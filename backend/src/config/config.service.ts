import { Injectable } from '@nestjs/common';
import { env, parseOrigins, type Env } from './env';

/**
 * Typed access to the validated environment.
 * Values are captured from `env.ts` (parsed once, fail-fast) — nothing here
 * re-reads process.env at runtime, so configuration is immutable while running.
 */
@Injectable()
export class ConfigService {
  private readonly values: Env = env;

  get nodeEnv(): Env['NODE_ENV'] {
    return this.values.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.values.NODE_ENV === 'production';
  }

  get port(): number {
    return this.values.PORT;
  }

  get corsOrigins(): string[] {
    return parseOrigins(this.values.FRONTEND_URL);
  }

  get jwtAccessSecret(): string {
    return this.values.JWT_ACCESS_SECRET;
  }

  /** Cloudflare R2 connection values for the storage adapter (integrations/storage). */
  get r2(): { bucket: string; accessKeyId: string; secretAccessKey: string; endpoint: string } {
    return {
      bucket: this.values.R2_BUCKET,
      accessKeyId: this.values.R2_ACCESS_KEY_ID,
      secretAccessKey: this.values.R2_SECRET_ACCESS_KEY,
      endpoint: this.values.R2_S3_ENDPOINT,
    };
  }

  /** Flutterwave v3 connection values for the gateway adapter (integrations/payments). */
  get flutterwave(): { secretKey: string; webhookSecretHash?: string } {
    return {
      secretKey: this.values.FLW_SECRET_KEY,
      webhookSecretHash: this.values.FLW_WEBHOOK_SECRET_HASH,
    };
  }

  /** Paystack stays dormant until keys are supplied — the adapter reports this. */
  get paystack(): { secretKey: string } | null {
    return this.values.PAYSTACK_SECRET_KEY ? { secretKey: this.values.PAYSTACK_SECRET_KEY } : null;
  }

  /**
   * Where hosted-checkout flows redirect back to after payment. Derived from
   * FRONTEND_URL (never client-supplied): an attacker must not choose where a
   * paying user's browser lands. Phase 10's share page lives at /shared/:token.
   */
  get paymentRedirectBase(): string {
    return this.values.FRONTEND_URL;
  }
}
