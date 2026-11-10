# Implementation Gap Audit — 2026-10-29

Scope: backend, frontend, database schema/migrations, security boundaries,
production build, tests, CI, operational docs, and high-risk edge cases.

## Follow-up audit — 2026-10-31

### Fixed in this pass

17. **A stale gateway poll could downgrade a successful transaction.** Pending,
    failed, currency-mismatch, and amount-mismatch writes now require
    `verifiedAt IS NULL`. If a concurrent verifier won, the endpoint re-reads
    and returns the successful database truth instead of overwriting it.
18. **Concurrent payment verifiers could emit duplicate notifications.** The
    landing transaction now records whether it created or reused the unique
    `DealPayment`; only the creator of the row sends the post-commit nudge.
19. **Every shared preview/file request loaded the full deal record.** File
    gates now use a narrow indexed `shareToken -> {id,status}` query instead of
    loading payments, events, deliveries, and deliverables that are never read.
20. **Hard-coded proxy trust allowed forged rate-limit identities when the API
    was directly exposed.** `TRUST_PROXY_HOPS` now defaults to zero and must be
    configured to the exact controlled gateway count. Tests opt into one hop.
21. **The UI represented an invented payout account and claimed provider
    transfers had completed.** The hard-coded masked account and automatic-
    payout claims were removed. Surfaces now distinguish DEAL's internal ledger
    release from provider payout execution.
22. **Creator onboarding trusted a stale access-token role.** The route now
    admits only CLIENT tokens as an early guard, then atomically re-checks that
    the database user is still ACTIVE and CLIENT before promotion. Suspended,
    deleted, creator, and admin accounts cannot be converted through onboarding.
23. **Suspended or demoted admins retained dispute authority until JWT expiry.**
    ADMIN routes now re-read current role and status before acting. Ordinary
    authenticated requests remain stateless; the extra indexed query is paid
    only on the high-impact administrative boundary.
24. **Page and API security headers were implicit.** Next now emits a baseline
    CSP, frame denial, MIME-sniff protection, referrer/permissions policy and
    production HSTS. Nest emits no-store plus API-appropriate hardening headers.
    The CSP's inline script/style allowances are a flagged Next compatibility
    compromise, not a nonce-based final policy.
25. **A failed dev service could leave the other Node process tree alive.** The
    root supervisor now awaits Windows tree termination before exiting, so a
    frontend/backend startup failure and Ctrl+C cannot orphan port listeners.
26. **The production frontend start path was wrong for workspace output.** Next
    emits the standalone server under a nested `frontend/` directory in this
    monorepo, while start and asset-copy scripts assumed a flat output. Both now
    discover the emitted server root and place/run assets relative to it.

### P0 — blocks real-money production launch

- **Escrow release is currently ledger-only.** `releaseHeldEscrow` changes
  PostgreSQL rows from `HELD` to `RELEASED`; neither payment gateway adapter has
  a transfer/subaccount/beneficiary operation. No money is sent to a creator.
  `PayoutAccount` exists in the schema but has no onboarding, verification, or
  payout execution route. This needs a provider-specific custody and settlement
  design, verified beneficiary onboarding, idempotent transfer records,
  asynchronous status webhooks, retries, reconciliation, and operator controls.
- **Refunds and chargebacks are not implemented.** The enum contains
  `REFUNDED`/`DISPUTED`, but there is no gateway refund call, refund ledger,
  chargeback intake, or reconciliation job. A dispute therefore cannot yet
  return real funds to a client.
- **Multiple live checkout attempts can over-collect.** Initialization creates
  a fresh provider charge every time. If two links for the same next slot are
  both paid, both verified charges are recorded. Before launch, introduce a
  durable payment-intent/slot identity, idempotency keys, intent expiry, an
  overpayment holding state, and an automatic/manual refund workflow.
- **No disposable PostgreSQL runtime was available during this workstation
  pass.** Database-backed concurrency, migration, R2, and full golden-path
  suites compile but were not executed locally. CI is configured to run them
  against PostgreSQL; a green CI run is required evidence before release.

## Fixed in this audit

1. **Long-lived refresh tokens were readable by browser JavaScript.** Refresh
   credentials now rotate in an `HttpOnly`, `SameSite=Strict`, auth-path-scoped
   cookie. JSON responses contain only the short-lived access token. Existing
   localStorage sessions migrate once and the legacy value is deleted.
2. **Clean installs could not typecheck the backend.** Prisma generation now
   runs during the backend workspace postinstall lifecycle.
3. **Production builds could hide TypeScript failures.** The Next.js
   `ignoreBuildErrors` bypass was removed; the verified deploy build now owns
   the TypeScript gate.
4. **Production frontend builds required Google Fonts network access.** Geist
   is self-hosted, making builds reproducible in restricted/offline CI.
5. **Frontend build/start scripts were POSIX-only.** Standalone asset copying
   now uses a small Node script and production starts with Node on every OS.
6. **Request and booking state writes had read/validate/write races.** Their
   status preconditions now live in conditional `updateMany` predicates.
7. **Reference allocation scanned all historical rows.** Request, booking, and
   deal references now use concurrency-safe PostgreSQL sequences (O(1)).
8. **Shape-valid but impossible dates were normalized silently.** A reusable
   real-calendar validator rejects values such as `2026-02-31`; deal due dates
   also cannot precede start dates.
9. **Core invariants existed only in DTO/service code.** Database CHECKs now
   cover money, ranges, file sizes, ratings, and dates; partial unique indexes
   enforce one primary channel and one default payout account.
