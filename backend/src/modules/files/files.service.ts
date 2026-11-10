import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DealStatus, FileRole, type FileAsset, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage-provider';
import { PrismaService } from '../../database/prisma.service';
import { DealsService } from '../deals/deals.service';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  FINAL_DOWNLOAD_URL_TTL_SECONDS,
  FINAL_RELEASED_STATUSES,
  KEY_DEALS_SEGMENT,
  KEY_CREATOR_SEGMENT,
  KEY_NAME_PATTERN,
  MAX_FILE_BYTES,
  PREVIEW_MAX_INPUT_BYTES,
  PREVIEW_VISIBLE_STATUSES,
  PROTECTED_PREVIEW_FOLDER,
  REVIEW_SOURCE_MIME_TYPES,
  ROLE_FOLDER,
  SAFE_NAME_MAX,
  UPLOAD_URL_TTL_SECONDS,
} from './files.constants';
import type { CreateUploadUrlDto, FinalizeUploadDto } from './dto/file.dto';
import { PreviewGenerator } from './preview-generator';

/** What the API returns for a file. The whitelist projection carries no
 * storageKey/uploadedBy: those stay internal. (A presigned URL necessarily
 * contains the key path inside its signature — it is a signed, time-limited
 * capability, valid only for the exact key and window.) */
export type SafeFile = Pick<FileAsset, 'id' | 'dealId' | 'role' | 'filename' | 'sizeBytes' | 'mime' | 'createdAt'> & {
  releasedAt: Date | null;
};

export interface PresignedUpload {
  uploadUrl: string;
  storageKey: string;
  mime: string;
  /** Seconds the URL stays valid — the client uploads within this window. */
  expiresIn: number;
}

export interface PresignedDownload {
  downloadUrl: string;
  expiresIn: number;
  file: SafeFile;
}

export interface SharedPreview {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}

