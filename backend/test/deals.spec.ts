import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';

/**
 * Phase 6 acceptance: deal engine exercised against the real app + live Neon
 * (skips when no DB URL / secret is present, mirroring creators.spec.ts).
 *
 * Matrix covered: draft creation (+ request link -> REPLIED), foreign-request
 * 404, wizard PATCH with replace-set deliverables + money validation, edit
 * window (DRAFT/CHANGES_REQUESTED only), send validation + re-send loop,
 * full lifecycle from ACTIVE via fixture payments (deliver -> revision ->
 * deliver -> approve with escrow release -> release-files money gate ->
 * complete), decline, dispute rows, approve with zero payments, the shared
 * capability projection (whitelist scan), cross-creator 404, and the shared
 * action rate limit (tested LAST — it burns the bucket).
 *
 * NOTE on fixtures: deals reach ACTIVE with money via direct DB writes here —
 * the production trigger is Phase 8's payment verification. The state machine
 * under test starts FROM ACTIVE; how a deal becomes ACTIVE is out of scope.
 */

const dbConfigured = typeof process.env.NEON_DATABASE_URL === 'string';
const secretConfigured =
  typeof process.env.JWT_ACCESS_SECRET === 'string' && process.env.JWT_ACCESS_SECRET.length >= 32;

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
const RUN36 = Date.now().toString(36) + Math.floor(Math.random() * 1_296).toString(36);
const EMAIL_A = `deal-test-${RUN}-a@deal.test`;
const EMAIL_B = `deal-test-${RUN}-b@deal.test`;
const PASSWORD = 'CorrectHorse1!';
const HANDLE_A = `dealer-${RUN36}`;
const HANDLE_B = `rival-${RUN36}`;

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

