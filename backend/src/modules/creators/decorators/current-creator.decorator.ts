import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CreatorScopedRequest } from '../guards/creator-profile.guard';

/**
 * Parameter decorator for creator-scoped controllers: hands the resolved
 * CreatorRef ({ id }) to the handler. Requires CreatorProfileGuard (or
 * @UseGuards(CreatorProfileGuard)) on the route.
 *
 *   @Get('me')
 *   me(@CurrentCreator() creator: CreatorRef) { ... }
 */
export const CurrentCreator = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<CreatorScopedRequest>();
  return request.creator;
});
