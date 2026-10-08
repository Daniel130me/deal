import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import type { WebhookHeaders } from '../../integrations/payments/payment-gateway';
import { WebhooksService } from './webhooks.service';

/**
 * Provider webhook intake — the out-of-band confirmation channel.
 *
 * @Public() by necessity (providers have no user tokens) but never anonymous in
 * effect: every delivery passes signature verification before any business
 * field is trusted, and the pipeline is idempotent per (provider, event id).
 *
 * Deliberately NOT rate-limited (see RATE_LIMITS note): a 429 here would only
 * make healthy rails retry; the signature gate plus cheap idempotency are the
 * abuse controls. Raw body is captured (rawBody: true at bootstrap) because
 * Paystack signs the exact bytes — Flutterwave's shared-secret header needs no
 * body but the SHA-256 of the same bytes is recorded for forensics.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Public()
  @Post('flutterwave')
  @HttpCode(HttpStatus.OK) // providers read the status code, not the envelope
  flutterwave(@Req() req: Request, @Body() payload: unknown) {
    return this.webhooks.handleFlutterwave(req.headers as WebhookHeaders, rawBodyOf(req), payload);
  }

  @Public()
  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  paystack(@Req() req: Request, @Body() payload: unknown) {
    return this.webhooks.handlePaystack(req.headers as WebhookHeaders, rawBodyOf(req), payload);
  }
}

/** Captured when the app is created with { rawBody: true } (app.ts). */
function rawBodyOf(req: Request): Buffer | undefined {
  return (req as Request & { rawBody?: Buffer }).rawBody;
}
