import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, DealEventType, DealStatus, FileRole, Prisma, type Deal, type DealPayment } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { nextSequentialRef, retryOnUniqueViolation } from '../../common/ids/ref.util';
import { PrismaService } from '../../database/prisma.service';
import { RequestsService } from '../requests/requests.service';
import { dealAmounts, formatNairaMinor, isFullyPaid, type DealAmounts } from './deal-money';
import { DealStateService } from './deal-state.service';
import {
  DEAL_REF_PREFIX,
  DEFAULT_DEAL_TITLE,
  DEFAULT_DELIVERY_NOTE,
  DEFAULT_DEPOSIT_PERCENT,
  DEFAULT_INSTALLMENTS_COUNT,
  DEFAULT_REVISIONS,
  EDITABLE_DEAL_STATUSES,
  SHARE_TOKEN_BYTES,
} from './deals.constants';
import type { CreateDealDto, UpdateDealDto } from './dto/deal.dto';

/** Deal with the relations every owner-facing response carries. */
export type DealDetail = Prisma.DealGetPayload<{
  include: {
    deliverables: { orderBy: { position: 'asc' } };
    payments: { orderBy: { paidAt: 'asc' } };
    events: { orderBy: { createdAt: 'asc' } };
    deliveries: { include: { files: true }; orderBy: { submittedAt: 'desc' } };
    request: { select: { ref: true } };
    disputes: { orderBy: { createdAt: 'desc' } };
  };
}>;

/** Deal with the lighter relations the dashboard list needs (no events). */
export type DealListItem = Prisma.DealGetPayload<{
  include: { deliverables: { orderBy: { position: 'asc' } }; payments: { orderBy: { paidAt: 'asc' } } };
}>;

/** Deal source for the shared (capability-link) projection: adds the audit
 *  timeline and the deliveries + files the client-facing whitelist exposes. */
export type DealSharedSource = Prisma.DealGetPayload<{
  include: {
    deliverables: { orderBy: { position: 'asc' } };
    payments: { orderBy: { paidAt: 'asc' } };
    events: { orderBy: { createdAt: 'asc' } };
    deliveries: { include: { files: true }; orderBy: { submittedAt: 'desc' } };
  };
}>;

export type DealWithAmounts = { amounts: DealAmounts };

/** 256-bit capability token — the client's only credential for the share link. */
function generateShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString('base64url');
}

/**
 * Deals domain boundary — owning phase: 6.
 *
 * Owns the Deal, DealDeliverable, DealDelivery and DealEvent tables. Every
 * owner call is scoped by the acting creator's profile id; a missing and a
 * foreign deal are the same 404. Status writes go exclusively through
 * DealStateService; the money in every response is computed here from stored
 * payments — never taken from the client.
 */
