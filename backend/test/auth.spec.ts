import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import { SignJWT } from 'jose';
import { createApp } from '../src/app';

/**
 * Phase 4 acceptance: security behaviour of the session endpoints, exercised
 * against the real app + live Neon (skips when no DB URL / secret is present,
 * mirroring db-constraints.spec.ts).
 *
 * Matrix covered: signup validation & duplicate, wrong password, unknown
 * identifier, missing/forged/expired access tokens, refresh rotation,
 * refresh reuse (family revocation), logout invalidation, hash-leak scan.
 */

const dbConfigured = typeof process.env.NEON_DATABASE_URL === 'string';
const secretConfigured =
  typeof process.env.JWT_ACCESS_SECRET === 'string' && process.env.JWT_ACCESS_SECRET.length >= 32;

const EMAIL = `auth-test-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@deal.test`;
const PASSWORD = 'CorrectHorse1!';

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface SessionData {
  user: { id: string; email: string | null; role: string };
  accessToken: string;
  refreshToken: string;
}

describe.skipIf(!dbConfigured || !secretConfigured)('auth sessions (integration, e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  const post = async (path: string, body: unknown): Promise<{ status: number; body: Envelope<unknown> }> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Envelope<unknown> };
  };

  const get = async (path: string, token?: string): Promise<{ status: number; body: Envelope<unknown> }> => {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, body: (await res.json()) as Envelope<unknown> };
  };

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0); // ephemeral port
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    // Cleanup the test identity (refresh tokens cascade with the user row).
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url: process.env.NEON_DATABASE_URL } } });
    await db.user.deleteMany({ where: { email: EMAIL } });
    await db.$disconnect();
  });

  // ── Signup ────────────────────────────────────────────────────────────────

  it('rejects malformed signup payloads with VALIDATION_ERROR', async () => {
    for (const bad of [
      { email: 'not-an-email', password: PASSWORD },
      { email: EMAIL, password: 'short' },
      { email: EMAIL, password: PASSWORD, sneaky: true }, // forbidNonWhitelisted
      { password: PASSWORD }, // email missing
    ]) {
      const { status, body } = await post('/api/v1/auth/signup', bad);
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    }
  });

  it('signs up, returns safe user + both tokens, never leaks the hash', async () => {
    const { status, body } = await post('/api/v1/auth/signup', { email: EMAIL, password: PASSWORD });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(JSON.stringify(body)).not.toContain('passwordHash');

    const data = body.data as SessionData;
    expect(data.user.email).toBe(EMAIL);
    expect(data.user.role).toBe('CLIENT');
    expect(data.accessToken.length).toBeGreaterThan(20);
    expect(data.refreshToken.length).toBeGreaterThan(20);
  });

  it('rejects duplicate signup with 409 EMAIL_TAKEN', async () => {
    const { status, body } = await post('/api/v1/auth/signup', { email: EMAIL, password: PASSWORD });
    expect(status).toBe(409);
    expect(body.error?.code).toBe('EMAIL_TAKEN');
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const { status, body } = await post('/api/v1/auth/login', { identifier: EMAIL, password: 'WrongPassword9' });
    expect(status).toBe(401);
    expect(body.error?.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown identifier with the SAME code (no user enumeration)', async () => {
    const { status, body } = await post('/api/v1/auth/login', {
      identifier: 'who-is-this@deal.test',
      password: PASSWORD,
    });
    expect(status).toBe(401);
    expect(body.error?.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in and issues a fresh token family', async () => {
    const { status, body } = await post('/api/v1/auth/login', { identifier: EMAIL.toUpperCase(), password: PASSWORD });
    expect(status).toBe(201);
    const data = body.data as SessionData;
    expect(data.user.email).toBe(EMAIL); // identifier was case-insensitive
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  // ── GET /me ───────────────────────────────────────────────────────────────

  it('serves /me for a valid access token', async () => {
    const login = (await post('/api/v1/auth/login', { identifier: EMAIL, password: PASSWORD })).body
      .data as SessionData;
    const { status, body } = await get('/api/v1/auth/me', login.accessToken);
    expect(status).toBe(200);
    const data = body.data as { id: string; email: string };
    expect(data.email).toBe(EMAIL);
  });

  it('rejects /me without a token and with a forged token', async () => {
    const missing = await get('/api/v1/auth/me');
    expect(missing.status).toBe(401);
    expect(missing.body.error?.code).toBe('TOKEN_INVALID');

    // Right shape, wrong signing key.
    const wrongKey = new TextEncoder().encode('forged-forged-forged-forged-forged-forged-forged');
    const forged = await new SignJWT({ role: 'CLIENT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('deal.api')
      .setAudience('deal.app')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(wrongKey);
    const forgedRes = await get('/api/v1/auth/me', forged);
    expect(forgedRes.status).toBe(401);
    expect(forgedRes.body.error?.code).toBe('TOKEN_INVALID');
  });

  it('rejects an EXPIRED access token with TOKEN_EXPIRED', async () => {
    const login = (await post('/api/v1/auth/login', { identifier: EMAIL, password: PASSWORD })).body
      .data as SessionData;

    const key = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
    const nowSec = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ role: 'CLIENT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(login.user.id)
      .setIssuer('deal.api')
      .setAudience('deal.app')
      .setIssuedAt(nowSec - 7200)
      .setExpirationTime(nowSec - 3600) // expired an hour ago
      .sign(key);

    const { status, body } = await get('/api/v1/auth/me', expired);
    expect(status).toBe(401);
    expect(body.error?.code).toBe('TOKEN_EXPIRED');
  });

  // ── Refresh rotation & reuse ──────────────────────────────────────────────

  it('rotates on refresh: new pair, old token becomes unusable, reuse kills the family', async () => {
    const login = (await post('/api/v1/auth/login', { identifier: EMAIL, password: PASSWORD })).body
      .data as SessionData;

    // 1st refresh: succeeds, issues a child token.
    const first = await post('/api/v1/auth/refresh', { refreshToken: login.refreshToken });
    expect(first.status).toBe(201);
    const child = first.body.data as SessionData;
    expect(child.refreshToken).not.toBe(login.refreshToken);
    expect(child.accessToken).not.toBe(login.accessToken);

    // An access token is not a refresh token — lookup misses.
    const wrongKind = await post('/api/v1/auth/refresh', { refreshToken: login.accessToken });
    expect(wrongKind.status).toBe(401);
    expect(wrongKind.body.error?.code).toBe('TOKEN_INVALID');

    // 2nd refresh with the SAME (now revoked) token: reuse detected.
    const reuse = await post('/api/v1/auth/refresh', { refreshToken: login.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error?.code).toBe('TOKEN_REUSE');

    // Family revocation: the child issued by the first refresh is dead too.
    const childAfter = await post('/api/v1/auth/refresh', { refreshToken: child.refreshToken });
    expect(childAfter.status).toBe(401);
    expect(childAfter.body.error?.code).toBe('TOKEN_REUSE');
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  it('logout revokes the presented refresh token (idempotent), refresh after logout fails', async () => {
    const login = (await post('/api/v1/auth/login', { identifier: EMAIL, password: PASSWORD })).body
      .data as SessionData;

    const out = await post('/api/v1/auth/logout', { refreshToken: login.refreshToken });
    expect(out.status).toBe(201);
    expect((out.body.data as { revoked: boolean }).revoked).toBe(true);

    const after = await post('/api/v1/auth/refresh', { refreshToken: login.refreshToken });
    expect(after.status).toBe(401);
    // Strict reuse semantics: presenting ANY revoked token (here: logged out)
    // is treated as replay/theft and revokes the whole family.
    expect(after.body.error?.code).toBe('TOKEN_REUSE');

    const again = await post('/api/v1/auth/logout', { refreshToken: login.refreshToken });
    expect(again.status).toBe(201);
    expect((again.body.data as { revoked: boolean }).revoked).toBe(false);
  });

  it('a login after a revoked family still works (new family)', async () => {
    const { status, body } = await post('/api/v1/auth/login', { identifier: EMAIL, password: PASSWORD });
    expect(status).toBe(201);
    const data = body.data as SessionData;
    expect(data.refreshToken).toBeTruthy();
  });
});
