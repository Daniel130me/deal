import { DealStatus } from '@prisma/client';

/**
 * File-domain rules — named constants instead of magic values (todo.md C2).
 * All limits here are policy choices, documented so changing one is a
 * one-line, reviewable decision.
 */

/** Key layout: creators/{creatorId}/deals/{dealId}/{review-sources|final}/{uuid}-{safeName} */
export const KEY_CREATOR_SEGMENT = 'creators';
export const KEY_DEALS_SEGMENT = 'deals';
/** Prisma FileRole -> key folder. FINAL is singular per the plan's key format. */
export const ROLE_FOLDER: Record<'PREVIEW' | 'FINAL', string> = {
  PREVIEW: 'review-sources',
  FINAL: 'final',
};

/** Generated derivatives are isolated from creator originals by key prefix. */
export const PROTECTED_PREVIEW_FOLDER = 'protected-previews';

/**
 * Hard cap for source/final uploads. Kept below PostgreSQL/Prisma's signed Int
 * ceiling while allowing real video masters and archives. Review sources have
 * the much smaller PREVIEW_MAX_INPUT_BYTES processing limit below.
 */
export const MAX_FILE_BYTES = 2_000_000_000;

/** Presigned URL lifetimes. Uploads get longer (big files on slow links). */
export const UPLOAD_URL_TTL_SECONDS = 600;
export const DOWNLOAD_URL_TTL_SECONDS = 300;
/** Client final-file capabilities are intentionally shorter than owner links. */
export const FINAL_DOWNLOAD_URL_TTL_SECONDS = 120;

/** Review-preview policy. These are security/quality controls, not UI hints. */
export const REVIEW_PREVIEW_MIME = 'image/webp' as const;
export const PREVIEW_MAX_DIMENSION = 1400;
export const PREVIEW_IMAGE_QUALITY = 42;
export const PREVIEW_MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const PREVIEW_MAX_INPUT_PIXELS = 40_000_000;
export const REVIEW_SOURCE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

/** Longest filename we keep in a storage key (the original is stored in FileAsset.filename). */
export const SAFE_NAME_MAX = 80;

/**
 * MIME allowlist — the formats a creative workflow produces (images, video,
 * audio, documents, archives). Data-in-code like the craft list: reviewed,
 * explicit, and cheap to extend. Anything else is rejected at upload-url time
 * and re-verified from the stored object at finalize.
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'application/pdf',
  'application/zip',
] as const;

/** Segment after the uuid in a key: {uuid}-{safeName}; safeName = [A-Za-z0-9._-]+ */
export const KEY_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]+$/;

/**
 * When the client may see a generated PREVIEW derivative through the
 * capability link: from the first delivery onward. DISPUTED is included on
 * purpose — a client disputing a delivery must keep access to the review copy.
 */
export const PREVIEW_VISIBLE_STATUSES: readonly DealStatus[] = [
  DealStatus.DELIVERED,
  DealStatus.REVISION,
  DealStatus.APPROVED,
  DealStatus.FILES_RELEASED,
  DealStatus.COMPLETED,
  DealStatus.DISPUTED,
];

/**
 * When the client may download FINAL files: only after the creator released
 * them. FILES_RELEASED/COMPLETED are reachable ONLY through
 * DealsService.releaseFiles, which already enforces approval + full payment —
 * keying the file gate on the status therefore re-uses that single source of
 * truth instead of duplicating escrow logic.
 */
export const FINAL_RELEASED_STATUSES: readonly DealStatus[] = [DealStatus.FILES_RELEASED, DealStatus.COMPLETED];
