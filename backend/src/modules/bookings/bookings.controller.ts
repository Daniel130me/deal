import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentCreator } from '../creators/decorators/current-creator.decorator';
import { CreatorProfileGuard, type CreatorRef } from '../creators/guards/creator-profile.guard';
import { BookingsService } from './bookings.service';
import { BookingActionDto } from './dto/booking.dto';

/** Creator's booking schedule — "me"-scoped, resolved from the bearer token. */
@Controller('creators/me/bookings')
@UseGuards(CreatorProfileGuard)
export class CreatorBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  async list(@CurrentCreator() creator: CreatorRef) {
    return { bookings: await this.bookings.listByCreator(creator.id) };
  }
}

/** Booking actions (confirm/decline/complete/cancel): transition table lives in the service. */
@Controller('bookings')
@UseGuards(CreatorProfileGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post(':id')
  @HttpCode(HttpStatus.OK) // an action mutates state; it creates nothing
  async act(@CurrentCreator() creator: CreatorRef, @Param('id') id: string, @Body() dto: BookingActionDto) {
    return { booking: await this.bookings.act(creator.id, id, dto) };
  }
}
