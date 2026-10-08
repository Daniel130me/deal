import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { ConfigService } from '../src/config/config.service';
import { FlutterwaveGateway } from '../src/integrations/payments/flutterwave.gateway';
import type { VerifiedPayment } from '../src/integrations/payments/payment-gateway';
import { createApp } from '../src/app';

/**
 * Phase 8 acceptance: payment rails + webhook pipeline against the real app +
 * live Neon (skips when no DB URL / secret is present, mirroring deals.spec.ts).
 *
 * Matrix covered: shared initialize (validation, draft refusal, reference
 * shape, pending transaction row, rail-refused 502 with audited initError),
 * Paystack dormant 503, verify landing the deposit (DealPayment HELD +
 * verified transaction + SENT->ACTIVE with acceptedAt/depositPaidAt + audit
 * event), client-verify idempotency, installment landing on ACTIVE, amount and
 * currency mismatch holds, failed/pending polls, foreign-reference 404, the
 * FULL webhook chain (unsigned 401, ignored events, successful landing,
 * duplicate-delivery dedup, second event for a landed reference, unknown
 * reference and mismatch marked processed-not-retried, malformed payload 400),
 * approve-releases-escrow + post-approval straight-to-creator payments, the
 * payment rate limit (deterministic), and a LIVE Flutterwave adapter smoke.
 *
 * Rate-limit isolation: the throttler keys per client IP, and the app trusts
 * exactly one proxy hop — so each test sends a UNIQUE X-Forwarded-For and gets
 * a fresh bucket (the sandbox gateway appends the real client IP the same way
 * in production). The limiter test then burns ONE dedicated IP deterministically.
 *
 * The pipeline tests stub ONLY the gateway boundary (the FlutterwaveGateway
 * instance inside the real app): a hosted checkout cannot be auto-completed
 * headlessly, and every rule under test (verification, escrow, idempotency)
 * lives server-side of that seam. The live adapter block proves the real rail
 * speaks the same port.
 */

const dbConfigured = typeof process.env.NEON_DATABASE_URL === 'string';
const secretConfigured =
  typeof process.env.JWT_ACCESS_SECRET === 'string' && process.env.JWT_ACCESS_SECRET.length >= 32;

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
const RUN36 = Date.now().toString(36) + Math.floor(Math.random() * 1_296).toString(36);
const EMAIL_A = `pay-test-${RUN}-a@deal.test`;
const EMAIL_B = `pay-test-${RUN}-b@deal.test`;
const PASSWORD = 'CorrectHorse1!';
const HANDLE_A = `payer-${RUN36}`;
const HANDLE_B = `rail-b-${RUN36}`;

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

