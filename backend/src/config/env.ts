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
