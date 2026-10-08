/**
 * DEAL demo seed — ports the prototype records (prisma/seed-data.ts) into Neon PostgreSQL.
 *
 * Run: `bun run db:seed` (or `prisma db seed`).
 *
 * ⚠️ WIPES every domain table before inserting. Guarded against production —
 * demo/dev databases only. The demo credential created here (tobi@deal.ng /
 * demo1234) is NON-PRODUCTION and documented as such.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  DEMO_BOOKINGS,
  DEMO_CHANNELS,
  DEMO_DEALS,
  DEMO_PROFILE,
  DEMO_REQUESTS,
  DEMO_REVIEWS,
  DEMO_SERVICES,
  DEMO_USER,
  type DemoFile,
} from './seed-data';

const db = new PrismaClient({
  datasources: { db: { url: process.env.NEON_DATABASE_URL } },
});

/** Demo password — hashed with Argon2id before touching the database. */
const DEMO_PASSWORD = 'demo1234';

/**
 * Released payments get RECENT releasedAt timestamps (days before seed time,
 * preserving the demo story's relative order). The prototype's static 2026-09
 * dates would make every month-scoped dashboard aggregate ("earned this
 * month", the 6-month earnings series) read zero as the calendar drifts — the
 * demo is meant to look alive whenever it is seeded. Amounts, escrow states
 * and totals are untouched; only recency moves.
 */
const RELEASED_AT_DAYS_AGO = [12, 10, 8, 6];

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Recency-shifted timestamp for the nth released payment: the requested
 * days-ago moment, but never before the current month's start (clamped so
 * month-scoped aggregates stay meaningful even on the 1st) and strictly
 * ordered via the release counter.
 */
function recentReleasedAt(daysAgo: number, nth: number): Date {
  const monthStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  const candidate = Date.now() - daysAgo * DAY_MS;
  return new Date(Math.max(candidate, monthStart + nth * HOUR_MS));
}

/** Prototype file sizes are display strings ("212.4 MB") — derive byte counts (binary units). */
function sizeToBytes(display: string): number {
  const match = /^([\d.]+)\s*(KB|MB|GB)$/i.exec(display.trim());
  if (!match) return 0;
  const multiplier = match[2].toUpperCase() === 'KB' ? 1024 : match[2].toUpperCase() === 'MB' ? 1024 ** 2 : 1024 ** 3;
  return Math.round(Number(match[1]) * multiplier);
}

const MIME_BY_KIND: Record<string, string> = {
  ZIP: 'application/zip',
  MP4: 'video/mp4',
  JPG: 'image/jpeg',
  PNG: 'image/png',
  PDF: 'application/pdf',
};

/**
 * Placeholder storage keys for fictional demo objects. Real R2 keys
 * (`creators/{creatorId}/deals/{dealId}/{previews|final}/...`) are produced by
 * the FilesService in Phase 7 — seeds only need a stable, well-shaped key.
 */
function storageKey(dealRef: string, role: 'PREVIEW' | 'FINAL', filename: string): string {
  const folder = role === 'FINAL' ? 'final' : 'previews';
  return `creators/u_tobi/deals/${dealRef}/${folder}/${filename}`;
}

function fileAssetRows(
  files: DemoFile[],
  dealId: string,
  dealRef: string,
  role: 'PREVIEW' | 'FINAL',
  uploadedBy: string,
  releasedAt: Date | null,
  deliveryId: string | null,
) {
  return files.map((file) => ({
    id: file.id,
    dealId,
    deliveryId,
    role,
    storageKey: storageKey(dealRef, role, file.name),
    filename: file.name,
    sizeBytes: sizeToBytes(file.size),
    mime: MIME_BY_KIND[file.kind] ?? 'application/octet-stream',
    uploadedBy,
    releasedAt: role === 'FINAL' ? releasedAt : null,
  }));
}

async function wipe(): Promise<void> {
  // FK-safe order: children first. DealEvent/FileAsset are append-only domain
  // data in production, but a demo reseed is expected to reset everything.
  await db.webhookEvent.deleteMany();
  await db.notification.deleteMany();
  await db.refreshToken.deleteMany();
  await db.payoutAccount.deleteMany();
  await db.dispute.deleteMany();
  await db.review.deleteMany();
  await db.dealEvent.deleteMany();
  await db.paymentTransaction.deleteMany();
  await db.fileAsset.deleteMany();
  await db.dealDelivery.deleteMany();
  await db.dealDeliverable.deleteMany();
  await db.dealPayment.deleteMany();
  await db.deal.deleteMany();
  await db.booking.deleteMany();
  await db.clientRequest.deleteMany();
  await db.service.deleteMany();
  await db.creatorChannel.deleteMany();
  await db.creatorProfile.deleteMany();
  await db.user.deleteMany();
}

