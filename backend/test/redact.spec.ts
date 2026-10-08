import { describe, expect, it } from 'bun:test';
import { redactUrl } from '../src/common/logger/redact';

/**
 * The capability-link token is the client's credential: access logs must keep
 * the route shape for debugging without storing the secret itself.
 */
describe('redactUrl (capability-token log redaction)', () => {
  it('masks the token segment on shared routes', () => {
    expect(redactUrl('/api/v1/shared/v5q7qX_7LE')).toBe('/api/v1/shared/{redacted}');
    expect(redactUrl('/api/v1/shared/v5q7qX_7LE/payments/verify')).toBe(
      '/api/v1/shared/{redacted}/payments/verify',
    );
    expect(redactUrl('/api/v1/shared/v5q7qX_7LE/files/f_1/download-url')).toBe(
      '/api/v1/shared/{redacted}/files/f_1/download-url',
    );
  });

  it('redacts every token when several appear (query-style urls)', () => {
    expect(redactUrl('/api/v1/shared/tokA?next=/shared/tokB')).toBe(
      '/api/v1/shared/{redacted}?next=/shared/{redacted}',
    );
  });

  it('leaves non-shared routes untouched', () => {
    expect(redactUrl('/api/v1/deals/d_1')).toBe('/api/v1/deals/d_1');
    expect(redactUrl('/api/v1/public/tobi-a')).toBe('/api/v1/public/tobi-a');
    expect(redactUrl('/health/ready')).toBe('/health/ready');
  });
});
