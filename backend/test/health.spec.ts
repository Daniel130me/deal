import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app';

/**
 * Phase 2 acceptance: boots the real app on an ephemeral port and asserts the
 * public contract — health probes outside /api/v1, request-id correlation,
 * response envelopes, and dev-only Swagger.
 */
describe('DEAL API foundation (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0); // ephemeral port — no clashes with the dev servers
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the health probe outside /api/v1', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { status: string; checks: Record<string, string> } };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.checks.app).toBe('ok');
  });

  it('serves liveness and readiness probes', async () => {
    for (const path of ['/health/live', '/health/ready']) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: { status: string } };
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('ok');
    }
  });

  it('mints and echoes a request id', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('honours an upstream request id', async () => {
    const res = await fetch(`${baseUrl}/health`, { headers: { 'x-request-id': 'test-req-123' } });
    expect(res.headers.get('x-request-id')).toBe('test-req-123');
  });

  it('wraps unknown routes in the error envelope', async () => {
    const res = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
  });

  it('serves swagger docs outside production', async () => {
    const res = await fetch(`${baseUrl}/api/docs`);
    expect(res.status).toBe(200);
  });
});
