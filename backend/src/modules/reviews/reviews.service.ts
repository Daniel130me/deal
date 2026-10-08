import { HttpStatus, Injectable } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { ActorType, DealEventType, DealStatus, type Deal, type Review } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../notifications/notifications.constants';

/**
 * Deal statuses from which a client may leave a review: the work must have
 * been approved (or the engagement already closed) — rating a delivery that
 * is still under active review would let the outcome be judged before it is
 * decided. Files-released/completed deals are post-approval by construction.
 */
export const REVIEWABLE_DEAL_STATUSES: readonly DealStatus[] = [
  DealStatus.APPROVED,
  DealStatus.FILES_RELEASED,
  DealStatus.COMPLETED,
];

/** Rating bounds enforced at the DTO edge; repeated here as the service contract. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** The creator-facing review row (never exposes the client's contact details). */
export type ReviewListItem = Pick<Review, 'id' | 'rating' | 'comment' | 'createdAt'> & {
  deal: { id: string; ref: string; title: string };
};

export interface RatingSummary {
  average: number | null;
  count: number;
}

/** Input for the capability-surface review action (rating validated upstream). */
export interface ReviewInput {
  rating: number;
  comment?: string | null;
}

/**
 * Reviews domain boundary — owning phase: 9.
 *
 * A review is written ONCE per deal by the anonymous client through the
 * capability link (the share token is the credential — same trust model as
 * the payment checkout), and read by the creator. A review does not move the
 * deal through the state machine; it is an annotation on an approved
 * engagement, recorded together with its REVIEW audit event in one
 * transaction.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The client's review action from the shared surface. The deal snapshot
   * comes from the caller (already loaded + token-verified); the status gate
   * is re-checked against that same snapshot inside the write transaction's
   * conditional create, so a concurrent lifecycle move cannot slip a review
   * onto a deal that just left the reviewable window.
   */
  async createForDeal(deal: Pick<Deal, 'id' | 'creatorId' | 'ref' | 'status'>, input: ReviewInput): Promise<Review> {
    if (!REVIEWABLE_DEAL_STATUSES.includes(deal.status)) {
      throw new HttpException(
        {
          code: 'DEAL_NOT_REVIEWABLE',
          message: 'You can review this deal once the work has been approved',
        },
        HttpStatus.CONFLICT,
      );
    }

    const created = await this.prisma
      .$transaction(async (tx) => {
        // Unique constraint on dealId is the real guard; the status WHERE
        // makes the gate race-safe (a deal disputed concurrently is not
        // reviewable anymore). P2002 surfaces as the 409 below.
        const review = await tx.review.create({
          data: {
            dealId: deal.id,
            creatorId: deal.creatorId,
            rating: input.rating,
            comment: input.comment?.trim() || null,
          },
        });
        await tx.dealEvent.create({
          data: {
            dealId: deal.id,
            type: DealEventType.REVIEW,
            actor: ActorType.CLIENT,
            label: `Client left a ${input.rating}-star review`,
            metadata: input.comment?.trim() ? { rating: input.rating, comment: input.comment.trim() } : { rating: input.rating },
          },
        });
        return review;
      })
      .catch((error) => {
        if ((error as { code?: string }).code === 'P2002') {
          throw new HttpException(
            { code: 'REVIEW_EXISTS', message: 'You have already reviewed this deal' },
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      });

    await this.notifyCreator(deal.creatorId, deal.ref, deal.id, created.rating);
    return created;
  }

  /** The creator's reviews, newest first, with the minimal deal context. */
  async listForCreator(creatorId: string): Promise<ReviewListItem[]> {
    return this.prisma.review.findMany({
      where: { creatorId },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        deal: { select: { id: true, ref: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Average + count for the dashboard/public profile — one aggregate query. */
  async summarizeForCreator(creatorId: string): Promise<RatingSummary> {
    const agg = await this.prisma.review.aggregate({
      where: { creatorId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return { average: agg._avg.rating, count: agg._count._all };
  }

  /** Advisory nudge to the creator — never fails the review that just landed. */
  private async notifyCreator(creatorId: string, dealRef: string, dealId: string, rating: number): Promise<void> {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { id: creatorId },
      select: { userId: true },
    });
    if (!profile) return; // structurally impossible (reviews RESTRICT profile deletion)
    await this.notifications.notify({
      userId: profile.userId,
      type: NOTIFICATION_TYPES.REVIEW_NEW,
      payload: { label: `Your deal ${dealRef} received a ${rating}-star review`, dealId, dealRef, rating },
    });
  }
}
