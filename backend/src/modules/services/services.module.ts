import { Module } from '@nestjs/common';
import { CreatorsModule } from '../creators/creators.module';
import { CreatorServicesController, ServicesController } from './services.controller';
import { ServicesService } from './services.service';

/**
 * Services domain boundary (implemented in Phase 5). Imports CreatorsModule
 * for the guard/decorator; exports ServicesService so requests/bookings/public
 * can validate service references without touching Prisma directly.
 */
@Module({
  imports: [CreatorsModule],
  controllers: [CreatorServicesController, ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
