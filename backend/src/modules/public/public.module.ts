import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { CreatorsModule } from '../creators/creators.module';
import { RequestsModule } from '../requests/requests.module';
import { ServicesModule } from '../services/services.module';
import { PublicController } from './public.controller';

/**
 * Public (unauthenticated) boundary — introduced in Phase 5.
 *
 * Not part of the original 13 shells: it exists so the whole anonymous surface
 * (creator page + submissions) is one rate-limited controller, and because
 * GET /public/:handle needs creators + services together, which a controller
 * inside either module cannot have without a circular import.
 */
@Module({
  imports: [CreatorsModule, ServicesModule, RequestsModule, BookingsModule],
  controllers: [PublicController],
})
export class PublicModule {}
