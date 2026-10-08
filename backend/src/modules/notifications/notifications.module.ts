import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Notifications domain boundary — see notifications.service.ts for the
 * boundary contract. Leaf module: imports nothing, so any domain module can
 * inject NotificationsService without creating a cycle.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
