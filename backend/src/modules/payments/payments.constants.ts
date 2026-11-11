import type { PaymentProvider } from '@prisma/client';

/**
 * Payment policy — named constants instead of magic values (todo.md C2).
 * Money maths themselves live in deal-money.ts (pure helpers); this file holds
 * the rail/surface rules.
 */

/** Reference prefixes per rail — prototype parity (the client UI badges FLW-/PSK-). */
export const PAYMENT_REF_PREFIX: Record<PaymentProvider, string> = {
  FLUTTERWAVE: 'FLW',
  PAYSTACK: 'PSK',
};

/**
 * Transaction reference shape: {PREFIX}-{deal ref}-{slot type}-{hex8}.
 * Carries enough context to debug from the provider dashboard alone; the
 * random suffix (8 bytes = 64 bits of randomness on top of the per-deal,
 * per-slot prefix) plus the DB unique index on PaymentTransaction.providerRef
 * are the actual uniqueness authorities.
 */
export const PAYMENT_REF_RANDOM_BYTES = 8;

/** The only currency the rails are wired for (prototype scope: Nigeria). */
export const PAYMENT_CURRENCY = 'NGN';

/** Bound provider lookups when recovering payments before webhooks are enabled. */
export const PAYMENT_RECONCILIATION_LIMIT = 3;
/** Provider-hosted attempts older than this are not polled automatically. */
export const PAYMENT_RECONCILIATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Deal statuses where money may still move. Terminal states (DECLINED,
 * DISPUTED, BALANCE_PAID) and DRAFT (terms not yet agreed — the client should
 * never be able to pay an un-sent offer) are excluded. The schedule check
 * (a due slot must exist) handles the rest: fully-paid deals have none.
 */
export const PAYABLE_DEAL_STATUSES = ['SENT', 'ACTIVE', 'DELIVERED', 'REVISION', 'APPROVED'] as const;
