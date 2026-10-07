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
