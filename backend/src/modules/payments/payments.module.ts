import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/** Payments domain boundary — see payments.service.ts for the boundary contract. */
@Module({
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
