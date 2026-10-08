import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';

/**
 * Phase 9 acceptance: reviews, disputes, notifications and the creator
 * dashboard aggregate — exercised against the real app + live Neon (skips
 * when no DB URL / secret is present, mirroring the other specs).
 *
 * Matrix covered:
 * - disputes: raise (priorStatus captured), the ADMIN-only pipeline
 *   (under-review / resolve with escrow release / reject with priorStatus
 *   restore), already-closed 409, role gates;
 * - reviews: rating validation, reviewability gate (approved work only),
 *   one-review-per-deal, creator listing isolation, REVIEW audit event;
 * - notifications: creator nudges for every Phase 9 event family, inbox
 *   read bookkeeping (one / all), foreign-id 404;
 * - overview: auth gates, DB-aggregated stats/money/series/rating/recents
 *   with exact kobo assertions against the fixtures.
 *
 * Fixture deals are driven through the real API + direct DB fixture writes
 * (the established pattern: how a deal gets money is Phase 8's concern).
 * Declaration order IS execution order (bun:test is serial): disputes first
 * (they move dealA1 to APPROVED via resolve), then reviews, then the inbox,
 * then the overview — every aggregate assertion runs against final state.
 */

const dbConfigured = typeof process.env.NEON_DATABASE_URL === 'string';
const secretConfigured =
  typeof process.env.JWT_ACCESS_SECRET === 'string' && process.env.JWT_ACCESS_SECRET.length >= 32;

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
const RUN36 = Date.now().toString(36) + Math.floor(Math.random() * 1_296).toString(36);
const EMAIL_A = `plat-test-${RUN}-a@deal.test`;
const EMAIL_B = `plat-test-${RUN}-b@deal.test`;
const EMAIL_ADMIN = `plat-test-${RUN}-admin@deal.test`;
const EMAIL_PLAIN = `plat-test-${RUN}-plain@deal.test`;
const PASSWORD = 'CorrectHorse1!';
const HANDLE_A = `plata-${RUN36}`;
const HANDLE_B = `platb-${RUN36}`;

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

