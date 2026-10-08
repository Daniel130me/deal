import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CreatorsController } from './creators.controller';
import { CreatorsService } from './creators.service';
import { CreatorProfileGuard } from './guards/creator-profile.guard';
import { OverviewService } from './overview.service';

/**
 * Creators domain boundary (implemented in Phase 5).
 *
 * Exports CreatorsService (the ONLY writer of CreatorProfile/CreatorChannel
 * rows) and CreatorProfileGuard (resolves token -> profile id for the other
 * creator-scoped modules). Cross-module calls go through these — never through
 * another module's repositories or Prisma models directly
 * (docs/target-architecture.md §6).
 *
 * OverviewService (Phase 9) is the read-only dashboard aggregate: one
 * PrismaService batch over the creator's own deal/payment/request/booking/
 * review rows. Deliberately NO module imports beyond UsersModule: a dependency
 * on ReviewsModule here would cycle with ReviewsModule's guard dependency on
 * this module (the rating summary is a plain read-only aggregate).
 */
@Module({
  imports: [UsersModule],
  controllers: [CreatorsController],
  providers: [CreatorsService, CreatorProfileGuard, OverviewService],
  exports: [CreatorsService, CreatorProfileGuard],
})
export class CreatorsModule {}
