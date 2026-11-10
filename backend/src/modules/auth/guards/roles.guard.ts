import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth.types';
import { UserRole, UserStatus } from '@prisma/client';
import { UsersService } from '../../users/users.service';

/**
 * Global authorization guard: enforces @Roles(...) where present, no-ops
 * otherwise. Runs after JwtAuthGuard (registered second), so request.user is
 * guaranteed on any route that reaches role evaluation.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    // Administrative dispute decisions are too sensitive to tolerate the
    // normal access-token revocation window. Re-check the current database
    // role and account status only for ADMIN routes, keeping ordinary JWT
    // requests stateless while making suspension/demotion immediate here.
    if (required.includes(UserRole.ADMIN)) {
      const current = await this.users.findUserById(request.user.id);
      if (current?.role !== UserRole.ADMIN || current.status !== UserStatus.ACTIVE) {
        throw new HttpException(
          { code: 'FORBIDDEN', message: 'Administrative access is no longer active' },
          HttpStatus.FORBIDDEN,
        );
      }
    }
    return true;
  }
}
