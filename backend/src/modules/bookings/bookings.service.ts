import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, type Booking, type Service } from '@prisma/client';
import { formatRef, retryOnUniqueViolation } from '../../common/ids/ref.util';
import { PrismaService } from '../../database/prisma.service';
import { calendarDateToUtc } from '../../common/validation/calendar-date.validator';
import { NOTIFICATION_TYPES } from '../notifications/notifications.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { ServicesService } from '../services/services.service';
import type { BookingActionDto, PublicBookingDto } from './dto/booking.dto';

/** Bookings echo their optional service reference in owner-facing responses. */
export type BookingWithService = Booking & { service: Service | null };

/** Action -> resulting status; the service validates reachability per row. */
const ACTION_TO_STATUS: Record<BookingActionDto['action'], BookingStatus> = {
  confirm: BookingStatus.CONFIRMED,
  decline: BookingStatus.DECLINED,
  complete: BookingStatus.COMPLETED,
  cancel: BookingStatus.CANCELLED,
};

/**
 * Server-side transition table — mirrors the prototype's rules exactly, now
 * enforced in one place instead of scattered `if`s:
 *   REQUESTED -> CONFIRMED | DECLINED | CANCELLED
 *   CONFIRMED -> COMPLETED | CANCELLED
 *   COMPLETED / DECLINED / CANCELLED are terminal.
 */
const BOOKING_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  [BookingStatus.REQUESTED]: [BookingStatus.CONFIRMED, BookingStatus.DECLINED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
};

/**
 * Bookings domain boundary — owning phase: 5.
 *
 * Owns the Booking table. Owner calls are scoped by the acting creator's
 * profile id (missing === foreign === 404); public submissions arrive with the
 * handle already resolved to a creator id by PublicController.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly services: ServicesService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Owner (authenticated creator) use cases ─────────────────────────────────

  /** Schedule listing — chronological like the prototype (date, then time). */
  async listByCreator(creatorId: string): Promise<BookingWithService[]> {
    return this.prisma.booking.findMany({
      where: { creatorId },
      include: { service: true },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });
  }

  async act(creatorId: string, bookingId: string, dto: BookingActionDto): Promise<BookingWithService> {
    const target = ACTION_TO_STATUS[dto.action];
    const allowedSources = Object.entries(BOOKING_TRANSITIONS)
      .filter(([, targets]) => targets?.includes(target))
      .map(([status]) => status as BookingStatus);

    // Conditional write closes the read/validate/write race without adding a
    // transaction or another happy-path query.
    const updated = await this.prisma.booking.updateMany({
      where: { id: bookingId, creatorId, status: { in: allowedSources } },
      data: { status: target },
    });
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, creatorId },
      include: { service: true },
    });
    if (!booking) {
      throw new HttpException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' }, HttpStatus.NOT_FOUND);
    }

    if (updated.count === 0) {
      throw new HttpException(
        {
          code: 'INVALID_BOOKING_TRANSITION',
          message: `A ${booking.status.toLowerCase()} booking cannot be ${dto.action}ed`,
        },
        HttpStatus.CONFLICT,
      );
    }
    return booking;
  }

  // ── Public submission (rate-limited, anonymous) ─────────────────────────────

  async createPublicSubmission(creatorId: string, dto: PublicBookingDto): Promise<BookingWithService> {
    let service: Service | null = null;
    if (dto.serviceId) {
      service = await this.services.findActiveOwned(dto.serviceId, creatorId);
      if (!service) {
        throw new HttpException({ code: 'SERVICE_NOT_FOUND', message: 'Service not found' }, HttpStatus.NOT_FOUND);
      }
    }

    const created = await this.createWithRef(creatorId, dto);
    // Nudge the creator AFTER the row exists (advisory, best-effort).
    await this.notifyNewBooking(created, service?.title ?? null);
    return { ...created, service };
  }

  /** Best-effort creator nudge for a public booking — never fails the intake. */
  private async notifyNewBooking(booking: Booking, serviceTitle: string | null): Promise<void> {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { id: booking.creatorId },
      select: { userId: true },
    });
    if (!profile) return; // structurally impossible (bookings RESTRICT profile deletion)
    await this.notifications.notify({
      userId: profile.userId,
      type: NOTIFICATION_TYPES.BOOKING_NEW,
      payload: {
        bookingId: booking.id,
        bookingRef: booking.ref,
        label: `New booking request from ${booking.clientName}${serviceTitle ? ` — ${serviceTitle}` : ''}`,
        clientName: booking.clientName,
        date: booking.date.toISOString().slice(0, 10),
        time: booking.time,
      },
    });
  }

  /** Ref generated inside the closure so a P2002 retry re-allocates. */
  private createWithRef(creatorId: string, dto: PublicBookingDto): Promise<Booking> {
    return retryOnUniqueViolation(async () => {
      const ref = await this.nextRef('BKG');
      return this.prisma.booking.create({
        data: {
          ref,
          creatorId,
          serviceId: dto.serviceId ?? null,
          sessionType: dto.sessionType,
          clientName: dto.clientName,
          clientContact: dto.clientContact,
          date: calendarDateToUtc(dto.date),
          time: dto.time,
          note: dto.note ?? null,
          status: BookingStatus.REQUESTED,
        },
      });
    });
  }

  private async nextRef(prefix: string): Promise<string> {
    const [row] = await this.prisma.$queryRaw<{ value: bigint }[]>`
      SELECT nextval('booking_ref_seq') AS value
    `;
    return formatRef(prefix, row!.value);
  }
}