describe.skipIf(!dbConfigured || !secretConfigured)('platform: disputes / reviews / notifications / overview (integration, e2e)', () => {
  /** Neon round-trips cost 0.2-2s — the 5s bun default is not enough headroom. */
  const timed = (name: string, fn: () => Promise<void>, ms = 30_000) => it(name, fn, ms);
  let app: INestApplication;
  let baseUrl: string;
  let a: Session;
  let b: Session;
  let admin: Session;
  let plain: Session;
  let db: PrismaClient;

  // Fixture deals (built in beforeAll, moved through the pipeline by the tests below):
  // - dealA1: DELIVERED + HELD ₦30,000 -> dispute -> resolve -> APPROVED -> reviewed (5 stars).
  // - dealA2: DELIVERED + HELD ₦20,000 -> approve (escrow releases) -> dispute -> reject -> APPROVED.
  // - dealA3: SENT, no money -> client request-changes -> CHANGES_REQUESTED.
  // - dealB1: DELIVERED + HELD ₦20,000 -> dispute -> reject -> back to DELIVERED.
  let dealA1: { id: string; ref: string; shareToken: string };
  let dealA2: { id: string; ref: string; shareToken: string };
  let dealA3: { id: string; ref: string; shareToken: string };
  let dealB1: { id: string; ref: string; shareToken: string };

  let firstNotificationId = '';
  let unreadBeforeMark = 0;

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

  /** Draft + wizard terms + send — the offer leaves the creator's hands. */
  const sentDeal = async (
    token: string,
    terms: { priceMinor: number; depositPercent: number },
  ): Promise<{ id: string; ref: string; shareToken: string }> => {
    const created = await call('POST', '/api/v1/deals', { title: `Platform deal ${RUN}`, clientName: 'Client', clientContact: 'client@example.com' }, token);
    expect(created.status).toBe(201);
    const deal = (created.body.data as { deal: { id: string; ref: string; shareToken: string } }).deal;
    const patched = await call('PATCH', `/api/v1/deals/${deal.id}`, terms, token);
    expect(patched.status).toBe(200);
    const sent = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, token);
    expect(sent.status).toBe(200);
    return deal;
  };

  /** Fixture: ACTIVE + a HELD deposit (production trigger is Phase 8's verification). */
  const activateWithDeposit = async (dealId: string, depositMinor: number) => {
    const now = new Date();
    await db.deal.update({ where: { id: dealId }, data: { status: 'ACTIVE', acceptedAt: now, depositPaidAt: now } });
    await db.dealPayment.create({
      data: {
        dealId,
        type: 'DEPOSIT',
        label: 'Deposit',
        amountMinor: depositMinor,
        method: 'CARD',
        provider: 'PAYSTACK',
        reference: `PSK-TEST-${RUN}-${dealId.slice(-6)}`,
        escrowStatus: 'HELD',
        paidAt: now,
      },
    });
  };

  const deliveredDeal = async (token: string, terms: { priceMinor: number; depositPercent: number }) => {
    const deal = await sentDeal(token, terms);
    await activateWithDeposit(deal.id, Math.round((terms.priceMinor * terms.depositPercent) / 100));
    const delivered = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'deliver' }, token);
    expect(delivered.status).toBe(200);
    return deal;
  };

  const sharedAction = async (token: string, body: Record<string, unknown>) =>
    call('POST', `/api/v1/shared/${token}/actions`, body);

  /** Resolves a dispute id for a deal through the admin listing. */
  async function disputeIdFor(dealId: string): Promise<string> {
    const listing = await call('GET', '/api/v1/disputes', undefined, admin.accessToken);
    const row = (listing.body.data as { disputes: Array<{ dealId: string; id: string }> }).disputes.find((d) => d.dealId === dealId);
    if (!row) throw new Error(`dispute for deal ${dealId} not found`);
    return row.id;
  }

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0); // ephemeral port
    baseUrl = await app.getUrl();

    const signupA = await call('POST', '/api/v1/auth/signup', { email: EMAIL_A, password: PASSWORD });
    const signupB = await call('POST', '/api/v1/auth/signup', { email: EMAIL_B, password: PASSWORD });
    const signupPlain = await call('POST', '/api/v1/auth/signup', { email: EMAIL_PLAIN, password: PASSWORD });
    a = signupA.body.data as unknown as Session;
    b = signupB.body.data as unknown as Session;
    plain = signupPlain.body.data as unknown as Session;
    await call('POST', '/api/v1/creators/me', { name: 'Platform A', handle: HANDLE_A, craft: 'Photographer' }, a.accessToken);
    await call('POST', '/api/v1/creators/me', { name: 'Platform B', handle: HANDLE_B, craft: 'Videographer' }, b.accessToken);
    await call(
      'POST',
      '/api/v1/creators/me/services',
      { title: 'Portrait session', description: 'Two-hour session', startingPriceMinor: 1_000_000, includes: ['2 hours'] },
      a.accessToken,
    );

    // Admin: promoted directly in the DB, then a FRESH login so the JWT role claim is current.
    await call('POST', '/api/v1/auth/signup', { email: EMAIL_ADMIN, password: PASSWORD });
    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient({ datasources: { db: { url: process.env.NEON_DATABASE_URL } } });
    await db.user.update({ where: { email: EMAIL_ADMIN }, data: { role: 'ADMIN' } });
    const adminLogin = await call('POST', '/api/v1/auth/login', { identifier: EMAIL_ADMIN, password: PASSWORD });
    admin = adminLogin.body.data as unknown as Session;
    if (!admin?.accessToken) throw new Error(`admin login failed: ${JSON.stringify(adminLogin.body)}`);

    dealA1 = await deliveredDeal(a.accessToken, { priceMinor: 6_000_000, depositPercent: 50 });
    dealA2 = await deliveredDeal(a.accessToken, { priceMinor: 2_000_000, depositPercent: 100 });
    dealA3 = await sentDeal(a.accessToken, { priceMinor: 1_000_000, depositPercent: 50 });
    dealB1 = await deliveredDeal(b.accessToken, { priceMinor: 4_000_000, depositPercent: 50 });

    // hook timeout: boot + 4 signups + 2 onboardings + service + fixtures against Neon.
  }, 90_000);

  afterAll(async () => {
    await app.close();
    // FK-safe cleanup: deal children first, then deals, requests, services,
    // then the users (which cascade away profiles/channels/refresh tokens).
    const handles = [HANDLE_A, HANDLE_B];
    await db.notification.deleteMany({ where: { user: { creatorProfile: { handle: { in: handles } } } } });
    await db.review.deleteMany({ where: { deal: { creator: { handle: { in: handles } } } } });
    await db.dealPayment.deleteMany({ where: { deal: { creator: { handle: { in: handles } } } } });
    await db.dealEvent.deleteMany({ where: { deal: { creator: { handle: { in: handles } } } } });
    await db.dealDeliverable.deleteMany({ where: { deal: { creator: { handle: { in: handles } } } } });
    await db.dealDelivery.deleteMany({ where: { deal: { creator: { handle: { in: handles } } } } });
    await db.dispute.deleteMany({ where: { deal: { creator: { handle: { in: handles } } } } });
    await db.deal.deleteMany({ where: { creator: { handle: { in: handles } } } });
    await db.clientRequest.deleteMany({ where: { creator: { handle: { in: handles } } } });
    await db.service.deleteMany({ where: { creator: { handle: { in: handles } } } });
    await db.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_ADMIN, EMAIL_PLAIN] } } });
    await db.$disconnect();
  });

  // ── Disputes (capability-link raise, ADMIN pipeline) ───────────────────────

  timed('dispute requires a reason -> DISPUTE_REASON_REQUIRED', async () => {
    const res = await sharedAction(dealA1.shareToken, { action: 'dispute' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('DISPUTE_REASON_REQUIRED');
  });

  timed('dispute on a non-delivered/approved deal -> 409', async () => {
    const res = await sharedAction(dealA3.shareToken, { action: 'dispute', note: 'not even active' });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_DEAL_TRANSITION');
  });

  timed('the dispute desk is ADMIN-only (creator 403, anon 401)', async () => {
    const asCreator = await call('GET', '/api/v1/disputes', undefined, a.accessToken);
    expect(asCreator.status).toBe(403);
    expect(asCreator.body.error?.code).toBe('FORBIDDEN');
    const anon = await call('GET', '/api/v1/disputes');
    expect(anon.status).toBe(401);
  });

  timed('client raises a dispute: DISPUTED move + OPEN row with priorStatus captured', async () => {
    const res = await sharedAction(dealA1.shareToken, { action: 'dispute', note: 'Colours look off in the final cut' });
    expect(res.status).toBe(200);
    expect((res.body.data as { deal: { status: string } }).deal.status).toBe('DISPUTED');

    const listing = await call('GET', '/api/v1/disputes', undefined, admin.accessToken);
    expect(listing.status).toBe(200);
    const row = (listing.body.data as { disputes: Array<{ dealId: string; status: string; priorStatus: string | null; reason: string; deal: { ref: string; creator: { handle: string } } }> }).disputes.find(
      (d) => d.dealId === dealA1.id,
    );
    expect(row?.status).toBe('OPEN');
    expect(row?.priorStatus).toBe('DELIVERED');
    expect(row?.reason).toBe('Colours look off in the final cut');
    expect(row?.deal.creator.handle).toBe(HANDLE_A);
  });

  timed('under-review move: OPEN -> UNDER_REVIEW, deal stays DISPUTED', async () => {
    const disputeId = await disputeIdFor(dealA1.id);
    const res = await call('POST', `/api/v1/disputes/${disputeId}/actions`, { action: 'under-review' }, admin.accessToken);
    expect(res.status).toBe(200);
    expect((res.body.data as { dispute: { status: string } }).dispute.status).toBe('UNDER_REVIEW');

    const detail = await call('GET', `/api/v1/deals/${dealA1.id}`, undefined, a.accessToken);
    expect((detail.body.data as { deal: { status: string } }).deal.status).toBe('DISPUTED');
  });

  timed('resolve: deal -> APPROVED, escrow RELEASED, dispute RESOLVED with resolvedAt', async () => {
    const disputeId = await disputeIdFor(dealA1.id);
    const res = await call('POST', `/api/v1/disputes/${disputeId}/actions`, { action: 'resolve', note: 'Mediated: colours match the brief' }, admin.accessToken);
    expect(res.status).toBe(200);
    const dispute = (res.body.data as { dispute: { status: string; resolvedAt: string | null } }).dispute;
    expect(dispute.status).toBe('RESOLVED');
    expect(dispute.resolvedAt).not.toBeNull();

    const detail = await call('GET', `/api/v1/deals/${dealA1.id}`, undefined, a.accessToken);
    const deal = (detail.body.data as { deal: { status: string; events: Array<{ type: string }>; payments: Array<{ escrowStatus: string }> } }).deal;
    expect(deal.status).toBe('APPROVED');
    expect(deal.payments.every((p) => p.escrowStatus === 'RELEASED')).toBe(true);
    expect(deal.events.some((e) => e.type === 'PAYMENT_RELEASED')).toBe(true);
    expect(deal.events.some((e) => e.type === 'DISPUTE_RESOLVED')).toBe(true);
  });

  timed('acting on a closed dispute -> 409 DISPUTE_ALREADY_CLOSED', async () => {
    const disputeId = await disputeIdFor(dealA1.id);
    const res = await call('POST', `/api/v1/disputes/${disputeId}/actions`, { action: 'reject' }, admin.accessToken);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('DISPUTE_ALREADY_CLOSED');
  });

  timed('reject restores an approved deal to its prior status (APPROVED)', async () => {
    // dealA2: DELIVERED -> approve (escrow releases) -> dispute -> reject -> APPROVED.
    const approve = await sharedAction(dealA2.shareToken, { action: 'approve' });
    expect(approve.status).toBe(200);
    expect((approve.body.data as { deal: { status: string } }).deal.status).toBe('APPROVED');

    const raise = await sharedAction(dealA2.shareToken, { action: 'dispute', note: 'Testing the reject path' });
    expect((raise.body.data as { deal: { status: string } }).deal.status).toBe('DISPUTED');

    const disputeId = await disputeIdFor(dealA2.id);
    const reject = await call('POST', `/api/v1/disputes/${disputeId}/actions`, { action: 'reject', note: 'Claim without merit' }, admin.accessToken);
    expect(reject.status).toBe(200);
    const dispute = (reject.body.data as { dispute: { status: string; priorStatus: string | null } }).dispute;
    expect(dispute.status).toBe('REJECTED');
    expect(dispute.priorStatus).toBe('APPROVED');

    const detail = await call('GET', `/api/v1/deals/${dealA2.id}`, undefined, a.accessToken);
    expect((detail.body.data as { deal: { status: string } }).deal.status).toBe('APPROVED');
  });

  timed('reject restores a delivered deal to its prior status (DELIVERED)', async () => {
    const raise = await sharedAction(dealB1.shareToken, { action: 'dispute', note: 'Client second thoughts' });
    expect((raise.body.data as { deal: { status: string } }).deal.status).toBe('DISPUTED');

    const disputeId = await disputeIdFor(dealB1.id);
    const reject = await call('POST', `/api/v1/disputes/${disputeId}/actions`, { action: 'reject' }, admin.accessToken);
    expect(reject.status).toBe(200);

    const detail = await call('GET', `/api/v1/deals/${dealB1.id}`, undefined, b.accessToken);
    expect((detail.body.data as { deal: { status: string } }).deal.status).toBe('DELIVERED');
  });

  // ── Reviews (capability-link write, creator read) ──────────────────────────
  // dealA1 is APPROVED by the dispute-resolve above — the reviewable window.

  timed('review requires a rating -> REVIEW_RATING_REQUIRED', async () => {
    const res = await sharedAction(dealA1.shareToken, { action: 'review', note: 'no stars given' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('REVIEW_RATING_REQUIRED');
  });

  timed('rating outside 1..5 is a validation error at the edge', async () => {
    for (const rating of [0, 6]) {
      const res = await sharedAction(dealA1.shareToken, { action: 'review', rating });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    }
  });

  timed('review is gated on approved work -> 409 DEAL_NOT_REVIEWABLE', async () => {
    // dealA3 is SENT — nothing approved to rate yet.
    const res = await sharedAction(dealA3.shareToken, { action: 'review', rating: 4 });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('DEAL_NOT_REVIEWABLE');
  });

  timed('client leaves a review on the approved deal (row + REVIEW event)', async () => {
    const res = await sharedAction(dealA1.shareToken, { action: 'review', rating: 5, note: ' superb work ' });
    expect(res.status).toBe(200);

    const list = await call('GET', '/api/v1/reviews', undefined, a.accessToken);
    expect(list.status).toBe(200);
    const reviews = (list.body.data as { reviews: Array<{ rating: number; comment: string | null; deal: { ref: string } }> }).reviews;
    const mine = reviews.find((r) => r.deal.ref === dealA1.ref);
    expect(mine?.rating).toBe(5);
    expect(mine?.comment).toBe('superb work'); // trimmed at the service edge

    const events = await db.dealEvent.findMany({ where: { dealId: dealA1.id, type: 'REVIEW' } });
    expect(events.length).toBe(1);
    expect(events[0]?.label).toContain('5-star');
  });

  timed('a second review on the same deal -> 409 REVIEW_EXISTS', async () => {
    const res = await sharedAction(dealA1.shareToken, { action: 'review', rating: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('REVIEW_EXISTS');
  });

  timed('GET /reviews is me-scoped — B never sees A reviews', async () => {
    const listB = await call('GET', '/api/v1/reviews', undefined, b.accessToken);
    expect(listB.status).toBe(200);
    const reviewsB = (listB.body.data as { reviews: unknown[] }).reviews;
    expect(reviewsB.length).toBe(0);
  });

  // ── Notifications (creator inbox) ──────────────────────────────────────────

  timed('creator actions nudge the creator: request-changes notification arrives', async () => {
    const res = await sharedAction(dealA3.shareToken, { action: 'request-changes', note: 'Can we go brighter?' });
    expect(res.status).toBe(200);

    const inbox = await call('GET', '/api/v1/notifications', undefined, a.accessToken);
    const types = (inbox.body.data as { items: Array<{ type: string }> }).items.map((i) => i.type);
    expect(types).toContain('deal.changes_requested');
  });

  timed('A inbox covers every Phase 9 event family with unread counts', async () => {
    const inbox = await call('GET', '/api/v1/notifications', undefined, a.accessToken);
    expect(inbox.status).toBe(200);
    const data = inbox.body.data as { items: Array<{ id: string; type: string; payload: Record<string, unknown>; readAt: string | null }>; unreadCount: number };
    const types = new Set(data.items.map((i) => i.type));
    // dispute raise + resolve (A1), approve + dispute + reject (A2), changes (A3), review (A1)
    for (const expected of ['deal.disputed', 'deal.dispute_resolved', 'deal.approved', 'deal.changes_requested', 'review.new']) {
      expect(types.has(expected)).toBe(true);
    }
    expect(data.unreadCount).toBeGreaterThan(0);
    // nothing has been read yet
    expect(data.items.every((i) => i.readAt === null)).toBe(true);
    firstNotificationId = data.items[0]!.id;
    unreadBeforeMark = data.unreadCount;
  });

  timed('mark one read: unreadCount drops, readAt stamped', async () => {
    const res = await call('POST', `/api/v1/notifications/${firstNotificationId}/read`, undefined, a.accessToken);
    expect(res.status).toBe(200);
    expect((res.body.data as { readAt: string | null }).readAt).not.toBeNull();

    const inbox = await call('GET', '/api/v1/notifications', undefined, a.accessToken);
    expect((inbox.body.data as { unreadCount: number }).unreadCount).toBe(unreadBeforeMark - 1);
  });

  timed('marking a FOREIGN notification read -> 404 (no existence leak)', async () => {
    const res = await call('POST', `/api/v1/notifications/${firstNotificationId}/read`, undefined, b.accessToken);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOTIFICATION_NOT_FOUND');
  });

  timed('read-all clears the unread badge', async () => {
    const before = await call('GET', '/api/v1/notifications', undefined, a.accessToken);
    const unread = (before.body.data as { unreadCount: number }).unreadCount;

    const res = await call('POST', '/api/v1/notifications/read-all', undefined, a.accessToken);
    expect(res.status).toBe(200);
    expect((res.body.data as { updated: number }).updated).toBe(unread);

    const inbox = await call('GET', '/api/v1/notifications', undefined, a.accessToken);
    expect((inbox.body.data as { unreadCount: number }).unreadCount).toBe(0);
  });

  timed('public submissions nudge the creator (request.new)', async () => {
    const services = await call('GET', '/api/v1/creators/me/services', undefined, a.accessToken);
    const serviceId = (services.body.data as { services: Array<{ id: string }> }).services[0]!.id;
    const submit = await call('POST', `/api/v1/public/${HANDLE_A}/requests`, {
      serviceId,
      clientName: 'Notify Client',
      clientContact: 'notify@example.com',
      description: 'Testing the nudge',
    });
    expect(submit.status).toBe(201);

    const inbox = await call('GET', '/api/v1/notifications', undefined, a.accessToken);
    const items = (inbox.body.data as { items: Array<{ type: string }> }).items;
    expect(items.some((i) => i.type === 'request.new')).toBe(true);
  });

  // ── Overview (DB aggregation dashboard) ────────────────────────────────────

  timed('overview is authenticated (401 tokenless)', async () => {
    const res = await call('GET', '/api/v1/creators/me/overview');
    expect(res.status).toBe(401);
  });

  timed('overview needs a creator profile (404 for a plain user)', async () => {
    const res = await call('GET', '/api/v1/creators/me/overview', undefined, plain.accessToken);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('CREATOR_PROFILE_NOT_FOUND');
  });

  timed('overview aggregates money exactly (kobo, escrow, expected, this month)', async () => {
    const res = await call('GET', '/api/v1/creators/me/overview', undefined, a.accessToken);
    expect(res.status).toBe(200);
    const data = res.body.data as {
      creator: { handle: string; name: string };
      money: { releasedAllTime: number; earnedThisMonth: number; inEscrow: number; expectedBalance: number };
      rating: { average: number | null; count: number };
    };

    expect(data.creator.handle).toBe(HANDLE_A);
    // dealA1 resolved (₦30,000 released) + dealA2 approved (₦20,000 released)
    expect(data.money.releasedAllTime).toBe(5_000_000);
    expect(data.money.inEscrow).toBe(0); // everything released; nothing held
    expect(data.money.earnedThisMonth).toBe(5_000_000); // all releases inside the window
    // dealA1 (APPROVED): 6M - 3M = 3M due. dealA2 (APPROVED) fully paid.
    // dealA3 is CHANGES_REQUESTED — unaccepted terms, prototype-parity excluded.
    expect(data.money.expectedBalance).toBe(3_000_000);
    expect(data.rating.count).toBe(1);
    expect(data.rating.average).toBe(5);
  });

  timed('overview stats reflect the fixture statuses; series is zero-filled with real months', async () => {
    const res = await call('GET', '/api/v1/creators/me/overview', undefined, a.accessToken);
    const data = res.body.data as {
      stats: Record<string, number>;
      earningsSeries: { month: string; amountMinor: number }[];
    };
    expect(data.stats.pendingDeals).toBe(1); // dealA3 CHANGES_REQUESTED
    expect(data.stats.ongoingDeals).toBe(2); // dealA1 + dealA2 APPROVED
    expect(data.stats.completedDeals).toBe(0);

    expect(data.earningsSeries.length).toBe(6);
    const total = data.earningsSeries.reduce((s, p) => s + p.amountMinor, 0);
    expect(total).toBe(5_000_000); // every release lands in the current bucket
    expect(data.earningsSeries.at(-1)?.month).toMatch(/^\d{4}-\d{2}$/);
  });

  timed('overview recent lists mirror the fixture rows', async () => {
    const res = await call('GET', '/api/v1/creators/me/overview', undefined, a.accessToken);
    const data = res.body.data as {
      deals: Array<{ ref: string; balanceMinor: number }>;
      requests: Array<{ ref: string; clientName: string }>;
      bookings: unknown[];
    };
    expect(data.deals.length).toBe(3);
    expect(data.deals.every((d) => typeof d.balanceMinor === 'number')).toBe(true);
    expect(data.requests.length).toBe(1); // the public submission above
    expect(data.requests[0]?.clientName).toBe('Notify Client');
    expect(data.bookings.length).toBe(0);
  });
});
