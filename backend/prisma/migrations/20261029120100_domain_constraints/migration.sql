-- Prisma cannot express CHECK or partial-unique constraints. Keep the database
-- as the final integrity boundary so imports, scripts, and future services
-- cannot bypass the same rules enforced by DTOs.

ALTER TABLE "Service"
  ADD CONSTRAINT "Service_startingPriceMinor_positive" CHECK ("startingPriceMinor" > 0);

ALTER TABLE "ClientRequest"
  ADD CONSTRAINT "ClientRequest_budgetMinMinor_nonnegative" CHECK ("budgetMinMinor" IS NULL OR "budgetMinMinor" >= 0),
  ADD CONSTRAINT "ClientRequest_budgetMaxMinor_nonnegative" CHECK ("budgetMaxMinor" IS NULL OR "budgetMaxMinor" >= 0),
  ADD CONSTRAINT "ClientRequest_budget_range_valid" CHECK (
    "budgetMinMinor" IS NULL OR "budgetMaxMinor" IS NULL OR "budgetMinMinor" <= "budgetMaxMinor"
  );

ALTER TABLE "Deal"
  ADD CONSTRAINT "Deal_priceMinor_nonnegative" CHECK ("priceMinor" >= 0),
  ADD CONSTRAINT "Deal_depositPercent_range" CHECK ("depositPercent" BETWEEN 1 AND 100),
  ADD CONSTRAINT "Deal_installmentsCount_range" CHECK ("installmentsCount" BETWEEN 0 AND 24),
  ADD CONSTRAINT "Deal_revisions_range" CHECK ("revisions" BETWEEN 0 AND 20),
  ADD CONSTRAINT "Deal_date_range_valid" CHECK ("startDate" IS NULL OR "dueDate" IS NULL OR "startDate" <= "dueDate");

ALTER TABLE "DealPayment"
  ADD CONSTRAINT "DealPayment_amountMinor_positive" CHECK ("amountMinor" > 0);

ALTER TABLE "PaymentTransaction"
  ADD CONSTRAINT "PaymentTransaction_amountMinor_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "PaymentTransaction_currency_iso_length" CHECK (char_length("currency") = 3);

ALTER TABLE "FileAsset"
  -- Prisma maps this field to a signed 32-bit integer. 2 GB leaves headroom
  -- below that ceiling and supports real video/archive deliverables.
  ADD CONSTRAINT "FileAsset_sizeBytes_range" CHECK ("sizeBytes" BETWEEN 1 AND 2000000000);

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

CREATE UNIQUE INDEX "CreatorChannel_one_primary_per_creator"
  ON "CreatorChannel" ("creatorId") WHERE "isPrimary" = true;

CREATE UNIQUE INDEX "PayoutAccount_one_default_per_user"
  ON "PayoutAccount" ("userId") WHERE "isDefault" = true;
