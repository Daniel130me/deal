import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, DealEventType, DealStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatorsService, type PublicProfile } from '../creators/creators.service';
import { DisputesService } from '../disputes/disputes.service';
import { NOTIFICATION_TYPES, type NotificationType } from '../notifications/notifications.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewsService } from '../reviews/reviews.service';
import { formatNairaMinor } from './deal-money';
import { DealStateService } from './deal-state.service';
import { DealEscrowService, type EscrowReleaseResult } from './deal-escrow.service';
import { DealsService } from './deals.service'; // value import: injected class (Nest DI)
import type { DealListItem, DealWithAmounts } from './deals.service';
import type { SharedDealActionDto } from './dto/deal.dto';

/**
 * What the client sees through a capability link — a strict WHITELIST
 * projection (plan Phase 6: "minimal payload"; §7: "no internal
 * events/passwords"). Internal ids, audit events, payment rows and the
 * client's own contact details never leave the server.
 */
export interface SharedDealProjection {
  deal: {
    ref: string;
    title: string;
    serviceTitle: string;
    clientName: string;
    status: DealStatus;
    summary: string | null;
    scope: string | null;
    message: string | null;
    eventDate: Date | null;
    location: string | null;
    deliverables: string[];
    revisions: number;
    depositPercent: number;
    installmentsCount: number;
    startDate: Date | null;
    dueDate: Date | null;
    createdAt: Date;
    sentAt: Date | null;
    acceptedAt: Date | null;
    deliveredAt: Date | null;
    approvedAt: Date | null;
    filesReleasedAt: Date | null;
    completedAt: Date | null;
  };
  creator: PublicProfile;
  amounts: DealWithAmounts['amounts'];
}

/**
 * Capability-surface boundary — the anonymous client side of the deal engine.
 * The share token IS the credential (256-bit CSPRNG, unguessable), so there
 * is no user identity here: every actor on a deal is CLIENT, and every route
 * is rate-limited (SharedDealsController).
 */
