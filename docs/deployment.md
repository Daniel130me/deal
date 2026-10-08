# Deployment — DEAL

## Topology

```
Browser ──► CDN/proxy (frontend, static + SPA)
                │  /api/v1/*  (bearer-token API calls)
                ▼
           DEAL API (NestJS, this repo /backend)
                │ Prisma (pooled)        │ S3 API (presigned)      │ HTTPS
                ▼                        ▼                         ▼
         Neon PostgreSQL          Cloudflare R2 (private)   Flutterwave / Paystack
                                                              ▲
   Provider ──► POST /api/v1/webhooks/{flutterwave|paystack} ──┘
```

- **Frontend**: Next.js standalone build (`frontend/`, `bun run build` → `.next/standalone`), served by any Node host/CDN. It is a pure API client (`frontend/src/lib/api/`); all identity, money, and file authority lives server-side.
- **Backend**: `backend/` — one deployable NestJS service. `PORT` (default 3001), global route prefix `/api/v1`, CORS allowlist from `FRONTEND_URL`.
- **Database**: Neon PostgreSQL. Runtime connects through the **pooled** endpoint (`NEON_DATABASE_URL`); migrations run through the **direct** endpoint (`NEON_DIRECT_URL`) because PgBouncer does not support the statement types `prisma migrate` needs.

## Build & run

```bash
# backend
cd backend
bun install
bun run db:migrate        # prisma migrate dev (dev) — or: bun run db:deploy (prod)
bun run db:seed           # demo data; production-guarded
bun run build             # tsc -> dist/
node dist/main.js         # start (PORT, env from environment)

# frontend
cd frontend
bun install
bun run build             # next build (standalone) + static/assets copy
bun run start             # NODE_ENV=production bun .next/standalone/server.js
```

## Production checklist

1. **Env**: every required variable in `docs/environment.md` is set; `NODE_ENV=production` makes `FRONTEND_URL` required + https-pinned (boot refuses otherwise).
2. **Database**: `bun run db:deploy` (never `db:push`); seed only if a demo dataset is actually wanted — the seed refuses to run when it would clobber production-shaped data.
3. **Payments**: swap Flutterwave TEST keys for LIVE keys in the same env slots. If webhook credentials are configured in the Flutterwave dashboard (Settings → Webhooks), set `FLW_WEBHOOK_SECRET_HASH` to the **same** value — the endpoint switches from refusing (503) to verifying with zero code changes. Paystack goes live by supplying `PAYSTACK_SECRET_KEY`.
4. **R2**: the bucket must stay **private** — deal files are served only via short-lived presigned URLs. The `R2_PUBLIC_BASE_URL` slot stays unused unless genuinely public assets (avatars) are introduced.
5. **CORS**: `FRONTEND_URL` must equal the exact browser origin(s). No wildcard support exists.
6. **Secrets**: generated with `openssl rand -base64 48`, file perms 600, never committed.
7. **Logs**: single structured JSON line per request (requestId, method, redacted URL, status, duration). Capability-link tokens are redacted automatically; ship logs to your aggregator as-is.

## Health probes

- `GET /api/v1/health` — liveness (no dependencies).
- `GET /api/v1/health/ready` — readiness; pings the DB (`checks.db`), 503 when down.
- `GET /api/v1/health/detail` — extended diagnostics.

## Known sandbox-only behaviors (not production concerns)

- The preview gateway routes API calls via an `XTransformPort` query param; the frontend strips this automatically in real builds (env-gated).
- Session-spawned test backends are ephemeral in the dev sandbox; production runs under a real supervisor.
