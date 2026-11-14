CREATE TABLE "BossMoneyRecord" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "recordKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "amountPaise" BIGINT,
    "dailyBudgetPaise" BIGINT,
    "investmentPaise" BIGINT,
    "salesPaise" BIGINT,
    "otherReceiptsPaise" BIGINT,
    "historicalExpensesPaise" BIGINT,
    "adjustmentPaise" BIGINT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BossMoneyRecord_pkey" PRIMARY KEY ("id")
    ,CONSTRAINT "BossMoneyRecord_amountPaise_nonnegative" CHECK ("amountPaise" IS NULL OR "amountPaise" >= 0)
    ,CONSTRAINT "BossMoneyRecord_dailyBudgetPaise_nonnegative" CHECK ("dailyBudgetPaise" IS NULL OR "dailyBudgetPaise" >= 0)
    ,CONSTRAINT "BossMoneyRecord_investmentPaise_nonnegative" CHECK ("investmentPaise" IS NULL OR "investmentPaise" >= 0)
    ,CONSTRAINT "BossMoneyRecord_salesPaise_nonnegative" CHECK ("salesPaise" IS NULL OR "salesPaise" >= 0)
    ,CONSTRAINT "BossMoneyRecord_otherReceiptsPaise_nonnegative" CHECK ("otherReceiptsPaise" IS NULL OR "otherReceiptsPaise" >= 0)
    ,CONSTRAINT "BossMoneyRecord_historicalExpensesPaise_nonnegative" CHECK ("historicalExpensesPaise" IS NULL OR "historicalExpensesPaise" >= 0)
);
CREATE UNIQUE INDEX "BossMoneyRecord_ownerUserId_recordKey_key" ON "BossMoneyRecord"("ownerUserId", "recordKey");
CREATE INDEX "BossMoneyRecord_ownerUserId_kind_updatedAt_idx" ON "BossMoneyRecord"("ownerUserId", "kind", "updatedAt");
ALTER TABLE "BossMoneyRecord" ADD CONSTRAINT "BossMoneyRecord_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
