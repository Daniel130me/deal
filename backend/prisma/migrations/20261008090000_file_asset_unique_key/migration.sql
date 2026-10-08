-- One registered asset per stored object: FileAsset.storageKey becomes unique.
-- Seed data verified 8/8 unique before applying (no duplicate risk).
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_storageKey_key" UNIQUE ("storageKey");
