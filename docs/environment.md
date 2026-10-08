# Environment Configuration — DEAL Backend

Every variable the backend reads is declared, validated, and documented in `backend/src/config/env.ts` (zod schema). Parsing happens once at first import; an invalid environment aborts boot with a readable error listing every offending variable — a half-configured app never starts.

## Contract

| Variable | Required | Rule | Feeds |
|---|---|---|---|
| `NODE_ENV` | no (default `development`) | `development` \| `test` \| `production` | fail-fast rules, Swagger mount |
| `PORT` | no (default `3001`) | int 1–65535 | HTTP listen |
| `FRONTEND_URL` | **in production** (else defaults `http://localhost:3000`) | production: must start `https://` | CORS allowlist, hosted-checkout redirect base |
| `NEON_DATABASE_URL` | yes | `postgresql://` URL (pooled endpoint, `sslmode=require`) | Prisma runtime |
| `NEON_DIRECT_URL` | yes (migrations) | `postgresql://` URL (direct endpoint) | `prisma migrate` (bypasses PgBouncer) |
| `JWT_ACCESS_SECRET` | yes | min 32 chars (≥256 bits) | HS256 access-token signing |
| `R2_BUCKET` | yes | non-empty | deal-file storage |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | yes | non-empty | R2 S3 API |
| `R2_S3_ENDPOINT` | yes | `https://` URL | R2 S3 endpoint |
| `R2_PUBLIC_BASE_URL` | no | `https://` URL | reserved for genuinely public assets; **never** used for deal files |
| `FLW_SECRET_KEY` | yes | non-empty | Flutterwave initialize + verify |
| `FLW_WEBHOOK_SECRET_HASH` | no (until webhooks configured) | min 16 chars | `verif-hash` webhook gating — see `payment-webhooks.md` |
| `PAYSTACK_SECRET_KEY` | no | non-empty when present | Paystack adapter stays dormant (503) until supplied |

## Fail-fast philosophy

Anything a boot cannot work without is **required with no dev default** (`JWT_ACCESS_SECRET`, R2, `FLW_SECRET_KEY`): a silently-weak or missing credential in dev tends to survive into production untouched — failing at boot keeps that class of mistake impossible. The one deliberate exception is `FRONTEND_URL`, which keeps a localhost default for friction-free dev boot but becomes required + https-pinned in production (it feeds CORS and checkout redirects; a silent localhost default there would fail-open into a broken posture).

## Naming conventions & gotchas

- **`NEON_*` naming is deliberate.** The sandbox exports a workspace-global `DATABASE_URL` into every process (the frontend prototype's SQLite file), and real environment variables beat `.env` files — so the backend owns distinct names and can never be shadowed.
- `backend/.env` is gitignored (chmod 600); `.env.example` documents every slot. Real secrets are never committed.
- The Paystack public/secret key pair follows the same pattern as Flutterwave: the **public** key is a browser credential (frontend concern), the **secret** key is the only one the backend reads.
- Test credentials (Flutterwave TEST keys, the dev R2 bucket) live in the same env slots — swap for live values at production cutover; no code changes.
