import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Auth domain boundary — see auth.service.ts for the boundary contract.
 *
 * Registers the two global guards (authentication, then role authorisation) so
 * EVERY route is protected by default; @Public() opts individual routes out.
 * Guard order = provider order here: JwtAuthGuard must run before RolesGuard.
 */
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenService, { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }],
  exports: [AuthService],
})
export class AuthModule {}
