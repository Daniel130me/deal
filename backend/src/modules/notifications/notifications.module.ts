import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/** Notifications domain boundary — see notifications.service.ts for the boundary contract. */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
