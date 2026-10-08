import { Module } from '@nestjs/common';
import { DealEscrowService } from './deal-escrow.service';
import { DealStateService } from './deal-state.service';

/**
 * The deal lifecycle's authoritative mechanics, split out of DealsModule in
 * Phase 9 so that every module which legitimately MOVES deals — the deal
 * engine itself, the dispute pipeline — imports the same state machine and
 * the same escrow writer instead of the modules importing each other.
 *
 * Layering (acyclic by construction):
 *   DealLifecycleModule  (machine + escrow — no business callers)
 *     ↑            ↑
 *  DealsModule  DisputesModule   (both wire lifecycle moves into their flows)
 *
 * Consumers:
 * - DealStateService: the ONLY writer of Deal.status (see deal-state.service.ts).
 * - DealEscrowService: the ONLY writer of escrow releases (see deal-escrow.service.ts).
 */
@Module({
  providers: [DealStateService, DealEscrowService],
  exports: [DealStateService, DealEscrowService],
})
export class DealLifecycleModule {}
