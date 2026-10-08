import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { STORAGE_PROVIDER, type StorageProvider } from '../src/integrations/storage/storage-provider';
import { createApp } from '../src/app';

/**
 * Phase 7 acceptance: R2 file storage exercised against the real app + live
 * Neon + the REAL R2 bucket (skips when DB/secret/R2 envs are missing).
 *
 * Matrix covered: presigned upload-url authorization + validation, canonical
 * key shape inside the caller's namespace, namespace-escape rejection at
 * finalize, not-yet-uploaded / empty / mime-mismatch verification, a REAL
 * browser-parity PUT through the presigned URL (png preview + mp4 final),
 * duplicate finalize 409, owner downloads (any role) + foreign 404, the
 * capability-link gating (previews from first delivery, finals only after
 * release via fixture payments -> release-files), releasedAt stamping on
 * first client download, cross-deal file access 404, unknown token 404.
 *
 * Every object created in the bucket is tracked and deleted in afterAll.
 */

const dbConfigured = typeof process.env.NEON_DATABASE_URL === 'string';
const secretConfigured =
  typeof process.env.JWT_ACCESS_SECRET === 'string' && process.env.JWT_ACCESS_SECRET.length >= 32;
const r2Configured =
  typeof process.env.R2_BUCKET === 'string' &&
  typeof process.env.R2_S3_ENDPOINT === 'string' &&
  typeof process.env.R2_ACCESS_KEY_ID === 'string';

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
const RUN36 = Date.now().toString(36) + Math.floor(Math.random() * 1_296).toString(36);
const EMAIL_A = `file-test-${RUN}-a@deal.test`;
const EMAIL_B = `file-test-${RUN}-b@deal.test`;
const PASSWORD = 'CorrectHorse1!';
const HANDLE_A = `filer-${RUN36}`;
const HANDLE_B = `peer-${RUN36}`;

/** Tiny byte payloads — R2 stores bytes verbatim, mime comes from headers. */
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
const MP4_BYTES = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50, 1, 2, 3, 4, 5, 6, 7, 8]);

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string };
}

