import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DealStatus, FileRole, type FileAsset } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage-provider';
import { PrismaService } from '../../database/prisma.service';
import { DealsService } from '../deals/deals.service';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  FINAL_RELEASED_STATUSES,
  KEY_DEALS_SEGMENT,
  KEY_CREATOR_SEGMENT,
  KEY_NAME_PATTERN,
  MAX_FILE_BYTES,
  PREVIEW_VISIBLE_STATUSES,
  ROLE_FOLDER,
  SAFE_NAME_MAX,
  UPLOAD_URL_TTL_SECONDS,
} from './files.constants';
import type { CreateUploadUrlDto, FinalizeUploadDto } from './dto/file.dto';

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
 * - Downloads are signed-URL-only, for the owner (their own files, any role)
 *   or the capability-link client (previews once review starts, finals only
 *   after release — see files.constants.ts for the status sets).
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
  ) {}

  // ── Owner (authenticated creator) use cases ─────────────────────────────────

  /** Step 1: mint a namespaced key + presigned PUT. No FileAsset row yet. */
  async createUploadUrl(creatorId: string, dto: CreateUploadUrlDto): Promise<PresignedUpload> {
    // 404 for a missing or foreign deal — the only authorization upload needs;
    // gating happens at download time, not at upload time.
    await this.deals.getOwnedDealContext(creatorId, dto.dealId);

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
        },
      })
      .catch((error: { code?: string }) => {
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
    const file = await this.prisma.fileAsset.findUnique({ where: { id: fileId } });
    if (!file) {
      throw this.fail('FILE_NOT_FOUND', 'File not found', HttpStatus.NOT_FOUND);
    }
    // A missing and a foreign file must be indistinguishable. The deal context
    // check answers "does this deal belong to the caller?" — its 404 is
    // therefore translated to a file 404 so the error CODE cannot leak the
    // difference (statuses alone are compared by callers, codes are printed).
    try {
      await this.deals.getOwnedDealContext(creatorId, file.dealId);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        throw this.fail('FILE_NOT_FOUND', 'File not found', HttpStatus.NOT_FOUND);
      }
      throw error;
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

  /** Token-resolving wrapper: share token -> deal -> gated presigned download. */
  async getSharedDownloadUrlByToken(token: string, fileId: string): Promise<PresignedDownload> {
    const deal = await this.findDealByToken(token);
    return this.getSharedDownloadUrl(deal, fileId);
  }

  /** Whitelisted listing for the share page, filtered by the deal's status gates. */
  async listSharedFiles(dealId: string, status: DealStatus): Promise<SafeFile[]> {
    const files = await this.prisma.fileAsset.findMany({
      where: { dealId },
      orderBy: { createdAt: 'asc' },
    });
    return files
      .filter((file) => this.visibleToClient(file, status))
      .map((file) => this.toSafeFile(file));
  }

  /**
   * Capability-link download. The share token resolved the deal; the file must
   * belong to THAT deal, and its role must pass the status gate. Unreleased or
   * not-yet-visible files return the same 404 shape as a missing file — a
   * capability surface must not confirm the existence of hidden resources.
   */
  async getSharedDownloadUrl(deal: { id: string; status: DealStatus }, fileId: string): Promise<PresignedDownload> {
    const file = await this.prisma.fileAsset.findFirst({ where: { id: fileId, dealId: deal.id } });
    if (!file || !this.visibleToClient(file, deal.status)) {
      throw this.fail(
        'FILE_NOT_FOUND',
        'File not found — it may not be available at this stage of the deal',
        HttpStatus.NOT_FOUND,
      );
    }

    if (file.role === FileRole.FINAL) {
      // Stamp delivery-to-client once. Its own single-row update — no
      // cross-module transaction needed (see class doc for the dependency
      // direction rationale).
      await this.prisma.fileAsset.updateMany({
        where: { id: file.id, releasedAt: null },
        data: { releasedAt: new Date() },
      });
      file.releasedAt = file.releasedAt ?? new Date();
    }

    const downloadUrl = await this.storage.createDownloadUrl(
      file.storageKey,
      DOWNLOAD_URL_TTL_SECONDS,
      // Previews render on the share page; finals are downloads.
      contentDisposition(file.role === FileRole.PREVIEW ? 'inline' : 'attachment', file.filename),
    );
    return { downloadUrl, expiresIn: DOWNLOAD_URL_TTL_SECONDS, file: this.toSafeFile(file) };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Resolve a share token through the deals domain; unknown token = unknown deal. */
  private async findDealByToken(token: string): Promise<{ id: string; status: DealStatus }> {
    const deal = await this.deals.findByShareToken(token);
    if (!deal) {
      throw this.fail('DEAL_NOT_FOUND', 'Deal not found. Check your link.', HttpStatus.NOT_FOUND);
    }
    return { id: deal.id, status: deal.status };
  }

  /** The role gate for the capability surface (see constants for the policy). */
  private visibleToClient(file: Pick<FileAsset, 'role' | 'releasedAt'>, status: DealStatus): boolean {
    return file.role === FileRole.PREVIEW
      ? PREVIEW_VISIBLE_STATUSES.includes(status)
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

  private fail(code: string, message: string, status: HttpStatus): never {
    throw new HttpException({ code, message }, status);
  }
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
