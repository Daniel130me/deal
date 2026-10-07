/**
 * Human-readable reference numbers (REQ-022, BKG-004, DEAL-006).
 *
 * Format deliberately matches the prototype's `nextRef()` so refs already
 * visible in demo data stay consistent after the Phase 10 cutover. Seeded
 * year-prefixed refs (REQ-2025-00021) and new short refs coexist, so the next
 * number is the max NUMERIC suffix across rows sharing the prefix — a plain
 * lexicographic max would prefer "REQ-2025-…" forever and collide.
 *
 * Uniqueness under concurrency is NOT guaranteed here — max-scan + increment
 * can race. Callers must generate the ref INSIDE the create closure and retry
 * on the DB's unique-constraint violation (P2002) via retryOnUniqueViolation;
 * the unique index on `ref` remains the real authority.
 */

/** Numeric suffix of a ref like "REQ-2025-00021" -> 21 (0 when unparseable). */
export function numericSuffix(ref: string): number {
  const n = Number(ref.split('-').pop() ?? NaN);
  return Number.isFinite(n) ? n : 0;
}

/** "REQ", 22 -> "REQ-022" */
export function formatRef(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

/** Next ref value given every ref already stored for this prefix. */
export function nextSequentialRef(prefix: string, existingRefs: string[]): string {
  const max = existingRefs.reduce((acc, ref) => Math.max(acc, numericSuffix(ref)), 0);
  return formatRef(prefix, max + 1);
}

/**
 * Retries a create on Prisma unique-violation (P2002) — used for ref
 * allocation races. Other errors propagate untouched; after `attempts` failed
 * tries the last P2002 is rethrown (something is genuinely wrong).
 */
export async function retryOnUniqueViolation<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      lastError = error;
    }
  }
  throw lastError;
}
