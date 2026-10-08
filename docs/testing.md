# Testing — DEAL

## Gates (all must be green before any commit lands)

| Gate | Command | Expectation |
|---|---|---|
| Backend lint | `cd backend && bun run lint` | 0 problems |
| Backend typecheck | `cd backend && bun run typecheck` | 0 errors |
| Backend tests | `cd backend && bun test` | **165/165** (see inventory) |
| Backend build | `cd backend && bun run build` | `dist/main.js` produced |
| Frontend lint | `cd frontend && bun run lint` | 0 problems |
| Frontend typecheck | `cd frontend && bun run typecheck` | 0 errors |
| Frontend build | `cd frontend && bun run build` | standalone build succeeds |

Note: `next.config.ts` keeps the scaffold's `typescript.ignoreBuildErrors: true` — TS enforcement is the **separate `tsc --noEmit` gate**, which is part of every run.

## Backend suite inventory (bun:test, integration against live Neon)

| Suite | Tests | Covers |
|---|---|---|
| `redact.spec.ts` | 3 | capability-token log redaction (pure unit) |
| `config.spec.ts` | 11 | env contract incl. production fail-fast rules |
| `health.spec.ts` | 6 | probes, Swagger mount, envelope shape |
| `platform.spec.ts` | 26 | disputes pipeline, reviews, notifications, dashboard aggregates |
| `db-constraints.spec.ts` | 5 | seeded shape, unique constraints, RESTRICT deletion policy |
| `auth.spec.ts` | 12 | signup/login/refresh rotation/reuse-family revocation/logout/me |
| `creators.spec.ts` | 21 | onboarding+role promotion, handles, channels, services, requests, bookings, public surface, rate limit |
| `deals.spec.ts` | 20 | lifecycle state machine, share projection whitelist, escrow release, file gating, disputes |
| `files.spec.ts` | 21 | presign in/out, namespace containment, live finalize checks, MIME/size limits, gating |
| `payments.spec.ts` | 25 | initialize/verify, mismatch holds, full webhook chain, idempotency, escrow landing, rate limit, live adapter smoke |
| `golden-path.spec.ts` | 15 | ONE continuous flow: signup → onboard → service → request → deal → send → deposit → ACTIVE → installments → deliver → approve (escrow released) → review → notifications → audit trail |

## Conventions (keep them for new tests)

- **Skip-if-unconfigured**: DB-backed suites run only when `NEON_DATABASE_URL` + `JWT_ACCESS_SECRET` exist, so a fresh clone lints/tests without secrets.
- **Real app, one stub seam**: tests boot the actual Nest app (`createApp()`, ephemeral port) and stub **only** the `FlutterwaveGateway` boundary — a hosted checkout can't be auto-completed headlessly, and everything under test (verification, escrow, idempotency, state machine) lives server-side of that seam.
- **RUN-stamped fixtures**: unique emails/handles per run (`*.test` reserved-TLD emails); FK-safe `afterAll` cleanup (ledger → children → owners). If a run is force-killed, sweep leftovers by the `@deal.test` email pattern (FKs: deal/request/booking → CreatorProfile id, not user id).
- **Rate-limit isolation**: the app trusts one proxy hop, so tests send a unique `X-Forwarded-For` per test to get a fresh bucket; limiter tests burn a dedicated IP deterministically.
- **Serial by declaration order** within a file (bun:test) — flow specs rely on it; keep it.
- Security-critical invariants are asserted, not assumed: whitelist projections (no internal fields), 404-vs-403 existence discipline, idempotent replays, family revocation, spoofed-field rejections.

## Frontend verification

`bun run lint && bun run typecheck && bun run build`, then browser E2E through the serving origin: demo login → dashboard (exact seeded money tiles) → deal detail (escrow banner + audit trail) → shared client view (installment CTAs + record timeline) → public creator page → money screen → mobile viewport (390×844) with flush footer. No payment mutations against seeded data during probes.
