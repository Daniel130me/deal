import type { UserRole } from '@prisma/client';
import type { Request } from 'express';

/** Identity attached to a request by JwtAuthGuard after token verification. */
export interface RequestUser {
  id: string;
  role: UserRole;
}

/** Express request carrying the authenticated identity (set by JwtAuthGuard). */
export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}
