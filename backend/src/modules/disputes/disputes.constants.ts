/**
 * Dispute domain rules — named constants instead of magic values (todo.md C2).
 */

/** Bounded admin resolution note (mirrors the deal text bound in spirit). */
export const DISPUTE_NOTE_MAX = 2_000;

/** Admin listing page size — disputes are rare by nature; a bounded read is enough. */
export const DISPUTES_LIST_LIMIT = 100;
