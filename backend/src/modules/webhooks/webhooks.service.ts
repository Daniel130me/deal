import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PaymentProvider, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ConfigService } from '../../config/config.service';
import { PrismaService } from '../../database/prisma.service';
import { FlutterwaveGateway } from '../../integrations/payments/flutterwave.gateway';
import { PaystackGateway } from '../../integrations/payments/paystack.gateway';
import type { WebhookHeaders } from '../../integrations/payments/payment-gateway';
import { PaymentsService } from '../payments/payments.service';
import { FLW_CHARGE_COMPLETED, GATEWAY_SUCCESSFUL, PS_CHARGE_SUCCESS } from './webhooks.constants';

/** Only the fields the pipeline reads — the verbatim payload is stored whole. */
interface WebhookPayload {
  event?: unknown;
  data?: {
    id?: unknown;
    status?: unknown;
    tx_ref?: unknown;
    reference?: unknown;
  } | null;
}

/** Post-signature structural view of a delivery. */
interface ParsedDelivery {
  event: string;
  data: NonNullable<WebhookPayload['data']>;
}

interface PipelineInput {
  provider: PaymentProvider;
  eventId: string;
  eventType: string;
  /** Our transaction reference (tx_ref / reference) named by the delivery. */
  reference: string | null;
  /** Whether this delivery represents money that moved (event + status filter). */
  isSuccessfulCharge: boolean;
  ignoreReason?: string;
  payloadHash: string;
  payload: unknown;
}

