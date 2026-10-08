import { Module } from '@nestjs/common';
import { DealLifecycleModule } from '../deals/deal-lifecycle.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

/**
 * Disputes domain boundary (implemented in Phase 9) — see disputes.service.ts
 * for the boundary contract. Depends on DealLifecycleModule (the state
 * machine + escrow writer — deliberately NOT DealsModule, which imports this
 * module for the dispute-raise path; one direction only) and
 * NotificationsModule (creator nudges).
 */
@Module({
  imports: [DealLifecycleModule, NotificationsModule],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
