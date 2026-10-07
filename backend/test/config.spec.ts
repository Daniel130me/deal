import { describe, expect, it } from 'bun:test';
import { parseEnv, parseOrigins } from '../src/config/env';

const VALID_ENV = {
  NEON_DATABASE_URL: 'postgresql://user:pass@localhost:5432/deal',
  JWT_ACCESS_SECRET: 'unit-test-secret-0123456789abcdef0123456789abcdef',
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
});

describe('parseOrigins', () => {
  it('splits a comma-separated allow-list and drops empties', () => {
    expect(parseOrigins('https://a.ng, https://b.ng ,,')).toEqual(['https://a.ng', 'https://b.ng']);
  });
});
