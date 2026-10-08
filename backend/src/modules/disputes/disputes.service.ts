import { HttpStatus, Injectable } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import {
  ActorType,
  DealEventType,
  DealStatus,
  DisputeStatus,
  type Deal,
  type Dispute,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NOTIFICATION_TYPES, type NotificationType } from '../notifications/notifications.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { DealEscrowService } from '../deals/deal-escrow.service';
import { DealStateService } from '../deals/deal-state.service';
import { DISPUTES_LIST_LIMIT } from './disputes.constants';

/**
 * Dispute as the admin list receives it — the deal context needed to act
 * (ref/title) plus the creator for notifications. No internal money or
 * client-contact fields.
 */
export type DisputeListItem = Pick<
  Dispute,
  'id' | 'dealId' | 'status' | 'reason' | 'priorStatus' | 'raisedBy' | 'resolvedAt' | 'createdAt'
> & {
  deal: { ref: string; title: string; creator: { name: string; handle: string } };
};

/** Full row the action pipeline needs: the dispute, its deal, and the deal's status. */
type DisputeWithDeal = Dispute & { deal: Pick<Deal, 'id' | 'ref' | 'status'> };

/**
 * Disputes domain boundary — owning phase: 9.
 *
 * A dispute is RAISED by the anonymous client through the capability link
 * (createClientDispute — the only writer of Dispute rows) and RESOLVED by the
 * platform (ADMIN routes): under-review -> resolve (work stands, escrow
 * releases, deal lands on APPROVED) or reject (claim dismissed, deal restored
 * to the status it held when the dispute was raised — `priorStatus` is the
 * restore point captured at raise time).
 *
 * All deal-status moves go through DealStateService; all escrow releases go
 * through DealsService.releaseHeldEscrow — this module never writes either
 * directly. The whole pipeline is ADMIN-only (global RolesGuard).
 */
