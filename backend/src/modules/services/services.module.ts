import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';

/** Services domain boundary — see services.service.ts for the boundary contract. */
@Module({
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
