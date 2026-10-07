import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

/** Webhooks domain boundary — see webhooks.service.ts for the boundary contract. */
@Module({
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
