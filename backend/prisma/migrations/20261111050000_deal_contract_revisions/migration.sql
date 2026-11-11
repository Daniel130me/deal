ALTER TYPE "DealEventType" ADD VALUE IF NOT EXISTS 'CONTRACT_UPDATED';
ALTER TYPE "DealEventType" ADD VALUE IF NOT EXISTS 'CONTRACT_REVERTED';

ALTER TABLE "Deal"
  ADD COLUMN "contractVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "publishedContract" JSONB;

CREATE TABLE "DealContractRevision" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealContractRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealContractRevision_dealId_version_key"
  ON "DealContractRevision"("dealId", "version");
CREATE INDEX "DealContractRevision_dealId_createdAt_idx"
  ON "DealContractRevision"("dealId", "createdAt");

ALTER TABLE "DealContractRevision"
  ADD CONSTRAINT "DealContractRevision_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
