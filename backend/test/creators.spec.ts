import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app';

/**
 * Phase 5 acceptance: creator domain exercised against the real app + live
 * Neon (skips when no DB URL / secret is present, mirroring auth.spec.ts).
 *
 * Matrix covered: profile onboarding + role promotion, handle uniqueness,
 * channel primary invariant, service catalogue + public visibility, public
 * request/booking submissions (validation + foreign-service rejection),
 * request/booking state machines, cross-creator ownership (404, not 403),
 * and the public submission rate limit (tested LAST — it burns the bucket).
 */

const dbConfigured = typeof process.env.NEON_DATABASE_URL === 'string';
const secretConfigured =
  typeof process.env.JWT_ACCESS_SECRET === 'string' && process.env.JWT_ACCESS_SECRET.length >= 32;

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
// Short base36 token so the derived handles stay inside the 30-char handle rule.
const RUN36 = Date.now().toString(36) + Math.floor(Math.random() * 1_296).toString(36);
const EMAIL_A = `creator-test-${RUN}-a@deal.test`;
const EMAIL_B = `creator-test-${RUN}-b@deal.test`;
const PASSWORD = 'CorrectHorse1!';
const HANDLE_A = `test-${RUN36}`;
const HANDLE_B = `second-${RUN36}`;

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string };
}

