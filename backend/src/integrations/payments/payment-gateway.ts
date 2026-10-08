import type { PaymentProvider } from '@prisma/client';

/**
 * PaymentGateway — the PORT every payment rail implements
 * (docs/target-architecture.md §5: PaymentsService → PaymentGateway →
 * PaystackGateway | FlutterwaveGateway).
 *
 * The port is deliberately SMALL and money-shaped, not provider-shaped:
 * - initializePayment: start a charge for an exact amount, get the hosted
 *   checkout URL the customer's browser completes it on. Card data never
 *   touches this API (PCI stays with the provider) — that is why there is no
 *   "charge card" operation even though the providers support one.
 * - verifyPayment: the SERVER re-asks the provider what happened to a
 *   reference. This is the only money truth the pipeline trusts — neither the
 *   browser's success redirect nor the webhook body is evidence on its own.
 * - verifyWebhookSignature: whether a webhook delivery really came from the
 *   provider. Signature schemes differ per rail (Flutterwave: shared-secret
 *   header equality; Paystack: HMAC-SHA512 over the raw body) — both collapse
 *   to this one boolean here.
 */
export interface InitializePaymentInput {
  /** Our generated unique reference — sent as the provider's tx_ref/reference. */
  reference: string;
  /** Integer minor units (kobo). Adapters convert to the provider's unit. */
  amountMinor: number;
  currency: string;
  customerEmail?: string;
  customerName?: string;
  /** Where the provider sends the customer's browser after checkout. */
  redirectUrl: string;
  /** Human-facing label shown on the provider's checkout page. */
  title: string;
}

export interface InitializePaymentOutput {
  /** Hosted checkout URL — the browser finishes the charge there. */
  link: string;
}

export type GatewayPaymentStatus = 'successful' | 'failed' | 'pending';

export interface VerifiedPayment {
  /** The provider's own transaction id (Flutterwave data.id), when it has one. */
  providerTransactionId: string | null;
  /** The reference echoed back (our tx_ref). */
  reference: string;
  status: GatewayPaymentStatus;
  /** Gateway truth, integer minor units — what the customer ACTUALLY paid. */
  amountMinor: number;
  currency: string;
  /** Verbatim provider response — the audit payload for PaymentTransaction.raw. */
  raw: unknown;
}

/** Request headers, typed loosely — adapters pick the header(s) they need. */
export type WebhookHeaders = Record<string, string | string[] | undefined>;

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  initializePayment(input: InitializePaymentInput): Promise<InitializePaymentOutput>;
  verifyPayment(reference: string): Promise<VerifiedPayment>;
  /** Constant-time where the scheme allows it; false on any doubt. */
  verifyWebhookSignature(headers: WebhookHeaders, rawBody: Buffer | undefined): boolean;
}
