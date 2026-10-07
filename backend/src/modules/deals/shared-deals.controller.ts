import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { RATE_LIMITS } from '../../common/rate-limit/rate-limit.constants';
import { Public } from '../auth/decorators/public.decorator';
import { SharedDealsService } from './shared-deals.service';
import { SharedDealActionDto } from './dto/deal.dto';

/**
 * Capability-link surface — the client side of every deal.
 *
 * The unguessable 256-bit share token IS the credential, so these routes are
 * @Public() but NOT anonymous-in-spirit: they expose exactly one deal's
 * whitelisted projection and accept only that deal's lifecycle moves, and
 * every route is rate-limited per client IP (plan §7: "capability share
 * links: >=128-bit random tokens, rate-limited, projection DTO").
 *
 * Kept inside DealsModule (not the PublicModule): the capability surface is a
 * deals concern — it projects deal state and drives the deal state machine —
 * so it lives with the domain that owns both. One small controller keeps the
 * "what can a stranger do here?" question answerable in one glance.
 */
@Controller('shared')
@UseGuards(ThrottlerGuard)
export class SharedDealsController {
  constructor(private readonly shared: SharedDealsService) {}

  @Public()
  @Throttle(RATE_LIMITS.shared.dealRead)
  @Get(':token')
  async view(@Param('token') token: string) {
    // Projection already carries { deal, creator, amounts } — no extra wrapping.
    return this.shared.getProjection(token);
  }

  @Public()
  @Throttle(RATE_LIMITS.shared.action)
  @Post(':token/actions')
  @HttpCode(HttpStatus.OK) // an action mutates state; it creates nothing
  async act(@Param('token') token: string, @Body() dto: SharedDealActionDto) {
    return this.shared.act(token, dto);
  }
}
