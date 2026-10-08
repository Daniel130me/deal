import { PaymentMethod, PaymentProvider } from '@prisma/client';
import { IsIn, IsString, Length } from 'class-validator';

/**
 * POST /shared/:token/payments/initialize — the client's checkout choices.
 * The AMOUNT is deliberately absent: it is always the server-computed next due
 * slot (deal-money.ts), never a client-supplied number.
 */
export class InitializePaymentDto {
  /** Which rail to charge on (the share page preselects the creator's preference). */
  @IsIn(Object.values(PaymentProvider), { message: 'Unsupported payment provider' })
  provider!: PaymentProvider;

  /** How the customer intends to pay (card / transfer / USSD) — recorded for the rail's checkout and audit. */
  @IsIn(Object.values(PaymentMethod), { message: 'Unsupported payment method' })
  method!: PaymentMethod;
}

/**
 * POST /shared/:token/payments/verify — the browser is back from hosted
 * checkout with a reference. The server re-verifies with the provider; the
 * reference alone is the input (never a claimed status or amount).
 */
export class VerifyPaymentDto {
  @IsString()
  @Length(8, 100, { message: 'That payment reference does not look right' })
  reference!: string;
}
