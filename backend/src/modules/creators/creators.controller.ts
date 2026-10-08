import { Body, Controller, Get, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { CreatorsService } from './creators.service';
import { CurrentCreator } from './decorators/current-creator.decorator';
import { CreatorProfileGuard, type CreatorRef } from './guards/creator-profile.guard';
import { CreateProfileDto, ReplaceChannelsDto, UpdateProfileDto } from './dto/profile.dto';
import { OverviewService } from './overview.service';

/**
 * Owner profile endpoints. Every path is "me" — the profile is resolved from
 * the bearer token (CreatorProfileGuard), never from the URL, so an
 * authenticated user can only ever read or mutate their own profile.
 *
 * The guard is deliberately NOT on the class: POST /me is onboarding — the one
 * call a user makes precisely because they have no profile yet. It addresses
 * request.user directly instead.
 */
@Controller('creators')
export class CreatorsController {
  constructor(
    private readonly creators: CreatorsService,
    private readonly overviewService: OverviewService,
  ) {}

  /** Onboarding — promotes the account to CREATOR in the same transaction. */
  @Post('me')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProfileDto) {
    return this.creators.createProfile(user.id, dto);
  }

  /** Full owner view (includes onboarded, timestamps, channels). */
  @Get('me')
  @UseGuards(CreatorProfileGuard)
  me(@CurrentCreator() creator: CreatorRef) {
    return this.creators.getProfileById(creator.id);
  }

  /**
   * The dashboard aggregate (Phase 9): stats, money summaries, earnings
   * series, rating summary and recent lists — all derived from the DB at read
   * time (docs/implementation-plan.md Phase 9: "via DB aggregation").
   */
  @Get('me/overview')
  @UseGuards(CreatorProfileGuard)
  overview(@CurrentCreator() creator: CreatorRef) {
    return this.overviewService.getForCreator(creator.id);
  }

  @Patch('me')
  @UseGuards(CreatorProfileGuard)
  update(@CurrentCreator() creator: CreatorRef, @Body() dto: UpdateProfileDto) {
    return this.creators.updateProfile(creator.id, dto);
  }

  /** Replaces the whole channel set (PUT semantics, matches the prototype). */
  @Put('me/channels')
  @UseGuards(CreatorProfileGuard)
  replaceChannels(@CurrentCreator() creator: CreatorRef, @Body() dto: ReplaceChannelsDto) {
    return this.creators.replaceChannels(creator.id, dto.channels);
  }
}
