import { DealStatus } from '@prisma/client';

/**
 * Deal domain rules — named constants instead of magic values (todo.md C2).
 * Values that mirror the prototype's defaults keep demo data and Phase 10
 * client behaviour consistent after the cutover.
 */

/** Deal ref prefix — nextSequentialRef continues the seeded DEAL-001..005 series. */
export const DEAL_REF_PREFIX = 'DEAL';

/**
 * Capability share tokens: 256 bits of CSPRNG entropy (base64url, 43 chars).
 * The token IS the client's only credential for the shared surface, so it
 * needs the same strength as refresh tokens (plan §7 requires >=128 bits).
 */
export const SHARE_TOKEN_BYTES = 32;

/** A deal without a title is still a valid draft (prototype parity: "Untitled deal"). */
export const DEFAULT_DEAL_TITLE = 'Untitled deal';

/** Prototype wizard defaults applied at draft creation. */
export const DEFAULT_DEPOSIT_PERCENT = 50;
export const DEFAULT_INSTALLMENTS_COUNT = 2;
export const DEFAULT_REVISIONS = 2;

/**
 * Bounded int inputs keep schedule math and storage sane (the prototype had no
 * caps; the escrow platform does). 24 installments / 20 revisions are far past
 * any real project while making garbage inputs fail fast at validation.
 */
export const MAX_INSTALLMENTS = 24;
export const MAX_REVISIONS = 20;
export const MAX_DELIVERABLES = 50;
export const DELIVERABLE_NAME_MAX = 120;

/** Text field bounds (display-friendly, storage-bounded). */
export const DEAL_TITLE_MAX = 200;
export const DEAL_TEXT_MAX = 2_000;

/**
 * Editing window — the escrow boundary. A deal's commercial terms (price,
 * deposit, deliverables) are locked the moment the offer leaves the creator's
 * hands: once SENT, the client decides on a fixed offer, and once ACTIVE real
 * money is held against those terms. Corrections after sending go through the
 * client-driven CHANGES_REQUESTED loop (re-opened by request-changes), never
 * through silent edits. DELIVERED+ states are protected for the same reason.
 */
export const EDITABLE_DEAL_STATUSES: readonly DealStatus[] = [DealStatus.DRAFT, DealStatus.CHANGES_REQUESTED];

/** Default delivery note when the creator submits work without one (prototype parity). */
export const DEFAULT_DELIVERY_NOTE = 'Preview files for your review — final high-resolution set follows after approval.';