/**
 * Webhook intake pipeline — the out-of-band confirmation channel.
 *
 * Order matters (plan Phase 8: "verify signature → idempotency → persist →
 * verify transaction with provider → DB transaction → mark processed"):
 *
 * 1. CONFIG — a rail without webhook credentials refuses everything (503)
 *    rather than trusting unsigned deliveries.
 * 2. SIGNATURE — verified before the payload's business fields are touched.
 * 3. IDEMPOTENCY — (provider, eventId) unique on WebhookEvent collapses
 *    provider retries and replays; a row left unprocessed by a crash is
 *    picked up and re-run (the landing core is idempotent by reference).
 * 4. RE-VERIFY — the webhook body is never money truth: the transaction is
 *    re-verified with the provider through PaymentsService, which lands the
 *    payment atomically (DealPayment + verified transaction + DealEvent
 *    [+ SENT -> ACTIVE]) or holds it for review on a mismatch.
 * 5. PROCESSED — stamped only after success; on failure the row stays
 *    unprocessed and the 5xx answer makes a healthy rail retry.
 *
 * Non-charge deliveries (failed charges, other event types) are recorded and
 * marked processed with an ignore reason — they are not errors and must not
 * trigger retry loops.
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly payments: PaymentsService,
    private readonly flutterwave: FlutterwaveGateway,
    private readonly paystack: PaystackGateway | null,
  ) {}

  async handleFlutterwave(headers: WebhookHeaders, rawBody: Buffer | undefined, payload: unknown) {
    // A rail with no webhook secret configured cannot verify ANY delivery —
    // refuse at the door instead of processing untrusted payloads.
    if (!this.config.flutterwave.webhookSecretHash) {
      throw this.fail('WEBHOOK_NOT_CONFIGURED', 'Webhooks are not configured for this server', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!this.flutterwave.verifyWebhookSignature(headers, rawBody)) {
      throw this.fail('WEBHOOK_SIGNATURE_INVALID', 'Signature verification failed', HttpStatus.UNAUTHORIZED);
    }

    const body = this.assertShape(payload);
    const reference = typeof body.data.tx_ref === 'string' ? body.data.tx_ref : null;
    const isSuccessfulCharge =
      body.event === FLW_CHARGE_COMPLETED && body.data.status === GATEWAY_SUCCESSFUL;

    return this.pipeline({
      provider: PaymentProvider.FLUTTERWAVE,
      // The dedup id is the provider's own transaction id.
      eventId: this.eventIdOf(body),
      eventType: body.event,
      reference,
      isSuccessfulCharge,
      ignoreReason: isSuccessfulCharge
        ? undefined
        : `ignored: ${body.event} status=${String(body.data.status)}`,
      payloadHash: this.hashOf(rawBody),
      payload,
    });
  }

  async handlePaystack(headers: WebhookHeaders, rawBody: Buffer | undefined, payload: unknown) {
    if (!this.paystack) {
      throw this.fail('WEBHOOK_NOT_CONFIGURED', 'Paystack is not configured on this server', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!this.paystack.verifyWebhookSignature(headers, rawBody)) {
      throw this.fail('WEBHOOK_SIGNATURE_INVALID', 'Signature verification failed', HttpStatus.UNAUTHORIZED);
    }

    const body = this.assertShape(payload);
    const reference = typeof body.data.reference === 'string' ? body.data.reference : null;
    const isSuccessfulCharge =
      body.event === PS_CHARGE_SUCCESS && body.data.status === GATEWAY_SUCCESSFUL;

    return this.pipeline({
      provider: PaymentProvider.PAYSTACK,
      eventId: this.eventIdOf(body),
      eventType: body.event,
      reference,
      isSuccessfulCharge,
      ignoreReason: isSuccessfulCharge
        ? undefined
        : `ignored: ${body.event} status=${String(body.data.status)}`,
      payloadHash: this.hashOf(rawBody),
      payload,
    });
  }

  // ── The pipeline ────────────────────────────────────────────────────────────

  private async pipeline(input: PipelineInput): Promise<{ received: boolean; duplicate?: boolean }> {
    // Persist FIRST (idempotency ledger): a provider retry after a crash finds
    // this row unprocessed and re-runs the pipeline instead of double-landing.
    let event: { id: string; processed: boolean; failureReason: string | null };
    try {
      event = await this.prisma.webhookEvent.create({
        data: {
          provider: input.provider,
          eventId: input.eventId,
          eventType: input.eventType,
          payloadHash: input.payloadHash,
          payload: input.payload as Prisma.InputJsonValue,
          processed: false,
        },
        select: { id: true, processed: true, failureReason: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const existing = await this.prisma.webhookEvent.findUnique({
        where: { provider_eventId: { provider: input.provider, eventId: input.eventId } },
        select: { id: true, processed: true, failureReason: true },
      });
      if (existing?.processed) {
        // Exact replay (or a race between two healthy deliveries): acknowledge
        // without reprocessing — the ledger is the dedup anchor.
        return { received: true, duplicate: true };
      }
      if (!existing) throw error;
      event = existing; // previous attempt crashed mid-processing — retry it now
    }

    // Record-and-ignore deliveries: not errors, must not trigger retries.
    if (!input.isSuccessfulCharge || !input.reference) {
      const reason = input.ignoreReason ?? 'ignored: no transaction reference in payload';
      await this.markProcessed(event.id, reason);
      return { received: true };
    }

    try {
      // Money truth comes from the provider (server-side verify), never from
      // this body. Known-and-held outcomes (unknown reference, amount/currency
      // mismatch) are terminal: mark processed so rails do not retry forever.
      await this.payments.verifyAndLandByReference(input.reference);
      await this.markProcessed(event.id, null);
      return { received: true };
    } catch (error) {
      if (error instanceof HttpException) {
        const code = (error.getResponse() as { code?: string }).code;
        if (code === 'PAYMENT_NOT_FOUND' || code === 'PAYMENT_AMOUNT_MISMATCH') {
          await this.markProcessed(event.id, `${code}: held for review, not retried`);
          return { received: true };
        }
      }
      // Everything else (gateway down, DB down) stays unprocessed: record the
      // reason and answer 5xx so the rail retries into the idempotent core.
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { failureReason: error instanceof Error ? error.message : String(error) },
      });
      throw this.fail('WEBHOOK_PROCESSING_FAILED', 'Delivery accepted but processing failed — retry scheduled', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ── Payload helpers ─────────────────────────────────────────────────────────

  /** Minimal structural validation AFTER the signature gate (provider-sent JSON). */
  private assertShape(payload: unknown): ParsedDelivery {
    const body = payload as WebhookPayload | null;
    if (!body || typeof body.event !== 'string' || !body.data || typeof body.data !== 'object') {
      throw this.fail('WEBHOOK_PAYLOAD_INVALID', 'Unrecognised webhook payload', HttpStatus.BAD_REQUEST);
    }
    return { event: body.event, data: body.data };
  }

  /** The dedup id — the provider's transaction id (numeric or string). */
  private eventIdOf(body: { data: { id?: unknown } }): string {
    if (body.data.id === undefined || body.data.id === null || body.data.id === '') {
      throw this.fail('WEBHOOK_PAYLOAD_INVALID', 'Webhook payload carries no event id', HttpStatus.BAD_REQUEST);
    }
    return String(body.data.id);
  }

  /** SHA-256 of the exact bytes the provider signed — audit + replay forensics. */
  private hashOf(rawBody: Buffer | undefined): string {
    return createHash('sha256').update(rawBody ?? '').digest('hex');
  }

  private async markProcessed(id: string, failureReason: string | null): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: { id },
      data: { processed: true, processedAt: new Date(), failureReason },
    });
  }

  private fail(code: string, message: string, status: HttpStatus): never {
    throw new HttpException({ code, message }, status);
  }
}
