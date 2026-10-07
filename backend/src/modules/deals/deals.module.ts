import { Module } from '@nestjs/common';
import { DealsService } from './deals.service';

/** Deals domain boundary — see deals.service.ts for the boundary contract. */
@Module({
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
