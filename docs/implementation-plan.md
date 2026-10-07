# DEAL — Production Platform Implementation Plan

> Source of truth: uploaded master implementation brief (`upload/Pasted Content_1791331245235.txt`, 67 sections).
> This document distils it into checkable phases. **Check items off as they are completed and verified.**
> Every phase follows the loop: inspect → state scope → identify risks → implement → lint → type-check → test → fix → retest → verify acceptance → summarize → Conventional Commit.
> Never commit a failing phase. Never combine phases into one commit.

---

## Phase 0 — Complete System Audit (no product changes)

- [ ] Inspect: src/lib/{types,api,store,db}.ts, src/app/api/**, src/components/app/**, payment-checkout.tsx, db/{db,seed}.json, prisma/schema.prisma, UPGRADE_SPEC.md, worklog.md, package.json
- [ ] Document current endpoints, Deal + Booking state machines, payment flow, file-delivery flow, auth weaknesses, persistence
- [ ] Baseline: lint + TypeScript check (build skipped in sandbox — recorded as environment restriction)
- [ ] Write docs/current-system-audit.md
- [ ] Write docs/target-architecture.md
- [ ] Write docs/migration-plan.md
- Commit: `docs(architecture): document frontend backend separation`

## Phase 1 — Repository Restructure

- [ ] Move Next.js app (src/, public/, next.config.ts, tailwind, components.json, tsconfig, eslint config) → frontend/
- [ ] Prototype db/ moves with frontend (JSON is frontend-owned until Phase 11 removal)
- [ ] Root: workspace package.json + scripts dev:frontend / dev / lint / typecheck; each app independently runnable
- [ ] No frontend↔backend source imports; sandbox dev flow (`bun run dev` → :3000) preserved and browser-verified
- Acceptance: frontend boots + builds assets work, screens accessible, structure clean
- Commit: `refactor(repo): separate frontend and backend applications`

## Phase 2 — NestJS Backend Foundation (backend/)

- [x] NestJS + TypeScript, global ValidationPipe, global exception filter ({success:false,error:{code,message}}), request IDs, structured logging
- [x] /api/v1 prefix, Swagger at /api/docs (dev only), CORS from FRONTEND_URL, health /health /health/live /health/ready
- [x] Empty module boundaries: auth, users, creators, services, requests, bookings, deals, payments, files, reviews, disputes, notifications, webhooks
- [x] backend/.env.example (only vars actually used); config validation; testing setup
- Acceptance: boots independently, health + Swagger work, lint/tsc/tests pass ✅ (bun --hot dev; gateway `?XTransformPort=3001`; 10 tests green)
- Commit: `feat(api): bootstrap NestJS backend foundation`

## Phase 3 — Neon PostgreSQL + Prisma

- [x] backend/prisma/schema.prisma with models: User, CreatorProfile, CreatorChannel, Service, ClientRequest, Booking, Deal, DealDeliverable, DealPayment, PaymentTransaction, DealDelivery, FileAsset, DealEvent, Review, Dispute, PayoutAccount, RefreshToken, Notification, WebhookEvent
- [x] Indexes: users.email/phone, profiles.handle, services.creatorId, requests.creatorId/ref, bookings.creatorId/ref, deals.creatorId/ref/shareToken/status, deal_payments.dealId/providerReference, deal_events.dealId, file_assets.dealId, webhook_events(provider,eventId)
- [x] Migration (not db push) + seed.ts from useful JSON records; passwords Argon2-hashed; demo credentials documented as non-production
- [x] PrismaModule; constraints verified
- Acceptance: migration + seed succeed, backend connects ✅ (`20261007090659_init` applied to Neon via DIRECT_URL; seed 1:1 with kobo money; /health/ready pings the DB; 5 integration constraint tests green)
- Commit: `feat(db): add Neon PostgreSQL domain schema`

## Phase 4 — Authentication

- [x] POST /api/v1/auth/{signup,login,refresh,logout}, GET /api/v1/auth/me
- [x] Argon2 password hashing; never return passwordHash; short-lived access token + refresh rotation/revocation (RefreshToken table)
- [x] Guards + ownership decorators; frontend stops trusting localStorage["deal_user"]
- Acceptance: security tests (wrong password, expired access, invalid/reused refresh) ✅ (12 e2e tests: validation matrix, duplicate 409, timing-equalised unknown identifier, forged/expired tokens, rotation, reuse → family revocation, logout idempotence; jose + opaque refresh flagged non-standard — see worklog Task 13)
- Commit: `feat(auth): implement secure authentication and sessions`

## Phase 5 — Creator Domain

- [x] CreatorProfile CRUD + unique handle; CreatorChannel (one primary enforced)
- [x] Services; ClientRequest (new/replied/archived/declined); Booking state machine (requested→confirmed→completed; declined/cancelled) enforced server-side
- [x] Ownership checks + rate limiting (signup, login, refresh, public submissions)
- Acceptance: profile onboarding + role promotion, handle uniqueness, single-primary invariant, service catalogue + public visibility, public submissions (validation + foreign-service 404s), request/booking state machines with 409 on illegal transitions, cross-creator access → 404 (no existence leak), per-IP throttling on auth + public surface — 21 new integration tests, 50/50 green ✅
- Deviations flagged: `me`-scoped owner routes instead of `/creators/:id` (identity from token, IDOR impossible); new PublicModule boundary hosting the whole unauthenticated surface (breaks creators↔services cycle, co-locates rate-limited attack surface); CreatorChannel FK → CASCADE (profile-owned child, unblocks profile deletion)
- Commit: `feat(creators): implement creator services requests and bookings`

## Phase 6 — Deal Engine

- [x] Deal CRUD + send; capability share tokens (random, high entropy, rate-limited, minimal payload)
- [x] DealStateService centralizes transitions: draft→sent→(changes_requested/declined)→active→delivered→revision→approved→files_released→completed; disputed; balance_paid legacy-only
- [x] Server-authoritative money: depositAmount/paidTotal/remainingBalance/isFullyPaid/paymentSchedule/nextDueSlot; integer minor units; no floats
- [x] Immutable DealEvent audit trail; disputes; file-release eligibility
- Acceptance: full lifecycle + failure matrix, 70/70 tests green ✅ (20 new e2e: draft defaults + 256-bit tokens, request-link→REPLIED in one transaction, foreign-request 404, kobo wizard PATCH with replace-set deliverables + 100%-deposit schedule, edit window (DRAFT/CHANGES_REQUESTED only), send validation + changes-requested→re-send loop, decline terminal, whitelist share projection (no events/payments/clientContact/internal ids), deliver→revision→deliver→approve with escrow release (held→released + PAYMENT_RELEASED system event), zero-payment approve invents nothing, finals gated on full payment (DEAL_NOT_FULLY_PAID), dispute requires reason + OPEN Dispute row, cross-creator 404, unauthenticated 401, 429 on the 21st shared action)
- Deviations flagged: SENT→ACTIVE is legal in the transition table but has NO route trigger until Phase 8 wires payment verification (a state no client can fake beats an "accept without money" action); deal PATCH restricted to DRAFT/CHANGES_REQUESTED (prototype allowed edits any time — escrow terms must not move under a sent offer); dispute requires a reason (prototype's was optional); money helpers are pure functions in deal-money.ts, not a DI "MoneyService" (no state/IO to inject — flagged vs the doc's naming); shared surface lives in DealsModule (SharedDealsController), not PublicModule — it projects deal state and drives the deal machine, so it stays with the domain
- Commit: `feat(deals): implement deal lifecycle and state machine`

## Phase 7 — Cloudflare R2

- [ ] StorageProvider interface + R2StorageProvider (@aws-sdk/client-s3 + presigner); keys creators/{creatorId}/deals/{dealId}/{previews|final}/{uuid}-{safeFilename}
- [ ] Presigned PUT flow: auth → deal ownership → metadata validation → key generation → presign → direct upload → finalize+verify → FileAsset
- [ ] File authorization: previews during review states; finals require approval + full payment + release; signed URLs only
- Commit: `feat(storage): integrate Cloudflare R2 protected file storage`

## Phase 8 — Payment Infrastructure

- [ ] PaymentGateway interface (initializePayment/verifyPayment/verifyWebhookSignature); PaystackGateway + FlutterwaveGateway adapters
- [ ] PaymentTransaction (provider refs unique); gateway status vs DEAL escrow status (pending…successful, held/released/refunded/disputed)
- [ ] Webhook pipeline: verify signature → idempotency (WebhookEvent) → persist → verify transaction → DB transaction → update payment + domain state + audit event → mark processed
- [ ] Never trust browser success; idempotent processing; Prisma transactions for verify+update+event and approval+release+event
- Commit: `feat(payments): implement secure payment and webhook processing`

## Phase 9 — Reviews, Disputes, Notifications, Dashboard

- [ ] Reviews (ratings validated), disputes, notifications; creator dashboard aggregates (money summaries, bookings, deal metrics) via DB aggregation
- Commit: `feat(platform): add reviews disputes notifications and metrics`

## Phase 10 — Frontend Integration

- [ ] frontend/src/lib/api/ centralizes all calls; NEXT_PUBLIC_API_URL env; progressive migration auth→profile→services→requests→bookings→deals→shared→payments→files→dashboard
- [ ] No UI redesign; independent deployability; no production feature on db/db.json
- Commit: `feat(integration): connect frontend to production API`

## Phase 11 — Remove Prototype Backend

- [ ] Remove frontend/src/app/api/**, store.ts localStorage identity, JSON runtime persistence, SQLite/prisma remnants — only what is truly unused
- Commit: `refactor(frontend): remove obsolete prototype backend`

## Phase 12 — Hardening + Complete E2E

- [ ] Full gates: frontend lint/ts/build; backend lint/ts/unit/integration/e2e/build
- [ ] Golden path E2E (signup→…→review) + failure matrix (§54): cross-creator access, invalid/foreign tokens, forged/duplicate webhooks, wrong amount/currency, duplicate approval, early final-file access, MIME/size limits
- [ ] Security review: ownership, auth, refresh, R2, file gating, payment verification, webhook idempotency, rate limits, CORS, secrets, logs, transactions, indexes
- [ ] docs/{deployment,environment,api-overview,payment-webhooks,r2-storage,testing}.md
- Commit: `test(platform): complete end-to-end hardening and verification`

---

## Standing Rules (from agent.md — checked every phase)

- Security first · readable · well-structured · commented where non-obvious · maintainable/extensible · minimal queries · flag non-standard choices · architecture before patches
- Avoid over-engineering, magic values, hard-coded assumptions
- Post-implementation standards check included in each phase walkthrough + worklog

## Environment Constraints & Flags

- `bun run build` is restricted in the sandbox → Next build verification deferred to CI/user machine; TypeScript `tsc --noEmit` used as the compile gate here (flagged as environment limitation)
- Neon DATABASE_URL and R2/payment secrets are user-side credentials → .env.example provided; live connection acceptance may require user-supplied values (flagged, never blocked silently)
- GitHub push requires the PAT flow used previously (ephemeral askpass, never stored)
