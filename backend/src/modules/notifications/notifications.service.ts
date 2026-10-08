import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { NotificationAudience, type Prisma, type Notification } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NOTIFICATIONS_LIST_LIMIT, type NotificationType } from './notifications.constants';

/** What callers attach to a notification — small, JSON-safe, display-shaped. */
export type NotificationPayload = Prisma.InputJsonValue;

/** Creation input — `userId` is the RECIPIENT (today always the creator's user id). */
export interface NotifyInput {
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
}

/** One inbox row as the client receives it. */
export type NotificationItem = Pick<Notification, 'id' | 'type' | 'payload' | 'readAt' | 'createdAt'>;

export interface NotificationInbox {
  items: NotificationItem[];
  unreadCount: number;
}

/**
 * Notifications domain boundary — owning phase: 9.
 *
 * Deliberately small and boring: an append-only inbox per user plus read
 * bookkeeping. The interesting decisions:
 *
 * - Best-effort delivery: `notify` NEVER throws. Domain actions call it AFTER
 *   their transaction has committed; if the insert fails, the domain state is
 *   already true and only the nudge is lost (logged, not swallowed silently).
 *   A best-effort write must not be able to roll back money or deal moves.
 * - Cross-module callers inject THIS service (the module boundary rule) —
 *   nothing outside this module touches the Notification table.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget creation — failures are logged, never propagated. */
  async notify(input: NotifyInput, audience: NotificationAudience = NotificationAudience.CREATOR): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: { userId: input.userId, audience, type: input.type, payload: input.payload },
      });
    } catch (error) {
      // Advisory data: losing one row must never break a payment or a deal
      // action that has already committed. Log for observability, move on.
      this.logger.error(
        `notification create failed (type=${input.type} userId=${input.userId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** The recipient's inbox — newest first, bounded, with the unread badge count. */
  async listForUser(userId: string): Promise<NotificationInbox> {
    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: NOTIFICATIONS_LIST_LIMIT,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unreadCount };
  }

  /** Marks one of MY notifications read — foreign and missing ids are the same 404. */
  async markRead(userId: string, id: string): Promise<{ id: string; readAt: Date | null }> {
    // updateMany with the owner in the WHERE: the read and the write are one
    // round-trip, and a foreign id simply matches nothing (no existence leak).
    const updated = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) {
      throw new HttpException(
        { code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' },
        HttpStatus.NOT_FOUND,
      );
    }
    const row = await this.prisma.notification.findUnique({ where: { id }, select: { id: true, readAt: true } });
    return row ?? { id, readAt: null };
  }

  /** Marks every unread notification of mine read. Idempotent by nature. */
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
