# DEAL — Target Architecture

> Companion to `docs/current-system-audit.md` (Phase 0) and `docs/implementation-plan.md` (phase breakdown).
> Principle: **modular monolith first, microservices-ready boundaries** — no distributed infrastructure until justified.

## 1. Repository Layout (target)

```text
deal/
├── frontend/          # Next.js 16 App Router — UI only, independently deployable
│   ├── src/app/       # hash-routed SPA + (temporarily) prototype API until Phase 11
│   ├── src/components/
│   ├── src/hooks/
│   ├── src/lib/api/   # THE only place that knows the backend URL/DTOs
│   ├── public/
│   ├── package.json   # npm install && npm run dev|build
│   └── .env.example   # NEXT_PUBLIC_API_URL
│
├── backend/           # NestJS 11 modular monolith — independently deployable
│   ├── src/
│   │   ├── main.ts            # /api/v1 prefix, Swagger (dev), CORS, request IDs
│   │   ├── app.module.ts
│   │   ├── config/            # validated env (zod/envalid), typed config
│   │   ├── common/            # guards, decorators, filters, interceptors, pipes, errors, utils
│   │   ├── database/          # PrismaModule + PrismaService (singleton)
│   │   ├── integrations/
│   │   │   ├── payments/      # PaymentGateway interface + Paystack/Flutterwave adapters
│   │   │   └── storage/       # StorageProvider interface + R2 adapter
│   │   └── modules/
│   │       ├── auth/          # signup/login/refresh/logout/me, Argon2, rotation
│   │       ├── users/
│   │       ├── creators/      # profiles, channels
│   │       ├── services/
│   │       ├── requests/
│   │       ├── bookings/
│   │       ├── deals/         # lifecycle + DealStateService + share tokens
│   │       ├── payments/      # transactions, verification, webhooks, escrow release
│   │       ├── files/         # FileAsset, presigned flows, access gating
│   │       ├── reviews/
│   │       ├── disputes/
│   │       ├── notifications/
│   │       └── webhooks/      # provider webhook intake (idempotent)
│   ├── prisma/                # schema.prisma (Neon PostgreSQL), migrations/, seed.ts
│   ├── test/                  # unit + integration + e2e (Jest)
│   ├── package.json           # npm install && npm run start:dev|build
│   └── .env.example
│
├── docs/              # architecture + runbooks (Phase 12 expands)
├── package.json       # workspaces: frontend, backend; dev/lint/typecheck scripts
└── README.md
```

Optional later: `infra/`, `scripts/`, `packages/api-contracts/` (only when compile-time contract sharing earns its cost — §6 of the brief).

## 2. Frontend ⇄ Backend Boundary (hard rules)

- Frontend never imports: Prisma, backend services, DB models, gateway/R2 secrets, backend config
- Backend never imports: React, Next.js, frontend hooks/state/utilities
- No relative imports crossing `frontend/` ↔ `backend/`; deployability is independent (verified per app)
- DTO shape knowledge lives in `frontend/src/lib/api/`; DB shape knowledge lives in `backend/src/modules/**`

## 3. API Surface (/api/v1)

```text
POST /api/v1/auth/signup | login | refresh | logout      GET /api/v1/auth/me
GET/POST        /api/v1/creators/:id/{services,requests,bookings,overview}
GET/POST/PATCH  /api/v1/services, /api/v1/requests/:id, /api/v1/bookings/:id
GET/POST/PATCH  /api/v1/deals(+/:id, /:id/actions)
POST            /api/v1/payments/initialize | /verify
POST            /api/v1/files/upload-url | /finalize      GET /api/v1/files/:id/download-url
GET             /api/v1/shared/:token   POST /api/v1/shared/:token/actions   # capability URL, rate-limited
GET/POST        /api/v1/public/:handle{,/requests,/bookings}
POST            /api/v1/webhooks/paystack | /flutterwave
GET/POST        /api/v1/reviews, /api/v1/disputes
GET             /health /health/live /health/ready      GET /api/docs (dev only)
```

Response envelope: `{ "success": true, "data": … }` / `{ "success": false, "error": { "code": "DEAL_NOT_FOUND", "message": "…" } }` — no stack traces in production.

## 4. Domain Models (Prisma / Neon PostgreSQL)

