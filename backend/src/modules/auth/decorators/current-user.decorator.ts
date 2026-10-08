import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth.types';

/**
 * Injects the authenticated identity ({ id, role }) into a handler parameter.
 * Only valid on routes guarded by JwtAuthGuard (i.e. non-@Public() routes).
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user!;
});

type RequestUser = NonNullable<AuthenticatedRequest['user']>;