describe.skipIf(!dbConfigured || !secretConfigured)('creator domain (integration, e2e)', () => {
  /** Neon round-trips cost 0.2-2s and tests make several sequential calls —
   *  the 5s bun default is not enough headroom. */
  const timed = (name: string, fn: () => Promise<void>) => it(name, fn, 30_000);
  let app: INestApplication;
  let baseUrl: string;
  let a: Session;
  let b: Session;
  let serviceId: string;
  let requestId: string;
  let bookingId: string;

  const call = async (
    method: string,
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<{ status: number; body: Envelope<Record<string, unknown>> }> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Envelope<Record<string, unknown>> };
  };

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0); // ephemeral port
    baseUrl = await app.getUrl();

    const signupA = await call('POST', '/api/v1/auth/signup', { email: EMAIL_A, password: PASSWORD });
    const signupB = await call('POST', '/api/v1/auth/signup', { email: EMAIL_B, password: PASSWORD });
    a = signupA.body.data as unknown as Session;
    b = signupB.body.data as unknown as Session;
  });

  afterAll(async () => {
    await app.close();
    // FK-safe cleanup: domain rows first (RESTRICT), then the users cascade
    // away profiles, channels and refresh tokens.
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url: process.env.NEON_DATABASE_URL } } });
    await db.booking.deleteMany({ where: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } });
    await db.clientRequest.deleteMany({ where: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } });
    await db.service.deleteMany({ where: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } });
    await db.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
    await db.$disconnect();
  });

  // ── Profile onboarding ─────────────────────────────────────────────────────

  timed('returns 404 CREATOR_PROFILE_NOT_FOUND before onboarding', async () => {
    const { status, body } = await call('GET', '/api/v1/creators/me', undefined, a.accessToken);
    expect(status).toBe(404);
    expect(body.error?.code).toBe('CREATOR_PROFILE_NOT_FOUND');
  });

  timed('rejects a malformed handle with VALIDATION_ERROR', async () => {
    const { status, body } = await call(
      'POST',
      '/api/v1/creators/me',
      { name: 'Tester', handle: 'Bad Handle!' },
      a.accessToken,
    );
    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  timed('onboards a creator, promotes the role, normalises the handle', async () => {
    const { status, body } = await call(
      'POST',
      '/api/v1/creators/me',
      {
        name: 'Tester A',
        handle: HANDLE_A.toUpperCase(), // must be stored lowercase
        craft: 'Photographer',
        location: 'Lagos',
      },
      a.accessToken,
    );
    expect(status).toBe(201);
    const profile = body.data as { handle: string; onboarded: boolean };
    expect(profile.handle).toBe(HANDLE_A);
    expect(profile.onboarded).toBe(true);

    // Role promotion happened atomically with profile creation.
    const me = await call('GET', '/api/v1/auth/me', undefined, a.accessToken);
    expect((me.body.data as { role: string }).role).toBe('CREATOR');
  });

  timed('rejects duplicate handle (409 HANDLE_TAKEN) and duplicate profile (409 PROFILE_EXISTS)', async () => {
    const taken = await call(
      'POST',
      '/api/v1/creators/me',
      { name: 'Tester B', handle: HANDLE_A },
      b.accessToken,
    );
    expect(taken.status).toBe(409);
    expect(taken.body.error?.code).toBe('HANDLE_TAKEN');

    const again = await call(
      'POST',
      '/api/v1/creators/me',
      { name: 'Tester A', handle: HANDLE_A },
      a.accessToken,
    );
    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe('PROFILE_EXISTS');
  });

  timed('patches profile fields but never the handle', async () => {
    const { status, body } = await call(
      'PATCH',
      '/api/v1/creators/me',
      { bio: 'Updated bio', handle: 'sneaky-rename' },
      a.accessToken,
    );
    expect(status).toBe(400); // handle is not a writable field (forbidNonWhitelisted)
    expect(body.error?.code).toBe('VALIDATION_ERROR');

    const ok = await call('PATCH', '/api/v1/creators/me', { bio: 'Updated bio' }, a.accessToken);
    expect(ok.status).toBe(200);
    expect((ok.body.data as { bio: string }).bio).toBe('Updated bio');
  });

  timed('enforces the one-primary-channel invariant on channel replace', async () => {
    const channels = [
      { type: 'WHATSAPP', value: '+2348010000001', isPrimary: true },
      { type: 'INSTAGRAM', value: '@tester', isPrimary: true }, // second primary is forced down
      { type: 'EMAIL', value: 'hi@tester.ng' },
    ];
    const put = await call('PUT', '/api/v1/creators/me/channels', { channels }, a.accessToken);
    expect(put.status).toBe(200);
    const stored = (put.body.data as { channels: Array<{ type: string; isPrimary: boolean }> }).channels;
    expect(stored.filter((c) => c.isPrimary)).toHaveLength(1);
    expect(stored.find((c) => c.type === 'WHATSAPP')?.isPrimary).toBe(true);

    // No primary at all -> the first channel defaults to primary.
    const put2 = await call(
      'PUT',
      '/api/v1/creators/me/channels',
      { channels: [{ type: 'SMS', value: '+2348010000002' }] },
      a.accessToken,
    );
    const stored2 = (put2.body.data as { channels: Array<{ isPrimary: boolean }> }).channels;
    expect(stored2).toHaveLength(1);
    expect(stored2[0].isPrimary).toBe(true);
  });

  // ── Services ───────────────────────────────────────────────────────────────

  timed('creates a service and lists it for the owner', async () => {
    const created = await call(
      'POST',
      '/api/v1/creators/me/services',
      {
        title: 'Test Shoot',
        description: 'A one-hour session',
        startingPriceMinor: 500_000,
        duration: '1 hour',
        includes: ['10 photos', ' '], // blank entries are dropped
      },
      a.accessToken,
    );
    expect(created.status).toBe(201);
    const service = created.body.data as { id: string; includes: string[] };
    expect(service.includes).toEqual(['10 photos']);
    serviceId = service.id;

    const list = await call('GET', '/api/v1/creators/me/services', undefined, a.accessToken);
    expect(list.status).toBe(200);
    expect((list.body.data as { services: unknown[] }).services).toHaveLength(1);
  });

  timed('shows the public page with active services and safe fields only', async () => {
    const { status, body } = await call('GET', `/api/v1/public/${HANDLE_A}`);
    expect(status).toBe(200);
    const page = body.data as {
      creator: { handle: string; verified: boolean };
      services: Array<{ id: string; startingPriceMinor: number }>;
    };
    expect(page.creator.handle).toBe(HANDLE_A);
    expect(page.services).toHaveLength(1);
    expect(page.services[0].id).toBe(serviceId);

    const raw = JSON.stringify(body);
    expect(raw).not.toContain('userId');
    expect(raw).not.toContain('onboarded');
    expect(raw).not.toContain('passwordHash');

    const unknown = await call('GET', '/api/v1/public/does-not-exist');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error?.code).toBe('CREATOR_NOT_FOUND');
  });

  timed('hides inactive services from the public page but keeps them for the owner', async () => {
    const patched = await call(
      'PATCH',
      `/api/v1/services/${serviceId}`,
      { isActive: false },
      a.accessToken,
    );
    expect(patched.status).toBe(200);

    const page = await call('GET', `/api/v1/public/${HANDLE_A}`);
    expect((page.body.data as { services: unknown[] }).services).toHaveLength(0);

    const owner = await call('GET', '/api/v1/creators/me/services', undefined, a.accessToken);
    expect((owner.body.data as { services: unknown[] }).services).toHaveLength(1);

    await call('PATCH', `/api/v1/services/${serviceId}`, { isActive: true }, a.accessToken);
  });

  timed("rejects foreign and unknown service edits with 404 (no existence leak)", async () => {
    // B onboards here so ownership (not missing-profile) is what's under test.
    const onboardB = await call(
      'POST',
      '/api/v1/creators/me',
      { name: 'Tester B', handle: HANDLE_B },
      b.accessToken,
    );
    expect(onboardB.status).toBe(201);

    const foreign = await call(
      'PATCH',
      `/api/v1/services/${serviceId}`,
      { title: 'Hijacked' },
      b.accessToken,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body.error?.code).toBe('SERVICE_NOT_FOUND');

    const unknown = await call(
      'PATCH',
      '/api/v1/services/nope-not-real',
      { title: 'X' },
      a.accessToken,
    );
    expect(unknown.status).toBe(404);
  });

  // ── Public request submissions ─────────────────────────────────────────────
  // NOTE: the submission rate limit is 5/min/IP and these all share one bucket.
  // Exactly 4 hits land here; the rate-limit test at the end tops it up.

  timed('accepts a valid public request and assigns a sequential ref', async () => {
    const { status, body } = await call('POST', `/api/v1/public/${HANDLE_A}/requests`, {
      serviceId,
      clientName: 'Ada Client',
      clientContact: '+234 802 555 0000',
      eventDate: '2026-12-01',
      budgetMinMinor: 400_000,
      budgetMaxMinor: 600_000,
      description: 'One-hour brand session.',
    });
    expect(status).toBe(201);
    const request = (body.data as { request: { id: string; ref: string; status: string; serviceId: string } }).request;
    expect(request.status).toBe('NEW');
    expect(request.serviceId).toBe(serviceId);
    expect(request.ref).toMatch(/^REQ-\d+$/);
    expect(Number(request.ref.split('-').pop())).toBeGreaterThan(22); // continues past the seeded refs
    requestId = request.id;
  });

  timed('rejects requests referencing another creator or unknown service (404)', async () => {
    const { status, body } = await call('POST', `/api/v1/public/${HANDLE_A}/requests`, {
      serviceId: 'sv_bogus',
      clientName: 'Ada Client',
      clientContact: 'ada@example.com',
      description: 'x',
    });
    expect(status).toBe(404);
    expect(body.error?.code).toBe('SERVICE_NOT_FOUND');
  });

  timed('rejects an inverted budget range with 400', async () => {
    const { status, body } = await call('POST', `/api/v1/public/${HANDLE_A}/requests`, {
      serviceId,
      clientName: 'Ada Client',
      clientContact: 'ada@example.com',
      budgetMinMinor: 900_000,
      budgetMaxMinor: 100_000,
      description: 'x',
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe('INVALID_BUDGET_RANGE');
  });

  timed('returns 404 CREATOR_NOT_FOUND for submissions to unknown handles', async () => {
    const { status, body } = await call('POST', '/api/v1/public/ghost-handle/requests', {
      serviceId,
      clientName: 'Ada',
      clientContact: 'ada@example.com',
      description: 'x',
    });
    expect(status).toBe(404);
    expect(body.error?.code).toBe('CREATOR_NOT_FOUND');
  });

  // ── Request inbox + state machine ──────────────────────────────────────────

  timed("lists the creator's inbox and hides it from other creators", async () => {
    const inbox = await call('GET', '/api/v1/creators/me/requests', undefined, a.accessToken);
    expect(inbox.status).toBe(200);
    const requests = (inbox.body.data as { requests: Array<{ id: string }> }).requests;
    expect(requests.some((r) => r.id === requestId)).toBe(true);

    const foreign = await call('GET', `/api/v1/requests/${requestId}`, undefined, b.accessToken);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error?.code).toBe('REQUEST_NOT_FOUND');

    const foreignAct = await call(
      'POST',
      `/api/v1/requests/${requestId}`,
      { action: 'decline' },
      b.accessToken,
    );
    expect(foreignAct.status).toBe(404);
  });

  timed('declines a NEW request, drops it from the inbox, and forbids further actions', async () => {
    const acted = await call('POST', `/api/v1/requests/${requestId}`, { action: 'decline' }, a.accessToken);
    expect(acted.status).toBe(200);
    expect((acted.body.data as { request: { status: string } }).request.status).toBe('DECLINED');

    const inbox = await call('GET', '/api/v1/creators/me/requests', undefined, a.accessToken);
    const requests = (inbox.body.data as { requests: Array<{ id: string }> }).requests;
    expect(requests.some((r) => r.id === requestId)).toBe(false);

    const detail = await call('GET', `/api/v1/requests/${requestId}`, undefined, a.accessToken);
    expect(detail.status).toBe(200); // still fetchable by id

    const archive = await call('POST', `/api/v1/requests/${requestId}`, { action: 'archive' }, a.accessToken);
    expect(archive.status).toBe(409);
    expect(archive.body.error?.code).toBe('INVALID_REQUEST_TRANSITION');
  });

  // ── Public bookings + state machine ────────────────────────────────────────

  timed('accepts a valid public booking with REQUESTED status', async () => {
    const { status, body } = await call('POST', `/api/v1/public/${HANDLE_A}/bookings`, {
      sessionType: 'Consultation call',
      serviceId,
      date: '2026-12-05',
      time: '10:00',
      clientName: 'Ada Client',
      clientContact: 'ada@example.com',
      note: 'Morning preferred',
    });
    expect(status).toBe(201);
    const booking = (body.data as { booking: { id: string; ref: string; status: string } }).booking;
    expect(booking.status).toBe('REQUESTED');
    expect(booking.ref).toMatch(/^BKG-\d+$/);
    bookingId = booking.id;
  });

  timed('rejects bookings with a bad time, foreign service, or unknown fields', async () => {
    const badTime = await call('POST', `/api/v1/public/${HANDLE_A}/bookings`, {
      sessionType: 'Consultation',
      date: '2026-12-05',
      time: '25:99',
      clientName: 'Ada',
      clientContact: 'ada@example.com',
    });
    expect(badTime.status).toBe(400);

    const foreignService = await call('POST', `/api/v1/public/${HANDLE_A}/bookings`, {
      sessionType: 'Consultation',
      serviceId: 'sv_bogus',
      date: '2026-12-05',
      time: '10:00',
      clientName: 'Ada',
      clientContact: 'ada@example.com',
    });
    expect(foreignService.status).toBe(404);
    expect(foreignService.body.error?.code).toBe('SERVICE_NOT_FOUND');
  });

  timed('drives the booking state machine: confirm -> complete, refusing illegal jumps', async () => {
    const confirm = await call('POST', `/api/v1/bookings/${bookingId}`, { action: 'confirm' }, a.accessToken);
    expect(confirm.status).toBe(200);
    expect((confirm.body.data as { booking: { status: string } }).booking.status).toBe('CONFIRMED');

    const reconfirm = await call('POST', `/api/v1/bookings/${bookingId}`, { action: 'confirm' }, a.accessToken);
    expect(reconfirm.status).toBe(409);
    expect(reconfirm.body.error?.code).toBe('INVALID_BOOKING_TRANSITION');

    const complete = await call('POST', `/api/v1/bookings/${bookingId}`, { action: 'complete' }, a.accessToken);
    expect(complete.status).toBe(200);
    expect((complete.body.data as { booking: { status: string } }).booking.status).toBe('COMPLETED');

    const decline = await call('POST', `/api/v1/bookings/${bookingId}`, { action: 'decline' }, a.accessToken);
    expect(decline.status).toBe(409);

    const foreign = await call('POST', `/api/v1/bookings/${bookingId}`, { action: 'cancel' }, b.accessToken);
    expect(foreign.status).toBe(404);
  });

  timed('allows cancelling straight from REQUESTED', async () => {
    const second = await call('POST', `/api/v1/public/${HANDLE_A}/bookings`, {
      sessionType: 'Studio visit',
      date: '2026-12-10',
      time: '14:00',
      clientName: 'Ada Client',
      clientContact: 'ada@example.com',
    });
    expect(second.status).toBe(201);
    const id = (second.body.data as { booking: { id: string } }).booking.id;

    const cancel = await call('POST', `/api/v1/bookings/${id}`, { action: 'cancel' }, a.accessToken);
    expect(cancel.status).toBe(200);
    expect((cancel.body.data as { booking: { status: string } }).booking.status).toBe('CANCELLED');
  });

  // ── Rate limiting (LAST — burns the public submission bucket) ──────────────

  timed('throttles public submissions after 5/min per IP', async () => {
    // 4 hits are already burned in this window by the tests above; a short
    // burst must therefore trip the limiter well before the loop ends.
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await call('POST', `/api/v1/public/${HANDLE_A}/requests`, {
        serviceId,
        clientName: 'Spam Test',
        clientContact: 'spam@example.com',
        description: 'rate limit probe',
      });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