@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: DealStateService,
    private readonly requests: RequestsService,
  ) {}

  // ── Owner (authenticated creator) use cases ─────────────────────────────────

  /** Dashboard listing — newest first, deliverables + payments for the money chips. */
  async listByCreator(creatorId: string): Promise<(DealListItem & DealWithAmounts)[]> {
    const deals = await this.prisma.deal.findMany({
      where: { creatorId },
      include: { deliverables: { orderBy: { position: 'asc' } }, payments: { orderBy: { paidAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return deals.map((deal) => ({ ...deal, amounts: this.amountsOf(deal) }));
  }

  /**
   * Full owner detail: deliverables, payments, deliveries, the linked request
   * ref, the immutable event timeline (the audit trail the dashboard renders)
   * and the deal's disputes (Phase 9: the creator must see when a client has
   * raised one — the pipeline itself is platform-only).
   */
  async getOwned(creatorId: string, dealId: string): Promise<DealDetail & DealWithAmounts> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, creatorId },
      include: {
        deliverables: { orderBy: { position: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        deliveries: { include: { files: true }, orderBy: { submittedAt: 'desc' } },
        request: { select: { ref: true } },
        disputes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!deal) {
      throw this.fail('DEAL_NOT_FOUND', 'Deal not found', HttpStatus.NOT_FOUND);
    }
    return { ...deal, amounts: this.amountsOf(deal) };
  }

  /**
   * Opens a draft. When a request is linked it must belong to this creator and
   * is marked REPLIED in the same transaction — a deal and its originating
   * thread can never disagree about who was answered.
   */
  async create(creatorId: string, dto: CreateDealDto): Promise<DealListItem & DealWithAmounts> {
    if (dto.requestId) {
      await this.requests.getOwned(creatorId, dto.requestId); // 404 on missing/foreign
    }

    const created = await retryOnUniqueViolation(async () => {
      const ref = await this.nextDealRef();
      return this.prisma.$transaction(async (tx) => {
        const deal = await tx.deal.create({
          data: {
            ref,
            creatorId,
            requestId: dto.requestId ?? null,
            shareToken: generateShareToken(),
            title: dto.title?.trim() || DEFAULT_DEAL_TITLE,
            serviceTitle: dto.serviceTitle?.trim() ?? '',
            clientName: dto.clientName?.trim() ?? '',
            clientContact: dto.clientContact?.trim() ?? '',
            priceMinor: 0,
            depositPercent: DEFAULT_DEPOSIT_PERCENT,
            installmentsCount: DEFAULT_INSTALLMENTS_COUNT,
            revisions: DEFAULT_REVISIONS,
            status: DealStatus.DRAFT,
          },
          include: { deliverables: true, payments: true },
        });
        await tx.dealEvent.create({
          data: {
            dealId: deal.id,
            type: DealEventType.CREATED,
            actor: ActorType.CREATOR,
            // Creator actions are always attributed to the scoped profile id.
            actorId: creatorId,
            label: 'Deal created',
          },
        });
        if (dto.requestId) {
          await this.requests.markReplied(dto.requestId, tx);
        }
        return deal;
      });
    });
    return { ...created, amounts: this.amountsOf(created) };
  }

  /**
   * Wizard edit. Deliberately restricted to DRAFT and CHANGES_REQUESTED (see
   * EDITABLE_DEAL_STATUSES): commercial terms are locked once the offer is out
   * or money is held. Deliverables are a replace-set — the client sends the
   * full ordered list, we swap the rows atomically with the field update.
   */
  async update(creatorId: string, dealId: string, dto: UpdateDealDto): Promise<DealDetail & DealWithAmounts> {
    const deal = await this.getOwned(creatorId, dealId);

    if (!EDITABLE_DEAL_STATUSES.includes(deal.status)) {
      throw this.fail(
        'DEAL_NOT_EDITABLE',
        `A ${deal.status.toLowerCase().replace(/_/g, ' ')} deal can no longer be edited`,
        HttpStatus.CONFLICT,
      );
    }

    const { deliverables, ...fields } = dto;
    const dateField = (value: string | null | undefined): Date | null | undefined =>
      value === undefined ? undefined : value === null ? null : new Date(`${value}T00:00:00Z`);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id: deal.id },
        data: {
          ...(fields.title !== undefined ? { title: fields.title } : {}),
          ...(fields.serviceTitle !== undefined ? { serviceTitle: fields.serviceTitle } : {}),
          ...(fields.summary !== undefined ? { summary: fields.summary } : {}),
          ...(fields.message !== undefined ? { message: fields.message } : {}),
          ...(fields.scope !== undefined ? { scope: fields.scope } : {}),
          ...(fields.location !== undefined ? { location: fields.location } : {}),
          ...(fields.eventDate !== undefined ? { eventDate: dateField(fields.eventDate) } : {}),
          ...(fields.startDate !== undefined ? { startDate: dateField(fields.startDate) } : {}),
          ...(fields.dueDate !== undefined ? { dueDate: dateField(fields.dueDate) } : {}),
          ...(fields.priceMinor !== undefined ? { priceMinor: fields.priceMinor } : {}),
          ...(fields.depositPercent !== undefined ? { depositPercent: fields.depositPercent } : {}),
          ...(fields.installmentsCount !== undefined ? { installmentsCount: fields.installmentsCount } : {}),
          ...(fields.revisions !== undefined ? { revisions: fields.revisions } : {}),
          ...(fields.clientName !== undefined ? { clientName: fields.clientName } : {}),
          ...(fields.clientContact !== undefined ? { clientContact: fields.clientContact } : {}),
        },
      });
      if (deliverables !== undefined) {
        await tx.dealDeliverable.deleteMany({ where: { dealId: deal.id } });
        if (deliverables.length > 0) {
          await tx.dealDeliverable.createMany({
            data: deliverables.map((name, position) => ({ dealId: deal.id, name, position })),
          });
        }
      }
      // Return the full detail shape in the same transaction.
      return tx.deal.findUniqueOrThrow({
        where: { id: deal.id },
        include: {
          deliverables: { orderBy: { position: 'asc' } },
          payments: { orderBy: { paidAt: 'asc' } },
          events: { orderBy: { createdAt: 'asc' } },
          deliveries: { include: { files: true }, orderBy: { submittedAt: 'desc' } },
          request: { select: { ref: true } },
          disputes: { orderBy: { createdAt: 'desc' } },
        },
      });
    });

    return { ...updated, amounts: this.amountsOf(updated) };
  }

  /** send: DRAFT|CHANGES_REQUESTED -> SENT, revalidating the offer is complete. */
  async send(creatorId: string, dealId: string): Promise<DealDetail & DealWithAmounts> {
    const deal = await this.getOwned(creatorId, dealId);
    if (!deal.title || !deal.clientName || deal.priceMinor <= 0) {
      // Prototype parity: an offer without a title, client or price cannot go out.
      throw this.fail('DEAL_NOT_READY_TO_SEND', 'Add a title, client and price before sending', HttpStatus.BAD_REQUEST);
    }
    const updated = await this.state.transition(
      { id: deal.id, status: deal.status },
      DealStatus.SENT,
      { type: DealEventType.SENT, actor: ActorType.CREATOR, actorId: creatorId, label: `Deal sent to ${deal.clientName}` },
    );
    return this.getOwned(creatorId, updated.id);
  }

  /**
   * deliver: ACTIVE|REVISION -> DELIVERED, opening a delivery record.
   *
   * Preview files uploaded for this deal but not yet part of a delivery are
   * attached to the new record in the same transaction — a delivery is the
   * bundle "note + what was delivered", and the client-facing share page
   * renders exactly that bundle. (Finals are never attached here: they unlock
   * through the release gate, keyed on status, not on a delivery row.)
   */
  async deliver(creatorId: string, dealId: string, note?: string): Promise<DealDetail & DealWithAmounts> {
    const deal = await this.getOwned(creatorId, dealId);
    await this.prisma.$transaction(async (tx) => {
      await this.state.transition(
        { id: deal.id, status: deal.status },
        DealStatus.DELIVERED,
        {
          type: DealEventType.DELIVERED,
          actor: ActorType.CREATOR,
          actorId: creatorId,
          label: 'Delivery submitted for review',
        },
        tx,
      );
      const delivery = await tx.dealDelivery.create({
        data: {
          dealId: deal.id,
          note: note?.trim() || DEFAULT_DELIVERY_NOTE,
        },
      });
      await tx.fileAsset.updateMany({
        where: { dealId: deal.id, deliveryId: null, role: FileRole.PREVIEW },
        data: { deliveryId: delivery.id },
      });
    });
    return this.getOwned(creatorId, deal.id);
  }

  /**
   * release-files: APPROVED -> FILES_RELEASED, gated on full payment — the
   * "file-release eligibility" rule (plan Phase 6). The files themselves are
   * attached in Phase 7 (R2); this transition is the gate they will hang on.
   */
  async releaseFiles(creatorId: string, dealId: string): Promise<DealDetail & DealWithAmounts> {
    const deal = await this.getOwned(creatorId, dealId);
    if (!isFullyPaid(deal, deal.payments)) {
      throw this.fail(
        'DEAL_NOT_FULLY_PAID',
        `Final files unlock when the deal is fully paid — ${formatNairaMinor(dealAmounts(deal.status, deal, deal.payments).dueMinor)} is still outstanding`,
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.state.transition(
      { id: deal.id, status: deal.status },
      DealStatus.FILES_RELEASED,
      {
        type: DealEventType.FILES_RELEASED,
        actor: ActorType.CREATOR,
        actorId: creatorId,
        label: 'Final files released to client',
      },
    );
    return this.getOwned(creatorId, updated.id);
  }

  // ── Shared surface helpers (used by SharedDealsService) ─────────────────────

  /** Money projection — the single source of every deal-facing amounts block. */
  amountsOf(deal: {
    status: DealStatus;
    priceMinor: number;
    depositPercent: number;
    installmentsCount: number;
    payments: Pick<DealPayment, 'amountMinor' | 'escrowStatus' | 'paidAt'>[];
  }): DealAmounts {
    return dealAmounts(deal.status, deal, deal.payments);
  }

  /**
   * Find a deal by its capability token (the shared surface's credential).
   * Carries the audit timeline and deliveries so the share-page projection can
   * whitelist what the client — a party to the deal — legitimately sees
   * (Phase 10: the client UI renders the record timeline and deliveries).
   */
  async findByShareToken(token: string): Promise<(DealSharedSource & DealWithAmounts) | null> {
    const deal = await this.prisma.deal.findUnique({
      where: { shareToken: token },
      include: {
        deliverables: { orderBy: { position: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        deliveries: { include: { files: true }, orderBy: { submittedAt: 'desc' } },
      },
    });
    return deal ? { ...deal, amounts: this.amountsOf(deal) } : null;
  }

  /**
   * Minimal ownership proof for sibling modules (files): the deal exists AND
   * belongs to this creator, or it is the same 404 as every other owner path.
   * Deliberately a single indexed query with a narrow select — file routes
   * must not pay for the full detail projection they never read.
   */
  async getOwnedDealContext(creatorId: string, dealId: string): Promise<Pick<Deal, 'id' | 'status' | 'creatorId'>> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, creatorId },
      select: { id: true, status: true, creatorId: true },
    });
    if (!deal) {
      throw this.fail('DEAL_NOT_FOUND', 'Deal not found', HttpStatus.NOT_FOUND);
    }
    return deal;
  }

  private async nextDealRef(): Promise<string> {
    const rows = await this.prisma.deal.findMany({
      where: { ref: { startsWith: `${DEAL_REF_PREFIX}-` } },
      select: { ref: true },
    });
    return nextSequentialRef(DEAL_REF_PREFIX, rows.map((row) => row.ref));
  }

  private fail(code: string, message: string, status: HttpStatus): never {
    throw new HttpException({ code, message }, status);
  }
}
