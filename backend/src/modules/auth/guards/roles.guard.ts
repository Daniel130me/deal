import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth.types';
import type { UserRole } from '@prisma/client';

/**
 * Global authorization guard: enforces @Roles(...) where present, no-ops
 * otherwise. Runs after JwtAuthGuard (registered second), so request.user is
 * guaranteed on any route that reaches role evaluation.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user || !required.includes(request.user.role)) {
      throw new HttpException(
        { code: 'FORBIDDEN', message: 'Insufficient role for this operation' },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
