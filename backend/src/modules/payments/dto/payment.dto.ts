import { PaymentMethod, PaymentProvider } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, MaxLength } from 'class-validator';

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

  /** Real payer address passed to the hosted rail for receipts and support. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid email for the payment receipt' })
  @MaxLength(254, { message: 'Email is too long' })
  customerEmail!: string;
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
