# Security Review — Phase 12 hardening pass

Scope: ownership/authz, auth & refresh rotation, R2/files, payments, webhooks, rate limits, CORS, secrets, logs, transactions, indexes, global guards, input validation — reviewed against `backend/src/**` and `prisma/schema.prisma` (documented, deliberate design decisions from worklog Tasks 11–20 treated as context, not findings).

**Verdict for the reviewed security controls: no open HIGH or MEDIUM vulnerability.** The current hardening pass also moved browser refresh credentials out of JavaScript-readable storage, made request/booking transitions race-safe, and added database checks for financial/domain invariants. Broader reliability and scale gaps are tracked separately in `implementation-gap-audit.md`; this verdict must not be read as a claim that the product has no remaining engineering work.

## Findings & disposition

| # | Severity | Area | Finding | Disposition |
|---|---|---|---|---|
| 1 | LOW | logs | Capability-link tokens appeared verbatim in access-log URLs (interceptor + exception filter) | **FIXED**: `redactUrl()` masks `/shared/{redacted}` in both log paths (+ unit tests) |
| 2 | LOW | reviews | Reviewability gate checked only the pre-transaction snapshot — a concurrent approve/dispute could slip a review past the window | **FIXED**: authoritative status re-read inside the write transaction; comment corrected |
| 3 | LOW | config | `FRONTEND_URL` silently defaulted to localhost even in production (feeds CORS + checkout redirects) | **FIXED**: required + https-pinned when `NODE_ENV=production` (+ config test) |
| 4 | INFO | payments | Comment claimed "256 bits" of reference entropy; actual was 4 bytes, and a suffix collision would surface as an unhandled P2002 → 500 | **FIXED (partial)**: comment corrected, entropy widened to 8 bytes (64 bits on a per-deal/per-slot prefix; the unique index remains the authority). P2002→retry deliberately not built (over-engineering for a 64-bit scoped space) |
| 5 | INFO | auth | `rotate()` treats *any* refresh-transaction failure as reuse and revokes the family — safe-side but a transient DB outage logs everyone out | **Accepted**: fail-closed is the right bias for an escrow-money platform; documented |
| 6 | INFO | notifications | A suspended user with a live (≤15 min) token can still read/mark their own inbox | **Accepted**: own-data, read-only-ish; every creator *resource* surface re-checks status |
| 7 | INFO | requests/bookings | Action transitions used read-then-write without the deal machine's where-filtered update | **FIXED**: conditional `updateMany` now binds owner and legal source status; the follow-up projection distinguishes missing resources from transition races without leaking ownership |
| 8 | INFO | auth | Signup answers `EMAIL_TAKEN` without timing equalisation → registered-contact enumeration on that one surface | **Accepted**: standard UX tradeoff; login path is fully equalised |
| 9 | MEDIUM | browser auth | Refresh tokens were returned in JSON and persisted in `localStorage`, exposing long-lived credentials to any successful XSS | **FIXED**: auth-scoped HttpOnly cookie, strict same-site policy, credentialed refresh, and one-time legacy-session migration |
| 10 | MEDIUM | data integrity | Several financial and domain invariants existed only in service code | **FIXED**: PostgreSQL CHECK/partial-unique constraints added; deployment must validate historical data before applying the migration |

Items 5, 6, and 8 remain deliberate tradeoffs. The non-standard PostgreSQL sequence and partial-index implementation, plus the historical-data migration preflight, are called out in `implementation-gap-audit.md`.
