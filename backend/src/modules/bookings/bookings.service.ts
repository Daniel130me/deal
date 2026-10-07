import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, type Booking, type Service } from '@prisma/client';
import { nextSequentialRef, retryOnUniqueViolation } from '../../common/ids/ref.util';
import { PrismaService } from '../../database/prisma.service';
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
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, creatorId },
      include: { service: true },
    });
    if (!booking) {
      throw new HttpException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' }, HttpStatus.NOT_FOUND);
    }

    const allowed = BOOKING_TRANSITIONS[booking.status] ?? [];
    if (!allowed.includes(ACTION_TO_STATUS[dto.action])) {
      throw new HttpException(
        {
          code: 'INVALID_BOOKING_TRANSITION',
          message: `A ${booking.status.toLowerCase()} booking cannot be ${dto.action}ed`,
        },
        HttpStatus.CONFLICT,
      );
    }
    return this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: ACTION_TO_STATUS[dto.action] },
      include: { service: true },
    });
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
    return { ...created, service };
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
          date: new Date(`${dto.date}T00:00:00Z`),
          time: dto.time,
          note: dto.note ?? null,
          status: BookingStatus.REQUESTED,
        },
      });
    });
  }

  private async nextRef(prefix: string): Promise<string> {
    const rows = await this.prisma.booking.findMany({
      where: { ref: { startsWith: `${prefix}-` } },
      select: { ref: true },
    });
    return nextSequentialRef(prefix, rows.map((row) => row.ref));
  }
}
