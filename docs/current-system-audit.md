# DEAL — Current System Audit (Phase 0)

> Audit date: 2026-10-06 · HEAD `e00e3be` · Scope: full repository · No product functionality was modified during this audit.

## 1. Repository Architecture (current)

Single Next.js 16 (App Router) application at repo root containing **both** the frontend and a prototype API layer:

```text
/home/z/my-project
├── src/app/            # hash-routed SPA (src/app/page.tsx) + prototype API (src/app/api/**)
├── src/components/     # landing/ + app/ screens (shadcn/ui, Tailwind v4)
├── src/lib/            # types, api client, JSON store, channels, utils
├── db/                 # db.json (in-memory JSON DB), seed.json, make-seed.ts
├── prisma/             # SQLite remnant (Signup model only)
├── examples/, skills/, mini-services/, tool-results/, upload/   # sandbox infra (not product)
├── Caddyfile           # sandbox gateway (single external port → :3000)
├── .zscripts/          # sandbox dev orchestration (bun run dev → :3000, dev.log)
└── docs/               # implementation-plan.md (this program) + Phase 0 docs
```

Routing model: hash-based SPA (`#/dashboard`, `#/deals/:id`, `#/c/{token}`, `#/u/{handle}`) driven by `useApp()` context + `useSyncExternalStore` on `hashchange`. Only `/` is server-rendered.

## 2. Frontend Structure

- `src/components/landing/**` — marketing site (hero, steps, flow, audience, pricing, FAQ, signup)
- `src/components/app/**` — product UI: chrome (`AppCanvas`, nav), kit (shared primitives incl. `ProtectedPreviewDialog` with watermarked preview), screens (dashboard, deals list, deal-detail, wizard, client-deal, money, requests, bookings, onboarding, settings, public-page)
- `src/components/app/payment-checkout.tsx` — simulated dual-gateway checkout (Flutterwave `#FF9B00` / Paystack `#00C3F7`), provider selectable per payment, creator `preferredProvider` preselected, card/transfer/USSD methods, "Use test card" helper
- State: React context (`AppProvider`) + localStorage persistence; no server-state library in active use (TanStack Query is installed but unused)

## 3. Current API Structure (prototype, same process)

18 route files under `src/app/api/` (Next.js route handlers, all sharing `src/lib/store.ts` JSON store):

| Route | Methods | Purpose |
|---|---|---|
| `/api` | GET | liveness ping |
| `/api/auth/login` | POST | plaintext password compare, returns full user JSON |
| `/api/auth/signup` | POST | create creator (plaintext password stored) |
| `/api/signup` | POST | legacy landing-page signup (Prisma/SQLite `Signup` model) |
| `/api/users/[id]` | PATCH | profile/onboarding updates (incl. craft, preferredProvider, channels) |
| `/api/users/[id]/services` | GET, POST | list/create creator services |
| `/api/creators/[id]/overview` | GET | dashboard aggregates (money, bookings, deals, series) |
| `/api/creators/[id]/requests` | GET | creator's client requests |
| `/api/creators/[id]/bookings` | GET | creator's bookings |
| `/api/deals` | GET, POST | list by creator, create (draft) |
| `/api/deals/[id]` | GET, PATCH, POST | fetch, edit, **actions**: `send` / `deliver` / `release-files` |
| `/api/requests/[id]` | PATCH | request status changes |
| `/api/bookings/[id]` | PATCH | booking status changes |
| `/api/public/{handle}` | GET | public creator payload ⚠ lives in malformed dir `andle]` |
| `/api/public/{handle}/requests` | POST | public enquiry submission |
| `/api/public/{handle}/bookings` | POST | public booking submission |
| `/api/shared/[token]` | GET, POST | client deal view + **all client-side deal actions** (accept, request-changes, pay, approve, pay-balance, complete) |
| `/api/admin/reset` | POST | reseed from seed.json (prototype demo tool) |

**Known defect (non-blocking):** the public routes folder is literally named `src/app/api/public/andle]/` — a corrupted `[handle]` dynamic segment. Empirically Next.js still resolves `/api/public/tobi-a` → 200 through it (verified during audit), but it is fragile, non-standard, and must be renamed during the Phase 10/11 frontend cleanup.

## 4. Persistence Mechanisms

- **Primary (product):** `db/db.json` — whole DB parsed once into `globalThis`, reads from RAM, atomic tmp+rename writes (`src/lib/store.ts`). Deliberately fast for prototype demos.
- **Remnant 1:** `db/custom.db` SQLite binary **tracked in git**; `prisma/schema.prisma` (SQLite provider) defines only `Signup`; used solely by legacy `/api/signup` (landing waitlist).
- **Remnant 2:** `.env` **tracked in git** containing only `DATABASE_URL` (SQLite file path). No real secrets committed — rotation not required — but the practice is wrong and must stop in Phase 1 (gitignore + remove from index, provide `.env.example`).

## 5. Frontend API Contract (as consumed by src/lib/api.ts)

- Envelope: routes return raw JSON or `{error: string}`; no uniform success/error envelope, no machine error codes
- Identity: `localStorage["deal_user"]` (key constant `USER_KEY` in `src/components/app/context.tsx`) is treated as proof of auth; `SafeUser` (no password) persisted client-side; every creator route trusts `body.creatorId`/`[id]` params — **no session, no signature, spoofable**
- Deal money helpers (`paymentSchedule`, `remainingBalance`, `nextDueSlot`) exist in `src/lib/types.ts` and run **client-side**; server recomputes on payment but does not enforce as single source of truth

