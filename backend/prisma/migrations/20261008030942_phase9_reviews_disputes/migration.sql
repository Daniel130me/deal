-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DealEventType" ADD VALUE 'REVIEW';
ALTER TYPE "DealEventType" ADD VALUE 'DISPUTE_RESOLVED';

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "priorStatus" "DealStatus";

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");
