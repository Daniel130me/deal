-- Originals and review derivatives are deliberately stored under different
-- keys. Existing PREVIEW rows remain unavailable to clients until a protected
-- derivative is generated; null therefore means "fail closed", not "use the
-- original".
ALTER TABLE "FileAsset"
  ADD COLUMN "previewStorageKey" TEXT,
  ADD COLUMN "previewSizeBytes" INTEGER,
  ADD COLUMN "previewMime" TEXT,
  ADD COLUMN "previewGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "previewWatermark" TEXT;

CREATE UNIQUE INDEX "FileAsset_previewStorageKey_key"
  ON "FileAsset"("previewStorageKey");

ALTER TABLE "FileAsset"
  ADD CONSTRAINT "FileAsset_preview_derivative_consistency_check"
  CHECK (
    ("previewStorageKey" IS NULL AND "previewSizeBytes" IS NULL AND "previewMime" IS NULL AND "previewGeneratedAt" IS NULL AND "previewWatermark" IS NULL)
    OR
    ("role" = 'PREVIEW' AND "previewStorageKey" IS NOT NULL AND "previewSizeBytes" > 0 AND "previewMime" IS NOT NULL AND "previewGeneratedAt" IS NOT NULL AND "previewWatermark" IS NOT NULL)
  );