describe.skipIf(!dbConfigured || !secretConfigured)('payment rails + webhook pipeline (integration, e2e)', () => {
  const timed = (name: string, fn: () => Promise<void>, ms = 30_000) => it(name, fn, ms);
  let app: INestApplication;
  let baseUrl: string;
  let a: Session;
  let b: Session;
  let db: PrismaClient;
  let flw: FlutterwaveGateway;

  /** Per-test rate-limit isolation: every test gets its own client IP bucket. */
  let ipCounter = 0;
  const nextIp = () => `10.77.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;

  /**
   * Faithful fake gateway: answers verify by reading the initialized
   * transaction row, so amounts match by construction unless a test
   * deliberately overrides the amount or status.
   */
  let verifyStatus: VerifiedPayment['status'] = 'successful';
  let verifyAmountOverride: number | null = null;
  let verifyCurrencyOverride: string | null = null;

  /** WebhookEvent rows created by this run — for scoped cleanup. */
  const webhookEventIds = new Set<string>();
  const webhookSeq = (() => {
    let n = 0;
    return () => `${Date.now()}-${++n}`;
  })();

  const call = async (
    method: string,
    path: string,
    body?: unknown,
    token?: string,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: Envelope<Record<string, unknown>> }> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': nextIp(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Envelope<Record<string, unknown>> };
  };

  const draftDeal = async (token: string, extra: Record<string, unknown> = {}) => {
    const res = await call('POST', '/api/v1/deals', { title: `Deal ${RUN}`, ...extra }, token);
    expect(res.status).toBe(201);
    return (res.body.data as { deal: { id: string; shareToken: string; ref: string } }).deal;
  };

  /** Wizard-fill + send: a SENT deal with a 50% deposit and 2 installments. */
  const sendDeal = async (token: string, priceMinor: number, extra: Record<string, unknown> = {}) => {
    const deal = await draftDeal(token, extra);
    const patched = await call(
      'PATCH',
      `/api/v1/deals/${deal.id}`,
      { priceMinor, clientName: 'Ada Client', title: `Paid deal ${RUN}` },
      token,
    );
    expect(patched.status).toBe(200);
    const sent = await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'send' }, token);
    expect(sent.status).toBe(200);
    return deal;
  };

  const initialize = async (shareToken: string, provider = 'FLUTTERWAVE', method = 'CARD') =>
    call('POST', `/api/v1/shared/${shareToken}/payments/initialize`, { provider, method });

  const verify = async (shareToken: string, reference: string) =>
    call('POST', `/api/v1/shared/${shareToken}/payments/verify`, { reference });

  const flwWebhook = async (payload: Record<string, unknown>, hash = process.env.FLW_WEBHOOK_SECRET_HASH ?? 'missing') => {
    const data = payload.data as { id?: unknown } | undefined;
    if (data && typeof data.id === 'string') webhookEventIds.add(data.id);
    return call('POST', '/api/v1/webhooks/flutterwave', payload, undefined, { 'verif-hash': hash });
  };

  const depositOf = (priceMinor: number) => Math.round((priceMinor * 50) / 100);

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0);
    baseUrl = await app.getUrl();

    // Stub the gateway boundary at the SEAM the architecture provides: the
    // adapter instance inside the real app. Everything behind it (pipeline,
    // escrow, state machine, idempotency) runs for real.
    flw = app.get(FlutterwaveGateway);
    flw.initializePayment = async (input) => ({ link: `https://checkout.flutterwave.test/${input.reference}` });
    flw.verifyPayment = async (reference: string) => {
      const row = await db.paymentTransaction.findUnique({ where: { providerRef: reference } });
      return {
        providerTransactionId: `FLWFAKE-${reference}`,
        reference,
        status: verifyStatus,
        amountMinor: verifyAmountOverride ?? row?.amountMinor ?? 0,
        currency: verifyCurrencyOverride ?? row?.currency ?? 'NGN',
        raw: { fake: true, note: 'test gateway stub' },
      };
    };

    const signupA = await call('POST', '/api/v1/auth/signup', { email: EMAIL_A, password: PASSWORD });
    const signupB = await call('POST', '/api/v1/auth/signup', { email: EMAIL_B, password: PASSWORD });
    a = signupA.body.data as unknown as Session;
    b = signupB.body.data as unknown as Session;
    await call('POST', '/api/v1/creators/me', { name: 'Payer A', handle: HANDLE_A, craft: 'Photographer' }, a.accessToken);
    await call('POST', '/api/v1/creators/me', { name: 'Rail B', handle: HANDLE_B, craft: 'Videographer' }, b.accessToken);

    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient({ datasources: { db: { url: process.env.NEON_DATABASE_URL } } });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    // FK-safe cleanup: payment ledger first, then deal children, then owners.
    // WebhookEvent has no deal FK — scoped by the event ids this run created.
    for (const id of webhookEventIds) {
      await db.webhookEvent.deleteMany({ where: { provider: 'FLUTTERWAVE', eventId: id } });
    }
    await db.paymentTransaction.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dealPayment.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.fileAsset.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dealDelivery.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dealEvent.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dealDeliverable.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dispute.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.deal.deleteMany({ where: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } });
    await db.clientRequest.deleteMany({ where: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } });
    await db.service.deleteMany({ where: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } });
    await db.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
    await db.$disconnect();
  }, 120_000); // ~16 sequential Neon round-trips — the 5s hook default is not enough

  // ── Shared initialize ───────────────────────────────────────────────────────

  timed('initialize is public but a wrong token is 404 DEAL_NOT_FOUND', async () => {
    const res = await initialize('not-a-real-token');
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('DEAL_NOT_FOUND');
  });

  timed('initialize validates the DTO (unknown fields rejected, unknown rail rejected)', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const spoofedField = await call('POST', `/api/v1/shared/${deal.shareToken}/payments/initialize`, {
      provider: 'FLUTTERWAVE',
      method: 'CARD',
      amountMinor: 1, // client-supplied amounts are forbidden — server computes
    });
    expect(spoofedField.status).toBe(400);
    expect(spoofedField.body.error?.code).toBe('VALIDATION_ERROR');
    const bogusRail = await call('POST', `/api/v1/shared/${deal.shareToken}/payments/initialize`, {
      provider: 'PAYPAL',
      method: 'CARD',
    });
    expect(bogusRail.status).toBe(400);
  });

  timed('refuses payment on a DRAFT deal (terms not yet agreed)', async () => {
    const deal = await draftDeal(a.accessToken);
    const res = await initialize(deal.shareToken);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('DEAL_NOT_PAYABLE');
  });

  timed('initializes the deposit slot on a SENT deal (server-computed amount, pending tx row)', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000); // ₦40,000 -> deposit ₦20,000
    const res = await initialize(deal.shareToken);
    expect(res.status).toBe(201);
    const data = res.body.data as { reference: string; amountMinor: number; label: string; link: string; provider: string };
    expect(data.reference).toMatch(/^FLW-DEAL-\d+-DEPOSIT-[0-9a-f]{8}$/);
    expect(data.amountMinor).toBe(depositOf(4_000_000));
    expect(data.label).toBe('Deposit (50%)');
    expect(data.link).toContain(data.reference);
    const row = await db.paymentTransaction.findUnique({ where: { providerRef: data.reference } });
    expect(row?.gatewayStatus).toBe('pending');
    expect(row?.verifiedAt).toBeNull();
  });

  timed('records an audited failure when the rail refuses the charge (502, tx row failed)', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const broken = app.get(FlutterwaveGateway);
    const original = broken.initializePayment;
    broken.initializePayment = async () => {
      throw new Error('rail unreachable (test)');
    };
    try {
      const res = await initialize(deal.shareToken);
      expect(res.status).toBe(502);
      expect(res.body.error?.code).toBe('PAYMENT_INITIALIZATION_FAILED');
      // The attempt row survives for audit even though the rail failed.
      const failed = await db.paymentTransaction.findFirst({
        where: { dealId: deal.id, gatewayStatus: 'failed' },
      });
      expect(failed?.providerRef).toMatch(/^FLW-DEAL-\d+-DEPOSIT-[0-9a-f]{8}$/);
    } finally {
      broken.initializePayment = original;
    }
  });

  timed('Paystack is dormant without keys: explicit 503, never a silent fallback', async () => {
    const deal = await sendDeal(b.accessToken, 2_000_000);
    const res = await initialize(deal.shareToken, 'PAYSTACK');
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
  });

  // ── Verify + landing (escrow core) ─────────────────────────────────────────

  timed('verify lands the deposit: HELD payment, verified tx, SENT -> ACTIVE with timestamps', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const init = await initialize(deal.shareToken);
    const reference = (init.body.data as { reference: string }).reference;

    const res = await verify(deal.shareToken, reference);
    expect(res.status).toBe(200);
    const data = res.body.data as {
      status: string;
      payment: { escrowStatus: string; amountMinor: number; type: string };
      amounts: { paidMinor: number; heldMinor: number };
    };
    expect(data.status).toBe('successful');
    expect(data.payment.escrowStatus).toBe('HELD');
    expect(data.payment.type).toBe('DEPOSIT');
    expect(data.amounts.paidMinor).toBe(depositOf(4_000_000));
    expect(data.amounts.heldMinor).toBe(depositOf(4_000_000));

    const row = await db.paymentTransaction.findUnique({ where: { providerRef: reference } });
    expect(row?.verifiedAt).not.toBeNull();
    expect(row?.gatewayStatus).toBe('successful');

    const stored = await db.deal.findUnique({ where: { id: deal.id }, include: { events: true } });
    expect(stored?.status).toBe('ACTIVE'); // the acceptance move Phase 6 reserved
    expect(stored?.acceptedAt).not.toBeNull();
    expect(stored?.depositPaidAt).not.toBeNull();
    expect(stored?.events.some((e) => e.type === 'DEPOSIT_PAID')).toBe(true);
  });

  timed('repeated verify is idempotent (client poll racing the webhook)', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const init = await initialize(deal.shareToken);
    const reference = (init.body.data as { reference: string }).reference;
    await verify(deal.shareToken, reference);
    const again = await verify(deal.shareToken, reference);
    expect(again.status).toBe(200);
    expect((again.body.data as { status: string }).status).toBe('successful');
    expect(await db.dealPayment.count({ where: { dealId: deal.id } })).toBe(1); // exactly one landed row
  });

  timed('an installment lands on an ACTIVE deal as HELD with a BALANCE_PAID event', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const init = await initialize(deal.shareToken);
    await verify(deal.shareToken, (init.body.data as { reference: string }).reference); // deposit -> ACTIVE

    const installment = await initialize(deal.shareToken);
    const data = installment.body.data as { label: string; reference: string };
    expect(data.label).toBe('Installment 1 of 2');
    const res = await verify(deal.shareToken, data.reference);
    expect(res.status).toBe(200);
    const stored = await db.deal.findUnique({ where: { id: deal.id }, include: { events: true, payments: true } });
    expect(stored?.status).toBe('ACTIVE'); // no spurious transition
    expect(stored?.payments.length).toBe(2);
    expect(stored?.events.some((e) => e.type === 'BALANCE_PAID' && e.label.includes('Installment 1 of 2'))).toBe(true);
  });

  timed('amount mismatch holds for review: 409, tx amount_mismatch, nothing lands', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const init = await initialize(deal.shareToken);
    const reference = (init.body.data as { reference: string }).reference;
    verifyAmountOverride = depositOf(4_000_000) + 1; // gateway "paid" one kobo too much
    try {
      const res = await verify(deal.shareToken, reference);
      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    } finally {
      verifyAmountOverride = null;
    }
    const row = await db.paymentTransaction.findUnique({ where: { providerRef: reference } });
    expect(row?.gatewayStatus).toBe('amount_mismatch');
    expect(row?.verifiedAt).toBeNull();
    expect(await db.dealPayment.count({ where: { dealId: deal.id } })).toBe(0);
  });

  timed('currency mismatch holds for review', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const init = await initialize(deal.shareToken);
    const reference = (init.body.data as { reference: string }).reference;
    verifyCurrencyOverride = 'USD';
    try {
      const res = await verify(deal.shareToken, reference);
      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    } finally {
      verifyCurrencyOverride = null;
    }
  });

  timed('a failed charge polls back as failed and lands nothing', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const init = await initialize(deal.shareToken);
    const reference = (init.body.data as { reference: string }).reference;
    verifyStatus = 'failed';
    try {
      const res = await verify(deal.shareToken, reference);
      expect(res.status).toBe(200);
      expect((res.body.data as { status: string }).status).toBe('failed');
    } finally {
      verifyStatus = 'successful';
    }
    expect(await db.dealPayment.count({ where: { dealId: deal.id } })).toBe(0);
    expect(await db.deal.findUnique({ where: { id: deal.id } }).then((d) => d?.status)).toBe('SENT');
  });

  timed('a reference from another deal answers the same 404 (no cross-deal probe)', async () => {
    const mine = await sendDeal(a.accessToken, 4_000_000);
    const theirs = await sendDeal(b.accessToken, 2_000_000);
    const foreignInit = await initialize(theirs.shareToken);
    const foreignRef = (foreignInit.body.data as { reference: string }).reference;
    const res = await verify(mine.shareToken, foreignRef);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('PAYMENT_NOT_FOUND');
  });

  // ── Webhook pipeline ────────────────────────────────────────────────────────

  timed('rejects deliveries with a missing or wrong signature', async () => {
    const payload = { event: 'charge.completed', data: { id: webhookSeq(), tx_ref: 'x', status: 'successful' } };
    const noHash = await flwWebhook(payload, '');
    expect(noHash.status).toBe(401);
    expect(noHash.body.error?.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    const badHash = await flwWebhook(payload, 'not-the-configured-hash-value');
    expect(badHash.status).toBe(401);
    expect(await db.webhookEvent.count({ where: { eventId: { in: [...webhookEventIds] } } })).toBe(0);
  });

  timed('records and ignores non-successful charges without retry bait', async () => {
    const id = webhookSeq();
    const res = await flwWebhook({ event: 'charge.completed', data: { id, tx_ref: 'FLW-never-initialized', status: 'failed' } });
    expect(res.status).toBe(200);
    const row = await db.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'FLUTTERWAVE', eventId: id } },
    });
    expect(row?.processed).toBe(true);
    expect(row?.failureReason).toContain('ignored');
  });

  timed('lands a successful charge delivered ONLY by webhook (the out-of-band path)', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const init = await initialize(deal.shareToken);
    const reference = (init.body.data as { reference: string }).reference;
    const id = webhookSeq();

    const res = await flwWebhook({ event: 'charge.completed', data: { id, tx_ref: reference, status: 'successful' } });
    expect(res.status).toBe(200);
    expect(await db.dealPayment.count({ where: { dealId: deal.id } })).toBe(1);
    expect(await db.deal.findUnique({ where: { id: deal.id } }).then((d) => d?.status)).toBe('ACTIVE');
    const row = await db.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'FLUTTERWAVE', eventId: id } },
    });
    expect(row?.processed).toBe(true);
    expect(row?.failureReason).toBeNull();
  });

  timed('a duplicate delivery is acknowledged without reprocessing', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const init = await initialize(deal.shareToken);
    const reference = (init.body.data as { reference: string }).reference;
    const payload = { event: 'charge.completed', data: { id: webhookSeq(), tx_ref: reference, status: 'successful' } };

    expect((await flwWebhook(payload)).status).toBe(200);
    const dup = await flwWebhook(payload);
    expect(dup.status).toBe(200);
    expect((dup.body.data as { duplicate?: boolean }).duplicate).toBe(true);
    expect(await db.dealPayment.count({ where: { dealId: deal.id } })).toBe(1);
  });

  timed('a second event for an already-landed reference short-circuits (still one payment)', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const init = await initialize(deal.shareToken);
    const reference = (init.body.data as { reference: string }).reference;
    await flwWebhook({ event: 'charge.completed', data: { id: webhookSeq(), tx_ref: reference, status: 'successful' } });
    // Provider-style retry with a DIFFERENT event id for the same charge.
    await flwWebhook({ event: 'charge.completed', data: { id: webhookSeq(), tx_ref: reference, status: 'successful' } });
    expect(await db.dealPayment.count({ where: { dealId: deal.id } })).toBe(1);
    const tx = await db.paymentTransaction.findUnique({ where: { providerRef: reference } });
    expect(tx?.verifiedAt).not.toBeNull();
  });

  timed('an unknown reference is marked processed with a failure reason (no retry loop)', async () => {
    const id = webhookSeq();
    const res = await flwWebhook({ event: 'charge.completed', data: { id, tx_ref: 'FLW-DEAL-000-DEPOSIT-deadbeef', status: 'successful' } });
    expect(res.status).toBe(200);
    const row = await db.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'FLUTTERWAVE', eventId: id } },
    });
    expect(row?.processed).toBe(true);
    expect(row?.failureReason).toContain('PAYMENT_NOT_FOUND');
  });

  timed('an amount-mismatch webhook is held for review, not retried', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const init = await initialize(deal.shareToken);
    const reference = (init.body.data as { reference: string }).reference;
    verifyAmountOverride = 1; // gateway "paid" ₦0.01
    const id = webhookSeq();
    try {
      const res = await flwWebhook({ event: 'charge.completed', data: { id, tx_ref: reference, status: 'successful' } });
      expect(res.status).toBe(200);
      const row = await db.webhookEvent.findUnique({
        where: { provider_eventId: { provider: 'FLUTTERWAVE', eventId: id } },
      });
      expect(row?.processed).toBe(true);
      expect(row?.failureReason).toContain('PAYMENT_AMOUNT_MISMATCH');
      expect(await db.dealPayment.count({ where: { dealId: deal.id } })).toBe(0);
    } finally {
      verifyAmountOverride = null;
    }
  });

  timed('a structurally malformed payload (after signature) is 400', async () => {
    const res = await flwWebhook({ event: 'charge.completed', data: { nope: true } });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('WEBHOOK_PAYLOAD_INVALID');
  });

  timed('Paystack webhook is 503 while the rail has no keys', async () => {
    const res = await call('POST', '/api/v1/webhooks/paystack', { event: 'charge.success', data: { id: 1 } });
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe('WEBHOOK_NOT_CONFIGURED');
  });

  // ── Escrow release + post-approval money ────────────────────────────────────

  timed('approve releases escrow; a post-approval payment lands straight to the creator', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const depositInit = await initialize(deal.shareToken);
    await verify(deal.shareToken, (depositInit.body.data as { reference: string }).reference);
    const instInit = await initialize(deal.shareToken);
    await verify(deal.shareToken, (instInit.body.data as { reference: string }).reference);

    // Creator delivers, client approves -> escrow releases.
    expect((await call('POST', `/api/v1/deals/${deal.id}/actions`, { action: 'deliver' }, a.accessToken)).status).toBe(200);
    const approve = await call('POST', `/api/v1/shared/${deal.shareToken}/actions`, { action: 'approve' });
    expect(approve.status).toBe(200);

    const afterApprove = await db.dealPayment.findMany({ where: { dealId: deal.id } });
    expect(afterApprove.length).toBe(2);
    expect(afterApprove.every((p) => p.escrowStatus === 'RELEASED' && p.releasedAt)).toBe(true);

    // The remaining balance now bypasses escrow (work already approved).
    const balanceInit = await initialize(deal.shareToken);
    const balanceData = balanceInit.body.data as { reference: string; label: string };
    expect(balanceData.label).toBe('Installment 2 of 2');
    const res = await verify(deal.shareToken, balanceData.reference);
    expect((res.body.data as { payment: { escrowStatus: string } }).payment.escrowStatus).toBe('RELEASED');
    const row = await db.dealPayment.findFirst({ where: { reference: balanceData.reference } });
    expect(row?.releasedAt).not.toBeNull();
  });

  // ── Rate limit (deterministic via a dedicated IP) ───────────────────────────

  timed('rate limit: the 16th payment initialize on one IP in a minute is 429', async () => {
    const deal = await sendDeal(a.accessToken, 4_000_000);
    const ip = `10.99.0.1`; // dedicated bucket for this test only
    let sawLimit = false;
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${baseUrl}/api/v1/shared/${deal.shareToken}/payments/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ provider: 'FLUTTERWAVE', method: 'CARD' }),
      });
      const body = (await res.json()) as Envelope<Record<string, unknown>>;
      if (res.status === 429) {
        sawLimit = true;
        expect(body.error?.code).toBe('RATE_LIMITED');
        break;
      }
      expect(res.status).toBe(201);
    }
    expect(sawLimit).toBe(true);
  });
});

// ── Live Flutterwave adapter (no stubs — speaks to the real test-mode rail) ───

describe.skipIf(!dbConfigured || !process.env.FLW_SECRET_KEY)('FlutterwaveGateway (live adapter smoke)', () => {
  it('mints a hosted link and reports an unknown reference as pending', async () => {
    const app = await createApp();
    try {
      const config = app.get(ConfigService);
      const gateway = new FlutterwaveGateway(config.flutterwave);
      const reference = `FLW-SMOKE-DEPOSIT-${Date.now().toString(36)}`;

      const { link } = await gateway.initializePayment({
        reference,
        amountMinor: 10_000, // ₦100 — test mode, the link is never visited
        currency: 'NGN',
        customerEmail: 'smoke@deal.test',
        customerName: 'Smoke Test',
        redirectUrl: `${config.paymentRedirectBase}/shared/smoke`,
        title: 'DEAL · smoke',
      });
      expect(link.startsWith('https://')).toBe(true);

      const bogus = await gateway.verifyPayment(`FLW-SMOKE-DEPOSIT-${Date.now().toString(36)}-bogus`);
      expect(bogus.status).toBe('pending'); // no completed charge yet — the normal poll answer
    } finally {
      await app.close();
    }
  }, 45_000);
});
