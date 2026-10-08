import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  ActorType,
  DealEventType,
  DealStatus,
  EscrowStatus,
  PaymentMethod,
  PaymentProvider,
  type DealPayment,
  type PaymentTransaction,
  type PaymentType,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '../../config/config.service';
import { PrismaService } from '../../database/prisma.service';
import { FlutterwaveGateway } from '../../integrations/payments/flutterwave.gateway';
import { PaystackGateway } from '../../integrations/payments/paystack.gateway';
import type { PaymentGateway, VerifiedPayment } from '../../integrations/payments/payment-gateway';
import { dealAmounts, formatNairaMinor, isApprovedStatus, nextDueSlot, type DealAmounts } from '../deals/deal-money';
import { DealStateService } from '../deals/deal-state.service';
import { DealsService } from '../deals/deals.service'; // value import: injected class (Nest DI)
import { NOTIFICATION_TYPES } from '../notifications/notifications.constants';
import { NotificationsService } from '../notifications/notifications.service';
import type { InitializePaymentDto, VerifyPaymentDto } from './dto/payment.dto';
import {
  PAYABLE_DEAL_STATUSES,
  PAYMENT_CURRENCY,
  PAYMENT_FALLBACK_EMAIL_DOMAIN,
  PAYMENT_REF_PREFIX,
  PAYMENT_REF_RANDOM_BYTES,
} from './payments.constants';

/** Everything the checkout dialog needs to send the customer to the rail. */
export interface PaymentInitiation {
  reference: string;
  provider: PaymentProvider;
  method: PaymentMethod;
  amountMinor: number;
  /** Schedule slot label, e.g. "Deposit (50%)" or "Installment 2 of 2". */
  label: string;
  /** Hosted checkout URL on the provider's domain. */
  link: string;
}

/** Result of a verify poll — status-shaped so the UI can render all three outcomes. */
export interface PaymentVerification {
  status: 'pending' | 'failed' | 'successful';
  reference: string;
  payment?: Pick<
    DealPayment,
    'reference' | 'type' | 'label' | 'amountMinor' | 'escrowStatus' | 'paidAt'
  >;
  amounts: DealAmounts;
}

/** Metadata recorded on the transaction at initialize time (kept in raw.init). */
type TxInitMeta = Prisma.InputJsonObject & {
  slotType: PaymentType;
  slotLabel: string;
  method: PaymentMethod;
};

