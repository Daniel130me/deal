import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../../common/rate-limit/rate-limit.constants';
import { Public } from '../auth/decorators/public.decorator';
import { CreatorsService } from '../creators/creators.service';
import { BookingsService } from '../bookings/bookings.service';
import { RequestsService } from '../requests/requests.service';
import { ServicesService } from '../services/services.service';
import { PublicRequestDto } from '../requests/dto/request.dto';
import { PublicBookingDto } from '../bookings/dto/booking.dto';

/**
 * The platform's entire unauthenticated surface in one controller — the
 * security posture ("what can a stranger do?") is reviewable in this one file.
 * Every route is rate-limited per client IP; submissions additionally
 * validate that referenced services exist, are active, and belong to the
 * creator the form was submitted to (checked inside the owning services).
 */
@Controller('public')
@UseGuards(ThrottlerGuard)
export class PublicController {
  constructor(
    private readonly creators: CreatorsService,
    private readonly services: ServicesService,
    private readonly requests: RequestsService,
    private readonly bookings: BookingsService,
  ) {}

  /** Creator landing page: public profile fields + active services only. */
  @Public()
  @Throttle(RATE_LIMITS.public.pageRead)
  @Get(':handle')
  async page(@Param('handle') handle: string) {
    const profile = await this.resolveProfile(handle);
    const services = await this.services.listActiveByCreator(profile.id);
    return { creator: this.creators.toPublicProfile(profile), services };
  }

  @Public()
  @Throttle(RATE_LIMITS.public.submission)
  @Post(':handle/requests')
  async submitRequest(@Param('handle') handle: string, @Body() dto: PublicRequestDto) {
    const profile = await this.resolveProfile(handle);
    return { request: await this.requests.createPublicSubmission(profile.id, dto) };
  }

  @Public()
  @Throttle(RATE_LIMITS.public.submission)
  @Post(':handle/bookings')
  async submitBooking(@Param('handle') handle: string, @Body() dto: PublicBookingDto) {
    const profile = await this.resolveProfile(handle);
    return { booking: await this.bookings.createPublicSubmission(profile.id, dto) };
  }

  private async resolveProfile(handle: string) {
    const profile = await this.creators.getProfileByHandle(handle);
    if (!profile) {
      throw new HttpException({ code: 'CREATOR_NOT_FOUND', message: 'Creator not found' }, HttpStatus.NOT_FOUND);
    }
    return profile;
  }
}
