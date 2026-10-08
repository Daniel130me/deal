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
 * Transaction reference shape: {PREFIX}-{deal ref}-{slot type}-{hex4}.
 * Carries enough context to debug from the provider dashboard alone; the
 * random suffix (256 bits of space) plus the DB unique index on
 * PaymentTransaction.providerRef are the actual uniqueness authorities.
 */
export const PAYMENT_REF_RANDOM_BYTES = 4;

/** The only currency the rails are wired for (prototype scope: Nigeria). */
export const PAYMENT_CURRENCY = 'NGN';

/**
 * Flutterwave's hosted checkout requires a customer email, but the capability
 * surface does not collect the payer's email yet (Phase 10 can pass the real
 * client contact through). Until then every charge carries a stable,
 * platform-scoped address on a RESERVED TLD (.test is never routable), so the
 * rail's contract is met without inventing a deliverable identity for anyone.
 */
export const PAYMENT_FALLBACK_EMAIL_DOMAIN = 'deal.test';

/**
 * Deal statuses where money may still move. Terminal states (DECLINED,
 * DISPUTED, BALANCE_PAID) and DRAFT (terms not yet agreed — the client should
 * never be able to pay an un-sent offer) are excluded. The schedule check
 * (a due slot must exist) handles the rest: fully-paid deals have none.
 */
export const PAYABLE_DEAL_STATUSES = ['SENT', 'ACTIVE', 'DELIVERED', 'REVISION', 'APPROVED'] as const;