```text
User(id, email*, phone*, passwordHash, role, status, lastLoginAt, …)
CreatorProfile(id, userId→User*, name, handle*, craft, location, bio, verified, onboarded, preferredProvider)
CreatorChannel(id, creatorId→CreatorProfile, type, value, isPrimary)          # ≤1 primary enforced in service
Service(id, creatorId, title, description, startingPrice, duration, isPopular, isActive)
ClientRequest(id, ref*, creatorId, serviceId?, clientName, clientContact, eventDate, location, budgetMin, budgetMax, description, notes, status)
Booking(id, ref*, creatorId, clientName, clientContact, serviceId?, eventDate, …, status)   # server-side transition table
Deal(id, ref*, creatorId, requestId?, shareToken*, title, serviceTitle, clientName, clientContact,
     summary, eventDate, location, message, scope, priceMinor, depositPercent, installmentsCount,
     startDate, dueDate, revisions, status, …timestamps)
DealDeliverable(id, dealId, name, position)
DealPayment(id, dealId, type, label, amountMinor, method, provider, reference*, escrowStatus, paidAt, releasedAt)
PaymentTransaction(id, paymentId?, dealId, provider, providerRef*, amountMinor, currency, gatewayStatus, verifiedAt, raw?)
DealDelivery(id, dealId, note, submittedAt)
FileAsset(id, dealId, deliveryId?, role: preview|final, storageKey, filename, sizeBytes, mime, uploadedBy, releasedAt?)
DealEvent(id, dealId, type, actorType, actorId?, label, metadata jsonb, createdAt)   # append-only
Review(id, dealId*, creatorId, rating 1..5, comment, createdAt)
Dispute(id, dealId, raisedByType, raisedById?, reason, status, resolvedAt?)
PayoutAccount(id, creatorId, provider, accountRef, isDefault)
RefreshToken(id, userId, tokenHash*, familyId, expiresAt, revokedAt?, replacedById?)
Notification(id, userId?, audience, type, payload jsonb, readAt?)
WebhookEvent(id, provider, eventId, eventType, payloadHash, payload jsonb, processed, processedAt?, failureReason?)
```

`*` = unique/indexed. Money in **integer minor units (kobo)**; `priceMinor`/`amountMinor` — server is the only authority (client copies are display-only).

## 5. Critical Domain Services

- **DealStateService** — the ONLY writer of `Deal.status`; explicit transition table; emits `DealEvent` rows in the same Prisma transaction
- **MoneyService (deal-money helpers)** — `depositAmount / paidTotal / remainingBalance / isFullyPaid / paymentSchedule / nextDueSlot`, integer math only
- **PaymentsService → PaymentGateway** (`initializePayment`, `verifyPayment`, `verifyWebhookSignature`) → `PaystackGateway` | `FlutterwaveGateway`; escrow state (`held → released`) is DEAL's, gateway state is the provider's
- **FilesService → StorageProvider** (`createUploadUrl/createDownloadUrl/deleteObject/objectExists`) → `R2StorageProvider`; key format `creators/{creatorId}/deals/{dealId}/{previews|final}/{uuid}-{safeFilename}`; finals require approval + full payment + release
- **WebhookPipeline** — verify signature → idempotency check (WebhookEvent unique on provider+eventId) → persist → verify transaction with provider → DB transaction (payment + domain state + DealEvent) → mark processed

## 6. Future Microservice Boundaries (design now, split later)

```text
API Gateway ─┬─ Identity   (auth, users, refresh tokens)
             ├─ Creator    (profiles, services, requests, bookings)
             ├─ Deal       (deals, deliverables, events, disputes)
             ├─ Payment    (transactions, gateways, webhooks, escrow)
             ├─ File       (FileAsset, storage)
             └─ Notification
```

Rules that keep the split cheap: cross-module calls only through injected service interfaces (never other modules' repositories); domain events (`DealAccepted`, `PaymentVerified`, `PaymentReleased`, `FinalFilesReleased`, …) raised in-process via an `EventEmitter2` facade so a broker can be added without touching business logic; one database now — no cross-module raw table access.

Explicitly **not** introduced now: Kafka/RabbitMQ, Kubernetes, service mesh, per-service databases.

## 7. Security Architecture (defaults, not options)

- Argon2id password hashing; `passwordHash` never serialized (DTO mapping at repository edge)
- Short-lived JWT access token + rotating refresh tokens (hash-at-rest, family revocation on reuse)
- Ownership guards on every creator-scoped route; role guard (creator vs client vs admin)
- Rate limits: signup, login, refresh, public submissions, shared-link actions, payment initialization
- Capability share links: ≥128-bit random tokens, rate-limited, projection DTO (no internal events/passwords)
- Webhooks: signature verification before parsing business payload; unique provider refs; idempotent handlers
- CORS: explicit `FRONTEND_URL` allow-list in production
- Structured logs (requestId, module, route) — never passwords, tokens, secrets, card data

## 8. Deployment Topology (independence requirement)

```text
frontend (Vercel/Cloudflare/any)  →  NEXT_PUBLIC_API_URL  →  backend (Render/Railway/Fly/AWS/…)
                                                                  ↓
                                                       Neon PostgreSQL + Cloudflare R2
```

Changing backend host = changing one env var. Neither build requires the other.