describe.skipIf(!dbConfigured || !secretConfigured || !r2Configured)('file storage (integration, e2e)', () => {
  /** Neon round-trips + R2 I/O cost 0.2-2s — generous headroom per test. */
  const timed = (name: string, fn: () => Promise<void>, ms = 30_000) => it(name, fn, ms);
  let app: INestApplication;
  let baseUrl: string;
  let a: Session;
  let b: Session;
  let db: PrismaClient;
  let storage: StorageProvider;

  /** Every storage key minted by the suite — deleted from the bucket in afterAll. */
  const trackedKeys = new Set<string>();
  const track = (key: string) => {
    trackedKeys.add(key);
    return key;
  };

  let dealA: { id: string; shareToken: string };
  let dealA2: { id: string };
  let previewFile: { fileId: string; storageKey: string };
  let finalFile: { fileId: string; storageKey: string };
  /** Key of an intentionally mismatched upload (object exists, asset never registered) — tracked via track(). */

  const call = async (
    method: string,
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<{ status: number; body: Envelope<Record<string, unknown>> }> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Envelope<Record<string, unknown>> };
  };

  /** The browser-parity half of the upload flow: PUT bytes to the presigned URL. */
  const putBytes = async (uploadUrl: string, bytes: Uint8Array, mime: string): Promise<number> => {
    const res = await fetch(uploadUrl, { method: 'PUT', body: bytes, headers: { 'Content-Type': mime } });
    return res.status;
  };

  const mintAndUpload = async (
    token: string,
    dealId: string,
    role: 'PREVIEW' | 'FINAL',
    filename: string,
    mime: string,
    bytes: Uint8Array,
  ): Promise<{ fileId: string; storageKey: string }> => {
    const mint = await call('POST', '/api/v1/files/upload-url', { dealId, role, filename, mime }, token);
    expect(mint.status).toBe(201);
    const upload = mint.body.data!.upload as { uploadUrl: string; storageKey: string };
    track(upload.storageKey);
    expect(await putBytes(upload.uploadUrl, bytes, mime)).toBe(200);
    const fin = await call(
      'POST',
      '/api/v1/files/finalize',
      { dealId, role, filename, mime, storageKey: upload.storageKey },
      token,
    );
    expect(fin.status).toBe(201);
    return { fileId: (fin.body.data!.file as { id: string }).id, storageKey: upload.storageKey };
  };

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0); // ephemeral port
    baseUrl = await app.getUrl();
    storage = app.get<StorageProvider>(STORAGE_PROVIDER);

    const signupA = await call('POST', '/api/v1/auth/signup', { email: EMAIL_A, password: PASSWORD });
    const signupB = await call('POST', '/api/v1/auth/signup', { email: EMAIL_B, password: PASSWORD });
    a = signupA.body.data as unknown as Session;
    b = signupB.body.data as unknown as Session;

    await call('POST', '/api/v1/creators/me', { name: 'Filer A', handle: HANDLE_A, craft: 'Photographer' }, a.accessToken);
    await call('POST', '/api/v1/creators/me', { name: 'Peer B', handle: HANDLE_B, craft: 'Videographer' }, b.accessToken);

    // Deal with real commercial terms so the release gate can be driven end-to-end.
    const deal = await call('POST', '/api/v1/deals', { title: `Files deal ${RUN}` }, a.accessToken);
    dealA = deal.body.data!.deal as { id: string; shareToken: string };
    await call(
      'PATCH',
      `/api/v1/deals/${dealA.id}`,
      { priceMinor: 60_000, depositPercent: 50, clientName: 'Client', clientContact: 'client@x.ng' },
      a.accessToken,
    );

    // A second deal for the cross-deal access probe.
    const deal2 = await call('POST', '/api/v1/deals', { title: `Other deal ${RUN}` }, a.accessToken);
    dealA2 = deal2.body.data!.deal as { id: string };

    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient({ datasources: { db: { url: process.env.NEON_DATABASE_URL } } });
  }, 60_000);

  afterAll(async () => {
    // Bucket hygiene first (independent of DB state).
    for (const key of trackedKeys) {
      await storage.deleteObject(key).catch(() => undefined);
    }
    await app.close();
    await db.dealPayment.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dealEvent.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dealDeliverable.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dealDelivery.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.fileAsset.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.dispute.deleteMany({ where: { deal: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } } });
    await db.deal.deleteMany({ where: { creator: { handle: { in: [HANDLE_A, HANDLE_B] } } } });
    await db.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
    await db.$disconnect();
  });

  // ── upload-url ───────────────────────────────────────────────────────────────

  timed('upload-url requires a bearer token', async () => {
    const { status, body } = await call('POST', '/api/v1/files/upload-url', {
      dealId: dealA.id,
      role: 'PREVIEW',
      filename: 'x.png',
      mime: 'image/png',
    });
    expect(status).toBe(401);
    expect(body.error!.code).toBe('TOKEN_INVALID');
  });

  timed('upload-url rejects unsupported mime, bad role, unknown fields and absurd sizes', async () => {
    for (const payload of [
      { dealId: dealA.id, role: 'PREVIEW', filename: 'x.exe', mime: 'application/x-msdownload' },
      { dealId: dealA.id, role: 'ATTACHMENT', filename: 'x.png', mime: 'image/png' },
      { dealId: dealA.id, role: 'PREVIEW', filename: 'x.png', mime: 'image/png', evil: true },
      { dealId: dealA.id, role: 'PREVIEW', filename: 'x.png', mime: 'image/png', sizeBytes: 999_999_999 },
    ]) {
      const { status, body } = await call('POST', '/api/v1/files/upload-url', payload, a.accessToken);
      expect(status).toBe(400);
      expect(body.error!.code).toBe('VALIDATION_ERROR');
    }
  });

  timed('upload-url on a foreign deal is the same 404 as a missing one', async () => {
    const { status, body } = await call(
      'POST',
      '/api/v1/files/upload-url',
      { dealId: dealA.id, role: 'PREVIEW', filename: 'x.png', mime: 'image/png' },
      b.accessToken,
    );
    expect(status).toBe(404);
    expect(body.error!.code).toBe('DEAL_NOT_FOUND');
  });

  timed('upload-url mints a namespaced, canonical key', async () => {
    const profile = await db.creatorProfile.findFirstOrThrow({ where: { handle: HANDLE_A }, select: { id: true } });
    const { status, body } = await call(
      'POST',
      '/api/v1/files/upload-url',
      { dealId: dealA.id, role: 'PREVIEW', filename: 'behind the scenes!.png', mime: 'image/png' },
      a.accessToken,
    );
    expect(status).toBe(201);
    const upload = body.data!.upload as { uploadUrl: string; storageKey: string; mime: string; expiresIn: number };
    track(upload.storageKey);
    // Pattern per plan: creators/{creatorId}/deals/{dealId}/{previews|final}/{uuid}-{safeName}
    expect(upload.storageKey).toMatch(
      new RegExp(`^creators/${profile.id}/deals/${dealA.id}/previews/[0-9a-f-]{36}-[A-Za-z0-9._-]+$`),
    );
    // Unsafe characters were reduced, never carried through.
    expect(upload.storageKey).toContain('behind-the-scenes-.png');
    expect(upload.uploadUrl.startsWith(process.env.R2_S3_ENDPOINT!)).toBe(true);
    expect(upload.mime).toBe('image/png');
  });

  // ── finalize verification ────────────────────────────────────────────────────

  timed('finalize rejects keys outside the caller namespace or shape', async () => {
    for (const storageKey of [
      `creators/someone-else/deals/${dealA.id}/previews/evil.png`, // foreign namespace
      `creators/x/deals/${dealA.id}/final/handmade.png`, // no uuid segment
      `creators/x/deals/${dealA.id}/previews/../../evil.png`, // traversal attempt
    ]) {
      const { status, body } = await call(
        'POST',
        '/api/v1/files/finalize',
        { dealId: dealA.id, role: 'PREVIEW', filename: 'evil.png', mime: 'image/png', storageKey },
        a.accessToken,
      );
      expect(status).toBe(400);
      expect(body.error!.code).toBe('FILE_KEY_INVALID');
    }
  });

  timed('finalize with an un-uploaded key reports FILE_NOT_UPLOADED (live R2 head)', async () => {
    const mint = await call(
      'POST',
      '/api/v1/files/upload-url',
      { dealId: dealA.id, role: 'PREVIEW', filename: 'never-uploaded.png', mime: 'image/png' },
      a.accessToken,
    );
    const { storageKey } = mint.body.data!.upload as { storageKey: string };
    track(storageKey);
    const { status, body } = await call(
      'POST',
      '/api/v1/files/finalize',
      { dealId: dealA.id, role: 'PREVIEW', filename: 'never-uploaded.png', mime: 'image/png', storageKey },
      a.accessToken,
    );
    expect(status).toBe(400);
    expect(body.error!.code).toBe('FILE_NOT_UPLOADED');
  });

  timed('finalize detects a stored content type that differs from the requested one', async () => {
    const mint = await call(
      'POST',
      '/api/v1/files/upload-url',
      { dealId: dealA.id, role: 'PREVIEW', filename: 'mismatch.png', mime: 'image/png' },
      a.accessToken,
    );
    const upload = mint.body.data!.upload as { uploadUrl: string; storageKey: string };
    track(upload.storageKey);
    expect(await putBytes(upload.uploadUrl, PNG_BYTES, 'image/png')).toBe(200);
    // Registered as a pdf although the object stores a png — the head check
    // catches it: the object under this key is not what was asked for.
    const { status, body } = await call(
      'POST',
      '/api/v1/files/finalize',
      { dealId: dealA.id, role: 'PREVIEW', filename: 'mismatch.pdf', mime: 'application/pdf', storageKey: upload.storageKey },
      a.accessToken,
    );
    expect(status).toBe(400);
    expect(body.error!.code).toBe('FILE_MIME_MISMATCH');
  });

  timed('real upload -> finalize -> safe projection (preview)', async () => {
    previewFile = await mintAndUpload(a.accessToken, dealA.id, 'PREVIEW', 'rink proof.png', 'image/png', PNG_BYTES);
    const detail = await call('GET', `/api/v1/files/${previewFile.fileId}/download-url`, undefined, a.accessToken);
    const download = detail.body.data!.download as { downloadUrl: string; file: Record<string, unknown> };
    // Server-side truth for size; the whitelist projection never carries the
    // key or uploader. (The presigned URL itself contains the key path inside
    // its signature — that is the signed capability, by design.)
    expect(download.file.sizeBytes).toBe(PNG_BYTES.byteLength);
    expect(download.file).not.toHaveProperty('storageKey');
    expect(download.file).not.toHaveProperty('uploadedBy');
    expect(JSON.stringify(download.file)).not.toContain('storageKey');
  });

  timed('duplicate finalize is a 409, not a second asset', async () => {
    const { status, body } = await call(
      'POST',
      '/api/v1/files/finalize',
      { dealId: dealA.id, role: 'PREVIEW', filename: 'rink proof.png', mime: 'image/png', storageKey: previewFile.storageKey },
      a.accessToken,
    );
    expect(status).toBe(409);
    expect(body.error!.code).toBe('FILE_ALREADY_REGISTERED');
  });

  timed('real upload -> finalize of the final deliverable', async () => {
    finalFile = await mintAndUpload(a.accessToken, dealA.id, 'FINAL', 'final cut.mp4', 'video/mp4', MP4_BYTES);
    expect(finalFile.fileId).toBeTruthy();
  });

  // ── owner downloads ─────────────────────────────────────────────────────────

  timed('owner can download their own preview and final (signed URLs only)', async () => {
    for (const file of [previewFile, finalFile]) {
      const { status, body } = await call('GET', `/api/v1/files/${file.fileId}/download-url`, undefined, a.accessToken);
      expect(status).toBe(200);
      const download = body.data!.download as { downloadUrl: string; expiresIn: number };
      expect(download.downloadUrl.startsWith(process.env.R2_S3_ENDPOINT!)).toBe(true);
      expect(download.expiresIn).toBe(300);
    }
  });

  timed('foreign file download is the same 404 as a missing one', async () => {
    const { status, body } = await call(
      'GET',
      `/api/v1/files/${previewFile.fileId}/download-url`,
      undefined,
      b.accessToken,
    );
    expect(status).toBe(404);
    expect(body.error!.code).toBe('FILE_NOT_FOUND');
  });

  // ── capability-link (shared) gating ────────────────────────────────────────

  timed('share page lists nothing before delivery, even with previews attached', async () => {
    const { status, body } = await call('GET', `/api/v1/shared/${dealA.shareToken}/files`);
    expect(status).toBe(200);
    expect(body.data!.files).toEqual([]);
  });

  timed('preview download before delivery is a non-committal 404', async () => {
    const { status, body } = await call('GET', `/api/v1/shared/${dealA.shareToken}/files/${previewFile.fileId}/download-url`);
    expect(status).toBe(404);
    expect(body.error!.code).toBe('FILE_NOT_FOUND');
  });

  timed('drive the deal: send -> deposit fixture -> deliver', async () => {
    const send = await call('POST', `/api/v1/deals/${dealA.id}/actions`, { action: 'send' }, a.accessToken);
    expect(send.status).toBe(200);
    const now = new Date();
    await db.deal.update({ where: { id: dealA.id }, data: { status: 'ACTIVE', acceptedAt: now, depositPaidAt: now } });
    await db.dealPayment.create({
      data: {
        dealId: dealA.id,
        type: 'DEPOSIT',
        label: 'Deposit (50%)',
        amountMinor: 30_000,
        method: 'CARD',
        provider: 'PAYSTACK',
        reference: `PSK-FILE-${RUN}-${dealA.id.slice(-6)}`,
        escrowStatus: 'HELD',
        paidAt: now,
      },
    });
    const deliver = await call('POST', `/api/v1/deals/${dealA.id}/actions`, { action: 'deliver' }, a.accessToken);
    expect(deliver.status).toBe(200);
  });

  timed('previews become visible to the client from DELIVERED (inline disposition)', async () => {
    const list = await call('GET', `/api/v1/shared/${dealA.shareToken}/files`);
    expect(list.status).toBe(200);
    const files = list.body.data!.files as { id: string; role: string; filename: string }[];
    // Only the preview — the final stays hidden until release.
    expect(files.map((f) => f.id)).toEqual([previewFile.fileId]);
    expect(files[0]!.filename).toBe('rink proof.png');
    expect(JSON.stringify(list.body)).not.toContain('storageKey');

    const dl = await call('GET', `/api/v1/shared/${dealA.shareToken}/files/${previewFile.fileId}/download-url`);
    expect(dl.status).toBe(200);
    const download = dl.body.data!.download as { downloadUrl: string };
    // Previews render on the share page — the signed URL carries inline disposition.
    expect(decodeURIComponent(download.downloadUrl)).toContain('response-content-disposition=inline');
  });

  timed('final download before release is a non-committal 404', async () => {
    const { status, body } = await call('GET', `/api/v1/shared/${dealA.shareToken}/files/${finalFile.fileId}/download-url`);
    expect(status).toBe(404);
    expect(body.error!.code).toBe('FILE_NOT_FOUND');
  });

  timed('cross-deal file access through a share token is a 404', async () => {
    // DB-fixture asset on the OTHER deal (no R2 object needed — the gate
    // rejects before any presign happens).
    await db.fileAsset.create({
      data: {
        dealId: dealA2.id,
        role: 'FINAL',
        storageKey: `creators/x/deals/${dealA2.id}/final/fixture-${RUN}.mp4`,
        filename: 'other-deal.mp4',
        sizeBytes: 10,
        mime: 'video/mp4',
        uploadedBy: 'fixture',
      },
    });
    const row = await db.fileAsset.findFirstOrThrow({ where: { storageKey: { contains: `fixture-${RUN}.mp4` } } });
    const { status, body } = await call('GET', `/api/v1/shared/${dealA.shareToken}/files/${row.id}/download-url`);
    expect(status).toBe(404);
    expect(body.error!.code).toBe('FILE_NOT_FOUND');
  });

  timed('unknown share token is a 404', async () => {
    const { status, body } = await call('GET', '/api/v1/shared/not-a-real-token/files');
    expect(status).toBe(404);
    expect(body.error!.code).toBe('DEAL_NOT_FOUND');
  });

  timed('release gate: approve needs full payment; release unlocks finals', async () => {
    const approve = await call('POST', `/api/v1/shared/${dealA.shareToken}/actions`, { action: 'approve' });
    expect(approve.status).toBe(200);

    // Owner cannot release before full payment — the deal gate still rules.
    const early = await call('POST', `/api/v1/deals/${dealA.id}/actions`, { action: 'release-files' }, a.accessToken);
    expect(early.status).toBe(409);
    expect(early.body.error!.code).toBe('DEAL_NOT_FULLY_PAID');

    // Balance fixture -> release.
    await db.dealPayment.create({
      data: {
        dealId: dealA.id,
        type: 'BALANCE',
        label: 'Balance payment',
        amountMinor: 30_000,
        method: 'CARD',
        provider: 'PAYSTACK',
        reference: `PSK-FILE-${RUN}-bal`,
        escrowStatus: 'RELEASED',
        paidAt: new Date(),
      },
    });
    const release = await call('POST', `/api/v1/deals/${dealA.id}/actions`, { action: 'release-files' }, a.accessToken);
    expect(release.status).toBe(200);
  });

  timed('after release the client downloads the final; releasedAt stamps on first delivery', async () => {
    const before = await db.fileAsset.findUniqueOrThrow({ where: { id: finalFile.fileId }, select: { releasedAt: true } });
    expect(before.releasedAt).toBeNull();

    const dl = await call('GET', `/api/v1/shared/${dealA.shareToken}/files/${finalFile.fileId}/download-url`);
    expect(dl.status).toBe(200);
    const download = dl.body.data!.download as { downloadUrl: string; file: { releasedAt: string | null } };
    // Finals are downloads, not inline renders.
    expect(decodeURIComponent(download.downloadUrl)).toContain('response-content-disposition=attachment');

    const after = await db.fileAsset.findUniqueOrThrow({ where: { id: finalFile.fileId }, select: { releasedAt: true } });
    expect(after.releasedAt).not.toBeNull();
    expect(download.file.releasedAt).not.toBeNull();
  });
});
