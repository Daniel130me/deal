import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Auth domain boundary — see auth.service.ts for the boundary contract. */
@Module({
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
