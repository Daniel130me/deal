import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../../common/rate-limit/rate-limit.constants';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto, RefreshTokenDto, SignupDto } from './dto/auth.dto';
import type { RequestUser } from './auth.types';

/**
 * Session endpoints. Everything under /api/v1 requires a bearer token by
 * default (global JwtAuthGuard); the four session-creation endpoints are the
 * explicit exceptions via @Public().
 *
 * Rate-limited (Phase 5): credential endpoints accept 10 req/min/IP, token
 * rotation 30 — see common/rate-limit for the policy rationale. Counts
 * include failed validation, so brute-forcing through the validator is
 * throttled too.
 */
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(RATE_LIMITS.auth.sessionCreation)
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @Throttle(RATE_LIMITS.auth.sessionCreation)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle(RATE_LIMITS.auth.tokenRotation)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Throttle(RATE_LIMITS.auth.tokenRotation)
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.auth.getProfile(user.id);
  }
}
