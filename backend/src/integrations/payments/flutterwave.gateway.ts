import { timingSafeEqual } from 'node:crypto';
import type { VerifiedPayment, WebhookHeaders } from './payment-gateway';
import type { PaymentGateway, InitializePaymentInput, InitializePaymentOutput } from './payment-gateway';

/** Minimal connection values the adapter needs — sourced from ConfigService.flutterwave. */
export interface FlutterwaveConfig {
  secretKey: string;
  webhookSecretHash?: string;
}

/** Flutterwave v3 response shape — only the fields this adapter reads. */
interface FlwEnvelope<T> {
  status: 'success' | 'error';
  message?: string;
  data?: T | null;
}

interface FlwInitData {
  link?: string;
}

interface FlwTxData {
  id?: number | string;
  tx_ref?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

/** Gateway calls must not hang the request thread — every fetch gets a budget. */
const GATEWAY_TIMEOUT_MS = 15_000;
/** Header Flutterwave sets on every webhook delivery to its configured secret hash. */
const VERIF_HASH_HEADER = 'verif-hash';
const API_BASE = 'https://api.flutterwave.com/v3';

/**
 * FlutterwaveGateway — the ADAPTER for the default rail (schema's
 * preferredProvider default). Speaks Flutterwave v3 over plain REST via fetch —
 * no SDK dependency for three endpoints (todo.md C1).
 *
 * Money units: Flutterwave amounts are MAJOR units (naira) as a number; this
 * port's contract is integer MINOR units (kobo) — conversion happens here and
 * nowhere else. The service still compares gateway-verified amounts against
 * what was initialized, so a conversion surprise can only fail a payment, never
 * over-credit it.
 *
 * Webhook signature: Flutterwave sets `verif-hash` to the exact secret hash
 * configured in the dashboard — comparison is constant-time.
 */
export class FlutterwaveGateway implements PaymentGateway {
  readonly provider = 'FLUTTERWAVE' as const;

  constructor(private readonly config: FlutterwaveConfig) {}

  async initializePayment(input: InitializePaymentInput): Promise<InitializePaymentOutput> {
    const body = {
      tx_ref: input.reference,
      // Minor -> major: kobo to naira. Rounding is defensive; slot amounts are
      // integer kobo and x/100 keeps 2 decimal places exactly representable.
      amount: input.amountMinor / 100,
      currency: input.currency,
      redirect_url: input.redirectUrl,
      customer: {
        ...(input.customerEmail ? { email: input.customerEmail } : {}),
        ...(input.customerName ? { name: input.customerName } : {}),
      },
      customizations: { title: input.title },
    };
    const data = await this.request<FlwInitData>('/payments', 'POST', body);
    if (!data?.link) {
      throw new Error('Flutterwave initialize returned no hosted link');
    }
    return { link: data.link };
  }

  async verifyPayment(reference: string): Promise<VerifiedPayment> {
    try {
      const data = await this.request<FlwTxData>(
        `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
        'GET',
      );
      return {
        providerTransactionId: data?.id !== undefined ? String(data.id) : null,
        reference: data?.tx_ref ?? reference,
        status: FlutterwaveGateway.mapStatus(data?.status),
        // Gateway truth back to minor units; round guards the float round-trip.
        amountMinor: Math.round((data?.amount ?? 0) * 100),
        currency: data?.currency ?? '',
        raw: data ?? null,
      };
    } catch (error) {
      // "No transaction was found" is the normal answer for a hosted checkout
      // the customer has not completed yet — that is PENDING, not a failure.
      if (error instanceof FlutterwaveApiError && FlutterwaveApiError.isNoTransaction(error)) {
        return {
          providerTransactionId: null,
          reference,
          status: 'pending',
          amountMinor: 0,
          currency: '',
          raw: { message: error.message },
        };
      }
      throw error;
    }
  }

  verifyWebhookSignature(headers: WebhookHeaders, _rawBody: Buffer | undefined): boolean {
    // Flutterwave's scheme is shared-secret equality — the raw body plays no
    // part (named _rawBody to keep the port signature uniform across rails).
    const expected = this.config.webhookSecretHash;
    const received = headers[VERIF_HASH_HEADER];
    if (!expected || typeof received !== 'string') {
      return false;
    }
    return FlutterwaveGateway.safeEqual(expected, received);
  }

  /** Uniform JSON call — throws FlutterwaveApiError on any non-success envelope. */
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
      throw new Error(
        `Flutterwave unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const payload = (await res.json().catch(() => null)) as FlwEnvelope<T> | null;
    if (!res.ok || payload?.status !== 'success') {
      throw new FlutterwaveApiError(
        payload?.message ?? `Flutterwave responded ${res.status}`,
        payload,
      );
    }
    return (payload.data ?? null) as T | null;
  }

  /** Flutterwave reports charge state in lowercase strings — normalise to the port. */
  private static mapStatus(status: string | undefined): VerifiedPayment['status'] {
    if (status === 'successful') return 'successful';
    if (status === 'failed') return 'failed';
    return 'pending';
  }

  private static safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    // Length mismatch leaks only the length (unavoidable for plain equality
    // schemes) — timingSafeEqual itself throws on unequal lengths, so guard first.
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}

/** Provider said no — carries the envelope so callers can special-case messages. */
export class FlutterwaveApiError extends Error {
  constructor(message: string, readonly payload: unknown) {
    super(message);
    this.name = 'FlutterwaveApiError';
  }

  /** The documented response for a reference with no completed charge yet. */
  static isNoTransaction(error: FlutterwaveApiError): boolean {
    return /no transaction/i.test(error.message);
  }
}
