import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';

/** Bookings domain boundary — see bookings.service.ts for the boundary contract. */
@Module({
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
