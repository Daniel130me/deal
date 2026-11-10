import { after, before, describe as nodeDescribe, test } from 'node:test';
import { expect } from 'expect';

type TestFunction = () => void | Promise<void>;

// The configuration module is intentionally fail-fast, even in tests. Supply
// inert values for unit suites without ever treating them as permission to
// contact external services; integration suites require explicit opt-in.
const TEST_ENV_DEFAULTS: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  NEON_DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/deal_test',
  JWT_ACCESS_SECRET: 'unit-test-secret-with-at-least-thirty-two-characters',
  R2_BUCKET: 'unit-test-private-bucket',
  R2_ACCESS_KEY_ID: 'unit-test-access-key',
  R2_SECRET_ACCESS_KEY: 'unit-test-secret-key',
  R2_S3_ENDPOINT: 'https://storage.invalid',
  FLW_SECRET_KEY: 'FLWSECK_TEST-unit-only',
  // Integration tests deliberately send distinct X-Forwarded-For values.
  // Production must set this only when a controlled proxy is actually present.
  TRUST_PROXY_HOPS: '1',
};

for (const [name, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  process.env[name] ??= value;
}

/**
 * Small compatibility layer for the existing suite.
 *
 * Keeping timeout and conditional-skip semantics here lets the tests run on
 * Node's built-in runner without coupling every specification to runner APIs.
 */
const runTest = (name: string, fn: TestFunction, timeout?: number) =>
  test(name, timeout === undefined ? {} : { timeout }, fn);

const skipTest = (name: string, fn: TestFunction, timeout?: number) =>
  test.skip(name, timeout === undefined ? {} : { timeout }, fn);

export const it = Object.assign(runTest, { skip: skipTest });

export const describe = Object.assign(nodeDescribe, {
  skipIf: (condition: boolean): typeof nodeDescribe =>
    (condition ? nodeDescribe.skip : nodeDescribe) as typeof nodeDescribe,
});

export const beforeAll = (fn: TestFunction, timeout?: number) =>
  before(fn, timeout === undefined ? {} : { timeout });

export const afterAll = (fn: TestFunction, timeout?: number) =>
  after(fn, timeout === undefined ? {} : { timeout });

export { expect };
