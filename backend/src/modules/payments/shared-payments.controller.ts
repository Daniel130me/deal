import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { RATE_LIMITS } from '../../common/rate-limit/rate-limit.constants';
import { InitializePaymentDto, VerifyPaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

/**
 * Capability-link payments — the client's checkout surface.
 *
 * Sits beside SharedDealsController on the same /shared path but lives in the
 * payments module: money movement is a payments concern (rail choice,
 * verification, escrow landing), while the deals module stays the authority on
 * deal state. The unguessable share token IS the credential, so the routes are
 * @Public() but rate-limited per IP — this is the only anonymous surface that
 * can move money, and its budget is documented in RATE_LIMITS.shared.payment.
 *
 * NOTE: initialize returns a provider HOSTED checkout link. Card data never
 * touches this API — the rail's PCI-scoped page collects it, and this server
 * only ever re-verifies the outcome.
 */
@Controller('shared')
@UseGuards(ThrottlerGuard)
export class SharedPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Throttle(RATE_LIMITS.shared.payment)
  @Post(':token/payments/initialize')
  async initialize(@Param('token') token: string, @Body() dto: InitializePaymentDto) {
    return this.payments.initializeForSharedDeal(token, dto);
  }

  @Public()
  @Throttle(RATE_LIMITS.shared.payment)
  @Post(':token/payments/verify')
  @HttpCode(HttpStatus.OK) // verify polls may repeat; it creates nothing on its own
  async verify(@Param('token') token: string, @Body() dto: VerifyPaymentDto) {
    return this.payments.verifySharedPayment(token, dto);
  }
}
