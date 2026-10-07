import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

/** Users domain boundary — see users.service.ts for the boundary contract. */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
