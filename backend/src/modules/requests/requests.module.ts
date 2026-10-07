import { Module } from '@nestjs/common';
import { RequestsService } from './requests.service';

/** Requests domain boundary — see requests.service.ts for the boundary contract. */
@Module({
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
