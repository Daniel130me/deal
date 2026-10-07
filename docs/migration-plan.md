# DEAL — Migration Plan

> Companion to `docs/current-system-audit.md` and `docs/target-architecture.md`. Phase-level sequence, deliverables, acceptance gates, and risk mitigations. Progress is tracked by checkboxes in `docs/implementation-plan.md`.

## 0. Guiding Constraints

1. **Behavior preservation during migration** — the investor demo (seeded deals, DEAL-002 gold path, watermarked previews, dual-gateway checkout) must keep working at every phase boundary until Phase 10/11 switch it to the production API.
2. **Incremental, independently verified phases** — each phase ends with lint + type-check + tests green, then a Conventional Commit. No phase combines with another. No failing phase is committed.
3. **agent.md standards check** appended to every phase walkthrough (security-first, no patches, no magic values, minimal queries, non-standard choices flagged).
4. Sandbox limitation: `next build` cannot run here — `tsc --noEmit` + dev-server + agent-browser smoke tests are the in-sandbox gates; full build gated externally (flagged each time).

## 1. Phase Sequence and Exit Criteria

| Phase | Deliverable | Exit gate | Commit |
|---|---|---|---|
| 0. Audit | current-system-audit / target-architecture / migration-plan docs; baseline lint+tsc | docs complete; baseline recorded | `docs(architecture): document frontend backend separation` |
| 1. Restructure | Next.js app → `frontend/`; root workspace; prototype db moves with it | `cd frontend && bun run dev` serves :3000; screens verified in browser; no cross-imports | `refactor(repo): separate frontend and backend applications` |
| 2. NestJS base | boot, config validation, /api/v1, Swagger, health, CORS, request IDs, logging, 13 module shells | backend boots standalone; health+Swagger OK; own lint/tsc/test green | `feat(api): bootstrap NestJS backend foundation` |
| 3. Neon+Prisma | full schema, migration, seed from JSON (hashed passwords), PrismaModule | migration + seed succeed; constraints verified; needs Neon DATABASE_URL (flag if absent) | `feat(db): add Neon PostgreSQL domain schema` |
| 4. Auth | signup/login/refresh/logout/me; Argon2; rotation+revocation; guards; frontend keeps working via interim shim | security tests: wrong password, expired access, invalid/reused refresh | `feat(auth): implement secure authentication and sessions` |
| 5. Creator domain | profiles, channels (≤1 primary), services, requests, bookings state machine, ownership, rate limits | cross-creator access tests fail correctly | `feat(creators): implement creator services requests and bookings` |
| 6. Deal engine | DealStateService, share tokens, server-authoritative money (kobo), events, disputes, release eligibility | invalid-transition tests; money math parity with prototype (golden path amounts) | `feat(deals): implement deal lifecycle and state machine` |
| 7. R2 | StorageProvider + R2 adapter, presigned up/down, preview/final gating | unauthorized-access tests; finals blocked pre-approval/pre-payment | `feat(storage): integrate Cloudflare R2 protected file storage` |
| 8. Payments | gateway interface, Paystack+Flutterwave adapters, webhooks, idempotency, transactions | forged/duplicate webhook tests; browser-success never trusted; amount/currency checks | `feat(payments): implement secure payment and webhook processing` |
| 9. Platform | reviews, disputes, notifications, dashboard aggregates | aggregate queries use DB (no JS-side full-table math) | `feat(platform): add reviews disputes notifications and metrics` |
| 10. Integration | frontend/src/lib/api → NEXT_PUBLIC_API_URL; progressive cutover | full flow over HTTP to NestJS; no UI redesign; demo still passes | `feat(integration): connect frontend to production API` |
| 11. Cleanup | remove src/app/api, localStorage identity, JSON/SQLite remnants | grep proves no prototype persistence remains; app still boots | `refactor(frontend): remove obsolete prototype backend` |
| 12. Hardening | all gates (incl. real `next build`), golden path E2E, §54 failure matrix, security review, runbook docs | everything green; docs complete | `test(platform): complete end-to-end hardening and verification` |

## 2. Data Migration (JSON → Neon)

- Source of demo data: `frontend/db/seed.json` (post-Phase 1 path) — 1 creator, 5 deals covering every state, services, requests, bookings, earnings series
- `backend/prisma/seed.ts` ports records 1:1 (ids preserved as `String` cuid-compatible where feasible; refs and share tokens preserved so existing demo links keep working)
- Passwords: seed users get Argon2-hashed passwords; documented demo credential (`tobi@deal.ng`) labeled **non-production** in docs only
- Money: JSON naira integers → `amountMinor` (×100, kobo) at seed time; every money helper re-tested against prototype outputs for the 5 seeded deals
- `balance_paid` legacy status carried in enum; seed does not use it (historical compatibility only)

## 3. Risk Register

| # | Risk | Phase | Mitigation |
|---|---|---|---|
| 1 | Sandbox gateway serves one port; separate backend origin breaks preview | 2→10 | Backend on its own port behind `XTransformPort` gateway param during dev; final cutover via `NEXT_PUBLIC_API_URL` + CORS allow-list. Flagged non-standard interim routing; production unaffected. |
| 2 | Client-side money helpers drift from server authority | 6 | Port helpers first; property-test against prototype outputs for seeded deals; frontend reduced to display-only after Phase 10 |
| 3 | Demo continuity broken mid-migration | all | Phase 10 keeps dual mode (prototype API + feature-flagged base URL) until every screen is cut over; `/api/admin/reset`-equivalent seeding via Prisma seed |
| 4 | `andle]` malformed route dir lurking | 11 | Renamed/removed with prototype API cleanup; grep-gate for `andle]` |
| 5 | `.env`/SQLite tracked in git | 1 | `git rm --cached`, .gitignore rules, `.env.example`; no secrets were ever committed (SQLite URL only — no rotation needed, documented) |
| 6 | Hash-SPA + SSR assumptions in Next 16 | 1 | Move is `git mv` + config paths; no routing-model change in Phase 1 |
| 7 | Neon/R2/gateway credentials unavailable in sandbox | 3,7,8 | `.env.example` + adapters unit-tested with mocks; live acceptance explicitly flagged for user-provided credentials — never silently skipped |
| 8 | Prototype consumers of `Deal.events/payments/deliveries` embedded arrays | 3,6 | Relational children + projection DTOs shaped to match frontend expectations during cutover |

## 4. Verification Strategy per Phase

- **Static:** ESLint + `tsc --noEmit` (both apps), strictness kept at current levels or raised
- **Unit:** money math, state machines, transition tables, authorization helpers, gateway/storage adapters (mocked HTTP), file-gating rules
- **Integration:** Prisma constraints, transactions, ownership, DTO validation
- **E2E (backend):** golden-path HTTP flow (§53); failure matrix (§54)
- **E2E (product):** agent-browser against the running stack — desktop 1440×900 + mobile 390×844 — covering the investor gold path (accept → deposit → deliver → watermarked review → approve → release → balance → final files)
- **Security checkpoints:** ownership, auth, refresh reuse, R2 access, file gating, webhook idempotency, rate limits, CORS, secrets, logs (Phase 12 runs the full checklist)

## 5. Definition of Done (program)

```text
frontend/  — deployable alone; talks only HTTP to NEXT_PUBLIC_API_URL; zero prototype backend code
backend/   — deployable alone; NestJS modular monolith; Neon + R2; validated env; Swagger; health checks
docs/      — deployment, environment, api-overview, payment-webhooks, r2-storage, testing runbooks
git        — one Conventional Commit per phase; two clearly independent applications
demo       — investor gold path passes against the production stack
```
