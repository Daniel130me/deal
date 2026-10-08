import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { NotificationsService } from './notifications.service';

/**
 * The user's notification inbox. Identity comes from the bearer token — any
 * authenticated role has an inbox (creators today; the surface is ready for
 * client accounts without changes). No DTOs: the only inputs are path params
 * on POST actions, and there is nothing to create or filter via body.
 *
 * No @UseGuards needed: the global JwtAuthGuard (APP_GUARD) already denies
 * unauthenticated requests — deny-by-default covers this controller too.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  inbox(@CurrentUser() user: RequestUser) {
    return this.notifications.listForUser(user.id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK) // a bulk mutation, not a creation
  readAll(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK) // a mutation, not a creation
  readOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
