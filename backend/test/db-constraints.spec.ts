import { describe, expect, it } from 'bun:test';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Phase 3 acceptance: database constraints verified against the live Neon database.
 * Skips automatically when no database URL is configured (e.g. CI without secrets) —
 * flagged, never silent in an environment where the variable WAS expected.
 */
const dbUrl = process.env.NEON_DATABASE_URL;
const hasDb = typeof dbUrl === 'string';
const db = hasDb
  ? new PrismaClient({ datasources: { db: { url: dbUrl } } })
  : new PrismaClient();

/** Runs `fn`, asserting it fails with a Prisma unique-constraint violation. */
async function expectP2002(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    throw new Error('Expected a unique-constraint violation (P2002) but the write succeeded.');
  } catch (error) {
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
  }
}

describe.skipIf(!hasDb)('database constraints (integration, Neon)', () => {
  it('seeded demo data is present', async () => {
    const deals = await db.deal.findMany({ select: { ref: true, status: true, priceMinor: true } });
    expect(deals.length).toBe(5);
    expect(deals.map((d) => d.ref).sort()).toEqual(['DEAL-001', 'DEAL-002', 'DEAL-003', 'DEAL-004', 'DEAL-005']);
    // Money is stored in kobo — naira values ×100 (server is the money authority).
    const deal1 = deals.find((d) => d.ref === 'DEAL-001');
    expect(deal1?.priceMinor).toBe(12_000_000);
  });

  it('enforces unique user email and phone', async () => {
    const tobi = await db.user.findUniqueOrThrow({ where: { email: 'tobi@deal.ng' } });
    await expectP2002(() =>
      db.user.create({ data: { email: 'tobi@deal.ng', phone: '+234 999 000 1111', passwordHash: 'x' } }),
    );
    await expectP2002(() =>
      db.user.create({ data: { email: 'other@deal.ng', phone: tobi.phone ?? '', passwordHash: 'x' } }),
    );
  });

  it('enforces unique creator handle and deal shareToken', async () => {
    await expectP2002(() =>
      db.creatorProfile.create({ data: { userId: 'u_tobi', name: 'Dup', handle: 'tobi-a' } }),
    );
    await expectP2002(() =>
      db.deal.create({
        data: {
          ref: 'DEAL-XXX',
          creatorId: 'u_tobi',
          shareToken: 'tok_lola001',
          title: 'Dup',
          serviceTitle: 'Dup',
          clientName: 'Dup',
          clientContact: 'x',
          priceMinor: 1,
          depositPercent: 1,
        },
      }),
    );
  });

  it('enforces unique payment reference and webhook (provider, eventId)', async () => {
    const deal = await db.deal.findUniqueOrThrow({ where: { ref: 'DEAL-001' } });
    await expectP2002(() =>
      db.dealPayment.create({
        data: {
          dealId: deal.id,
          type: 'DEPOSIT',
          label: 'Dup',
          amountMinor: 1,
          method: 'CARD',
          provider: 'PAYSTACK',
          reference: 'PSK-8KD92MAQ',
          paidAt: new Date(),
        },
      }),
    );
    await db.webhookEvent.create({
      data: { provider: 'PAYSTACK', eventId: 'evt_constraint_probe', eventType: 'charge.success', payloadHash: 'x' },
    });
    await expectP2002(() =>
      db.webhookEvent.create({
        data: { provider: 'PAYSTACK', eventId: 'evt_constraint_probe', eventType: 'charge.success', payloadHash: 'x' },
      }),
    );
    // Same eventId from the OTHER provider is allowed — dedup is per provider.
    await db.webhookEvent.create({
      data: { provider: 'FLUTTERWAVE', eventId: 'evt_constraint_probe', eventType: 'charge.completed', payloadHash: 'x' },
    });
    await db.webhookEvent.deleteMany({ where: { eventId: 'evt_constraint_probe' } });
  });

  it('blocks cascade destruction of a creator with domain data', async () => {
    // RESTRICT by design: a creator holding deals cannot be deleted accidentally.
    // NOTE (flagged): under the bun runtime Prisma surfaces FK violations as
    // PrismaClientUnknownRequestError (no P2003 code), so we assert the invariant
    // — the delete must fail with a foreign-key error — instead of the code.
    let blocked = false;
    try {
      await db.creatorProfile.delete({ where: { id: 'u_tobi' } });
    } catch (error) {
      const message = String((error as Error)?.message ?? '');
      const code = (error as Prisma.PrismaClientKnownRequestError).code;
      blocked = code === 'P2003' || message.toLowerCase().includes('foreign key');
    }
    expect(blocked).toBe(true);
  });
});
