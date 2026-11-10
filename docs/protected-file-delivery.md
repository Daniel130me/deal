# Protected file delivery

## Security boundary

Creator uploads are source objects. They live in the private R2 bucket under
`review-sources/` or `final/` and are never used as a client review response.
The bucket must have public development URLs and custom public domains disabled;
only the API's R2 credentials may read objects.

For a `PREVIEW` upload, finalization performs a fail-closed server transform:

1. verify the namespaced object, size and declared content type;
2. decode it with bounded input bytes and pixels;
3. resize it to at most 1400 px and encode WebP at quality 42;
4. composite a tiled and central watermark into the pixels;
5. store that derivative under `protected-previews/`;
6. persist both references in one asset-row write, with compensating object
   deletion if that database write fails. R2 and PostgreSQL cannot share a
   transaction, so this compensation is intentional rather than atomic storage.

The watermark contains creator name, handle, deal reference, project title,
`REVIEW COPY`, and `NOT LICENSED`. Repetition across the full frame makes useful
cropping difficult. Metadata is removed during re-encoding.

## Client access

The shared client endpoint streams only the generated derivative:

`GET /api/v1/shared/:token/files/:fileId/preview`

It never returns an R2 URL or the source key and sets `no-store`, `nosniff`,
same-site resource policy and no-index headers. A preview row without a generated
derivative—including legacy rows—returns 404. The old shared download endpoint
now refuses every `PREVIEW` role.

The browser removes download controls and blocks ordinary context-menu/drag
actions. These are deterrents, not a security boundary: anything a browser can
display can be captured with a screenshot, camera, developer tools, or a custom
client. No implementation can truthfully guarantee that a visible watermark is
impossible to remove; the baked, repeated, identity-bearing mark instead makes
removal expensive and misuse attributable.

## Final release

Final originals remain unavailable on the shared surface until the deal reaches
`FILES_RELEASED` or `COMPLETED`. The existing release transition permits this
only after client approval and full payment. Each requested final is then issued
as an attachment through an R2 signed URL with a 120-second lifetime. The first
successful URL request stamps `releasedAt` for auditability. It records that a
download capability was issued, not proof that every byte reached the client.

## Supported review sources

Protected review generation currently accepts JPEG, PNG, WebP and AVIF images,
up to 25 MiB and 40 million decoded pixels. Video, audio, PDF and archive uploads
remain valid as `FINAL` files, but are rejected as `PREVIEW` sources. This is a
deliberate fail-closed limitation; adding those formats requires isolated media
workers (for example FFmpeg and a PDF rasterizer), resource quotas, timeouts and
malware scanning—not a fallback that exposes an original.

Final files are still untrusted creator uploads. Before a production launch
that permits PDF/ZIP downloads, add an asynchronous malware-scanning quarantine
and allow release only after a clean verdict. That requires a scanner service
and worker infrastructure and is deliberately not simulated in application
code.
