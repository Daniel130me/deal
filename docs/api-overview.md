# API Overview — DEAL Backend

One NestJS service, global prefix `/api/v1`, JSON envelope on every response:

```jsonc
// success
{ "success": true, "data": { ... } }
// failure — machine-readable code + human message; no internals leak
{ "success": false, "error": { "code": "DEAL_NOT_EDITABLE", "message": "…" } }
```

## Identity model

- **Bearer access token** (JWT HS256, 15 min, iss/aud pinned) on every protected call: `Authorization: Bearer <token>`.
- **Refresh token**: opaque 256-bit CSPRNG value, SHA-256-hashed at rest, rotated on every use (single-use; presenting a rotated/revoked token revokes the whole token family — strict reuse detection for an escrow-money platform).
- **Capability token** (share link): 256-bit token in the URL path, the *client party's* credential. Scope: the whitelisted deal projection + the legal lifecycle moves + gated files + checkout/review. Rate-limited per IP.
- Deny-by-default: global `JwtAuthGuard` + `RolesGuard`; `@Public()` exists only on health, auth, the public marketing surface, the shared capability surface, and webhook intake.

## Route map

| Prefix | Auth | Purpose |
|---|---|---|
| `auth/signup`, `auth/login`, `auth/refresh`, `auth/logout` | public | session lifecycle (rotation, family revocation) |
| `auth/me` | bearer | current SafeUser (suspension applies immediately) |
| `creators/me` | bearer | onboarding (CLIENT→CREATOR promotion) + profile |
| `creators/me/channels` | bearer | contact channels (≤1 primary invariant) |
| `creators/me/services`, `services/:id` | bearer | service catalogue CRUD |
| `creators/me/requests` | bearer | request inbox (NEW → REPLIED when a deal answers it) |
| `requests/:id` | bearer | accept/decline a request (state machine) |
| `creators/me/bookings`, `bookings/:id` | bearer | bookings (REQUESTED → CONFIRMED → COMPLETED, cancel window) |
| `creators/me/overview` | bearer | dashboard: DB-aggregated stats, money, earnings series, rating |
| `deals`, `deals/:id` | bearer | deal CRUD (wizard), kobo money, atomically-replaced deliverables |
| `deals/:id/actions` | bearer | `send` / `deliver` / `release-files` (state machine) |
| `reviews` | bearer | creator's review list |
| `notifications`, `notifications/:id/read`, `notifications/read-all` | bearer | inbox bookkeeping |
| `disputes`, `disputes/:id/actions` | ADMIN | dispute desk (under-review / resolve+release / reject+restore) |
| `files/upload-url`, `files/finalize`, `files/:id/download-url` | bearer | presigned R2 upload/download, namespace-contained |
| `public/:handle`, `public/:handle/requests`, `public/:handle/bookings` | public, rate-limited | creator marketing page + anonymous submissions |
| `shared/:token` | capability, rate-limited | whitelisted deal projection `{deal, creator, amounts}` |
| `shared/:token/actions` | capability | `request-changes`, `decline`, `approve`, `complete`, `review`, `dispute` |
| `shared/:token/payments/initialize` \| `/verify` | capability | hosted-checkout hand-off + verified landing |
| `shared/:token/files`, `shared/:token/files/:fileId/download-url` | capability | gated file list + signed download URLs |
| `webhooks/flutterwave`, `webhooks/paystack` | signature-gated | provider-sourced money events (see `payment-webhooks.md`) |
| `health`, `health/ready`, `health/detail` | public | probes |

## Conventions

- **Money is integer kobo everywhere** (`priceMinor`, `amountMinor`); naira exists only at the UI edge. No floats.
- **Statuses are UPPER_SNAKE enums** mirrored client-side by the mapper layer.
- **404 for foreign resources** (never 403) — no existence probing across creators.
- **Server-authoritative everything**: amounts (schedule slots are computed, never client-supplied), state transitions (transition tables in the services), file access (status gates re-checked inside transactions), identity (always token-derived).
- **Rate limits** (per IP, 60 s windows): auth 10/min signup+login, 30/min refresh+logout; public reads 30/min, submissions 5/min; shared reads 30/min, actions 20/min, payments 15/min; webhook intake deliberately unthrottled (signature + idempotency are the controls; a 429 there would only cause healthy rails to retry).
- Interactive docs (Swagger) mount only outside production.

Deeper dives: `payment-webhooks.md`, `r2-storage.md`, `environment.md`, `deployment.md`.
