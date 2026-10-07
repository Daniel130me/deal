import { Module } from '@nestjs/common';
import { CreatorsModule } from '../creators/creators.module';
import { RequestsModule } from '../requests/requests.module';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { DealStateService } from './deal-state.service';
import { SharedDealsController } from './shared-deals.controller';
import { SharedDealsService } from './shared-deals.service';

/**
 * Deals domain boundary (implemented in Phase 6) — the escrow engine.
 *
 * Owns the Deal, DealDeliverable, DealDelivery, DealPayment (rows written by
 * Phase 8's payment flow) and DealEvent tables. Exports:
 * - DealsService — owner use cases + the shared-surface deal lookup;
 * - SharedDealsService — the capability-link projection + client actions;
 * - DealStateService — the ONLY writer of Deal.status. Phase 8's payment
 *   verification moves deals (SENT -> ACTIVE, deposit) through it inside the
 *   payment transaction, which is why it is exported.
 *
 * Cross-module calls go through these exports — never through another
 * module's repositories or Prisma models directly (docs/target-architecture.md §6).
 */
@Module({
  imports: [CreatorsModule, RequestsModule],
  controllers: [DealsController, SharedDealsController],
  providers: [DealsService, SharedDealsService, DealStateService],
  exports: [DealsService, SharedDealsService, DealStateService],
})
export class DealsModule {}
