import { Module } from '@nestjs/common';
import { CreatorsModule } from '../creators/creators.module';
import { ServicesModule } from '../services/services.module';
import { CreatorRequestsController, RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

/**
 * Requests domain boundary (implemented in Phase 5). Owns the ClientRequest
 * table; exports RequestsService (Phase 6's deal creation marks requests
 * replied through it).
 */
@Module({
  imports: [CreatorsModule, ServicesModule],
  controllers: [CreatorRequestsController, RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
