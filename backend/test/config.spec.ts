import { describe, expect, it } from 'bun:test';
import { parseEnv, parseOrigins } from '../src/config/env';

const VALID_ENV = {
  NEON_DATABASE_URL: 'postgresql://user:pass@localhost:5432/deal',
  JWT_ACCESS_SECRET: 'unit-test-secret-0123456789abcdef0123456789abcdef',
  R2_BUCKET: 'dtg-test',
  R2_ACCESS_KEY_ID: 'r2-key',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
  R2_S3_ENDPOINT: 'https://acc123.r2.cloudflarestorage.com',
  FLW_SECRET_KEY: 'FLWSECK_TEST-unit',
};

describe('env config', () => {
  it('applies safe defaults when optional variables are absent', () => {
    const parsed = parseEnv(VALID_ENV);
    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.PORT).toBe(3001);
    expect(parsed.FRONTEND_URL).toBe('http://localhost:3000');
  });

  it('coerces and accepts explicit values', () => {
    const parsed = parseEnv({
      ...VALID_ENV,
      NODE_ENV: 'production',
      PORT: '8080',
      FRONTEND_URL: 'https://deal.ng',
    });
    expect(parsed.NODE_ENV).toBe('production');
    expect(parsed.PORT).toBe(8080);
    expect(parsed.FRONTEND_URL).toBe('https://deal.ng');
  });

  it('fails fast with readable issues on invalid values', () => {
    expect(() => parseEnv({ ...VALID_ENV, PORT: 'not-a-port' })).toThrow(/PORT/);
    expect(() => parseEnv({ ...VALID_ENV, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a missing or non-postgres NEON_DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/NEON_DATABASE_URL/);
    expect(() => parseEnv({ NEON_DATABASE_URL: 'mysql://nope' })).toThrow(/NEON_DATABASE_URL/);
  });

  it('rejects a missing or too-short JWT_ACCESS_SECRET', () => {
    const { JWT_ACCESS_SECRET: _omit, ...withoutSecret } = VALID_ENV;
    expect(() => parseEnv(withoutSecret)).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => parseEnv({ ...VALID_ENV, JWT_ACCESS_SECRET: 'too-short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a missing or non-https R2 endpoint', () => {
    const { R2_S3_ENDPOINT: _omit, ...withoutEndpoint } = VALID_ENV;
    expect(() => parseEnv(withoutEndpoint)).toThrow(/R2_S3_ENDPOINT/);
    expect(() => parseEnv({ ...VALID_ENV, R2_S3_ENDPOINT: 'http://insecure.example' })).toThrow(/R2_S3_ENDPOINT/);
  });

  it('treats R2_PUBLIC_BASE_URL as optional but validated when present', () => {
    expect(parseEnv(VALID_ENV).R2_PUBLIC_BASE_URL).toBeUndefined();
    expect(() => parseEnv({ ...VALID_ENV, R2_PUBLIC_BASE_URL: 'http://nope.example' })).toThrow(/R2_PUBLIC_BASE_URL/);
    expect(
      parseEnv({ ...VALID_ENV, R2_PUBLIC_BASE_URL: 'https://pub-x.r2.dev' }).R2_PUBLIC_BASE_URL,
    ).toBe('https://pub-x.r2.dev');
  });

  it('requires the Flutterwave secret key but keeps the webhook hash optional', () => {
    const { FLW_SECRET_KEY: _omit, ...withoutFlw } = VALID_ENV;
    expect(() => parseEnv(withoutFlw)).toThrow(/FLW_SECRET_KEY/);
    const parsed = parseEnv(VALID_ENV);
    expect(parsed.FLW_WEBHOOK_SECRET_HASH).toBeUndefined();
    // Webhook deliveries are refused while the hash is unset — the schema only
    // demands a length once the value exists.
    expect(() => parseEnv({ ...VALID_ENV, FLW_WEBHOOK_SECRET_HASH: 'short' })).toThrow(/FLW_WEBHOOK_SECRET_HASH/);
    expect(
      parseEnv({ ...VALID_ENV, FLW_WEBHOOK_SECRET_HASH: 'a-hash-of-at-least-16-chars' }).FLW_WEBHOOK_SECRET_HASH,
    ).toBe('a-hash-of-at-least-16-chars');
  });

  it('keeps Paystack dormant unless a secret key is supplied', () => {
    expect(parseEnv(VALID_ENV).PAYSTACK_SECRET_KEY).toBeUndefined();
    expect(parseEnv({ ...VALID_ENV, PAYSTACK_SECRET_KEY: 'sk_test_x' }).PAYSTACK_SECRET_KEY).toBe('sk_test_x');
  });
});

describe('parseOrigins', () => {
  it('splits a comma-separated allow-list and drops empties', () => {
    expect(parseOrigins('https://a.ng, https://b.ng ,,')).toEqual(['https://a.ng', 'https://b.ng']);
  });
});
