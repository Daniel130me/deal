# R2 File Storage — DEAL

## Posture

Deal deliverables live in a **private** Cloudflare R2 bucket. Bytes never touch the API: uploads are direct-to-R2 via presigned PUT, downloads via short-lived presigned GET. Public bucket hosts are **not** used for deal files — every access is a signed, time-limited, server-minted URL.

## Configuration

All via environment (see `environment.md`): `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_S3_ENDPOINT` (https-pinned). `R2_PUBLIC_BASE_URL` is optional and **reserved** for genuinely public assets (e.g. avatars) — nothing in the deal-file path reads it. The bucket must remain private.

## Key layout & namespace containment

```
{creatorId}/{dealId}/{role}/{uuid}.{safename}
         ^server-derived     ^uuid-shape enforced
```

- The prefix is **re-derived server-side** from the token-verified creator and the ownership-checked deal at finalize — a client cannot register an object outside its own namespace.
- The basename must match a uuid + safename pattern; everything else is `400` before any storage call.

## Upload flow

1. `POST /api/v1/files/upload-url` (bearer) — validates role/parent, mime **allowlist**, size bound, filename length; mints a presigned PUT whose URL **pins the Content-Type**, cryptographically binding the object to the requested mime.
2. Browser PUTs the bytes straight to R2.
3. `POST /api/v1/files/finalize` — the server **heads the stored object live**: exists / not empty / ≤ 200 MB / content-type matches the requested mime. Only then does the `FileAsset` row exist. Double finalize → `409`, not a second asset. `storageKey` and `uploadedBy` are server-only fields (never in any projection).

## Download & gating

- `GET .../download-url` mints a **300-second signed URL**; the object's disposition is chosen server-side per role (previews render inline, finals download).
- Gates, enforced server-side in both owner and capability surfaces (and re-checked inside transactions where raced):
  - `PREVIEW` files: visible to the client once the deal is being worked (preview-visible statuses).
  - `FINAL` files: locked until the deal is **fully paid AND the creator releases files** (`FILES_RELEASED` gate) — gated files answer the same `404` as missing ones (no existence disclosure).
  - Foreign downloads translate to `FILE_NOT_FOUND` so even error codes can't leak existence.

## Development note

The current R2 credentials are **development credentials** (test bucket `dtg`); rotate them before production. The finalize live-head check means stale keys fail loudly, not silently.
