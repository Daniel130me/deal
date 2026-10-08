import { Module } from '@nestjs/common';
import { PaymentsIntegrationModule } from '../../integrations/payments/payments-integration.module';
import { PaymentsModule } from '../payments/payments.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/**
 * Webhooks domain boundary (implemented in Phase 8) — provider delivery intake.
 *
 * Imports PaymentsModule for PaymentsService (the only writer of payment rows)
 * and PaymentsIntegrationModule for the signature-verifying adapters. Owns the
 * WebhookEvent idempotency ledger; nothing else may write it.
 */
@Module({
  imports: [PaymentsModule, PaymentsIntegrationModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
