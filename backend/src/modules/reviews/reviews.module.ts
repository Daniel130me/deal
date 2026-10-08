import { Module } from '@nestjs/common';
import { CreatorsModule } from '../creators/creators.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/**
 * Reviews domain boundary — see reviews.service.ts for the boundary contract.
 * Depends on CreatorsModule (the profile guard anchoring the me-scoped read
 * route) and NotificationsModule (creator nudge). The write path is exercised
 * from DealsModule (the capability surface), which imports THIS module.
 */
@Module({
  imports: [CreatorsModule, NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
