import { z } from 'zod';

/**
 * Runtime environment contract for the backend.
 *
 * The schema is the single source of truth for what the app reads from the
 * environment — every variable must be declared here with a validation rule.
 * Parsing happens ONCE at first import; an invalid environment aborts boot
 * with a readable error instead of failing later on a half-initialised service.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Browser origin(s) allowed by CORS. Comma-separated; never a wildcard in production. */
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  /** Neon PostgreSQL pooled connection string (Prisma runtime). Required since Phase 3.
   *  Named NEON_* on purpose: the sandbox platform exports a workspace-global
   *  DATABASE_URL (the frontend prototype's SQLite file) that would otherwise
   *  shadow this file's value — see .env for the full rationale. */
  NEON_DATABASE_URL: z
    .string()
    .regex(/^postgresql:\/\//, 'must be a postgresql:// connection string'),
  /** HMAC secret for short-lived access-token JWTs (HS256).
   *  ≥32 chars = ≥256 bits of entropy; generate with `openssl rand -base64 48`.
   *  Required (no dev default): a silently-weak secret in dev tends to survive
   *  into production untouched — fail-fast keeps that class of mistake impossible. */
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** Cloudflare R2 (S3-compatible) object storage — deal files.
   *  Required since Phase 7: files are core domain data (deliverables), so a
   *  boot without storage is a boot without a working product — fail-fast
   *  beats a half-configured app that 500s on first upload.
   *  IMPORTANT: deal files are PRIVATE — access only via presigned URLs.
   *  R2_PUBLIC_BASE_URL (the optional public r2.dev host) is NOT used for
   *  them; it is reserved for genuinely public assets (e.g. avatars). */
  R2_BUCKET: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  /** R2 S3 endpoint, e.g. https://<account-id>.r2.cloudflarestorage.com */
  R2_S3_ENDPOINT: z.string().url().regex(/^https:\/\//, 'must be an https:// URL'),
  /** Optional public CDN host (pub-xxxx.r2.dev). Reserved for public assets;
   *  never used for deal files (their gating requires signed URLs). */
  R2_PUBLIC_BASE_URL: z.string().url().regex(/^https:\/\//, 'must be an https:// URL').optional(),

  /** Flutterwave v3 secret key — the server-side credential (verify + initialize).
   *  Required since Phase 8: Flutterwave is the schema's default payment rail, so
   *  a boot without it is a boot without a working checkout — fail-fast beats a
   *  half-configured app that 503s on the money path. The PUBLIC key is a browser
   *  credential (Phase 10 frontend) and is deliberately not read here. */
  FLW_SECRET_KEY: z.string().min(1),
  /** Shared secret Flutterwave echoes in the `verif-hash` header of every webhook.
   *  Optional UNTIL the user configures webhooks in their dashboard: when absent
   *  the webhook endpoint refuses every delivery (503) instead of processing
   *  unverified payloads. Set the SAME value in the FLW dashboard and here. */
  FLW_WEBHOOK_SECRET_HASH: z.string().min(16).optional(),
  /** Paystack secret key — the adapter is implemented (plan Phase 8) but the
   *  rail stays dormant until keys are supplied: initializing via Paystack then
   *  answers 503 PAYMENT_PROVIDER_UNAVAILABLE, nothing silently falls back. */
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/** Parsed, validated environment. Import this instead of touching process.env anywhere else. */
export const env = parseEnv(process.env);

/** "https://a, https://b" -> ["https://a", "https://b"] (tolerates spaces and empty entries). */
export function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