## 6. Deal State Machine (current, from src/lib/types.ts + API routes)

```text
draft → sent → active → delivered → approved → files_released → completed
              ↘ changes_requested → active (after re-send/edit)
              ↘ declined
delivered → revision → delivered (redeliver loop)
any(late) → disputed
legacy: balance_paid ("Payment secured" label — historical compatibility only)
```

Transitions are implemented as inline `switch` cases in two route files (`/api/deals/[id]` POST and `/api/shared/[token]` POST) — **no centralized transition table**; guard quality varies by action. Payment `status`: `held | released` per DealPayment; approval releases all `held` payments.

## 7. Booking State Machine (current)

```text
requested → confirmed → completed
requested → declined | cancelled
confirmed → completed | cancelled
```

Enforced in `/api/bookings/[id]` PATCH (ad-hoc checks, not a reusable machine).

## 8. Payment Flow (current, simulated)

1. Client accepts deal → checkout: provider choice (Paystack/Flutterwave; creator's `preferredProvider` preselected) → method (card/transfer/USSD) → simulated form → `POST /api/shared/[token]` `{action:"pay",…}`
2. Server computes amount from deal (`paymentSchedule`), mints gateway ref (`FLW-…`/`PSK-…`), records `DealPayment{status:"held"}` → deal `draft→sent→active` on deposit
3. Approval (`action:"approve"`) → all `held` payments → `released` (+ `payment_released` event) → post-approval payments recorded as instantly received
4. `release-files` (creator) → `files_released` → client sees downloads (product-level file gating is UI-enforced only)
5. Full payment = sum(payments) ≥ price; UI unlocks final files

No real gateway calls, no webhook pipeline, no verification step, no idempotency keys.

## 9. File-Delivery Flow (current, simulated)

- Deliveries: `DealDelivery{note, files: DealFile[{name,size,kind}]}` — **no real files anywhere**; metadata only
- Protection UX: `ProtectedPreviewDialog` (diagonal "DEAL · PROTECTED PREVIEW" watermark, reduced quality copy), `Protected` badges, unlock copy tied to approval + full payment
- Reality: downloads are simulated buttons; there is no storage, no signed URLs, no server-side authorization

## 10. Authentication Weaknesses (all confirmed in code)

1. Plaintext passwords stored and compared (`db.json.password`, `/api/auth/login`)
2. `localStorage` identity = auth (spoofable by design of prototype)
3. No sessions/tokens at all; creator-scoped routes trust client-supplied `creatorId`
4. Share tokens: `tok_` + 5 random bytes (40 bits) — acceptable entropy, but no rate limiting, no expiry, and the shared endpoint returns full deal incl. internal events
5. `/api/admin/reset` unauthenticated (fine for demo, catastrophic in prod)
6. No CORS policy (same-origin only by accident of architecture)
7. Legacy `/api/signup` stores waitlist contacts in SQLite w/ Prisma (sha-ish hash via route, not Argon2)

## 11. Security Risks Summary (target-state priorities)

| Risk | Severity | Phase that fixes it |
|---|---|---|
| Spoofable creator identity on every route | Critical | 4 (auth) + 5/6 (ownership guards) |
| Plaintext passwords | Critical | 3 (schema) + 4 (Argon2) |
| Browser-trusted payment success | High | 8 (verify + webhooks) |
| Unauthenticated state mutations (deals/bookings/requests) | High | 5/6 |
| No file authorization (product promise unenforceable) | High | 7 (R2 + signed URLs + gating) |
| Unauthenticated admin/reset endpoint | Medium | 11 (removal) |
| `.env` + SQLite binary tracked in git | Medium | 1 |
| No rate limiting on public submissions | Medium | 2 (throttle) + 5 |
| Non-standard `andle]` route dir | Low | 11 |

## 12–15. Forward-looking sections

Target structure, NestJS architecture, and Prisma model inventory → see `docs/target-architecture.md`.
Sequencing, data migration, and risk register → see `docs/migration-plan.md`.

## 16. Migration Risks (headline)

1. **Hash-SPA + prototype-API coupling**: screens call `/api/...` same-origin with cookie-less `fetch`; moving the API to another origin requires the central api-client layer (Phase 10) and CORS (Phase 2) — plus sandbox gateway compatibility for the live preview.
2. **Money semantics drift**: client-side helpers vs server authority — server helpers must be ported *first* (Phase 6) and byte-compared against prototype behavior for the demo golden path.
3. **Demo continuity**: investors use seeded JSON state (5 deals, gold path on DEAL-002/tok_glow002). Seed must be ported 1:1 into Prisma seed (Phase 3) with hashed passwords so the same demo works against Neon.
4. **`balance_paid` legacy status** and event-shape compatibility must be preserved until Phase 11 removes old consumers.
5. **Sandbox constraints**: `bun run build` is restricted → Next build gate deferred; tsc `--noEmit` + dev-server smoke tests used as the compile/verification gate in-sandbox (recorded as environment limitation, not a skipped requirement).

## 17. Baseline Status (recorded)

- `bun run lint` → **pass (0 problems)**
- `bunx tsc --noEmit` → **0 errors in `src/`** (pre-existing failures only in sandbox infra dirs `examples/websocket`, `skills/`, `tool-results/` — not product code, recorded separately per §Phase 0)
- `next build` → **not runnable in sandbox** (restricted); will be gated in CI/user machine at Phase 12
- Runtime smoke: `GET /` 200; `GET /api/public/tobi-a` 200 (through the malformed dir — see §3)