@Injectable()
export class SharedDealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: DealStateService,
    private readonly deals: DealsService,
    private readonly creators: CreatorsService,
    private readonly escrow: DealEscrowService,
    private readonly disputes: DisputesService,
    private readonly reviews: ReviewsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** GET /shared/:token — the share-page payload. */
  async getProjection(token: string): Promise<SharedDealProjection> {
    const deal = await this.findDeal(token);
    const profile = await this.creators.getProfileById(deal.creatorId);
    if (!profile) {
      // Deal exists but its creator vanished — structurally impossible today
      // (deals RESTRICT profile deletion), guarded for defence in depth.
      throw this.fail('DEAL_NOT_FOUND', 'Deal not found. Check your link.', HttpStatus.NOT_FOUND);
    }
    return {
      deal: {
        ref: deal.ref,
        title: deal.title,
        serviceTitle: deal.serviceTitle,
        clientName: deal.clientName,
        status: deal.status,
        summary: deal.summary,
        scope: deal.scope,
        message: deal.message,
        eventDate: deal.eventDate,
        location: deal.location,
        deliverables: deal.deliverables.map((d) => d.name),
        revisions: deal.revisions,
        depositPercent: deal.depositPercent,
        installmentsCount: deal.installmentsCount,
        startDate: deal.startDate,
        dueDate: deal.dueDate,
        createdAt: deal.createdAt,
        sentAt: deal.sentAt,
        acceptedAt: deal.acceptedAt,
        deliveredAt: deal.deliveredAt,
        approvedAt: deal.approvedAt,
        filesReleasedAt: deal.filesReleasedAt,
        completedAt: deal.completedAt,
      },
      creator: this.creators.toPublicProfile(profile),
      amounts: deal.amounts,
    };
  }

  /**
   * POST /shared/:token/actions — the client's lifecycle moves.
   *
   * Every accepted move nudges the deal's creator afterwards (best-effort,
   * after the domain write committed) — the dispute and review cases carry
   * their own notifications inside their owning services, so they are not
   * repeated here.
   */
  async act(token: string, dto: SharedDealActionDto): Promise<SharedDealProjection> {
    const deal = await this.findDeal(token);

    switch (dto.action) {
      case 'request-changes': {
        // From a sent offer the changes loop re-opens editing; from a delivery
        // it becomes a revision round. Anything else has nothing under review.
        const to =
          deal.status === DealStatus.SENT
            ? DealStatus.CHANGES_REQUESTED
            : deal.status === DealStatus.DELIVERED
              ? DealStatus.REVISION
              : null;
        if (!to) {
          throw this.fail('INVALID_DEAL_TRANSITION', 'No offer or delivery is awaiting your review right now', HttpStatus.CONFLICT);
        }
        await this.state.transition(
          { id: deal.id, status: deal.status },
          to,
          {
            type: DealEventType.CHANGES_REQUESTED,
            actor: ActorType.CLIENT,
            label: dto.note ? `Changes requested: “${dto.note}”` : 'Changes requested',
            metadata: dto.note ? { note: dto.note } : undefined,
          },
        );
        await this.notifyCreator(deal.creatorId, NOTIFICATION_TYPES.DEAL_CHANGES_REQUESTED, {
          dealId: deal.id,
          dealRef: deal.ref,
          label: dto.note
            ? `Client requested changes on ${deal.ref}: “${dto.note}”`
            : `Client requested changes on ${deal.ref}`,
        });
        break;
      }

      case 'decline': {
        await this.state.transition(
          { id: deal.id, status: deal.status },
          DealStatus.DECLINED,
          { type: DealEventType.DECLINED, actor: ActorType.CLIENT, label: 'Client declined the deal' },
        );
        await this.notifyCreator(deal.creatorId, NOTIFICATION_TYPES.DEAL_DECLINED, {
          dealId: deal.id,
          dealRef: deal.ref,
          label: `Client declined ${deal.ref}`,
        });
        break;
      }

      case 'approve': {
        const released = await this.approveWithEscrowRelease(deal);
        await this.notifyCreator(deal.creatorId, NOTIFICATION_TYPES.DEAL_APPROVED, {
          dealId: deal.id,
          dealRef: deal.ref,
          label:
            released.totalMinor > 0
              ? `Client approved ${deal.ref} — ${formatNairaMinor(released.totalMinor)} released from escrow to you`
              : `Client approved ${deal.ref}`,
        });
        break;
      }

      case 'complete': {
        await this.state.transition(
          { id: deal.id, status: deal.status },
          DealStatus.COMPLETED,
          { type: DealEventType.COMPLETED, actor: ActorType.CLIENT, label: 'Deal completed — client confirmed delivery' },
        );
        await this.notifyCreator(deal.creatorId, NOTIFICATION_TYPES.DEAL_COMPLETED, {
          dealId: deal.id,
          dealRef: deal.ref,
          label: `Client completed ${deal.ref} — congratulations!`,
        });
        break;
      }

      case 'review': {
        // Rating presence is the service's job (the DTO keeps rating optional
        // because the other actions don't carry one).
        if (dto.rating === undefined) {
          throw this.fail('REVIEW_RATING_REQUIRED', 'Pick a star rating to leave your review', HttpStatus.BAD_REQUEST);
        }
        await this.reviews.createForDeal(deal, { rating: dto.rating, comment: dto.note });
        break;
      }

      case 'dispute': {
        if (!dto.note) {
          // Deliberate tightening vs the prototype: the resolution team needs a reason.
          throw this.fail('DISPUTE_REASON_REQUIRED', 'Tell us what went wrong so our team can help', HttpStatus.BAD_REQUEST);
        }
        // Owned by the disputes domain: the DISPUTED move, the row (with its
        // priorStatus restore point) and the creator nudge land together there.
        if (deal.status !== DealStatus.DELIVERED && deal.status !== DealStatus.APPROVED) {
          throw this.fail('INVALID_DEAL_TRANSITION', "This deal can't be disputed right now", HttpStatus.CONFLICT);
        }
        await this.disputes.createClientDispute(deal, dto.note);
        break;
      }
    }

    return this.getProjection(token);
  }

  /**
   * approve: DELIVERED -> APPROVED — the moment escrow releases to the creator.
   * All HELD payments flip to RELEASED in the same transaction as the status
   * move; the PAYMENT_RELEASED audit event carries the released total. (New
   * payments made AFTER approval bypass escrow — enforced by Phase 8's payment
   * flow, which reads the deal status at verification time.)
   *
   * The released total is computed INSIDE the transaction, after the status
   * move, by the shared escrow writer (DealEscrowService): Phase 8's payment
   * landing serializes on the Deal row lock, so a deposit racing this approve
   * is either already committed (counted in the re-read, released by the
   * updateMany inside the primitive) or lands after with the post-approval
   * straight-to-creator rule — never stranded as HELD.
   */
  private async approveWithEscrowRelease(
    deal: DealListItem & DealWithAmounts,
  ): Promise<EscrowReleaseResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.state.transition(
        { id: deal.id, status: deal.status },
        DealStatus.APPROVED,
        { type: DealEventType.APPROVED, actor: ActorType.CLIENT, label: 'Work approved by client' },
        tx,
      );
      return this.escrow.releaseHeldEscrow(tx, deal);
    });
  }

  /** Advisory nudge to the deal's creator — best-effort, never fails the action. */
  private async notifyCreator(
    creatorId: string,
    type: NotificationType,
    payload: { dealId: string; dealRef: string; label: string },
  ): Promise<void> {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { id: creatorId },
      select: { userId: true },
    });
    if (!profile) return; // structurally impossible (deals RESTRICT profile deletion)
    await this.notifications.notify({ userId: profile.userId, type, payload });
  }

  private async findDeal(token: string): Promise<DealListItem & DealWithAmounts> {
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
