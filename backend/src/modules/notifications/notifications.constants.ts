import type { NotificationAudience } from '@prisma/client';

/**
 * Notification domain rules — named constants instead of magic values (todo.md C2).
 *
 * Notifications are ADVISORY projections of domain state: the dashboard and
 * deal endpoints always derive truth from Deal/Dispute/Review/Payment rows, a
 * notification is the "come look at this" nudge. That is why delivery is
 * best-effort (see NotificationsService) and why a lost row is never a
 * correctness problem.
 */

/**
 * Machine-readable notification types (dot-namespaced, stable contract for
 * the Phase 10 client). The human text lives in the payload's `label`.
 */
export const NOTIFICATION_TYPES = {
  REQUEST_NEW: 'request.new',
  BOOKING_NEW: 'booking.new',
  DEAL_CHANGES_REQUESTED: 'deal.changes_requested',
  DEAL_DECLINED: 'deal.declined',
  DEAL_APPROVED: 'deal.approved',
  DEAL_COMPLETED: 'deal.completed',
  DEAL_DISPUTED: 'deal.disputed',
  DISPUTE_RESOLVED: 'deal.dispute_resolved',
  PAYMENT_RECEIVED: 'payment.received',
  REVIEW_NEW: 'review.new',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/**
 * Only CREATOR-audience notifications are written today: the client side of a
 * deal is an anonymous capability-link holder with no user account to address
 * (Notification.userId is nullable for schema flexibility, but inventing
 * unaddressable CLIENT rows would be dead data). This is a deliberate Phase 9
 * scope decision, not an omission.
 */
export const NOTIFICATION_AUDIENCES: readonly NotificationAudience[] = ['CREATOR'];

/** Inbox page size — bounded read; the UI paginates later if it ever needs to. */
export const NOTIFICATIONS_LIST_LIMIT = 50;