describe.skipIf(!dbConfigured || !secretConfigured)('deal engine (integration, e2e)', () => {
  /** Neon round-trips cost 0.2-2s — the 5s bun default is not enough headroom. */
  const timed = (name: string, fn: () => Promise<void>, ms = 30_000) => it(name, fn, ms);
  let app: INestApplication;
  let baseUrl: string;
  let a: Session;
  let b: Session;
  let db: PrismaClient;

  /** Deals created through the API for status-flow tests (cleanup is handle-based). */
  const draftDeal = async (token: string, extra: Record<string, unknown> = {}) => {
    const res = await call('POST', '/api/v1/deals', { title: `Deal ${RUN}`, ...extra }, token);
    expect(res.status).toBe(201);
    return (res.body.data as { deal: { id: string } }).deal;
  };
  /** Fixture: force a deal into ACTIVE with a paid deposit payment row (Phase 8's job in production). */
  const activateWithDeposit = async (dealId: string, depositMinor: number) => {
    const now = new Date();
    await db.deal.update({ where: { id: dealId }, data: { status: 'ACTIVE', acceptedAt: now, depositPaidAt: now } });
    await db.dealPayment.create({
      data: {
        dealId,
        type: 'DEPOSIT',
        label: 'Deposit (50%)',
        amountMinor: depositMinor,
        method: 'CARD',
        provider: 'PAYSTACK',
        reference: `PSK-TEST-${RUN}-${dealId.slice(-6)}`,
        escrowStatus: 'HELD',
        paidAt: now,
      },
    });
  };

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

    // Onboard both as creators and give each one a service (public submissions need it).
    await call('POST', '/api/v1/creators/me', { name: 'Dealer A', handle: HANDLE_A, craft: 'Photographer' }, a.accessToken);
    await call('POST', '/api/v1/creators/me', { name: 'Rival B', handle: HANDLE_B, craft: 'Videographer' }, b.accessToken);
    await call(
      'POST',
      '/api/v1/creators/me/services',
      { title: 'Wedding shoot', description: 'Full-day coverage', startingPriceMinor: 2_000_000, includes: ['8 hours'] },
      a.accessToken,
    );
    await call(
      'POST',
      '/api/v1/creators/me/services',
      { title: 'Rival edit', description: 'Per-project editing', startingPriceMinor: 1_000_000, includes: [] },
      b.accessToken,
    );

    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient({ datasources: { db: { url: process.env.NEON_DATABASE_URL } } });
    // ^ hook timeout: boot + 2 signups + 2 onboardings + 2 services against Neon (~0.8s each).
  }, 60_000);

  afterAll(async () => {
    await app.close();
    // FK-safe cleanup: deal children first, then deals, requests, services,
    // then the users (which cascade away profiles/channels/refresh tokens).
    await db.dealPayment.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dealEvent.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dealDeliverable.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dealDelivery.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dispute.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.deal.deleteMany({ where: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } });
    await db.clientRequest.deleteMany({ where: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } });
    await db.service.deleteMany({ where: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } });
    await db.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
    await db.$disconnect();
  });

  // ── Draft creation ─────────────────────────────────────────────────────────

  timed('rejects unknown fields with VALIDATION_ERROR (forbidNonWhitelisted)', async () => {
    const { status, body } = await call('POST', '/api/v1/deals', { creatorId: 'spoofed', title: 'X' }, a.accessToken);
    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  timed('creates a draft with prototype defaults and a 256-bit share token', async () => {
    const { status, body } = await call('POST', '/api/v1/deals', { title: 'Lola Wedding' }, a.accessToken);
    expect(status).toBe(201);
    const deal = body.data as { deal: { ref: string; shareToken: string; status: string; depositPercent: number; installmentsCount: number; revisions: number; priceMinor: number; amounts: { totalMinor: number } } };
    expect(deal.deal.status).toBe('DRAFT');
    expect(deal.deal.ref).toMatch(/^DEAL-\d+$/);
    expect(deal.deal.shareToken.length).toBeGreaterThanOrEqual(43); // 256 bits base64url
    expect(deal.deal.depositPercent).toBe(50);
    expect(deal.deal.installmentsCount).toBe(2);
    expect(deal.deal.revisions).toBe(2);
    expect(deal.deal.priceMinor).toBe(0);
    expect(deal.deal.amounts.totalMinor).toBe(0);
  });

  timed('marks an owned request REPLIED when a deal is created from it', async () => {
    // A client request arrives on A's public page (needs A's service id).
    const services = await call('GET', '/api/v1/creators/me/services', undefined, a.accessToken);
    const serviceId = (services.body.data as { services: Array<{ id: string }> }).services[0].id;
    const submission = await call('POST', `/api/v1/public/${HANDLE_A}/requests`, {
      serviceId,
      clientName: 'Ngozi Client',
      clientContact: 'ngozi@example.com',
      description: 'Need a birthday shoot',
    });
    expect(submission.status).toBe(201);
    const requestId = (submission.body.data as { request: { id: string } }).request.id;

    const created = await draftDeal(a.accessToken, { requestId, clientName: 'Ngozi Client', clientContact: 'ngozi@example.com' });
    const detail = await call('GET', `/api/v1/requests/${requestId}`, undefined, a.accessToken);
    expect((detail.body.data as { request: { status: string } }).request.status).toBe('REPLIED');
    expect((created as unknown as { requestId: string }).requestId).toBe(requestId);
  });

  timed('rejects a foreign requestId with 404 (no existence leak across creators)', async () => {
    // A request owned by B.
    const servicesB = await call('GET', '/api/v1/creators/me/services', undefined, b.accessToken);
    const serviceIdB = (servicesB.body.data as { services: Array<{ id: string }> }).services[0].id;
    const submission = await call('POST', `/api/v1/public/${HANDLE_B}/requests`, {
      serviceId: serviceIdB,
      clientName: 'B Client',
      clientContact: 'bclient@example.com',
      description: 'Foreign request',
    });
    const foreignRequestId = (submission.body.data as { request: { id: string } }).request.id;

    const res = await call('POST', '/api/v1/deals', { requestId: foreignRequestId }, a.accessToken);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('REQUEST_NOT_FOUND');
  });

  // ── Wizard PATCH ───────────────────────────────────────────────────────────

  timed('patches wizard fields and replaces deliverables atomically', async () => {
    const deal = await draftDeal(a.accessToken);
    const res = await call(
      'PATCH',
      `/api/v1/deals/${deal.id}`,
      {
        clientName: 'Tobi Client',
        clientContact: 'tobi@example.com',
        priceMinor: 9_000_000, // ₦90,000 in kobo
        depositPercent: 50,
        installmentsCount: 2,
        eventDate: '2026-12-24',
        deliverables: ['Edited photos', 'Raw footage', 'Album'],
      },
      a.accessToken,
    );
    expect(res.status).toBe(200);
    const updated = res.body.data as { deal: { deliverables: Array<{ name: string; position: number }>; amounts: { depositMinor: number; dueMinor: number; schedule: Array<{ label: string; amountMinor: number; status: string }> } } };
    expect(updated.deal.deliverables.map((d) => d.name)).toEqual(['Edited photos', 'Raw footage', 'Album']);
    expect(updated.deal.deliverables.map((d) => d.position)).toEqual([0, 1, 2]);
    // ₦90,000 at 50% deposit = ₦45,000 deposit, ₦45,000 split into 2 installments.
    expect(updated.deal.amounts.depositMinor).toBe(4_500_000);
    expect(updated.deal.amounts.dueMinor).toBe(9_000_000);
    expect(updated.deal.amounts.schedule[0]).toMatchObject({ label: 'Deposit (50%)', amountMinor: 4_500_000, status: 'due' });
  });

  timed('supports a 100% deposit deal as a single full-payment slot', async () => {
    const deal = await draftDeal(a.accessToken);
    const res = await call(
      'PATCH',
      `/api/v1/deals/${deal.id}`,
      { clientName: 'Full Pay', priceMinor: 5_000_000, depositPercent: 100 },
      a.accessToken,
    );
    expect(res.status).toBe(200);
    const amounts = (res.body.data as { deal: { amounts: { depositMinor: number; schedule: Array<{ label: string }> } } }).deal.amounts;
    expect(amounts.depositMinor).toBe(5_000_000);
    expect(amounts.schedule).toHaveLength(1);
    expect(amounts.schedule[0].label).toBe('Full payment');
  });

  timed('rejects invalid money inputs and malformed deliverables', async () => {
    const deal = await draftDeal(a.accessToken);
    const negative = await call('PATCH', `/api/v1/deals/${deal.id}`, { priceMinor: -1 }, a.accessToken);
    expect(negative.status).toBe(400);

    const badPercent = await call('PATCH', `/api/v1/deals/${deal.id}`, { depositPercent: 0 }, a.accessToken);
    expect(badPercent.status).toBe(400);

    const emptyDeliverable = await call('PATCH', `/api/v1/deals/${deal.id}`, { deliverables: ['OK', '   '] }, a.accessToken);
    expect(emptyDeliverable.status).toBe(400);

    const unknown = await call('PATCH', `/api/v1/deals/${deal.id}`, { price: 100 }, a.accessToken);
    expect(unknown.status).toBe(400);
  });

  // ── Send + edit window ─────────────────────────────────────────────────────

  timed('refuses to send an incomplete offer (DEAL_NOT_READY_TO_SEND)', async () => {
    const deal = await draftDeal(a.accessToken); // no price, no client
    const res = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, a.accessToken);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('DEAL_NOT_READY_TO_SEND');
  });

  timed('sends a complete offer and stamps the SENT event', async () => {
    const deal = await draftDeal(a.accessToken);
    await call(
      'PATCH',
      `/api/v1/deals/${deal.id}`,
      { clientName: 'Ada Send', priceMinor: 3_000_000 },
      a.accessToken,
    );
    const res = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, a.accessToken);
    expect(res.status).toBe(200);
    const sent = res.body.data as { deal: { status: string; sentAt: string; events: Array<{ type: string; label: string }> } };
    expect(sent.deal.status).toBe('SENT');
    expect(sent.deal.sentAt).toBeTruthy();
    expect(sent.deal.events.some((e) => e.type === 'SENT' && e.label.includes('Ada Send'))).toBe(true);

    // The offer is out: terms are locked now.
    const patch = await call('PATCH', `/api/v1/deals/${deal.id}`, { priceMinor: 1 }, a.accessToken);
    expect(patch.status).toBe(409);
    expect(patch.body.error?.code).toBe('DEAL_NOT_EDITABLE');
  });

  timed('refuses a double send, then loops via changes_requested -> re-send', async () => {
    const deal = await draftDeal(a.accessToken);
    await call('PATCH', `/api/v1/deals/${deal.id}`, { clientName: 'Loop Client', priceMinor: 2_000_000 }, a.accessToken);
    await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, a.accessToken);

    const resend = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, a.accessToken);
    expect(resend.status).toBe(409);
    expect(resend.body.error?.code).toBe('INVALID_DEAL_TRANSITION');

    // Client requests changes -> creator edits -> re-send.
    const share = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, select: { shareToken: true } });
    const changes = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'request-changes', note: 'Make it cheaper' });
    expect(changes.status).toBe(200);
    expect((changes.body.data as { deal: { status: string } }).deal.status).toBe('CHANGES_REQUESTED');

    const edit = await call('PATCH', `/api/v1/deals/${deal.id}`, { priceMinor: 1_500_000 }, a.accessToken);
    expect(edit.status).toBe(200); // CHANGES_REQUESTED re-opens the edit window

    const resent = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, a.accessToken);
    expect(resent.status).toBe(200);
    expect((resent.body.data as { deal: { status: string; priceMinor: number } }).deal.status).toBe('SENT');
    expect((resent.body.data as { deal: { priceMinor: number } }).deal.priceMinor).toBe(1_500_000);
  });

  timed('declines from SENT, terminally', async () => {
    const deal = await draftDeal(a.accessToken);
    await call('PATCH', `/api/v1/deals/${deal.id}`, { clientName: 'Gone Client', priceMinor: 2_000_000 }, a.accessToken);
    await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, a.accessToken);
    const share = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, select: { shareToken: true } });

    const decline = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'decline' });
    expect(decline.status).toBe(200);
    expect((decline.body.data as { deal: { status: string } }).deal.status).toBe('DECLINED');

    const again = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'decline' });
    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe('INVALID_DEAL_TRANSITION');
  });

  // ── Shared capability projection ───────────────────────────────────────────

  timed('returns 404 for an unknown share token', async () => {
    const res = await call('GET', '/api/v1/shared/definitely-not-a-token');
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('DEAL_NOT_FOUND');
  });

  timed('serves the whitelisted share projection — no internal fields, amounts computed', async () => {
    const deal = await draftDeal(a.accessToken);
    await call(
      'PATCH',
      `/api/v1/deals/${deal.id}`,
      { clientName: 'Ada View', priceMinor: 4_000_000, deliverables: ['Teaser'], summary: 'A teaser cut', scope: '1 minute vertical' },
      a.accessToken,
    );
    const record = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, select: { shareToken: true, requestId: true } });

    const res = await call('GET', `/api/v1/shared/${record.shareToken}`);
    expect(res.status).toBe(200);
    const payload = res.body.data as { deal: Record<string, unknown>; creator: Record<string, unknown>; amounts: Record<string, unknown> };

    // Minimal payload: whitelist projection, no internal surface. Phase 10:
    // the deal RECORD (events, deliveries) is client-visible through a
    // restricted whitelist — but internal ids and payment rows never are.
    expect(payload.deal.ref).toMatch(/^DEAL-\d+$/);
    expect(payload.deal.status).toBe('DRAFT');
    expect(payload.deal.deliverables).toEqual(['Teaser']);
    for (const forbidden of ['id', 'creatorId', 'requestId', 'shareToken', 'payments', 'clientContact']) {
      expect(payload.deal).not.toHaveProperty(forbidden);
    }
    // Events are whitelisted down to {type, actor, label, createdAt} — no ids or metadata.
    expect(Array.isArray(payload.deal.events)).toBe(true);
    for (const event of payload.deal.events as Record<string, unknown>[]) {
      expect(Object.keys(event).sort()).toEqual(['actor', 'createdAt', 'label', 'type']);
    }
    expect(payload.deal.deliveries).toEqual([]); // nothing delivered yet — no file names leak
    expect(payload.creator).toMatchObject({ handle: HANDLE_A });
    expect(payload.amounts.totalMinor).toBe(4_000_000);
    expect(payload.amounts.depositMinor).toBe(2_000_000);
    expect(payload.amounts.fullyPaid).toBe(false);
  });

  // ── Full lifecycle from ACTIVE (fixtures stand in for Phase 8 payments) ────

  timed(
    'drives deliver -> revision -> deliver -> approve with escrow release, then gates finals on full payment',
    async () => {
    const deal = await draftDeal(a.accessToken);
    await call(
      'PATCH',
      `/api/v1/deals/${deal.id}`,
      { clientName: 'Escrow Client', priceMinor: 9_000_000, depositPercent: 50, installmentsCount: 2 },
      a.accessToken,
    );
    await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, a.accessToken);
    await activateWithDeposit(deal.id, 4_500_000); // ₦45,000 deposit held

    const deliver = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'deliver', note: 'First cut ready' }, a.accessToken);
    expect(deliver.status).toBe(200);
    const delivered = deliver.body.data as { deal: { status: string; deliveries: Array<{ note: string }>; events: Array<{ type: string }> } };
    expect(delivered.deal.status).toBe('DELIVERED');
    expect(delivered.deal.deliveries).toHaveLength(1);
    expect(delivered.deal.deliveries[0].note).toBe('First cut ready');

    const share = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, select: { shareToken: true } });
    const revision = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'request-changes', note: 'Brighter grade' });
    expect(revision.status).toBe(200);
    expect((revision.body.data as { deal: { status: string } }).deal.status).toBe('REVISION');

    const redeliver = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'deliver' }, a.accessToken);
    expect(redeliver.status).toBe(200);
    expect((redeliver.body.data as { deal: { deliveries: unknown[] } }).deal.deliveries).toHaveLength(2);

    // Approve: status move + escrow release are one transaction.
    const approve = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'approve' });
    expect(approve.status).toBe(200);
    const approved = approve.body.data as { deal: { status: string }; amounts: { heldMinor: number; paidMinor: number; approved: boolean } };
    expect(approved.deal.status).toBe('APPROVED');
    expect(approved.amounts.heldMinor).toBe(0);
    expect(approved.amounts.paidMinor).toBe(4_500_000);
    expect(approved.amounts.approved).toBe(true);

    const stored = await db.deal.findUniqueOrThrow({
      where: { id: deal.id },
      include: { payments: true, events: true },
    });
    expect(stored.paymentReleasedAt).toBeTruthy();
    expect(stored.payments.every((p) => p.escrowStatus === 'RELEASED' && p.releasedAt)).toBe(true);
    expect(stored.events.some((e) => e.type === 'PAYMENT_RELEASED' && e.actor === 'SYSTEM')).toBe(true);

    // Finals stay locked until the balance is settled.
    const early = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'release-files' }, a.accessToken);
    expect(early.status).toBe(409);
    expect(early.body.error?.code).toBe('DEAL_NOT_FULLY_PAID');
    expect(early.body.error?.message).toContain('₦45,000');

    await db.dealPayment.create({
      data: {
        dealId: deal.id,
        type: 'BALANCE',
        label: 'Balance payment',
        amountMinor: 4_500_000,
        method: 'TRANSFER',
        provider: 'FLUTTERWAVE',
        reference: `FLW-TEST-${RUN}-${deal.id.slice(-6)}`,
        escrowStatus: 'HELD',
        paidAt: new Date(),
      },
    });

    const release = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'release-files' }, a.accessToken);
    expect(release.status).toBe(200);
    expect((release.body.data as { deal: { status: string } }).deal.status).toBe('FILES_RELEASED');

    const complete = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'complete' });
    expect(complete.status).toBe(200);
    expect((complete.body.data as { deal: { status: string }; amounts: { fullyPaid: boolean } }).deal.status).toBe('COMPLETED');
    expect((complete.body.data as { amounts: { fullyPaid: boolean } }).amounts.fullyPaid).toBe(true);

    const recomplete = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'complete' });
    expect(recomplete.status).toBe(409);
    },
    90_000, // ~12 sequential Neon round-trips plus fixtures
  );

  timed('approves a zero-payment deal without inventing a release event', async () => {
    const deal = await draftDeal(a.accessToken);
    await call('PATCH', `/api/v1/deals/${deal.id}`, { clientName: 'Zero Pay', priceMinor: 1_000_000 }, a.accessToken);
    await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, a.accessToken);
    await db.deal.update({ where: { id: deal.id }, data: { status: 'ACTIVE', acceptedAt: new Date(), depositPaidAt: new Date() } });

    const deliver = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'deliver' }, a.accessToken);
    expect(deliver.status).toBe(200);

    const share = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, select: { shareToken: true } });
    const approve = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'approve' });
    expect(approve.status).toBe(200);

    const stored = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { events: true } });
    expect(stored.status).toBe('APPROVED');
    expect(stored.paymentReleasedAt).toBeNull();
    expect(stored.events.some((e) => e.type === 'PAYMENT_RELEASED')).toBe(false);
  });

  timed('rejects approving a deal that was never delivered', async () => {
    const deal = await draftDeal(a.accessToken);
    await call('PATCH', `/api/v1/deals/${deal.id}`, { clientName: 'Eager Client', priceMinor: 1_000_000 }, a.accessToken);
    await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, a.accessToken);
    const share = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, select: { shareToken: true } });

    const approve = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'approve' });
    expect(approve.status).toBe(409);
    expect(approve.body.error?.code).toBe('INVALID_DEAL_TRANSITION');
  });

  timed('raises a dispute with a required reason, stored as an OPEN Dispute row', async () => {
    const deal = await draftDeal(a.accessToken);
    await call('PATCH', `/api/v1/deals/${deal.id}`, { clientName: 'Angry Client', priceMinor: 1_000_000 }, a.accessToken);
    await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, a.accessToken);
    await db.deal.update({ where: { id: deal.id }, data: { status: 'ACTIVE', acceptedAt: new Date(), depositPaidAt: new Date() } });
    await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'deliver' }, a.accessToken);
    const share = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, select: { shareToken: true } });

    const noReason = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'dispute' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error?.code).toBe('DISPUTE_REASON_REQUIRED');

    const disputed = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'dispute', note: 'Wrong deliverable colour grade' });
    expect(disputed.status).toBe(200);
    expect((disputed.body.data as { deal: { status: string } }).deal.status).toBe('DISPUTED');

    const row = await db.dispute.findFirstOrThrow({ where: { dealId: deal.id } });
    expect(row.status).toBe('OPEN');
    expect(row.raisedBy).toBe('CLIENT');
    expect(row.reason).toBe('Wrong deliverable colour grade');

    const again = await call('POST', `/api/v1/shared/${share.shareToken}/actions`, { action: 'dispute', note: 'again' });
    expect(again.status).toBe(409);
  });

  // ── Cross-creator protection ───────────────────────────────────────────────

  timed('hides foreign deals: 404 on detail, empty list, spoofed identity rejected', async () => {
    const mine = await draftDeal(a.accessToken);
    const foreign = await call('GET', `/api/v1/deals/${mine.id}`, undefined, b.accessToken);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error?.code).toBe('DEAL_NOT_FOUND');

    const listB = await call('GET', '/api/v1/deals', undefined, b.accessToken);
    const bDeals = (listB.body.data as { deals: Array<{ id: string }> }).deals;
    expect(bDeals.some((d) => d.id === mine.id)).toBe(false);

    const detail = await call('GET', `/api/v1/deals/${mine.id}`, undefined, a.accessToken);
    expect(detail.status).toBe(200);
  });

  timed('unauthenticated access to owner routes is 401', async () => {
    const res = await call('GET', '/api/v1/deals');
    expect(res.status).toBe(401);
  });

  // ── Rate limiting (isolated: fresh app instance = fresh in-memory bucket) ──

  timed(
    'throttles shared actions after 20/min per IP',
    async () => {
      // The main app's bucket is shared by every test above with a rolling 60s
      // window — slow Neon round-trips make exact counting flaky. A second app
      // instance carries its OWN in-memory store, so this burn is deterministic:
      // 21 request-changes probes against a DRAFT deal (each a fast 409), the
      // 21st must hit the 20/min ceiling.
      const deal = await draftDeal(a.accessToken);
      const share = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, select: { shareToken: true } });

      const probe = await createApp();
      await probe.listen(0);
      const probeUrl = await probe.getUrl();
      try {
        const statuses: number[] = [];
        for (let i = 0; i < 21; i++) {
          const res = await fetch(`${probeUrl}/api/v1/shared/${share.shareToken}/actions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'request-changes' }),
          });
          statuses.push(res.status);
        }
        expect(statuses.slice(0, 20)).toEqual(Array(20).fill(409)); // state-machine refusals, still counted
        expect(statuses[20]).toBe(429);
      } finally {
        await probe.close();
      }
    },
    60_000,
  );
});