/**
 * Files domain boundary — owning phase: 7.
 *
 * Owns the FileAsset table and everything about putting bytes in R2 and
 * letting authorized eyes pull them back out:
 *
 * - Uploads are a two-step presigned flow: the client never sends file bytes
 *   to this API. upload-url mints a key INSIDE the caller's namespace
 *   (creators/{theirCreatorId}/deals/{dealId}/{role}/...) and presigns a PUT
 *   whose Content-Type is pinned to the requested mime. finalize re-derives
 *   the namespace prefix server-side, requires the echoed key to sit inside
 *   it, and verifies the stored object (exists, size cap, content type)
 *   before a FileAsset row exists. Nothing is trusted from the client except
 *   the display filename.
 * - Owners receive short-lived signed URLs for their own source files.
 *   Capability-link clients receive only server-generated preview bytes once
 *   review starts; signed final-file URLs exist only after release.
 * - releasedAt is stamped on a final the first time it reaches the client
 *   through the share link. It records delivery-to-client, complementing
 *   Deal.filesReleasedAt (the release decision). Kept inside this service so
 *   the deals -> files dependency stays one-directional (files -> deals for
 *   context, never the reverse).
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly deals: DealsService,
    private readonly previewGenerator: PreviewGenerator,
  ) {}

  // ── Owner (authenticated creator) use cases ─────────────────────────────────

  /** Step 1: mint a namespaced key + presigned PUT. No FileAsset row yet. */
  async createUploadUrl(creatorId: string, dto: CreateUploadUrlDto): Promise<PresignedUpload> {
    // 404 for a missing or foreign deal — the only authorization upload needs;
    // gating happens at download time, not at upload time.
    await this.deals.getOwnedDealContext(creatorId, dto.dealId);

    if (dto.role === FileRole.PREVIEW && !(REVIEW_SOURCE_MIME_TYPES as readonly string[]).includes(dto.mime)) {
      throw this.fail(
        'PREVIEW_FORMAT_UNSUPPORTED',
        'Protected review previews currently support JPEG, PNG, WebP and AVIF images. Upload other formats as final files; originals are never exposed as a fallback.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (dto.role === FileRole.PREVIEW && dto.sizeBytes && dto.sizeBytes > PREVIEW_MAX_INPUT_BYTES) {
      throw this.fail(
        'PREVIEW_SOURCE_TOO_LARGE',
        'Review source is too large to process safely. Export a smaller review source and try again.',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const storageKey = this.buildKey(creatorId, dto.dealId, dto.role, dto.filename);
    const uploadUrl = await this.storage.createUploadUrl(storageKey, dto.mime, UPLOAD_URL_TTL_SECONDS);
    return { uploadUrl, storageKey, mime: dto.mime, expiresIn: UPLOAD_URL_TTL_SECONDS };
  }

  /**
   * Step 2: verify the bytes actually landed as presigned, then register the
   * FileAsset. Every check here re-derives state server-side — the client's
   * only meaningful inputs are the echoed key and a display filename.
   */
  async finalizeUpload(creatorId: string, dto: FinalizeUploadDto): Promise<SafeFile> {
    const deal = await this.deals.getOwnedDealContext(creatorId, dto.dealId);

    // Namespace containment: the key must be one this API could have minted
    // for THIS creator + deal + role. A foreign or hand-shaped key cannot
    // pass, so a client can never register an object they did not upload.
    const expectedPrefix = this.keyPrefix(creatorId, dto.dealId, dto.role);
    if (!dto.storageKey.startsWith(expectedPrefix) || !KEY_NAME_PATTERN.test(this.keyTail(dto.storageKey, expectedPrefix))) {
      throw this.fail(
        'FILE_KEY_INVALID',
        'Unknown upload key — start a new upload and finalize with the returned key',
        HttpStatus.BAD_REQUEST,
      );
    }

    const head = await this.storage.objectHead(dto.storageKey);
    if (!head.exists) {
      // Nothing under the key: the PUT never happened or used wrong headers.
      throw this.fail('FILE_NOT_UPLOADED', 'No uploaded file found for this key — upload it first', HttpStatus.BAD_REQUEST);
    }
    const sizeBytes = head.sizeBytes ?? 0;
    if (sizeBytes < 1) {
      throw this.fail('FILE_EMPTY', 'Uploaded file is empty', HttpStatus.BAD_REQUEST);
    }
    if (sizeBytes > MAX_FILE_BYTES) {
      throw this.fail('FILE_TOO_LARGE', 'File exceeds the maximum supported size', HttpStatus.BAD_REQUEST);
    }
    if (head.contentType !== dto.mime) {
      // The presigned PUT pinned Content-Type; a mismatch means the object
      // under this key is not the upload we minted. Treat as fatal mismatch.
      throw this.fail('FILE_MIME_MISMATCH', 'Uploaded file type does not match the requested type', HttpStatus.BAD_REQUEST);
    }

    if (dto.role === FileRole.PREVIEW && sizeBytes > PREVIEW_MAX_INPUT_BYTES) {
      throw this.fail(
        'PREVIEW_SOURCE_TOO_LARGE',
        'Review source is too large to process safely. Export a smaller review source and try again.',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    let generatedPreview:
      | { storageKey: string; sizeBytes: number; mime: string; watermark: string; generatedAt: Date }
      | undefined;

    if (dto.role === FileRole.PREVIEW) {
      try {
        const source = await this.storage.getObjectBytes(dto.storageKey);
        const generated = await this.previewGenerator.generate(source, {
          creatorName: deal.creator.name,
          creatorHandle: deal.creator.handle,
          dealRef: deal.ref,
          projectTitle: deal.title,
        });
        const previewStorageKey = this.buildPreviewKey(creatorId, deal.id);
        await this.storage.putObject(previewStorageKey, generated.bytes, generated.mime);
        generatedPreview = {
          storageKey: previewStorageKey,
          sizeBytes: generated.bytes.byteLength,
          mime: generated.mime,
          watermark: generated.watermark,
          generatedAt: new Date(),
        };
      } catch {
        throw this.fail(
          'PREVIEW_GENERATION_FAILED',
          'The server could not create a protected preview from this file. Check that the image is valid and try again.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    const file = await this.prisma.fileAsset
      .create({
        data: {
          dealId: deal.id,
          role: dto.role,
          storageKey: dto.storageKey,
          filename: dto.filename,
          sizeBytes,
          mime: dto.mime,
          uploadedBy: creatorId,
          ...(generatedPreview
            ? {
                previewStorageKey: generatedPreview.storageKey,
                previewSizeBytes: generatedPreview.sizeBytes,
                previewMime: generatedPreview.mime,
                previewGeneratedAt: generatedPreview.generatedAt,
                previewWatermark: generatedPreview.watermark,
              }
            : {}),
        },
      })
      .catch(async (error: { code?: string }) => {
        if (generatedPreview) {
          // The object write and database are different systems. Compensating
          // cleanup prevents an unreferenced derivative when registration fails.
          await this.storage.deleteObject(generatedPreview.storageKey).catch(() => undefined);
        }
        if (error.code === 'P2002') {
          // Unique(storageKey): the same object registered twice (double-click
          // on finalize). 409, not 500 — the client already holds the asset.
          throw this.fail('FILE_ALREADY_REGISTERED', 'This file was already registered', HttpStatus.CONFLICT);
        }
        throw error;
      });

    return this.toSafeFile(file);
  }

  /** Owner download: any role, always allowed — it is the creator's own work. */
  async getOwnerDownloadUrl(creatorId: string, fileId: string): Promise<PresignedDownload> {
    // Ownership is part of the lookup so missing and foreign IDs take one
    // query and remain indistinguishable. This avoids a second deal lookup.
    const file = await this.prisma.fileAsset.findFirst({
      where: { id: fileId, deal: { creatorId } },
    });
    if (!file) {
      throw this.fail('FILE_NOT_FOUND', 'File not found', HttpStatus.NOT_FOUND);
    }

    const downloadUrl = await this.storage.createDownloadUrl(
      file.storageKey,
      DOWNLOAD_URL_TTL_SECONDS,
      contentDisposition('attachment', file.filename),
    );
    return { downloadUrl, expiresIn: DOWNLOAD_URL_TTL_SECONDS, file: this.toSafeFile(file) };
  }

  // ── Shared surface (capability-link client) use cases ───────────────────────

  /** Token-resolving wrapper: share token -> deal -> gated listing. */
  async listSharedFilesByToken(token: string): Promise<SafeFile[]> {
    const deal = await this.findDealByToken(token);
    return this.listSharedFiles(deal.id, deal.status);
  }

  /** Token-resolving wrapper: share token -> deal -> gated final-file URL. */
  async getSharedDownloadUrlByToken(token: string, fileId: string): Promise<PresignedDownload> {
    const deal = await this.findDealByToken(token);
    return this.getSharedDownloadUrl(deal, fileId);
  }

  /** Stream-only review derivative. The creator's source key is never used. */
  async getSharedPreviewByToken(token: string, fileId: string): Promise<SharedPreview> {
    const deal = await this.findDealByToken(token);
    const file = await this.prisma.fileAsset.findFirst({
      where: { id: fileId, dealId: deal.id },
      select: { role: true, previewStorageKey: true, previewMime: true, filename: true },
    });
    if (
      !file ||
      file.role !== FileRole.PREVIEW ||
      !this.visibleToClient(file, deal.status) ||
      !file.previewStorageKey ||
      !file.previewMime
    ) {
      throw this.fail(
        'FILE_NOT_FOUND',
        'File not found — it may not be available at this stage of the deal',
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      bytes: await this.storage.getObjectBytes(file.previewStorageKey),
      mime: file.previewMime,
      filename: reviewFilename(file.filename),
    };
  }

  /** Whitelisted listing for the share page, filtered by the deal's status gates. */
  async listSharedFiles(dealId: string, status: DealStatus): Promise<SafeFile[]> {
    const previewsVisible = PREVIEW_VISIBLE_STATUSES.includes(status);
    const finalsVisible = FINAL_RELEASED_STATUSES.includes(status);
    if (!previewsVisible && !finalsVisible) return [];

    let visibility: Prisma.FileAssetWhereInput;
    if (previewsVisible && finalsVisible) {
      visibility = {
        OR: [{ role: FileRole.PREVIEW, previewStorageKey: { not: null } }, { role: FileRole.FINAL }],
      };
    } else if (previewsVisible) {
      visibility = { role: FileRole.PREVIEW, previewStorageKey: { not: null } };
    } else {
      visibility = { role: FileRole.FINAL };
    }

    const files = await this.prisma.fileAsset.findMany({
      where: { dealId, ...visibility },
      orderBy: { createdAt: 'asc' },
    });
    return files.map((file) => this.toSharedSafeFile(file));
  }

  /**
   * Capability-link download. The share token resolved the deal; the file must
   * belong to THAT deal, and its role must pass the status gate. Unreleased or
   * not-yet-visible files return the same 404 shape as a missing file — a
   * capability surface must not confirm the existence of hidden resources.
   */
  async getSharedDownloadUrl(deal: { id: string; status: DealStatus }, fileId: string): Promise<PresignedDownload> {
    const file = await this.prisma.fileAsset.findFirst({ where: { id: fileId, dealId: deal.id } });
    if (!file || file.role !== FileRole.FINAL || !this.visibleToClient(file, deal.status)) {
      throw this.fail(
        'FILE_NOT_FOUND',
        'File not found — it may not be available at this stage of the deal',
        HttpStatus.NOT_FOUND,
      );
    }

    // Stamp delivery-to-client once. Its own single-row update — no
    // cross-module transaction needed (see class doc for the dependency
    // direction rationale).
    const releasedAt = new Date();
    await this.prisma.fileAsset.updateMany({
      where: { id: file.id, releasedAt: null },
      data: { releasedAt },
    });
    file.releasedAt = file.releasedAt ?? releasedAt;

    const downloadUrl = await this.storage.createDownloadUrl(
      file.storageKey,
      FINAL_DOWNLOAD_URL_TTL_SECONDS,
      contentDisposition('attachment', file.filename),
    );
    return { downloadUrl, expiresIn: FINAL_DOWNLOAD_URL_TTL_SECONDS, file: this.toSafeFile(file) };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Resolve a share token through the deals domain; unknown token = unknown deal. */
  private async findDealByToken(token: string): Promise<{ id: string; status: DealStatus }> {
    const deal = await this.deals.findSharedFileContext(token);
    if (!deal) {
      throw this.fail('DEAL_NOT_FOUND', 'Deal not found. Check your link.', HttpStatus.NOT_FOUND);
    }
    return { id: deal.id, status: deal.status };
  }

  /** The role gate for the capability surface (see constants for the policy). */
  private visibleToClient(
    file: Pick<FileAsset, 'role' | 'previewStorageKey'>,
    status: DealStatus,
  ): boolean {
    return file.role === FileRole.PREVIEW
      ? file.previewStorageKey !== null && PREVIEW_VISIBLE_STATUSES.includes(status)
      : FINAL_RELEASED_STATUSES.includes(status);
  }

  private keyPrefix(creatorId: string, dealId: string, role: 'PREVIEW' | 'FINAL'): string {
    return `${KEY_CREATOR_SEGMENT}/${creatorId}/${KEY_DEALS_SEGMENT}/${dealId}/${ROLE_FOLDER[role]}/`;
  }

  private keyTail(storageKey: string, prefix: string): string {
    return storageKey.slice(prefix.length);
  }

  /** creators/{creatorId}/deals/{dealId}/{role folder}/{uuid}-{safeName} */
  private buildKey(creatorId: string, dealId: string, role: 'PREVIEW' | 'FINAL', filename: string): string {
    return `${this.keyPrefix(creatorId, dealId, role)}${randomUUID()}-${sanitizeName(filename)}`;
  }

  private buildPreviewKey(creatorId: string, dealId: string): string {
    return `${KEY_CREATOR_SEGMENT}/${creatorId}/${KEY_DEALS_SEGMENT}/${dealId}/${PROTECTED_PREVIEW_FOLDER}/${randomUUID()}.webp`;
  }

  /** Whitelist projection — storageKey and uploadedBy stay internal. */
  private toSafeFile(file: FileAsset): SafeFile {
    return {
      id: file.id,
      dealId: file.dealId,
      role: file.role,
      filename: file.filename,
      sizeBytes: file.sizeBytes,
      mime: file.mime,
      createdAt: file.createdAt,
      releasedAt: file.releasedAt,
    };
  }

  /** Shared metadata describes the derivative actually sent to the client. */
  private toSharedSafeFile(file: FileAsset): SafeFile {
    const safe = this.toSafeFile(file);
    if (file.role !== FileRole.PREVIEW) return safe;
    return {
      ...safe,
      sizeBytes: file.previewSizeBytes ?? safe.sizeBytes,
      mime: file.previewMime ?? safe.mime,
    };
  }

  private fail(code: string, message: string, status: HttpStatus): never {
    throw new HttpException({ code, message }, status);
  }
}

function reviewFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').trim() || 'review';
  return `${sanitizeName(base)}-review.webp`;
}

/**
 * Reduce a user-supplied filename to the key-safe form: collapse everything
 * outside [A-Za-z0-9._-] (spaces, unicode, path separators, control chars) to
 * '-', trim repeated separators, cap length. Path traversal dies here twice —
 * '..' loses its dots, and namespace containment checks the prefix anyway.
 */
function sanitizeName(filename: string): string {
  const safe = filename
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .slice(0, SAFE_NAME_MAX)
    .replace(/^[-.]+/, '');
  return safe.length > 0 ? safe : 'file';
}

/** Content-Disposition value with the filename reduced to header-safe ASCII. */
function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._ -]+/g, '').trim() || 'download';
  return `${type}; filename="${safe.replace(/"/g, '')}"`;
}