/**
 * Payments domain boundary — owning phase 8.
 *
 * Money rules enforced here (docs/target-architecture.md §5):
 * - The ONLY amount a customer can pay is the server-computed next due slot —
 *   initialize takes no amount input.
 * - Nothing is trusted from the browser or the webhook body: both paths call
 *   verifyPayment() against the provider and land money from GATEWAY truth.
 * - Landing is idempotent (unique reference + conditional verify update) and
 *   atomic: DealPayment row + PaymentTransaction verification + DealEvent
 *   (+ SENT -> ACTIVE for the deposit) in ONE Prisma transaction.
 * - Escrow is DEAL's, never the gateway's: payments before approval are HELD
 *   until the client's approve releases them; payments after approval go
 *   straight to the creator (RELEASED at landing, prototype parity).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deals: DealsService,
    private readonly state: DealStateService,
    private readonly config: ConfigService,
    private readonly flutterwave: FlutterwaveGateway,
    // Constructed only when PAYSTACK_SECRET_KEY is set (integration module) —
    // a missing rail is an explicit 503, never a silent fallback.
    private readonly paystack: PaystackGateway | null,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Shared (capability-link) checkout ───────────────────────────────────────

  /**
   * Start a charge for the deal's next due slot. Every call mints a fresh
   * reference (a new PaymentTransaction row, status pending) — retries and
   * abandoned checkouts are natural, each attempt is its own auditable row.
   */
  async initializeForSharedDeal(token: string, dto: InitializePaymentDto): Promise<PaymentInitiation> {
    const deal = await this.findDealOr404(token);
    this.assertPayable(deal.status);

    const slot = nextDueSlot(deal, deal.payments);
    if (!slot) {
      // Only reachable for a payable-status deal with everything settled —
      // exactly the "nothing left to charge" case.
      throw this.fail('DEAL_NOT_PAYABLE', 'Every slot on this deal is already paid', HttpStatus.CONFLICT);
    }

    const gateway = this.gatewayFor(dto.provider);
    const reference = `${PAYMENT_REF_PREFIX[dto.provider]}-${deal.ref}-${slot.type}-${randomBytes(PAYMENT_REF_RANDOM_BYTES).toString('hex')}`;
    const meta: TxInitMeta = { slotType: slot.type, slotLabel: slot.label, method: dto.method };

    // Record the attempt BEFORE talking to the gateway: an initialize that
    // dies mid-flight still leaves an audit row instead of vanishing.
    const tx = await this.prisma.paymentTransaction.create({
      data: {
        dealId: deal.id,
        provider: dto.provider,
        providerRef: reference,
        amountMinor: slot.amountMinor,
        currency: PAYMENT_CURRENCY,
        gatewayStatus: 'pending',
        raw: { init: meta } satisfies Prisma.InputJsonValue,
      },
    });

    try {
      const { link } = await gateway.initializePayment({
        reference,
        amountMinor: slot.amountMinor,
        currency: PAYMENT_CURRENCY,
        customerName: deal.clientName || undefined,
        customerEmail: `payments+${deal.ref.toLowerCase()}@${PAYMENT_FALLBACK_EMAIL_DOMAIN}`,
        redirectUrl: `${this.config.paymentRedirectBase}/shared/${token}`,
        title: `DEAL · ${deal.ref}`,
      });
      return {
        reference,
        provider: dto.provider,
        method: dto.method,
        amountMinor: slot.amountMinor,
        label: slot.label,
        link,
      };
    } catch (error) {
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          gatewayStatus: 'failed',
          raw: {
            init: meta,
            initError: error instanceof Error ? error.message : String(error),
          } satisfies Prisma.InputJsonValue,
        },
      });
      throw this.fail(
        'PAYMENT_INITIALIZATION_FAILED',
        error instanceof Error && error.message
          ? `The payment rail refused the charge: ${error.message}`
          : 'The payment rail refused the charge — try again',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * The browser is back from hosted checkout. The reference is the only input;
   * the provider is re-asked server-side, so a forged "success" redirect
   * changes nothing. Safe to poll: repeated calls are idempotent.
   */
  async verifySharedPayment(token: string, dto: VerifyPaymentDto): Promise<PaymentVerification> {
    const deal = await this.findDealOr404(token);
    const tx = await this.prisma.paymentTransaction.findUnique({ where: { providerRef: dto.reference } });
    // Same 404 for a foreign deal's reference and a missing one — the capability
    // link must not confirm which references exist elsewhere.
    if (!tx || tx.dealId !== deal.id) {
      throw this.fail('PAYMENT_NOT_FOUND', 'No payment attempt with that reference on this deal', HttpStatus.NOT_FOUND);
    }
    return this.resolveTransaction(tx);
  }

  // ── Webhook entry (called by WebhooksService) ───────────────────────────────

  /**
   * Webhook path: no capability token exists here — the provider names the
   * reference. Safety comes from the gateway re-verification: money only lands
   * if the provider confirms a successful charge for that exact reference, and
   * a reference can only be CHARGED through a hosted link minted by someone
   * holding the share token (or the creator). Guessing a reference yields
   * nothing chargeable.
   */
  async verifyAndLandByReference(reference: string): Promise<PaymentVerification> {
    const tx = await this.prisma.paymentTransaction.findUnique({ where: { providerRef: reference } });
    if (!tx) {
      // Unknown reference: nothing to land. Not fatal for the webhook — the
      // caller decides how to record it (processed with a failure reason).
      throw this.fail('PAYMENT_NOT_FOUND', 'No payment attempt with that reference', HttpStatus.NOT_FOUND);
    }
    return this.resolveTransaction(tx);
  }

  // ── The landing core ────────────────────────────────────────────────────────

  /**
   * Ask the provider about a transaction and land a successful charge.
   * Idempotent: an already-verified transaction short-circuits (no gateway
   * call); two concurrent landings of the same reference converge on one
   * DealPayment row (unique reference) and one verified transaction.
   */
  private async resolveTransaction(tx: PaymentTransaction): Promise<PaymentVerification> {
    // Already verified by a previous server-side check: no gateway call, no
    // re-landing — the stored payment IS the answer.
    if (tx.verifiedAt) {
      return this.verificationFrom(tx, 'successful');
    }

    const gateway = this.gatewayFor(tx.provider);
    const verified = await gateway.verifyPayment(tx.providerRef);

    if (verified.status !== 'successful') {
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          gatewayStatus: verified.status,
          raw: this.withVerified(tx.raw, verified),
        },
      });
      return this.verificationFrom(tx, verified.status);
    }

    // Gateway says successful — the only moment money may land. Both mismatch
    // checks hold the charge for review instead of landing a wrong amount.
    if (verified.currency !== PAYMENT_CURRENCY) {
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { gatewayStatus: 'currency_mismatch', raw: this.withVerified(tx.raw, verified) },
      });
      throw this.fail(
        'PAYMENT_AMOUNT_MISMATCH',
        `The charge came back in ${verified.currency || 'an unexpected currency'} — this deal is priced in ${PAYMENT_CURRENCY}`,
        HttpStatus.CONFLICT,
      );
    }
    if (verified.amountMinor !== tx.amountMinor) {
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { gatewayStatus: 'amount_mismatch', raw: this.withVerified(tx.raw, verified) },
      });
      throw this.fail(
        'PAYMENT_AMOUNT_MISMATCH',
        'The verified amount does not match what was charged — payment held for review',
        HttpStatus.CONFLICT,
      );
    }

    const payment = await this.landSuccessfulPayment(tx, verified);
    return this.verificationFrom(tx, 'successful', payment);
  }

  /**
   * One transaction, one truth: DealPayment + verified PaymentTransaction +
   * audit event (+ the SENT -> ACTIVE move for a deposit) all land or none do.
   *
   * Concurrency: the transaction takes the Deal row lock FIRST (SELECT ... FOR
   * UPDATE). Every other Deal-status/escrow writer (the client's approve with
   * its escrow release, the creator's lifecycle moves) writes the Deal row
   * inside its transaction, so they serialize against this one — the escrow
   * decision below can never observe a half-finished approve, and approve can
   * never release a payment this transaction has not inserted yet.
   */
  private async landSuccessfulPayment(
    tx: PaymentTransaction,
    verified: VerifiedPayment,
  ): Promise<PaymentVerification['payment']> {
    // The transaction returns what the post-commit nudge needs — the money
    // write itself stays untouched (lock-first, idempotent, atomic).
    const landed = await this.prisma.$transaction(async (db) => {
      // Serialize against every other Deal-status/escrow writer (see doc above).
      // Parameter binding via Prisma's tagged template — no string SQL built here.
      await db.$queryRaw`SELECT "id" FROM "Deal" WHERE "id" = ${tx.dealId} FOR UPDATE`;

      const deal = await db.deal.findUnique({
        where: { id: tx.dealId },
        include: {
          payments: { orderBy: { paidAt: 'asc' } },
          // For the creator nudge after commit (advisory, best-effort).
          creator: { select: { userId: true } },
        },
      });
      if (!deal) {
        // A deal referenced by a transaction cannot vanish (dealId RESTRICTs);
        // this branch exists so the type system proves we checked.
        throw this.fail('DEAL_NOT_FOUND', 'Deal not found', HttpStatus.NOT_FOUND);
      }

      // Attribute the charge to the CURRENT schedule: the slot the client
      // initialized may have been consumed by a racing payment, so re-derive
      // from stored payments. An exact amount match keeps the slot's identity;
      // any other verified amount lands as a balance payment (deal-money's
      // consumption logic still fills the schedule correctly).
      const slot = nextDueSlot(deal, deal.payments);
      const attributed =
        slot && slot.amountMinor === verified.amountMinor
          ? slot
          : { type: 'BALANCE' as PaymentType, label: 'Balance payment', amountMinor: verified.amountMinor };

      // Escrow is decided from the deal status UNDER THE LOCK: before approval
      // money waits in escrow; after approval it goes straight to the creator.
      const released = isApprovedStatus(deal.status);
      const now = new Date();

      let payment: DealPayment;
      try {
        payment = await db.dealPayment.create({
          data: {
            dealId: deal.id,
            type: attributed.type,
            label: attributed.label,
            amountMinor: verified.amountMinor, // gateway truth, never a client claim
            method: this.methodOf(tx),
            provider: tx.provider,
            reference: tx.providerRef,
            escrowStatus: released ? EscrowStatus.RELEASED : EscrowStatus.HELD,
            paidAt: now,
            ...(released ? { releasedAt: now } : {}),
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          // A concurrent landing (client verify racing the webhook) already
          // inserted this charge — that IS success; reuse the stored row.
          const existing = await db.dealPayment.findUnique({ where: { reference: tx.providerRef } });
          if (existing) {
            await this.markVerified(db, tx, existing.id, verified);
            return { payment: existing, deal, slotLabel: attributed.label };
          }
        }
        throw error;
      }

      await this.markVerified(db, tx, payment.id, verified);

      const railName = tx.provider === PaymentProvider.FLUTTERWAVE ? 'Flutterwave' : 'Paystack';
      const moneyMeta = { reference: tx.providerRef, provider: tx.provider, amountMinor: verified.amountMinor };

      // The deposit on a SENT deal is the acceptance move the state machine
      // reserved in Phase 6. Status is re-checked at the filtered write, so a
      // racing decline/changes-request makes the move a no-op — the money event
      // is still written (money is fact; the deal simply moved on without it).
      if (deal.status === DealStatus.SENT && attributed.type === 'DEPOSIT') {
        try {
          await this.state.transition(
            { id: deal.id, status: deal.status },
            DealStatus.ACTIVE,
            {
              type: DealEventType.DEPOSIT_PAID,
              actor: ActorType.CLIENT,
              label: `${formatNairaMinor(verified.amountMinor)} deposit paid via ${railName} — deal is now active`,
              metadata: moneyMeta,
              extraData: { depositPaidAt: now },
            },
            db,
          );
        } catch (error) {
          if (!(error instanceof HttpException)) throw error;
          await db.dealEvent.create({
            data: {
              dealId: deal.id,
              type: DealEventType.DEPOSIT_PAID,
              actor: ActorType.CLIENT,
              label: `${formatNairaMinor(verified.amountMinor)} deposit paid via ${railName} (deal no longer awaiting acceptance)`,
              metadata: { ...moneyMeta, transitionLost: true },
            },
          });
        }
      } else {
        await db.dealEvent.create({
          data: {
            dealId: deal.id,
            // The enum's money family beyond the deposit is BALANCE_PAID; the
            // slot label ("Installment 2 of 2") carries the human detail.
            type: attributed.type === 'DEPOSIT' ? DealEventType.DEPOSIT_PAID : DealEventType.BALANCE_PAID,
            actor: ActorType.CLIENT,
            label: `${formatNairaMinor(verified.amountMinor)} paid — ${attributed.label}`,
            metadata: moneyMeta,
          },
        });
      }

      return { payment, deal, slotLabel: attributed.label };
    });

    // AFTER commit: money is fact, the nudge is advisory — a failed
    // notification never rolls back (or fails) a verified landing.
    await this.notifications.notify({
      userId: landed.deal.creator.userId,
      type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
      payload: {
        dealId: landed.deal.id,
        dealRef: landed.deal.ref,
        label: `${formatNairaMinor(landed.payment.amountMinor)} paid — ${landed.slotLabel}`,
        amountMinor: landed.payment.amountMinor,
        reference: tx.providerRef,
      },
    });

    return this.paymentProjection(landed.payment);
  }

  /** Conditional verify stamp — where-filtered so a racing landing wins cleanly. */
  private async markVerified(
    db: Prisma.TransactionClient,
    tx: PaymentTransaction,
    paymentId: string,
    verified: VerifiedPayment,
  ): Promise<void> {
    await db.paymentTransaction.updateMany({
      where: { id: tx.id, verifiedAt: null },
      data: {
        verifiedAt: new Date(),
        gatewayStatus: 'successful',
        paymentId,
        raw: this.withVerified(tx.raw, verified),
      },
    });
  }

  // ── Projection helpers ──────────────────────────────────────────────────────

  /** Fresh amounts for the verify response (one indexed read after landing). */
  private async verificationFrom(
    tx: Pick<PaymentTransaction, 'providerRef' | 'dealId'>,
    status: PaymentVerification['status'],
    payment?: PaymentVerification['payment'],
  ): Promise<PaymentVerification> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: tx.dealId },
      select: { status: true, priceMinor: true, depositPercent: true, installmentsCount: true, payments: true },
    });
    // The fallback shape is unreachable in practice (deals RESTRICT payment
    // deletion) — it exists so the response contract stays total.
    const amounts = deal
      ? dealAmounts(deal.status, deal, deal.payments)
      : dealAmounts(DealStatus.DRAFT, { priceMinor: 0, depositPercent: 0, installmentsCount: 0 }, []);
    return { status, reference: tx.providerRef, ...(payment ? { payment } : {}), amounts };
  }

  private paymentProjection(payment: DealPayment): PaymentVerification['payment'] {
    return {
      reference: payment.reference,
      type: payment.type,
      label: payment.label,
      amountMinor: payment.amountMinor,
      escrowStatus: payment.escrowStatus,
      paidAt: payment.paidAt,
    };
  }

  /** Merge the verbatim gateway payload into the transaction's audit JSON. */
  private withVerified(initRaw: Prisma.JsonValue | null, verified: VerifiedPayment): Prisma.InputJsonValue {
    const init = (initRaw as { init?: unknown } | null)?.init ?? {};
    // Gateway payloads arrive as parsed provider JSON — Json-compatible by construction.
    return { init, verified: verified.raw as Prisma.InputJsonValue };
  }

  /** The method recorded at initialize time (kept in the tx's audit JSON). */
  private methodOf(tx: PaymentTransaction): PaymentMethod {
    const meta = (tx.raw as { init?: TxInitMeta } | null)?.init;
    return meta?.method ?? PaymentMethod.CARD;
  }

  private gatewayFor(provider: PaymentProvider): PaymentGateway {
    const gateway = provider === PaymentProvider.FLUTTERWAVE ? this.flutterwave : this.paystack;
    if (!gateway) {
      throw this.fail(
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'Paystack is not configured on this server yet — pay with Flutterwave',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return gateway;
  }

  private assertPayable(status: DealStatus): void {
    if (!(PAYABLE_DEAL_STATUSES as readonly string[]).includes(status)) {
      throw this.fail(
        'DEAL_NOT_PAYABLE',
        `A ${status.toLowerCase().replace(/_/g, ' ')} deal cannot take payments`,
        HttpStatus.CONFLICT,
      );
    }
  }

  private async findDealOr404(token: string) {
    const deal = await this.deals.findByShareToken(token);
    if (!deal) {
      throw this.fail('DEAL_NOT_FOUND', 'Deal not found. Check your link.', HttpStatus.NOT_FOUND);
    }
    return deal;
  }

  private fail(code: string, message: string, status: HttpStatus): never {
    throw new HttpException({ code, message }, status);
  }
}
