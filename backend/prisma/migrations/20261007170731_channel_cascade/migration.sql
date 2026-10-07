-- DropForeignKey
ALTER TABLE "CreatorChannel" DROP CONSTRAINT "CreatorChannel_creatorId_fkey";

-- AddForeignKey
ALTER TABLE "CreatorChannel" ADD CONSTRAINT "CreatorChannel_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