10. **React 19 lint failures and stale identity results.** Capability/public
    page results are keyed to their token/handle, mobile detection uses
    `useSyncExternalStore`, and carousel subscriptions clean up fully.
11. **No enforceable CI gate.** CI now provisions PostgreSQL, applies the real
    migrations, and runs typecheck, lint, backend tests, and both builds.
12. **Multiple CORS origins produced an invalid payment return URL.** The first
    configured origin is now explicitly the primary hosted-checkout origin.
13. **Production origin validation checked only the string prefix.** Every
    comma-separated entry is now parsed as an exact, path-free HTTPS origin.
14. **Shutdown and request-size policies were implicit.** Production enables
    Nest shutdown hooks so Prisma disconnects during SIGTERM/SIGINT, and the
    parser enforces a validated, configurable body-size ceiling before webhook
    signature work.
15. **Placeholder CI credentials activated live-provider tests.** Remote R2
    and Flutterwave smoke suites now require explicit opt-in flags; the default
    CI path remains deterministic and cannot mutate a real bucket or rail by
    accidentally populated environment variables.
16. **Local login posted to an unhandled Next route.** Browser API calls now
    stay on same-origin `/api/v1` and Next proxies them to the server-only
    `DEAL_API_ORIGIN` (development default `http://localhost:3001`). This fixes
    local login while preserving the HttpOnly refresh-cookie boundary.

## Remaining gaps (prioritized)

### P1 — address before sustained production traffic

- **Owner list APIs are unpaginated.** Deals, requests, bookings, services, and
  reviews can return an account's complete history. Add cursor pagination with
  stable `(createdAt,id)` ordering and update screens for incremental loading.
- **Rate limiting is process-local.** Multiple API replicas have independent
  counters. Move throttling storage to Redis (or the gateway/WAF) before
  horizontal scaling; keep the current per-route budgets as policy inputs.
- **Notifications are best-effort without an outbox.** A committed money/deal
  transition can lose its notification during a transient DB failure. Add a
  transactional outbox and idempotent worker if notifications become a
  contractual delivery channel.
- **No automated browser journey.** Backend golden-path coverage is strong, but
  the Next.js hash-router, hosted-checkout return, upload UI, and responsive
  navigation are verified manually. Add Playwright against a disposable stack.
- **No payment reconciliation worker.** Provider success that arrives after
  webhook retries stop, abandoned pending attempts, transfer results, and
  gateway/ledger divergence have no scheduled repair path or operator queue.
- **Final files have no malware/content scanning.** Private storage and
  attachment disposition reduce exposure but do not protect a client from a
  malicious archive, PDF, or media payload. Quarantine uploads, scan before
  release, and record the scanner verdict/version.

### P2 — operational maturity

- **No retention jobs.** Expired refresh tokens are pruned only on login, and
  webhook/audit/notification growth has no archival policy. Add scheduled,
  bounded cleanup with retention metrics.
- **No orphan-object cleanup.** Upload URLs can leave unregistered source
  objects, and a cross-system failure can leave generated derivatives without
  database rows. Add bounded storage reconciliation and retention rules.
- **Observability is log-only.** Add request/error/latency metrics, payment and
  webhook counters, queue/outbox health, alert thresholds, and trace context.
- **Capability links cannot be revoked/rotated independently.** A leaked deal
  share token remains valid for the deal lifetime. Add creator-initiated token
  rotation and an audit event without exposing whether an old token existed.
- **Private-bucket posture is operational, not API-verifiable.** The code never
  emits a public R2 URL, but it cannot prove that an administrator did not
  enable bucket-wide public access. Deployment needs an automated bucket-policy
  check and an alert if public access is enabled.
- **Webhook edge throttling remains infrastructure-owned.** The application now
  enforces an explicit bounded body size before signature work. Configure a
  provider-aware edge policy that absorbs abusive repetition without returning
  429 for normal provider retries.

### P3 — product and maintenance edges

- **Phone numbers are not canonicalized.** Equivalent formats can produce
  distinct accounts and login surprises. Normalize to E.164 with a country
  selection/migration plan before phone-first acquisition.
- **Protected review generation supports images only.** PDFs, video, audio, and
  design archives can be final files, but cannot yet receive a server-rendered
  reduced-quality review derivative. Add isolated, resource-bounded workers per
  format; never fall back to sharing the original.
- **Accessibility has no automated gate.** Add axe checks for dialogs, payment
  flows, focus restoration, error announcements, and the mobile navigation.
- **Historical documentation remains intentionally stale.**
  `current-system-audit.md` describes the retired prototype; keep its historical
  banner prominent or move it under an archive directory.

## Non-standard implementation notes

- Prisma cannot represent CHECK constraints, partial unique indexes, or
  sequences in `schema.prisma`; the two SQL migrations are therefore the
  deliberate source of truth for those invariants.
- The backend suite uses Node's built-in test runner through a small local
  compatibility adapter. Test concurrency is deliberately fixed at one because
  several integration specifications exercise ordered state transitions.
- `RELEASED` currently means an internal DEAL ledger state, not a confirmed
  gateway transfer. Treating it as settled money would be non-standard and
  unsafe; the UI now says so, and the P0 settlement work above must replace this
  interim meaning before real-money launch.
- The frontend CSP currently permits inline scripts and styles because Next's
  generated application shell uses them. This is weaker than a per-request
  nonce policy and should be tightened when the hosting/runtime approach can
  propagate nonces through the full render path.
- The graph extraction reported dangling/collapsed edges because the extractor
  cannot parse the SQL migrations without its optional SQL grammar and folds
  repeated decorator references. This affects the generated map, not runtime
  code; direct SQL inspection was used for the audit.