@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: DealStateService,
    private readonly escrow: DealEscrowService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Raise (capability surface — the client side) ────────────────────────────

  /**
   * The shared surface's dispute action, owned here so ALL Dispute writes sit
   * in one module. One transaction: the DISPUTED transition (machine-validated,
   * race-safe) and the row carrying `priorStatus` — the restore point a later
   * reject needs — land together or not at all.
   */
  async createClientDispute(deal: Pick<Deal, 'id' | 'ref' | 'creatorId' | 'status'>, reason: string): Promise<Dispute> {
    const dispute = await this.prisma.$transaction(async (tx) => {
      await this.state.transition(
        { id: deal.id, status: deal.status },
        DealStatus.DISPUTED,
        {
          type: DealEventType.DISPUTED,
          actor: ActorType.CLIENT,
          label: 'Dispute raised — our team will step in',
          metadata: { reason },
        },
        tx,
      );
      return tx.dispute.create({
        data: {
          dealId: deal.id,
          raisedBy: ActorType.CLIENT,
          reason,
          status: DisputeStatus.OPEN,
          priorStatus: deal.status,
        },
      });
    });

    await this.notifyCreator(
      deal.creatorId,
      NOTIFICATION_TYPES.DEAL_DISPUTED,
      `A dispute was raised on ${deal.ref} — our team will step in`,
      { dealId: deal.id, dealRef: deal.ref },
    );
    return dispute;
  }

  // ── Platform pipeline (ADMIN) ───────────────────────────────────────────────

  /** Admin listing — newest first, bounded, with the deal + creator context. */
  async list(): Promise<DisputeListItem[]> {
    return this.prisma.dispute.findMany({
      select: {
        id: true,
        dealId: true,
        status: true,
        reason: true,
        priorStatus: true,
        raisedBy: true,
        resolvedAt: true,
        createdAt: true,
        deal: {
          select: { ref: true, title: true, creator: { select: { name: true, handle: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: DISPUTES_LIST_LIMIT,
    });
  }

  /**
   * One pipeline, three moves. `resolve` and `reject` close the dispute AND
   * move the deal in the SAME transaction — a closed dispute whose deal is
   * still DISPUTED (or the reverse) can never exist.
   */
  async act(disputeId: string, dto: { action: 'under-review' | 'resolve' | 'reject'; note?: string }): Promise<DisputeListItem> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { deal: { select: { id: true, ref: true, status: true, creatorId: true } } },
    });
    if (!dispute) {
      throw new HttpException({ code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' }, HttpStatus.NOT_FOUND);
    }
    if (dispute.status === DisputeStatus.RESOLVED || dispute.status === DisputeStatus.REJECTED) {
      throw new HttpException(
        { code: 'DISPUTE_ALREADY_CLOSED', message: 'This dispute has already been closed' },
        HttpStatus.CONFLICT,
      );
    }

    switch (dto.action) {
      case 'under-review': {
        // Conditional update: a concurrent close makes this match nothing.
        const updated = await this.prisma.dispute.updateMany({
          where: { id: dispute.id, status: DisputeStatus.OPEN },
          data: { status: DisputeStatus.UNDER_REVIEW },
        });
        if (updated.count === 0) {
          throw new HttpException(
            { code: 'INVALID_DISPUTE_TRANSITION', message: 'Only an open dispute can move to under review' },
            HttpStatus.CONFLICT,
          );
        }
        break;
      }

      case 'resolve': {
        // Platform-mediated outcome: the agreed work stands, the client's
        // escrowed money releases — the deal lands on APPROVED exactly as if
        // the client had approved it.
        await this.prisma.$transaction(async (tx) => {
          await this.state.transition(
            { id: dispute.deal.id, status: dispute.deal.status },
            DealStatus.APPROVED,
            {
              type: DealEventType.DISPUTE_RESOLVED,
              actor: ActorType.SYSTEM,
              label: 'Dispute resolved — the work stands, escrow released to the creator',
              metadata: this.outcomeMetadata(dispute, 'resolved', dto.note),
            },
            tx,
          );
          await this.escrow.releaseHeldEscrow(tx, dispute.deal);
          await tx.dispute.update({
            where: { id: dispute.id },
            data: { status: DisputeStatus.RESOLVED, resolvedAt: new Date() },
          });
        });
        await this.notifyCreator(
          dispute.deal.creatorId,
          NOTIFICATION_TYPES.DISPUTE_RESOLVED,
          `The dispute on ${dispute.deal.ref} was resolved in your favor — escrow has been released`,
          { dealId: dispute.deal.id, dealRef: dispute.deal.ref },
        );
        break;
      }

      case 'reject': {
        // Claim dismissed: the lifecycle resumes where it was interrupted.
        // priorStatus is always set by createClientDispute; the DELIVERED
        // fallback exists only so a hand-migrated row can never hard-fail the
        // pipeline (and DISPUTED→DELIVERED is a legal machine move).
        const restoreTo = dispute.priorStatus ?? DealStatus.DELIVERED;
        await this.prisma.$transaction(async (tx) => {
          await this.state.transition(
            { id: dispute.deal.id, status: dispute.deal.status },
            restoreTo,
            {
              type: DealEventType.DISPUTE_RESOLVED,
              actor: ActorType.SYSTEM,
              label: 'Dispute rejected — the claim was reviewed and dismissed',
              metadata: this.outcomeMetadata(dispute, 'rejected', dto.note, restoreTo),
            },
            tx,
          );
          await tx.dispute.update({
            where: { id: dispute.id },
            data: { status: DisputeStatus.REJECTED, resolvedAt: new Date() },
          });
        });
        await this.notifyCreator(
          dispute.deal.creatorId,
          NOTIFICATION_TYPES.DISPUTE_RESOLVED,
          `The dispute on ${dispute.deal.ref} was reviewed and dismissed — the deal resumes as before`,
          { dealId: dispute.deal.id, dealRef: dispute.deal.ref },
        );
        break;
      }
    }

    const refreshed = await this.prisma.dispute.findUnique({
      select: {
        id: true,
        dealId: true,
        status: true,
        reason: true,
        priorStatus: true,
        raisedBy: true,
        resolvedAt: true,
        createdAt: true,
        deal: { select: { ref: true, title: true, creator: { select: { name: true, handle: true } } } },
      },
      where: { id: dispute.id },
    });
    return refreshed!;
  }

  /** Audit metadata shared by both closing outcomes. */
  private outcomeMetadata(
    dispute: DisputeWithDeal,
    outcome: 'resolved' | 'rejected',
    note?: string,
    restoredTo?: DealStatus,
  ): Record<string, unknown> {
    return {
      disputeId: dispute.id,
      outcome,
      ...(restoredTo ? { restoredTo } : {}),
      ...(note ? { note } : {}),
    };
  }

  /** Advisory nudge to the deal's creator — best-effort, never fails the action. */
  private async notifyCreator(
    creatorId: string,
    type: NotificationType,
    label: string,
    context: { dealId: string; dealRef: string },
  ): Promise<void> {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { id: creatorId },
      select: { userId: true },
    });
    if (!profile) return; // structurally impossible (disputes RESTRICT profile deletion)
    await this.notifications.notify({ userId: profile.userId, type, payload: { label, ...context } });
  }
}