async function seed(): Promise<void> {
  const passwordHash = await hash(DEMO_PASSWORD);

  await db.user.create({ data: { ...DEMO_USER, passwordHash } });
  await db.creatorProfile.create({ data: DEMO_PROFILE });
  await db.creatorChannel.createMany({ data: DEMO_CHANNELS });
  await db.service.createMany({ data: DEMO_SERVICES });
  await db.clientRequest.createMany({ data: DEMO_REQUESTS });
  await db.booking.createMany({ data: DEMO_BOOKINGS });

  /** Counts released payments as the seed walks the deals — orders the recency shift. */
  let releasedSeen = 0;

  for (const deal of DEMO_DEALS) {
    await db.deal.create({
      data: {
        id: deal.id,
        ref: deal.ref,
        creatorId: 'u_tobi',
        requestId: deal.requestId,
        shareToken: deal.shareToken,
        title: deal.title,
        serviceTitle: deal.serviceTitle,
        clientName: deal.clientName,
        clientContact: deal.clientContact,
        summary: deal.summary,
        eventDate: new Date(deal.eventDate),
        location: deal.location,
        message: deal.message,
        scope: deal.scope,
        priceMinor: deal.priceMinor,
        depositPercent: deal.depositPercent,
        installmentsCount: deal.installmentsCount,
        revisions: deal.revisions,
        startDate: new Date(deal.startDate),
        dueDate: new Date(deal.dueDate),
        status: deal.status as Prisma.DealStatus,
        createdAt: new Date(deal.createdAt),
        sentAt: deal.sentAt ? new Date(deal.sentAt) : null,
        acceptedAt: deal.acceptedAt ? new Date(deal.acceptedAt) : null,
        depositPaidAt: deal.depositPaidAt ? new Date(deal.depositPaidAt) : null,
        deliveredAt: deal.deliveredAt ? new Date(deal.deliveredAt) : null,
        approvedAt: deal.approvedAt ? new Date(deal.approvedAt) : null,
        balancePaidAt: deal.balancePaidAt ? new Date(deal.balancePaidAt) : null,
        filesReleasedAt: deal.filesReleasedAt ? new Date(deal.filesReleasedAt) : null,
        paymentReleasedAt: deal.paymentReleasedAt ? new Date(deal.paymentReleasedAt) : null,
        completedAt: deal.completedAt ? new Date(deal.completedAt) : null,
      },
    });

    await db.dealDeliverable.createMany({
      data: deal.deliverables.map((name, position) => ({ dealId: deal.id, name, position })),
    });

    await db.dealEvent.createMany({
      data: deal.events.map((event) => ({
        dealId: deal.id,
        type: event.type as Prisma.DealEventType,
        actor: event.actor as Prisma.ActorType,
        label: event.label,
        createdAt: new Date(event.at),
      })),
    });

    for (const payment of deal.payments) {
      // Demo recency shift (see recentReleasedAt): released money always
      // lands in the current month no matter when the seed runs.
      const isReleased = payment.escrowStatus === 'RELEASED' && Boolean(payment.releasedAt);
      const releasedAt = isReleased
        ? recentReleasedAt(RELEASED_AT_DAYS_AGO[Math.min(releasedSeen, RELEASED_AT_DAYS_AGO.length - 1)], releasedSeen++)
        : payment.releasedAt
          ? new Date(payment.releasedAt)
          : null;
      await db.dealPayment.create({
        data: {
          id: payment.id,
          dealId: deal.id,
          type: payment.type as Prisma.PaymentType,
          label: payment.label,
          amountMinor: payment.amountMinor,
          method: payment.method as Prisma.PaymentMethod,
          provider: payment.provider as Prisma.PaymentProvider,
          reference: payment.reference,
          escrowStatus: payment.escrowStatus as Prisma.EscrowStatus,
          paidAt: new Date(payment.paidAt),
          releasedAt,
        },
      });
      // Every seeded payment is backed by a verified gateway transaction so the
      // invariant "escrow movement ⇄ verified transaction" holds from day one.
      await db.paymentTransaction.create({
        data: {
          dealId: deal.id,
          paymentId: payment.id,
          provider: payment.provider as Prisma.PaymentProvider,
          providerRef: payment.reference,
          amountMinor: payment.amountMinor,
          gatewayStatus: 'success',
          verifiedAt: new Date(payment.paidAt),
        },
      });
    }

    for (const delivery of deal.deliveries) {
      await db.dealDelivery.create({
        data: {
          id: delivery.id,
          dealId: deal.id,
          note: delivery.note,
          submittedAt: new Date(delivery.submittedAt),
        },
      });
      await db.fileAsset.createMany({
        data: fileAssetRows(delivery.files, deal.id, deal.ref, 'PREVIEW', 'u_tobi', null, delivery.id),
      });
    }

    if (deal.finalFiles.length > 0) {
      await db.fileAsset.createMany({
        data: fileAssetRows(
          deal.finalFiles,
          deal.id,
          deal.ref,
          'FINAL',
          'u_tobi',
          deal.filesReleasedAt ? new Date(deal.filesReleasedAt) : null,
          null,
        ),
      });
    }
  }

  // Reviews reference deals — seeded after the deal loop (FK order).
  await db.review.createMany({ data: DEMO_REVIEWS });

  const counts = {
    users: await db.user.count(),
    profiles: await db.creatorProfile.count(),
    channels: await db.creatorChannel.count(),
    services: await db.service.count(),
    requests: await db.clientRequest.count(),
    bookings: await db.booking.count(),
    deals: await db.deal.count(),
    deliverables: await db.dealDeliverable.count(),
    payments: await db.dealPayment.count(),
    transactions: await db.paymentTransaction.count(),
    deliveries: await db.dealDelivery.count(),
    files: await db.fileAsset.count(),
    events: await db.dealEvent.count(),
    reviews: await db.review.count(),
  };
  console.log('Seed complete:', JSON.stringify(counts));
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    throw new Error('Refusing to seed a production database without SEED_ALLOW_PRODUCTION=1.');
  }
  await wipe();
  await seed();
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
