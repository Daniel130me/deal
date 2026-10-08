import { Injectable } from '@nestjs/common';
import { BookingStatus, EscrowStatus, RequestStatus, type CreatorProfile } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  EXPECTED_BALANCE_DEAL_STATUSES,
  ONGOING_DEAL_STATUSES,
  PENDING_DEAL_STATUSES,
} from '../deals/deals.constants';
import { remainingBalance } from '../deals/deal-money';
import type { RatingSummary } from '../reviews/reviews.service';

/** "New this week" window — prototype parity (7 days, rolling). */
const NEW_REQUEST_WINDOW_DAYS = 7;

/**
 * Chart window: the last N calendar months, zero-filled, ending with the
 * current one — a stable x-axis the client can render without guessing.
 * Prototype parity is 6 points.
 */
const EARNINGS_SERIES_MONTHS = 6;

/** Recent-list sizes — prototype dashboard parity (4 requests / 5 deals / 3 bookings). */
const RECENT_REQUESTS = 4;
const RECENT_DEALS = 5;
const RECENT_BOOKINGS = 3;

/** `yyyy-MM` in UTC — month buckets are calendar concepts, not locale strings. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function firstDayOfMonthUTC(reference: Date, monthsBack = 0): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - monthsBack, 1));
}

/**
 * The creator's dashboard payload — the read-only projection Phase 10's
 * dashboard/money screens consume. Prototype overview shape (stats / money /
 * earningsSeries / recent lists) preserved so the cutover maps 1:1, with
 * every number now DERIVED from the database:
 *
 * - Counts come from groupBy, sums from aggregate — never "load all rows and
 *   reduce in JS" (the plan's explicit "via DB aggregation" requirement).
 * - The earnings series is ONE parameterised date_trunc query (the second raw
   query in the codebase, after Phase 8's row lock — both tagged templates,
   no string SQL) zero-filled over a fixed 6-month window in-process.
 * - Money is integer kobo everywhere; the client converts for display.
 */
