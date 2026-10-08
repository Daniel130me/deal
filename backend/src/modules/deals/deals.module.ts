import { Module } from '@nestjs/common';
import { CreatorsModule } from '../creators/creators.module';
import { DisputesModule } from '../disputes/disputes.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RequestsModule } from '../requests/requests.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { DealLifecycleModule } from './deal-lifecycle.module';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { SharedDealsController } from './shared-deals.controller';
import { SharedDealsService } from './shared-deals.service';

/**
 * Deals domain boundary (implemented in Phase 6) — the escrow engine.
 *
 * Owns the Deal, DealDeliverable, DealDelivery, DealPayment (rows written by
 * Phase 8's payment flow) and DealEvent tables. Exports:
 * - DealsService — owner use cases + the shared-surface deal lookup;
 * - SharedDealsService — the capability-link projection + client actions.
 *
 * Deal MOVES (status transitions, escrow releases) are not provided here —
 * they come from DealLifecycleModule, shared with DisputesModule so the
 * machine and the escrow writer each have exactly one implementation.
 *
 * The client-action flows call into DisputesModule (raising a dispute row
 * atomically with the DISPUTED move), ReviewsModule (the review action) and
 * NotificationsModule (creator nudges) — one direction only; none of those
 * modules import back into DealsModule.
 *
 * Cross-module calls go through exported services — never through another
 * module's repositories or Prisma models directly (docs/target-architecture.md §6).
 */
@Module({
  imports: [
    CreatorsModule,
    RequestsModule,
    DealLifecycleModule,
    DisputesModule,
    ReviewsModule,
    NotificationsModule,
  ],
  controllers: [DealsController, SharedDealsController],
  providers: [DealsService, SharedDealsService],
  exports: [DealsService, SharedDealsService],
})
export class DealsModule {}
