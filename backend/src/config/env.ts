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
  /** Maximum parsed JSON/form body size. Webhooks are signature-verified, but
   *  bounding bytes before verification also limits parser and HMAC work. */
  MAX_JSON_BODY_KB: z.coerce.number().int().min(1).max(1024).default(100),
  /** Number of trusted reverse-proxy hops in front of the API. Zero is the
   *  secure default: trusting X-Forwarded-For on a directly exposed server
   *  lets clients forge rate-limit identities. Set to 1 only when exactly one
   *  controlled gateway always sits in front of the process. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  /** Browser origin(s) allowed by CORS. Comma-separated; never a wildcard in production.
   *  In production this is REQUIRED and must be https:// — it feeds both the
   *  CORS allowlist and the hosted-checkout redirect base, so a silent
   *  localhost default would fail-open into a broken security posture
   *  (same fail-fast precedent as JWT_ACCESS_SECRET/R2/FLW keys). */
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
   *  Development may omit it (deliveries are then refused), but production
   *  requires it so asynchronous payment confirmation cannot be disabled. */
  FLW_WEBHOOK_SECRET_HASH: z.string().min(16).optional(),
  /** Paystack secret key — the adapter is implemented (plan Phase 8) but the
   *  rail stays dormant until keys are supplied: initializing via Paystack then
   *  answers 503 PAYMENT_PROVIDER_UNAVAILABLE, nothing silently falls back. */
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
}).superRefine((values, ctx) => {
  // Production has no safe default for the browser origin: without it CORS
  // allowlists localhost and checkout redirects point off-origin. Dev/test
  // keep the localhost default for friction-free boot.
  const origins = parseOrigins(values.FRONTEND_URL);
  if (origins.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['FRONTEND_URL'],
      message: 'must contain at least one browser origin',
    });
  }
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: `contains an invalid URL: ${origin}` });
      continue;
    }
    const allowedProtocol = values.NODE_ENV === 'production' ? parsed.protocol === 'https:' : ['http:', 'https:'].includes(parsed.protocol);
    if (!allowedProtocol || parsed.origin !== origin) {
      ctx.addIssue({
        code: 'custom',
        path: ['FRONTEND_URL'],
        message:
          values.NODE_ENV === 'production'
            ? `must contain exact https origins without paths: ${origin}`
            : `must contain exact http(s) origins without paths: ${origin}`,
      });
    }
  }

  if (values.NODE_ENV !== 'production') return;

  if (!values.FLW_WEBHOOK_SECRET_HASH) {
    ctx.addIssue({
      code: 'custom',
      path: ['FLW_WEBHOOK_SECRET_HASH'],
      message: 'is required in production',
    });
  }
  if (/test/i.test(values.FLW_SECRET_KEY)) {
    ctx.addIssue({
      code: 'custom',
      path: ['FLW_SECRET_KEY'],
      message: 'must be a live Flutterwave key in production',
    });
  }
  if (!values.PAYSTACK_SECRET_KEY?.startsWith('sk_live_')) {
    ctx.addIssue({
      code: 'custom',
      path: ['PAYSTACK_SECRET_KEY'],
      message: 'must be a Paystack sk_live_ secret in production',
    });
  }

  try {
    const databaseUrl = new URL(values.NEON_DATABASE_URL);
    const sslMode = databaseUrl.searchParams.get('sslmode');
    if (!['require', 'verify-full'].includes(sslMode ?? '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['NEON_DATABASE_URL'],
        message: 'must set sslmode=require or sslmode=verify-full in production',
      });
    }
  } catch {
    // The base schema reports malformed database URLs.
  }
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
