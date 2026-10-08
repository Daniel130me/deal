# Security Review — Phase 12 hardening pass

Scope: ownership/authz, auth & refresh rotation, R2/files, payments, webhooks, rate limits, CORS, secrets, logs, transactions, indexes, global guards, input validation — reviewed against `backend/src/**` and `prisma/schema.prisma` (documented, deliberate design decisions from worklog Tasks 11–20 treated as context, not findings).

**Verdict: no HIGH or MEDIUM findings.** The documented security architecture (token-derived identity, capability-link posture, gateway-verified money, lock-serialized escrow, structural idempotency) is implemented as described. Verified-OK areas: ownership/authz (me-scoped routes, creatorId-scoped queries, 404-not-403), auth (Argon2id, timing-equalised unknown-identifier path, suspension re-checks at 4 layers, claim-pinned JWTs), refresh rotation (atomic single-use conditional update, family revocation), R2 (namespace re-derivation, live finalize head, mime/size caps, signed-URL-only downloads, gated files 404 like missing ones), payments (server-computed slots only, verify-before-land, deal row lock, 4-layer idempotency), webhooks (signature before business fields, constant-time compares, 503 while unconfigured), rate limits (per-surface budgets, trust proxy = 1), CORS (env allowlist, credentials, no wildcard, Swagger dev-only), secrets (fail-fast zod contract, gitignored .env, no hardcoded values), logs (no tokens/hashes/refs; URLs redacted), transactions (all money/lifecycle writes atomic; conditional where-filtered status writes), indexes (all hot-path columns covered), guards (deny-by-default, `@Public()` exhaustively enumerated), validation (global whitelist + forbidNonWhitelisted; the only raw SQL is 3 parameterised tagged templates).

## Findings & disposition

| # | Severity | Area | Finding | Disposition |
|---|---|---|---|---|
| 1 | LOW | logs | Capability-link tokens appeared verbatim in access-log URLs (interceptor + exception filter) | **FIXED**: `redactUrl()` masks `/shared/{redacted}` in both log paths (+ unit tests) |
| 2 | LOW | reviews | Reviewability gate checked only the pre-transaction snapshot — a concurrent approve/dispute could slip a review past the window | **FIXED**: authoritative status re-read inside the write transaction; comment corrected |
| 3 | LOW | config | `FRONTEND_URL` silently defaulted to localhost even in production (feeds CORS + checkout redirects) | **FIXED**: required + https-pinned when `NODE_ENV=production` (+ config test) |
| 4 | INFO | payments | Comment claimed "256 bits" of reference entropy; actual was 4 bytes, and a suffix collision would surface as an unhandled P2002 → 500 | **FIXED (partial)**: comment corrected, entropy widened to 8 bytes (64 bits on a per-deal/per-slot prefix; the unique index remains the authority). P2002→retry deliberately not built (over-engineering for a 64-bit scoped space) |
| 5 | INFO | auth | `rotate()` treats *any* refresh-transaction failure as reuse and revokes the family — safe-side but a transient DB outage logs everyone out | **Accepted**: fail-closed is the right bias for an escrow-money platform; documented |
| 6 | INFO | notifications | A suspended user with a live (≤15 min) token can still read/mark their own inbox | **Accepted**: own-data, read-only-ish; every creator *resource* surface re-checks status |
| 7 | INFO | requests/bookings | Action transitions use read-then-write without the deal machine's where-filtered update | **Accepted**: single equally-privileged actor per transition; uniformity noted for future work |
| 8 | INFO | auth | Signup answers `EMAIL_TAKEN` without timing equalisation → registered-contact enumeration on that one surface | **Accepted**: standard UX tradeoff; login path is fully equalised |

Items 5–8 are recorded deliberately rather than "fixed" — each is either a defensible tradeoff or has no exploit path; mass-fixing them would be patch-chasing, not hardening.
