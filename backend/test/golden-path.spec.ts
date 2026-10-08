import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { FlutterwaveGateway } from '../src/integrations/payments/flutterwave.gateway';
import type { VerifiedPayment } from '../src/integrations/payments/payment-gateway';
import { createApp } from '../src/app';

/**
 * Phase 12 golden path: ONE continuous HTTP flow from signup to review —
 * the exact journey a creator and their client take in production.
 *
 * signup → onboard (role promotion) → service → client request on the public
 * page → deal created from the request (request REPLIED) → wizard patch →
 * send → share projection → deposit checkout (initialize → verify → ACTIVE,
 * escrow HELD) → installment checkout (fully paid) → deliver → approve
 * (escrow RELEASED) → review visible to the creator.
 *
 * The gateway boundary is stubbed exactly where payments.spec.ts stubs it (a
 * hosted checkout cannot be auto-completed headlessly); everything behind the
 * seam — validation, state machine, escrow, audit trail, notifications — is
 * the real application. Negative assertions ride along at each step so the
 * happy path also proves the gates it passes THROUGH are enforced.
 */

const dbConfigured = typeof process.env.NEON_DATABASE_URL === 'string';
const secretConfigured =
  typeof process.env.JWT_ACCESS_SECRET === 'string' && process.env.JWT_ACCESS_SECRET.length >= 32;

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
const RUN36 = Date.now().toString(36) + Math.floor(Math.random() * 1_296).toString(36);
const EMAIL_CREATOR = `golden-creator-${RUN}@deal.test`;
const EMAIL_CLIENT = `golden-client-${RUN}@deal.test`;
const PASSWORD = 'CorrectHorse1!';
const HANDLE = `golden-${RUN36}`;

// ₦80,000 deal: 50% deposit (₦40,000) + one installment (₦40,000) — two
// checkout rounds, exercising both schedule slots without a third.
const PRICE_MINOR = 8_000_000;
const DEPOSIT_MINOR = 4_000_000;

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

