import { Module } from '@nestjs/common';
import { CreatorsService } from './creators.service';

/** Creators domain boundary — see creators.service.ts for the boundary contract. */
@Module({
  providers: [CreatorsService],
  exports: [CreatorsService],
})
export class CreatorsModule {}
