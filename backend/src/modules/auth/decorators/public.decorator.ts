import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as reachable without a bearer token.
 * The global JwtAuthGuard skips @Public() routes — everything else 401s by
 * default, so a forgotten guard can never silently expose an endpoint.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
