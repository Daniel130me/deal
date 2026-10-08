import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

/**
 * Restricts a route to the given roles (evaluated by the global RolesGuard,
 * after JwtAuthGuard has authenticated the request).
 * Routes without @Roles() are open to any authenticated user.
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
