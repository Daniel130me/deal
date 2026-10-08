import { Module } from '@nestjs/common';
import { PaymentsIntegrationModule } from '../../integrations/payments/payments-integration.module';
import { DealLifecycleModule } from '../deals/deal-lifecycle.module';
import { DealsModule } from '../deals/deals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsService } from './payments.service';
import { SharedPaymentsController } from './shared-payments.controller';

/**
 * Payments domain boundary (implemented in Phase 8) — the money rails.
 *
 * Imports DealsModule for the shared-token deal lookup, DealLifecycleModule
 * for DealStateService (the ONLY writer of Deal.status — the deposit's
 * SENT -> ACTIVE move happens inside the payment transaction through it), and
 * NotificationsModule for the creator's payment nudge after a verified
 * landing. Imports PaymentsIntegrationModule for the gateway adapters
 * (Flutterwave active, Paystack dormant until keyed).
 *
 * Exports PaymentsService — the webhook pipeline re-verifies and lands money
 * through it; nothing else may write DealPayment/PaymentTransaction rows.
 */
@Module({
  imports: [DealsModule, DealLifecycleModule, PaymentsIntegrationModule, NotificationsModule],
  controllers: [SharedPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
