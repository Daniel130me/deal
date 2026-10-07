import { Module } from '@nestjs/common';
import { DisputesService } from './disputes.service';

/** Disputes domain boundary — see disputes.service.ts for the boundary contract. */
@Module({
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
