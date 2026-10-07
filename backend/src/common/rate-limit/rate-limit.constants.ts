/**
 * Rate-limit policy — named constants instead of magic values (todo.md C2).
 *
 * Shaped for @nestjs/throttler v6 ({ name: { limit, ttl } }); ttl is
 * milliseconds. Counters are in-memory per instance and keyed per client IP
 * (Express `trust proxy` is set to one hop, so behind the sandbox gateway /
 * any single reverse proxy the real client IP is used, not the proxy's).
 *
 * Deliberately controller-scoped, not global: only the brute-forceable
 * session endpoints and the anonymous submission surface are limited today
 * (implementation-plan Phase 5). A future global policy belongs to the
 * hardening phase (12), so live endpoints never inherit surprises.
 */
export const RATE_LIMITS = {
  auth: {
    /** signup / login: credential-guessing surface. */
    sessionCreation: { default: { limit: 10, ttl: 60_000 } },
    /** refresh / logout: legitimate clients rotate quietly; headroom for multi-tab. */
    tokenRotation: { default: { limit: 30, ttl: 60_000 } },
  },
  public: {
    /** Public creator page reads: generous, it is a normal browsing surface. */
    pageRead: { default: { limit: 30, ttl: 60_000 } },
    /** Anonymous form submissions into the DB: the abuse surface. */
    submission: { default: { limit: 5, ttl: 60_000 } },
  },
  shared: {
    /** Capability-link deal reads: client + any listener they forward the page to. */
    dealRead: { default: { limit: 30, ttl: 60_000 } },
    /**
     * Capability-link actions (decline/approve/...): one-click human decisions,
     * but also Phase 8's payment attempts from the share page — card retries
     * legitimately repeat, so the budget keeps headroom while still bounding
     * the only writable anonymous surface on a deal.
     */
    action: { default: { limit: 20, ttl: 60_000 } },
  },
} as const;
