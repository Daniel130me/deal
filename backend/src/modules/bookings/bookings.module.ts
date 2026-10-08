import { Module } from '@nestjs/common';
import { CreatorsModule } from '../creators/creators.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServicesModule } from '../services/services.module';
import { BookingsController, CreatorBookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

/**
 * Bookings domain boundary (implemented in Phase 5). Owns the Booking table;
 * the request/booking state machines stay in their owning services.
 * NotificationsModule powers the creator nudge on new public submissions
 * (Phase 9).
 */
@Module({
  imports: [CreatorsModule, ServicesModule, NotificationsModule],
  controllers: [CreatorBookingsController, BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
