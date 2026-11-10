# Testing — DEAL

## Gates (all must be green before any commit lands)

| Gate | Command | Expectation |
|---|---|---|
| Backend lint | `npm --workspace @deal/backend run lint` | 0 problems |
| Backend typecheck | `npm --workspace @deal/backend run typecheck` | 0 errors |
| Backend tests | `npm --workspace @deal/backend test` | **147 default-CI + 22 opt-in live-provider tests** (169 declared; see inventory) |
| Backend build | `npm --workspace @deal/backend run build` | `dist/main.js` produced |
| Frontend lint | `npm --workspace @deal/frontend run lint` | 0 problems |
| Frontend typecheck | `npm --workspace @deal/frontend run typecheck` | 0 errors |
| Frontend build | `npm --workspace @deal/frontend run build` | standalone build succeeds |

`next build` performs its normal TypeScript validation. The separate `tsc --noEmit` gate remains useful because it fails faster and gives focused diagnostics.

## Backend suite inventory (Node test runner, integration against live Neon)

| Suite | Tests | Covers |
|---|---|---|
| `redact.spec.ts` | 3 | capability-token log redaction (pure unit) |
| `config.spec.ts` | 11 | env contract incl. production fail-fast rules |
| `health.spec.ts` | 6 | probes, Swagger mount, envelope shape |
| `platform.spec.ts` | 26 | disputes pipeline, reviews, notifications, dashboard aggregates |
| `db-constraints.spec.ts` | 5 | seeded shape, unique constraints, RESTRICT deletion policy |
| `auth.spec.ts` | 13 | signup/login, HttpOnly cookie issuance, refresh rotation/reuse-family revocation, logout, me |
| `calendar-date.spec.ts` | 2 | real calendar dates, leap years, and UTC conversion without timezone drift |
| `creators.spec.ts` | 21 | onboarding+role promotion, handles, channels, services, requests, bookings, public surface, rate limit |
| `deals.spec.ts` | 20 | lifecycle state machine, share projection whitelist, escrow release, file gating, disputes |
| `files.spec.ts` | 21 | opt-in live R2: presign in/out, namespace containment, finalize checks, MIME/size limits, gating |
| `payments.spec.ts` | 26 | 25 deterministic rail/pipeline tests plus one opt-in live Flutterwave adapter smoke |
| `golden-path.spec.ts` | 15 | ONE continuous flow: signup → onboard → service → request → deal → send → deposit → ACTIVE → installments → deliver → approve (escrow released) → review → notifications → audit trail |

## Conventions (keep them for new tests)

- **Explicit database opt-in**: DB-backed suites run only with `RUN_DATABASE_TESTS=true` plus the required connection variables. Local verification never mutates a developer database merely because `.env` exists; CI opts in against disposable PostgreSQL.
- **Live providers are explicit**: set `RUN_LIVE_STORAGE_TESTS=true` for the 21-test R2 suite and `RUN_LIVE_GATEWAY_TESTS=true` for the Flutterwave smoke. CI uses deterministic fake gateway boundaries and never treats placeholder credentials as permission to call a real provider.
- **Real app, one stub seam**: tests boot the actual Nest app (`createApp()`, ephemeral port) and stub **only** the `FlutterwaveGateway` boundary — a hosted checkout can't be auto-completed headlessly, and everything under test (verification, escrow, idempotency, state machine) lives server-side of that seam.
- **RUN-stamped fixtures**: unique emails/handles per run (`*.test` reserved-TLD emails); FK-safe `afterAll` cleanup (ledger → children → owners). If a run is force-killed, sweep leftovers by the `@deal.test` email pattern (FKs: deal/request/booking → CreatorProfile id, not user id).
- **Rate-limit isolation**: the test harness explicitly sets `TRUST_PROXY_HOPS=1`, so tests send a unique `X-Forwarded-For` per test to get a fresh bucket. Runtime deployments default to zero trusted hops and must opt in only for a controlled gateway.
- **Serial by declaration order** within and across files (`--test-isolation=none --test-concurrency=1`) — flow specs rely on it; keep it.
- Security-critical invariants are asserted, not assumed: whitelist projections (no internal fields), 404-vs-403 existence discipline, idempotent replays, family revocation, spoofed-field rejections.

## Frontend verification

`npm run lint && npm run typecheck && npm run build`, then browser E2E through the serving origin: demo login → dashboard (exact seeded money tiles) → deal detail (escrow banner + audit trail) → shared client view (installment CTAs + record timeline) → public creator page → money screen → mobile viewport (390×844) with flush footer. No payment mutations against seeded data during probes.

## Continuous integration

`.github/workflows/ci.yml` installs from `package-lock.json` with `npm ci` and runs the same repository-level `npm run verify` gate against a disposable PostgreSQL 16 service. It applies every migration and seeds the deterministic integration fixtures before the database-backed suites run. Browser-journey automation is still a tracked gap; the production build and server/API integration tests are automated today.
