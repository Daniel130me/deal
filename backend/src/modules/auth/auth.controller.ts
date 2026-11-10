import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { RATE_LIMITS } from '../../common/rate-limit/rate-limit.constants';
import { ConfigService } from '../../config/config.service';
import { AuthService } from './auth.service';
import {
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
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
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle(RATE_LIMITS.auth.sessionCreation)
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.signup(dto);
    this.setRefreshCookie(response, session.refreshToken);
    return this.browserSession(session);
  }

  @Public()
  @Throttle(RATE_LIMITS.auth.sessionCreation)
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(dto);
    this.setRefreshCookie(response, session.refreshToken);
    return this.browserSession(session);
  }

  @Public()
  @Throttle(RATE_LIMITS.auth.tokenRotation)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.refresh(this.refreshTokenFrom(request, dto));
    this.setRefreshCookie(response, session.refreshToken);
    return this.browserSession(session);
  }

  @Public()
  @Throttle(RATE_LIMITS.auth.tokenRotation)
  @Post('logout')
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Clear client state even when the presented credential is already invalid.
    // Server-side revocation remains authoritative when a token is available.
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.cookieOptions());
    const result = await this.auth.logout(this.refreshTokenFrom(request, dto));
    return result;
  }

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.auth.getProfile(user.id);
  }

  /** Body tokens remain accepted for non-browser API clients and migration. */
  private refreshTokenFrom(request: Request, dto: RefreshTokenDto): string {
    // A browser cookie is authoritative. The body is only a fallback for old
    // sessions and non-browser clients, so stale localStorage cannot override
    // a newer rotated cookie.
    const token = this.readCookie(request.headers.cookie, REFRESH_TOKEN_COOKIE) ?? dto.refreshToken;
    if (!token) {
      throw new HttpException({ code: 'TOKEN_INVALID', message: 'Invalid refresh token' }, HttpStatus.UNAUTHORIZED);
    }
    return token;
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_TOKEN_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: REFRESH_TOKEN_TTL_SECONDS * 1_000,
    });
  }

  /** The long-lived credential is cookie-only and never enters browser JS. */
  private browserSession<T extends { refreshToken: string }>(session: T): Omit<T, 'refreshToken'> {
    const { refreshToken: _cookieOnly, ...publicSession } = session;
    return publicSession;
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'strict' as const,
      path: REFRESH_TOKEN_COOKIE_PATH,
    };
  }

  /** Minimal cookie parser: this endpoint needs one cookie, not middleware state. */
  private readCookie(header: string | undefined, name: string): string | undefined {
    for (const part of header?.split(';') ?? []) {
      const separator = part.indexOf('=');
      if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
