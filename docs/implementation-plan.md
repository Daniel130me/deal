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

- [x] StorageProvider interface + R2StorageProvider (@aws-sdk/client-s3 + presigner); keys creators/{creatorId}/deals/{dealId}/{previews|final}/{uuid}-{safeFilename}
- [x] Presigned PUT flow: auth → deal ownership → metadata validation → key generation → presign → direct upload → finalize+verify → FileAsset
- [x] File authorization: previews during review states; finals require approval + full payment + release; signed URLs only
- Acceptance: 91/91 tests green ✅ (21 new e2e vs live Neon + REAL R2: auth/validation matrix on upload-url, canonical namespaced keys, namespace-escape + traversal rejection, not-uploaded / empty / mime-mismatch finalize verification via live HeadObject, real browser-parity PUTs, duplicate finalize 409, owner downloads + foreign 404 (code leak plugged), shared gating pre-delivery/post-delivery/post-release with releasedAt stamping, cross-deal 404, unknown token 404; gateway smoke: login → upload → PUT → finalize → owner download → shared gating → cleanup pristine; browser regression clean)
- Deviations flagged: plan's `objectExists` realised as `objectHead` (finalize needs stored size + content type anyway — a metadata head subsumes the boolean); `releasedAt` is stamped by FilesService on first client delivery (NOT by the release action) to keep the module dependency one-directional (files → deals); deal-status keyed finals gate re-uses the releaseFiles approval+full-payment enforcement instead of duplicating escrow logic; FileAsset.storageKey unique constraint added (idempotent finalize); shared file routes live in FilesModule (`shared/:token/files`) so ALL file policy sits behind one service; R2_* env vars required fail-fast (storage is core domain data), R2_PUBLIC_BASE_URL optional and deliberately unused for deal files (signed URLs only; public host reserved for future public assets)
- Commit: `feat(storage): integrate Cloudflare R2 protected file storage`

## Phase 8 — Payment Infrastructure

- [x] PaymentGateway interface (initializePayment/verifyPayment/verifyWebhookSignature); PaystackGateway + FlutterwaveGateway adapters
- [x] PaymentTransaction (provider refs unique); gateway status vs DEAL escrow status (pending…successful, held/released/refunded/disputed)
- [x] Webhook pipeline: verify signature → idempotency (WebhookEvent) → persist → verify transaction → DB transaction → update payment + domain state + audit event → mark processed
- [x] Never trust browser success; idempotent processing; Prisma transactions for verify+update+event and approval+release+event
- Acceptance: 120/120 tests green ✅ (25 new e2e vs live Neon: shared initialize validation + draft refusal + pending tx rows + rail-refused 502 with audited initError, Paystack dormant 503, deposit landing (HELD payment + verified tx + SENT→ACTIVE with acceptedAt/depositPaidAt + DEPOSIT_PAID event), client-verify idempotency, installment landing on ACTIVE, amount/currency mismatch held for review, failed polls land nothing, cross-deal reference 404, full webhook chain (unsigned 401, ignored events processed-with-reason, webhook-only landing, duplicate-delivery dedup, second-event short-circuit, unknown-ref and mismatch marked processed-not-retried, malformed 400), approve releases escrow + post-approval payment lands straight to the creator, deterministic 429 on the 16th payment initialize; LIVE Flutterwave adapter smoke against the real test-mode rail (hosted link + bogus-reference pending poll); gateway smoke: real test-mode checkout link minted through the Caddy gateway, unsigned webhook 401, browser regression clean)
- Deviations flagged: checkout lives on the capability link (`/shared/:token/payments/*`) instead of `/payments/*` — the paying party is the anonymous client whose credential IS the share token; live hosted checkouts cannot be auto-completed headlessly, so pipeline tests stub the gateway seam (the adapter instance inside the real app) while the real adapter gets a live smoke gated on FLW_SECRET_KEY; Flutterwave's hosted checkout requires a payer email the capability surface does not collect yet — the service supplies a stable platform-scoped address on the reserved `.test` TLD (named constant) until Phase 10 passes the real client contact; `FLW_WEBHOOK_SECRET_HASH` optional — the webhook endpoint refuses every delivery (503) while unset rather than process unverified payloads (user supplies the dashboard hash later); Paystack adapter implemented but dormant without keys (explicit 503s, never a silent fallback); money landing takes the Deal row lock FIRST (`SELECT … FOR UPDATE`) so escrow decisions serialize against approve/decline — and Phase 6's `approveWithEscrowRelease` now re-reads HELD payments inside the transaction so the released total is computed under the same lock (no stranded HELD after an approve race); verified amounts land as the current due slot when they match it, otherwise as a balance payment (schedule consumption stays correct — never a client claim); webhook intake deliberately NOT throttled (signature + idempotency are the controls; a 429 would only cause provider retry storms)
- Commit: `feat(payments): implement secure payment and webhook processing`

## Phase 9 — Reviews, Disputes, Notifications, Dashboard

- [x] Reviews (ratings validated), disputes, notifications; creator dashboard aggregates (money summaries, bookings, deal metrics) via DB aggregation
- Acceptance: 146/146 tests green ✅ (26 new e2e vs live Neon in platform.spec: dispute raise with priorStatus capture, ADMIN-only pipeline (under-review → resolve with full escrow release + DISPUTE_RESOLVED event / reject with priorStatus restore to DELIVERED or APPROVED), already-closed 409, role gates 403/401; review rating validation at the edge (0/6 → 400), DEAL_NOT_REVIEWABLE gate until approval, one-review-per-deal 409, REVIEW audit event, me-scoped creator listing isolation; notifications covering all six event families (client actions, payment landing, public submissions, review, dispute outcomes) with unread counts, mark-one/mark-all, foreign-id 404; overview with exact kobo aggregates (releasedAllTime/inEscrow/earnedThisMonth/expectedBalance), zero-filled 6-month earnings series via one parameterised date_trunc query, rating summary, recent lists) — plus a live gateway smoke of /creators/me/overview, /notifications, /reviews, /disputes against the seeded demo data
- Deviations flagged: the deal state machine + escrow release were extracted into a new DealLifecycleModule (DealStateService + new DealEscrowService) shared by DealsModule and DisputesModule — the dispute pipeline legitimately moves deals and releases escrow, and without the shared module the deals↔disputes dependency would be a module cycle; the capability surface now delegates dispute-row creation to DisputesService.createClientDispute (single Dispute writer, priorStatus captured at raise time — the reject path's restore point); notifications are creator-audience only (no client accounts exist to address — CLIENT rows would be dead data); notification delivery is best-effort AFTER the domain transaction commits (advisory projection, never rolls back money/deal moves; failures logged); `earnedThisMonth` is a real month-to-date aggregate (prototype reused releasedAllTime) and the seeded demo's released payments get recency-shifted releasedAt timestamps at seed time so month-scoped aggregates stay meaningful; there is no POST /reviews or POST /disputes — dispute intake is the capability link's dispute action and reviews are written through it (the reviewer is the anonymous client whose credential IS the share token); the admin dispute desk is ADMIN-only via the global RolesGuard
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
