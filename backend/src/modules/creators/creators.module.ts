import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CreatorsController } from './creators.controller';
import { CreatorsService } from './creators.service';
import { CreatorProfileGuard } from './guards/creator-profile.guard';

/**
 * Creators domain boundary (implemented in Phase 5).
 *
 * Exports CreatorsService (the ONLY writer of CreatorProfile/CreatorChannel
 * rows) and CreatorProfileGuard (resolves token -> profile id for the other
 * creator-scoped modules). Cross-module calls go through these — never through
 * another module's repositories or Prisma models directly
 * (docs/target-architecture.md §6).
 */
@Module({
  imports: [UsersModule],
  controllers: [CreatorsController],
  providers: [CreatorsService, CreatorProfileGuard],
  exports: [CreatorsService, CreatorProfileGuard],
})
export class CreatorsModule {}
