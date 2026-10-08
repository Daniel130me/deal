import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessTokenService } from '../access-token.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../auth.types';

/**
 * Global authentication guard: every route requires `Authorization: Bearer <jwt>`
 * unless marked @Public(). On success it attaches { id, role } to the request —
 * the only source of identity the rest of the app is allowed to trust.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new HttpException(
        { code: 'TOKEN_INVALID', message: 'Missing bearer token' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const claims = await this.tokens.verifyAccessToken(header.slice('Bearer '.length).trim());
    request.user = { id: claims.sub, role: claims.role };
    return true;
  }
}