describe.skipIf(!dbConfigured || !secretConfigured)('golden path (integration, e2e)', () => {
  const timed = (name: string, fn: () => Promise<void>, ms = 30_000) => it(name, fn, ms);
  let app: INestApplication;
  let baseUrl: string;
  let creator: Session;
  let db: PrismaClient;
  let flw: FlutterwaveGateway;

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
    await app.listen(0);
    baseUrl = await app.getUrl();

    // Same seam stub as payments.spec.ts: the adapter inside the real app.
    flw = app.get(FlutterwaveGateway);
    flw.initializePayment = async (input) => ({ link: `https://checkout.flutterwave.test/${input.reference}` });
    flw.verifyPayment = async (reference: string): Promise<VerifiedPayment> => {
      const row = await db.paymentTransaction.findUnique({ where: { providerRef: reference } });
      return {
        providerTransactionId: `FLWFAKE-${reference}`,
        reference,
        status: 'successful',
        amountMinor: row?.amountMinor ?? 0,
        currency: row?.currency ?? 'NGN',
        raw: { fake: true, note: 'golden path gateway stub' },
      };
    };

    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient({ datasources: { db: { url: process.env.NEON_DATABASE_URL } } });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    // FK-safe cleanup: ledger/children first, then owners (cascades take
    // profile, refresh tokens, notifications).
    await db.paymentTransaction.deleteMany({ where: { deal: { creator: { handle: HANDLE } } } });
    await db.dealPayment.deleteMany({ where: { deal: { creator: { handle: HANDLE } } } });
    await db.review.deleteMany({ where: { deal: { creator: { handle: HANDLE } } } });
    await db.dealDelivery.deleteMany({ where: { deal: { creator: { handle: HANDLE } } } });
    await db.dealEvent.deleteMany({ where: { deal: { creator: { handle: HANDLE } } } });
    await db.dealDeliverable.deleteMany({ where: { deal: { creator: { handle: HANDLE } } } });
    await db.deal.deleteMany({ where: { creator: { handle: HANDLE } } });
    await db.clientRequest.deleteMany({ where: { creator: { handle: HANDLE } } });
    await db.service.deleteMany({ where: { creator: { handle: HANDLE } } });
    await db.user.deleteMany({ where: { email: { in: [EMAIL_CREATOR, EMAIL_CLIENT] } } });
    await db.$disconnect();
  }, 30_000);

  // The golden path shares ONE deal across steps, so the flow lives in
  // file-scoped state filled in as the steps run.
  const journey: {
    serviceId: string;
    requestId: string;
    dealId: string;
    shareToken: string;
    dealStatus: string;
  } = { serviceId: '', requestId: '', dealId: '', shareToken: '', dealStatus: '' };

  timed('1. creator signs up as a CLIENT-role user', async () => {
    const res = await call('POST', '/api/v1/auth/signup', { email: EMAIL_CREATOR, password: PASSWORD });
    expect(res.status).toBe(201);
    creator = res.body.data as unknown as Session;
    expect(creator.accessToken).toBeTruthy();
    expect(creator.user.role).toBe('CLIENT'); // promotion happens at onboarding
  });

  timed('2. onboarding promotes the account to CREATOR', async () => {
    const res = await call(
      'POST',
      '/api/v1/creators/me',
      { name: 'Golden Creator', handle: HANDLE, craft: 'Photographer' },
      creator.accessToken,
    );
    expect(res.status).toBe(201);
    const me = await call('GET', '/api/v1/auth/me', undefined, creator.accessToken);
    expect((me.body.data as { role: string }).role).toBe('CREATOR');
  });

  timed('3. creator lists a service', async () => {
    const res = await call(
      'POST',
      '/api/v1/creators/me/services',
      { title: 'Golden session', description: 'Two-hour brand shoot', startingPriceMinor: 5_000_000, includes: ['2 hours'] },
      creator.accessToken,
    );
    expect(res.status).toBe(201);
    // services.create returns the Service row directly (no wrapper).
    journey.serviceId = (res.body.data as { id: string }).id;
  });

  timed('4. client signs up and requests the service on the public page', async () => {
    const signup = await call('POST', '/api/v1/auth/signup', { email: EMAIL_CLIENT, password: PASSWORD });
    expect(signup.status).toBe(201);

    const page = await call('GET', `/api/v1/public/${HANDLE}`);
    expect(page.status).toBe(200);
    expect(
      (page.body.data as { services: Array<{ id: string }> }).services.some((s) => s.id === journey.serviceId),
    ).toBe(true);

    const submit = await call('POST', `/api/v1/public/${HANDLE}/requests`, {
      serviceId: journey.serviceId,
      clientName: 'Golden Client',
      clientContact: '+234 802 555 0123',
      eventDate: '2026-12-18',
      budgetMinMinor: 6_000_000,
      budgetMaxMinor: 9_000_000,
      description: 'Brand launch coverage.',
    });
    expect(submit.status).toBe(201);
    journey.requestId = (submit.body.data as { request: { id: string; status: string } }).request.id;
    expect(
      (submit.body.data as { request: { status: string } }).request.status,
    ).toBe('NEW');
  });

  timed('5. deal created from the request — request flips to REPLIED atomically', async () => {
    const res = await call(
      'POST',
      '/api/v1/deals',
      { requestId: journey.requestId, clientName: 'Golden Client', clientContact: '+234 802 555 0123' },
      creator.accessToken,
    );
    expect(res.status).toBe(201);
    const deal = (res.body.data as { deal: { id: string; status: string } }).deal;
    journey.dealId = deal.id;
    expect(deal.status).toBe('DRAFT');

    const inbox = await call('GET', '/api/v1/creators/me/requests', undefined, creator.accessToken);
    const row = (inbox.body.data as { requests: Array<{ id: string; status: string }> }).requests.find(
      (r) => r.id === journey.requestId,
    );
    expect(row?.status).toBe('REPLIED');
  });

  timed('6. wizard patch sets kobo terms and a two-slot schedule', async () => {
    const res = await call(
      'PATCH',
      `/api/v1/deals/${journey.dealId}`,
      {
        title: 'Brand launch coverage',
        priceMinor: PRICE_MINOR,
        depositPercent: 50,
        installmentsCount: 1,
        eventDate: '2026-12-18',
        deliverables: ['Edited gallery', 'Highlight reel'],
      },
      creator.accessToken,
    );
    expect(res.status).toBe(200);
    const amounts = (res.body.data as { deal: { amounts: { schedule: Array<{ label: string; amountMinor: number; status: string }> } } }).deal.amounts;
    expect(amounts.schedule).toHaveLength(2);
    expect(amounts.schedule[0]).toMatchObject({ label: 'Deposit (50%)', amountMinor: DEPOSIT_MINOR, status: 'due' });
  });

  timed('7. send locks terms — and refuses a second send', async () => {
    const res = await call('POST', `/api/v1/deals/${journey.dealId}/actions`, { action: 'send' }, creator.accessToken);
    expect(res.status).toBe(200);
    expect((res.body.data as { deal: { status: string } }).deal.status).toBe('SENT');

    const locked = await call('PATCH', `/api/v1/deals/${journey.dealId}`, { priceMinor: 1 }, creator.accessToken);
    expect(locked.status).toBe(409);
    expect(locked.body.error?.code).toBe('DEAL_NOT_EDITABLE');

    const again = await call('POST', `/api/v1/deals/${journey.dealId}/actions`, { action: 'send' }, creator.accessToken);
    expect(again.status).toBe(409);
  });

  timed('8. client opens the capability link — whitelisted projection only', async () => {
    const detail = await call('GET', `/api/v1/deals/${journey.dealId}`, undefined, creator.accessToken);
    journey.shareToken = (detail.body.data as { deal: { shareToken: string } }).deal.shareToken;

    const res = await call('GET', `/api/v1/shared/${journey.shareToken}`);
    expect(res.status).toBe(200);
    // The projection carries { deal, creator, amounts } — an explicit field
    // whitelist. Slim events/deliveries are PART of it (the client is a deal
    // party; Phase 10), but internal-only fields never appear.
    const data = res.body.data as { deal: Record<string, unknown>; events?: unknown };
    expect(data.deal.status).toBe('SENT');
    expect(data.deal).not.toHaveProperty('clientContact');
    expect(data.deal).not.toHaveProperty('userId');
    expect(data.deal).not.toHaveProperty('creatorId');
    expect(data.deal).not.toHaveProperty('shareToken');
    // Whitelisted event records are slim — no ids, no internals.
    for (const event of data.deal.events as Array<Record<string, unknown>>) {
      expect(Object.keys(event).sort()).toEqual(['actor', 'createdAt', 'label', 'type']);
    }
  });

  timed('9. deposit checkout: server-computed slot only, then verified landing', async () => {
    // The browser never dictates an amount — a spoofed field is rejected.
    const spoofed = await call('POST', `/api/v1/shared/${journey.shareToken}/payments/initialize`, {
      provider: 'FLUTTERWAVE',
      method: 'CARD',
      amountMinor: 1,
    });
    expect(spoofed.status).toBe(400);

    const init = await call('POST', `/api/v1/shared/${journey.shareToken}/payments/initialize`, {
      provider: 'FLUTTERWAVE',
      method: 'CARD',
    });
    expect(init.status).toBe(201);
    const reference = (init.body.data as { reference: string }).reference;

    const verify = await call('POST', `/api/v1/shared/${journey.shareToken}/payments/verify`, { reference });
    expect(verify.status).toBe(200);
    const data = verify.body.data as {
      status: string;
      payment: { escrowStatus: string; type: string; amountMinor: number };
      amounts: { paidMinor: number; heldMinor: number };
    };
    expect(data.status).toBe('successful');
    expect(data.payment.type).toBe('DEPOSIT');
    expect(data.payment.escrowStatus).toBe('HELD');
    expect(data.amounts.heldMinor).toBe(DEPOSIT_MINOR);
    // The deposit's landing is what accepts the offer — read the move from the projection.
    const after = await call('GET', `/api/v1/shared/${journey.shareToken}`);
    expect((after.body.data as { deal: { status: string } }).deal.status).toBe('ACTIVE');

    // Re-verify of the same reference is IDEMPOTENT (a client poll racing the
    // webhook converges on one landing — never a double charge).
    const replay = await call('POST', `/api/v1/shared/${journey.shareToken}/payments/verify`, { reference });
    expect(replay.status).toBe(200);
    expect((replay.body.data as { status: string }).status).toBe('successful');
    expect(await db.dealPayment.count({ where: { dealId: journey.dealId } })).toBe(1);
  });

  timed('10. installment checkout completes the payment plan', async () => {
    const init = await call('POST', `/api/v1/shared/${journey.shareToken}/payments/initialize`, {
      provider: 'FLUTTERWAVE',
      method: 'CARD',
    });
    const reference = (init.body.data as { reference: string }).reference;
    const verify = await call('POST', `/api/v1/shared/${journey.shareToken}/payments/verify`, { reference });
    const data = verify.body.data as {
      payment: { type: string; escrowStatus: string };
      amounts: { paidMinor: number; heldMinor: number };
    };
    expect(data.payment.type).toBe('INSTALLMENT');
    expect(data.amounts.paidMinor).toBe(PRICE_MINOR); // fully paid
    expect(data.amounts.heldMinor).toBe(PRICE_MINOR); // everything in escrow
  });

  timed('11. approve refuses before delivery; deliver moves the deal to DELIVERED', async () => {
    const early = await call('POST', `/api/v1/shared/${journey.shareToken}/actions`, { action: 'approve' });
    expect(early.status).toBe(409);

    const deliver = await call(
      'POST',
      `/api/v1/deals/${journey.dealId}/actions`,
      { action: 'deliver', note: 'Gallery is ready for review.' },
      creator.accessToken,
    );
    expect(deliver.status).toBe(200);
    expect((deliver.body.data as { deal: { status: string } }).deal.status).toBe('DELIVERED');
  });

  timed('12. approve releases escrow; a second approve is refused', async () => {
    const approve = await call('POST', `/api/v1/shared/${journey.shareToken}/actions`, { action: 'approve' });
    expect(approve.status).toBe(200);
    // act() returns the same { deal, creator, amounts } projection as a view.
    const data = approve.body.data as { deal: { status: string }; amounts: { heldMinor: number } };
    expect(data.deal.status).toBe('APPROVED');
    expect(data.amounts.heldMinor).toBe(0); // escrow emptied to the creator

    const duplicate = await call('POST', `/api/v1/shared/${journey.shareToken}/actions`, { action: 'approve' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error?.code).toBe('INVALID_DEAL_TRANSITION');
  });

  timed('13. client review lands; the creator sees it', async () => {
    const review = await call('POST', `/api/v1/shared/${journey.shareToken}/actions`, {
      action: 'review',
      rating: 5,
      note: 'Flawless from brief to delivery.',
    });
    expect(review.status).toBe(200);

    const list = await call('GET', '/api/v1/reviews', undefined, creator.accessToken);
    expect(list.status).toBe(200);
    const reviews = list.body.data as { reviews: Array<{ rating: number; comment: string | null }> };
    expect(reviews.reviews.some((r) => r.rating === 5 && r.comment?.includes('Flawless'))).toBe(true);
  });

  timed('14. the creator was notified along the way', async () => {
    const res = await call('GET', '/api/v1/notifications', undefined, creator.accessToken);
    expect(res.status).toBe(200);
    const types = (res.body.data as { items: Array<{ type: string }> }).items.map((n) => n.type);
    expect(types).toContain('deal.approved');
  });

  timed('15. final audit trail records the whole journey', async () => {
    const detail = await call('GET', `/api/v1/deals/${journey.dealId}`, undefined, creator.accessToken);
    const events = (detail.body.data as { deal: { events: Array<{ type: string }> } }).deal.events;
    const types = events.map((e) => e.type);
    for (const expected of ['SENT', 'DEPOSIT_PAID', 'BALANCE_PAID', 'DELIVERED', 'APPROVED', 'PAYMENT_RELEASED', 'REVIEW']) {
      expect(types).toContain(expected);
    }
  });
});
