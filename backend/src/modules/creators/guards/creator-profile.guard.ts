import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { CreatorsService } from '../creators.service';

/**
 * The ownership anchor services receive from controllers — only the fields
 * guaranteed by the guard's single indexed lookup. Keeping this narrow (just
 * the id) is honest: callers never depend on data the guard did not fetch.
 */
export interface CreatorRef {
  id: string;
}

/** Request enriched by CreatorProfileGuard after resolving the token's profile. */
export interface CreatorScopedRequest extends AuthenticatedRequest {
  creator?: CreatorRef;
}

/**
 * Resolves the authenticated user to their CreatorProfile and attaches its id
 * to the request as `request.creator`.
 *
 * - No profile yet -> 404 CREATOR_PROFILE_NOT_FOUND (the caller simply has not
 *   onboarded; there is nothing to act on).
 * - Suspended user -> 403 ACCOUNT_SUSPENDED. Access tokens stay valid for up
 *   to 15 minutes after a suspension, so resource-level guards re-check the
 *   account status here — the token alone is not enough authority to act.
 *
 * Runs after the global JwtAuthGuard (controller-level guards always do), so
 * request.user is guaranteed.
 */
@Injectable()
export class CreatorProfileGuard implements CanActivate {
  constructor(private readonly creators: CreatorsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CreatorScopedRequest>();
    if (!request.user) {
      // Defensive: unreachable while the global JwtAuthGuard is registered.
      throw new HttpException({ code: 'TOKEN_INVALID', message: 'Missing bearer token' }, HttpStatus.UNAUTHORIZED);
    }

    const profile = await this.creators.getProfileStatusByUserId(request.user.id);
    if (!profile) {
      throw new HttpException(
        { code: 'CREATOR_PROFILE_NOT_FOUND', message: 'Create your creator profile first' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (profile.status !== UserStatus.ACTIVE) {
      throw new HttpException({ code: 'ACCOUNT_SUSPENDED', message: 'This account is suspended' }, HttpStatus.FORBIDDEN);
    }

    request.creator = { id: profile.id };
    return true;
  }
}
