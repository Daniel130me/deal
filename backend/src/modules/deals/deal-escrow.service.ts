import { Injectable } from '@nestjs/common';
import { ActorType, DealEventType, EscrowStatus, type Deal } from '@prisma/client';
import { formatNairaMinor } from './deal-money';
import type { PrismaTx } from './deal-state.service';

/** What an escrow release changed — callers enrich their own audit context. */
export interface EscrowReleaseResult {
  count: number;
  totalMinor: number;
}

/**
 * The single writer of escrow moves (todo.md A3: logic lives where a developer
 * expects to find it). Extracted in Phase 9 from the shared surface's approve
 * flow so BOTH escrow-releasing outcomes — the client's approve and the
 * platform's dispute resolution — go through exactly one implementation:
 *
 *   every HELD payment on the deal flips to RELEASED (stamping releasedAt),
 *   the deal's paymentReleasedAt is stamped, and one PAYMENT_RELEASED audit
 *   event records the released total.
 *
 * MUST run inside the caller's transaction, AFTER its status transition: the
 * escrow decision is only correct under the same lock that serializes deal
 * writers (see PaymentsService.landSuccessfulPayment for the lock ordering).
 * A deal with zero HELD payments releases nothing — a silent no-op, because
 * "approve with zero payments invents nothing" is the established rule.
 */
@Injectable()
export class DealEscrowService {
  async releaseHeldEscrow(tx: PrismaTx, deal: Pick<Deal, 'id'>): Promise<EscrowReleaseResult> {
    // Re-read under the write: the pre-transaction snapshot may miss a payment
    // that landed concurrently (deal-row lock ordering guarantees it is
    // committed by now if it exists).
    const held = await tx.dealPayment.findMany({
      where: { dealId: deal.id, escrowStatus: EscrowStatus.HELD },
      select: { amountMinor: true },
    });
    if (held.length === 0) {
      return { count: 0, totalMinor: 0 };
    }

    const total = held.reduce((s, p) => s + p.amountMinor, 0);
    await tx.dealPayment.updateMany({
      where: { dealId: deal.id, escrowStatus: EscrowStatus.HELD },
      data: { escrowStatus: EscrowStatus.RELEASED, releasedAt: new Date() },
    });
    await tx.deal.update({
      where: { id: deal.id },
      data: { paymentReleasedAt: new Date() },
    });
    await tx.dealEvent.create({
      data: {
        dealId: deal.id,
        type: DealEventType.PAYMENT_RELEASED,
        actor: ActorType.SYSTEM,
        label: `${formatNairaMinor(total)} released from escrow to the creator's payout account`,
        metadata: { releasedCount: held.length, totalMinor: total },
      },
    });
    return { count: held.length, totalMinor: total };
  }
}
