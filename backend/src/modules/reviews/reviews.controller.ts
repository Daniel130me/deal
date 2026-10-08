import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentCreator } from '../creators/decorators/current-creator.decorator';
import { CreatorProfileGuard, type CreatorRef } from '../creators/guards/creator-profile.guard';
import { ReviewsService } from './reviews.service';

/**
 * Creator-facing review reads — "me"-scoped, the profile resolved from the
 * bearer token. The WRITE side lives on the capability link
 * (POST /shared/:token/actions action=review): the reviewer is the anonymous
 * client whose credential IS the share token, so there is no /reviews POST.
 */
@Controller('reviews')
@UseGuards(CreatorProfileGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  async list(@CurrentCreator() creator: CreatorRef) {
    return { reviews: await this.reviews.listForCreator(creator.id) };
  }
}