@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getForCreator(creatorId: string): Promise<CreatorOverview> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - NEW_REQUEST_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const monthStart = firstDayOfMonthUTC(now);
    const seriesStart = firstDayOfMonthUTC(now, EARNINGS_SERIES_MONTHS - 1);

    // One parallel batch — every query below is an independent indexed read
    // over the creator's own rows (todo.md A9: no N+1, no serial round-trips).
    const [
      profile,
      dealStatusCounts,
      escrowSums,
      earnedThisMonth,
      expectedBalanceDeals,
      seriesRows,
      requestStatusCounts,
      newThisWeek,
      upcomingBookings,
      recentRequests,
      recentDeals,
      recentBookings,
      ratingAgg,
    ] = await Promise.all([
      this.prisma.creatorProfile.findUnique({ where: { id: creatorId } }),
      this.prisma.deal.groupBy({ by: ['status'], where: { creatorId }, _count: { _all: true } }),
      this.prisma.dealPayment.groupBy({
        by: ['escrowStatus'],
        where: { deal: { creatorId } },
        _sum: { amountMinor: true },
      }),
      this.prisma.dealPayment.aggregate({
        where: { deal: { creatorId }, escrowStatus: EscrowStatus.RELEASED, releasedAt: { gte: monthStart } },
        _sum: { amountMinor: true },
      }),
      // Remaining balance per ongoing deal: prices + per-deal paid sums (two
      // SQL statements in one Prisma call; the per-deal remainder cannot be
      // expressed as a single flat SUM).
      this.prisma.deal.findMany({
        where: { creatorId, status: { in: [...EXPECTED_BALANCE_DEAL_STATUSES] } },
        select: {
          priceMinor: true,
          depositPercent: true,
          installmentsCount: true,
          payments: { select: { amountMinor: true } },
        },
      }),
      this.prisma.$queryRaw<{ month: Date; total: bigint | null }[]>`
        SELECT date_trunc('month', dp."releasedAt") AS month, SUM(dp."amountMinor") AS total
        FROM "DealPayment" dp
        JOIN "Deal" d ON d."id" = dp."dealId"
        WHERE d."creatorId" = ${creatorId}
          AND dp."escrowStatus" = 'RELEASED'
          AND dp."releasedAt" >= ${seriesStart}
        GROUP BY 1`,
      this.prisma.clientRequest.groupBy({ by: ['status'], where: { creatorId }, _count: { _all: true } }),
      this.prisma.clientRequest.count({ where: { creatorId, createdAt: { gte: weekAgo } } }),
      this.prisma.booking.count({
        where: { creatorId, status: { in: [BookingStatus.REQUESTED, BookingStatus.CONFIRMED] } },
      }),
      this.prisma.clientRequest.findMany({
        where: { creatorId, status: { notIn: [RequestStatus.ARCHIVED, RequestStatus.DECLINED] } },
        select: {
          id: true,
          ref: true,
          clientName: true,
          clientContact: true,
          status: true,
          eventDate: true,
          budgetMinMinor: true,
          budgetMaxMinor: true,
          description: true,
          createdAt: true,
          service: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_REQUESTS,
      }),
      this.prisma.deal.findMany({
        where: { creatorId },
        select: {
          id: true,
          ref: true,
          title: true,
          clientName: true,
          status: true,
          priceMinor: true,
          depositPercent: true,
          installmentsCount: true,
          dueDate: true,
          updatedAt: true,
          payments: { select: { amountMinor: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_DEALS,
      }),
      this.prisma.booking.findMany({
        where: { creatorId },
        select: {
          id: true,
          ref: true,
          sessionType: true,
          clientName: true,
          clientContact: true,
          date: true,
          time: true,
          status: true,
          createdAt: true,
          service: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_BOOKINGS,
      }),
      // Read-only aggregate over the reviews domain's table — same projection
      // posture as every other query in this service (writes of Review rows
      // belong to ReviewsService; this is a count, not a mutation).
      this.prisma.review.aggregate({
        where: { creatorId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    if (!profile) {
      // The guard resolved this profile moments ago — unreachable unless the
      // row vanished in between; a 404-shaped guard would be misleading here.
      throw new Error(`CreatorProfile ${creatorId} vanished between guard and overview read`);
    }

    const statusCount = (
      statuses: readonly { status: string; count: number }[],
      wanted: readonly string[],
    ): number =>
      statuses.filter((row) => wanted.includes(row.status)).reduce((sum, row) => sum + row.count, 0);

    const dealStatus = dealStatusCounts.map((row) => ({ status: row.status as string, count: row._count._all }));
    const requestStatus = requestStatusCounts.map((row) => ({ status: row.status as string, count: row._count._all }));

    const escrowTotal = (status: EscrowStatus): number =>
      escrowSums.find((row) => row.escrowStatus === status)?._sum.amountMinor ?? 0;

    return {
      creator: this.creatorProjection(profile),
      stats: {
        // Prototype parity: the request counters ignore declined/archived rows.
        totalRequests: requestStatus
          .filter((r) => r.status !== RequestStatus.ARCHIVED && r.status !== RequestStatus.DECLINED)
          .reduce((sum, r) => sum + r.count, 0),
        newRequests: statusCount(requestStatus, [RequestStatus.NEW]),
        pendingDeals: statusCount(dealStatus, PENDING_DEAL_STATUSES),
        ongoingDeals: statusCount(dealStatus, ONGOING_DEAL_STATUSES),
        completedDeals: statusCount(dealStatus, ['COMPLETED']),
        newThisWeek,
        upcomingBookings,
      },
      money: {
        releasedAllTime: escrowTotal(EscrowStatus.RELEASED),
        earnedThisMonth: earnedThisMonth._sum.amountMinor ?? 0,
        inEscrow: escrowTotal(EscrowStatus.HELD),
        expectedBalance: expectedBalanceDeals.reduce(
          (sum, deal) => sum + remainingBalance(deal, deal.payments),
          0,
        ),
      },
      earningsSeries: this.fillSeries(seriesRows, now),
      rating: { average: ratingAgg._avg.rating, count: ratingAgg._count._all },
      requests: recentRequests,
      deals: recentDeals.map((deal) => ({
        id: deal.id,
        ref: deal.ref,
        title: deal.title,
        clientName: deal.clientName,
        status: deal.status,
        priceMinor: deal.priceMinor,
        balanceMinor: remainingBalance(deal, deal.payments),
        dueDate: deal.dueDate,
        updatedAt: deal.updatedAt,
      })),
      bookings: recentBookings,
    };
  }

  /** Zero-filled 6-month series — buckets without released money report 0. */
  private fillSeries(rows: { month: Date; total: bigint | null }[], now: Date): { month: string; amountMinor: number }[] {
    const byMonth = new Map(rows.map((row) => [monthKey(row.month), Number(row.total ?? 0)]));
    const series: { month: string; amountMinor: number }[] = [];
    for (let back = EARNINGS_SERIES_MONTHS - 1; back >= 0; back--) {
      const key = monthKey(firstDayOfMonthUTC(now, back));
      series.push({ month: key, amountMinor: byMonth.get(key) ?? 0 });
    }
    return series;
  }

  /** The owner's own profile block — every scalar, no joins. */
  private creatorProjection(profile: CreatorProfile) {
    return {
      id: profile.id,
      name: profile.name,
      handle: profile.handle,
      craft: profile.craft,
      location: profile.location,
      bio: profile.bio,
      verified: profile.verified,
      onboarded: profile.onboarded,
      createdAt: profile.createdAt,
    };
  }
}

/** The dashboard payload contract (Phase 10 client maps this 1:1). */
export interface CreatorOverview {
  creator: {
    id: string;
    name: string;
    handle: string;
    craft: string | null;
    location: string | null;
    bio: string | null;
    verified: boolean;
    onboarded: boolean;
    createdAt: Date;
  };
  stats: {
    totalRequests: number;
    newRequests: number;
    pendingDeals: number;
    ongoingDeals: number;
    completedDeals: number;
    newThisWeek: number;
    upcomingBookings: number;
  };
  money: {
    releasedAllTime: number;
    earnedThisMonth: number;
    inEscrow: number;
    expectedBalance: number;
  };
  earningsSeries: { month: string; amountMinor: number }[];
  rating: RatingSummary;
  requests: {
    id: string;
    ref: string;
    clientName: string;
    clientContact: string;
    status: RequestStatus;
    eventDate: Date | null;
    budgetMinMinor: number | null;
    budgetMaxMinor: number | null;
    description: string | null;
    createdAt: Date;
    service: { id: string; title: string } | null;
  }[];
  deals: {
    id: string;
    ref: string;
    title: string;
    clientName: string;
    status: string;
    priceMinor: number;
    balanceMinor: number;
    dueDate: Date | null;
    updatedAt: Date;
  }[];
  bookings: {
    id: string;
    ref: string;
    sessionType: string;
    clientName: string;
    clientContact: string;
    date: Date;
    time: string;
    status: BookingStatus;
    createdAt: Date;
    service: { id: string; title: string } | null;
  }[];
}
