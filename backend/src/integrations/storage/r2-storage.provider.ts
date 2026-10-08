import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, StoredObjectHead } from './storage-provider';

/** Minimal connection values the adapter needs — sourced from ConfigService.r2. */
export interface R2StorageConfig {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

/**
 * R2StorageProvider — the ADAPTER: Cloudflare R2 spoken through the
 * S3-compatible API (@aws-sdk/client-s3).
 *
 * Notes:
 * - `forcePathStyle: true` — R2 serves buckets as path segments on the
 *   account endpoint (<endpoint>/<bucket>/<key>); it has no virtual-hosted
 *   bucket hostnames.
 * - `region: 'auto'` — R2's documented region value.
 * - Presigning (upload/download URLs) computes an HMAC locally — no network
 *   round-trip, so minting URLs is cheap enough for every request.
 * - A missing object surfaces as different shapes across stores/SDK paths
 *   (NotFound error, NoSuchKey, 404 metadata) — all are normalised to
 *   exists=false instead of leaking as a 500.
 */
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: R2StorageConfig) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async createUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async createDownloadUrl(key: string, expiresInSeconds: number, disposition: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentDisposition: disposition,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async objectHead(key: string): Promise<StoredObjectHead> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return {
        exists: true,
        sizeBytes: head.ContentLength,
        contentType: head.ContentType,
      };
    } catch (error) {
      if (R2StorageProvider.isNotFound(error)) {
        return { exists: false };
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  private static isNotFound(error: unknown): boolean {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404;
  }
}
