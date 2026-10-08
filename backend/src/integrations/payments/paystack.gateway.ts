import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentGateway, InitializePaymentInput, InitializePaymentOutput } from './payment-gateway';
import type { VerifiedPayment, WebhookHeaders } from './payment-gateway';

/** Minimal connection values the adapter needs — sourced from ConfigService.paystack. */
export interface PaystackConfig {
  secretKey: string;
}

/** Paystack response shape — only the fields this adapter reads. */
interface PsEnvelope<T> {
  status: boolean;
  message?: string;
  data?: T | null;
}

interface PsInitData {
  authorization_url?: string;
}

interface PsTxData {
  id?: number;
  reference?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

const GATEWAY_TIMEOUT_MS = 15_000;
const SIGNATURE_HEADER = 'x-paystack-signature';
const API_BASE = 'https://api.paystack.co';

/**
 * PaystackGateway — the ADAPTER for the second rail. Implemented alongside
 * Flutterwave (plan Phase 8) so adding the rail later is configuration, not
 * code; it stays DORMANT until PAYSTACK_SECRET_KEY is supplied (the integration
 * module refuses to construct it without one, and the service answers 503).
 *
 * Money units: Paystack amounts are already MINOR units (kobo) — no conversion,
 * unlike the Flutterwave adapter.
 *
 * Email: Paystack's initialize API requires a customer email. The capability
 * surface does not collect one today, so the rail needs Phase 10 to pass the
 * client's contact through — the adapter fails loudly rather than fabricating
 * customer data (no invented emails, todo.md C3).
 */
export class PaystackGateway implements PaymentGateway {
  readonly provider = 'PAYSTACK' as const;

  constructor(private readonly config: PaystackConfig) {}

  async initializePayment(input: InitializePaymentInput): Promise<InitializePaymentOutput> {
    if (!input.customerEmail) {
      throw new Error('Paystack requires a customer email — not collected on this surface yet');
    }
    const body = {
      reference: input.reference,
      amount: input.amountMinor, // already kobo
      currency: input.currency,
      email: input.customerEmail,
      callback_url: input.redirectUrl,
      metadata: { title: input.title, ...(input.customerName ? { name: input.customerName } : {}) },
    };
    const data = await this.request<PsInitData>('/transaction/initialize', 'POST', body);
    if (!data?.authorization_url) {
      throw new Error('Paystack initialize returned no checkout URL');
    }
    return { link: data.authorization_url };
  }

  async verifyPayment(reference: string): Promise<VerifiedPayment> {
    const data = await this.request<PsTxData>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      'GET',
    );
    return {
      providerTransactionId: data?.id !== undefined ? String(data.id) : null,
      reference: data?.reference ?? reference,
      status: PaystackGateway.mapStatus(data?.status),
      amountMinor: data?.amount ?? 0, // Paystack speaks kobo natively
      currency: data?.currency ?? '',
      raw: data ?? null,
    };
  }

  /**
   * Paystack signs the RAW request body with HMAC-SHA512 keyed by the secret
   * key — hence the rawBody the Flutterwave adapter ignores.
   */
  verifyWebhookSignature(headers: WebhookHeaders, rawBody: Buffer | undefined): boolean {
    const received = headers[SIGNATURE_HEADER];
    if (typeof received !== 'string' || !rawBody) {
      return false;
    }
    const expected = createHmac('sha512', this.config.secretKey).update(rawBody).digest('hex');
    const bufA = Buffer.from(expected, 'utf8');
    const bufB = Buffer.from(received, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  private async request<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T | null> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`Paystack unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }

    const payload = (await res.json().catch(() => null)) as PsEnvelope<T> | null;
    if (!res.ok || payload?.status !== true) {
      throw new Error(payload?.message ?? `Paystack responded ${res.status}`);
    }
    return (payload.data ?? null) as T | null;
  }

  /**
   * success -> successful, failed -> failed, anything else (ongoing, abandoned,
   * queued...) -> pending: an incomplete checkout can still be completed on the
   * same hosted link, so only the provider's terminal states are terminal here.
   */
  private static mapStatus(status: string | undefined): VerifiedPayment['status'] {
    if (status === 'success') return 'successful';
    if (status === 'failed') return 'failed';
    return 'pending';
  }
}
