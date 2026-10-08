import { DealStatus } from '@prisma/client';

/**
 * File-domain rules — named constants instead of magic values (todo.md C2).
 * All limits here are policy choices, documented so changing one is a
 * one-line, reviewable decision.
 */

/** Key layout: creators/{creatorId}/deals/{dealId}/{previews|final}/{uuid}-{safeName} */
export const KEY_CREATOR_SEGMENT = 'creators';
export const KEY_DEALS_SEGMENT = 'deals';
/** Prisma FileRole -> key folder. FINAL is singular per the plan's key format. */
export const ROLE_FOLDER: Record<'PREVIEW' | 'FINAL', string> = {
  PREVIEW: 'previews',
  FINAL: 'final',
};

/** Hard cap for one uploaded file — generous for 4K video masters, bounded for abuse. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

/** Presigned URL lifetimes. Uploads get longer (big files on slow links). */
export const UPLOAD_URL_TTL_SECONDS = 600;
export const DOWNLOAD_URL_TTL_SECONDS = 300;

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
 * When the client may see/download PREVIEW files through the capability link:
 * from the first delivery onward. DISPUTED is included on purpose — a client
 * disputing a delivery must keep access to the work they are disputing.
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
