/**
 * StorageProvider — the PORT of the storage hexagon (docs/target-architecture.md §5).
 *
 * The files domain depends on this interface, never on S3/R2 SDK types, so the
 * backing store can be swapped (or faked in tests) by replacing one adapter.
 * Contract (implementation-plan Phase 7): createUploadUrl / createDownloadUrl /
 * deleteObject + object metadata for finalize-verify. `objectExists` from the
 * plan is realised as `objectHead` — finalize needs the stored size and
 * content type anyway, and a head that returns metadata subsumes a boolean.
 *
 * All methods are async and may perform network I/O EXCEPT createUploadUrl /
 * createDownloadUrl: presigning is a local signature computation, so minting
 * URLs never blocks on the storage backend.
 */

/** Result of inspecting a stored object (HeadObject). */
export interface StoredObjectHead {
  /** False when nothing exists under the key (HTTP 404 from the store). */
  exists: boolean;
  /** Stored byte count — the server-side truth for finalize-verify. */
  sizeBytes?: number;
  /** Content type recorded at upload time (the presigned PUT pins it). */
  contentType?: string;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageProvider {
  /**
   * A time-limited URL the client PUTs the file bytes to, with exactly the
   * given Content-Type (the signature pins it — a mismatching upload fails).
   */
  createUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;

  /**
   * A time-limited GET URL. `disposition` controls the Content-Disposition the
   * store sends ("inline" for previews, "attachment; filename=..." for finals).
   */
  createDownloadUrl(key: string, expiresInSeconds: number, disposition: string): Promise<string>;

  /** Metadata for one object; exists=false when the key holds nothing. */
  objectHead(key: string): Promise<StoredObjectHead>;

  /** Best-effort permanent delete (cleanup paths); idempotent at the store. */
  deleteObject(key: string): Promise<void>;
}
