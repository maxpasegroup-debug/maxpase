-- CreateTable
CREATE TABLE "NiceJobsIncentivePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "jobVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsIncentivePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsIncentivePolicy_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsIncentivePolicy_jobVersionId_fkey" FOREIGN KEY ("jobVersionId") REFERENCES "NiceJobsVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsIncentiveVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ownerUserId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "reviewedAt" DATETIME,
    "currency" TEXT NOT NULL,
    "effectiveAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    "definition" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsIncentiveVersion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "NiceJobsIncentivePolicy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsIncentiveVersion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsIncentiveVersion_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsIncentiveEarning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" BIGINT,
    "eligibility" TEXT NOT NULL,
    "calculation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CALCULATED',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "creatorUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsIncentiveEarning_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsIncentiveEarning_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "NiceJobsIncentivePolicy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsIncentiveEarning_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "NiceJobsIncentiveVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsIncentiveEarning_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "NiceJobsPerformanceSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsIncentiveEarning_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OperationalRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsIncentiveEarning_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsWallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "creatorUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsWallet_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsWallet_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsWalletAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "privateNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "creatorUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsWalletAdjustment_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "NiceJobsWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsWalletAdjustment_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "NiceJobsIncentiveVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsWalletAdjustment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OperationalRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsWalletAdjustment_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsWalletLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "earningId" TEXT,
    "adjustmentId" TEXT,
    "statementId" TEXT,
    "reversesId" TEXT,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsWalletLedger_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "NiceJobsWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsWalletLedger_earningId_fkey" FOREIGN KEY ("earningId") REFERENCES "NiceJobsIncentiveEarning" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsWalletLedger_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "NiceJobsWalletAdjustment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsWalletLedger_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "NiceJobsSettlementStatement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsWalletLedger_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "NiceJobsWalletLedger" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsWalletLedger_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsSettlementPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "from" DATETIME NOT NULL,
    "until" DATETIME NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "creatorUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "closedAt" DATETIME,
    CONSTRAINT "NiceJobsSettlementPeriod_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "NiceJobsIncentivePolicy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsSettlementPeriod_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "NiceJobsIncentiveVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsSettlementPeriod_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OperationalRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsSettlementPeriod_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsSettlementStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsSettlementStatement_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "NiceJobsSettlementPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsSettlementStatement_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "NiceJobsWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsSettlementLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "statementId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "activeLedgerId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    CONSTRAINT "NiceJobsSettlementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "NiceJobsSettlementStatement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsSettlementLine_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "NiceJobsWalletLedger" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsPayoutIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "statementId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROVIDER_NOT_CONFIGURED',
    "reference" TEXT NOT NULL,
    "providerReference" TEXT,
    "creatorUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsPayoutIntent_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "NiceJobsSettlementStatement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPayoutIntent_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsFinanceException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "walletId" TEXT,
    "code" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsFinanceException_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsFinanceException_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsFinanceException_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "NiceJobsWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsFinanceException_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NiceJobsIncentivePolicy_companyId_divisionId_jobVersionId_id_idx" ON "NiceJobsIncentivePolicy"("companyId", "divisionId", "jobVersionId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsIncentiveVersion_policyId_status_effectiveAt_id_idx" ON "NiceJobsIncentiveVersion"("policyId", "status", "effectiveAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsIncentiveVersion_policyId_number_key" ON "NiceJobsIncentiveVersion"("policyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsIncentiveEarning_requestId_key" ON "NiceJobsIncentiveEarning"("requestId");

-- CreateIndex
CREATE INDEX "NiceJobsIncentiveEarning_assignmentId_status_currency_id_idx" ON "NiceJobsIncentiveEarning"("assignmentId", "status", "currency", "id");

-- CreateIndex
CREATE INDEX "NiceJobsIncentiveEarning_policyVersionId_status_id_idx" ON "NiceJobsIncentiveEarning"("policyVersionId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsIncentiveEarning_assignmentId_policyId_periodStart_periodEnd_key" ON "NiceJobsIncentiveEarning"("assignmentId", "policyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWallet_assignmentId_currency_key" ON "NiceJobsWallet"("assignmentId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletAdjustment_requestId_key" ON "NiceJobsWalletAdjustment"("requestId");

-- CreateIndex
CREATE INDEX "NiceJobsWalletAdjustment_walletId_status_id_idx" ON "NiceJobsWalletAdjustment"("walletId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletLedger_earningId_key" ON "NiceJobsWalletLedger"("earningId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletLedger_adjustmentId_key" ON "NiceJobsWalletLedger"("adjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletLedger_statementId_key" ON "NiceJobsWalletLedger"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletLedger_reversesId_key" ON "NiceJobsWalletLedger"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletLedger_reference_key" ON "NiceJobsWalletLedger"("reference");

-- CreateIndex
CREATE INDEX "NiceJobsWalletLedger_walletId_type_createdAt_id_idx" ON "NiceJobsWalletLedger"("walletId", "type", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSettlementPeriod_requestId_key" ON "NiceJobsSettlementPeriod"("requestId");

-- CreateIndex
CREATE INDEX "NiceJobsSettlementPeriod_policyVersionId_status_from_id_idx" ON "NiceJobsSettlementPeriod"("policyVersionId", "status", "from", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSettlementPeriod_policyId_from_until_key" ON "NiceJobsSettlementPeriod"("policyId", "from", "until");

-- CreateIndex
CREATE INDEX "NiceJobsSettlementStatement_walletId_status_id_idx" ON "NiceJobsSettlementStatement"("walletId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSettlementStatement_periodId_walletId_key" ON "NiceJobsSettlementStatement"("periodId", "walletId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSettlementLine_activeLedgerId_key" ON "NiceJobsSettlementLine"("activeLedgerId");

-- CreateIndex
CREATE INDEX "NiceJobsSettlementLine_ledgerId_idx" ON "NiceJobsSettlementLine"("ledgerId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSettlementLine_statementId_ledgerId_key" ON "NiceJobsSettlementLine"("statementId", "ledgerId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPayoutIntent_statementId_key" ON "NiceJobsPayoutIntent"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPayoutIntent_reference_key" ON "NiceJobsPayoutIntent"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPayoutIntent_providerReference_key" ON "NiceJobsPayoutIntent"("providerReference");

-- CreateIndex
CREATE INDEX "NiceJobsPayoutIntent_status_createdAt_id_idx" ON "NiceJobsPayoutIntent"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsFinanceException_reference_key" ON "NiceJobsFinanceException"("reference");

-- CreateIndex
CREATE INDEX "NiceJobsFinanceException_companyId_divisionId_createdAt_id_idx" ON "NiceJobsFinanceException"("companyId", "divisionId", "createdAt", "id");


-- Posted ledger rows are immutable even through direct database writes.
CREATE TRIGGER nicejobs_wallet_ledger_no_update BEFORE UPDATE ON NiceJobsWalletLedger BEGIN SELECT RAISE(ABORT, 'Posted financial history is immutable'); END;
CREATE TRIGGER nicejobs_wallet_ledger_no_delete BEFORE DELETE ON NiceJobsWalletLedger BEGIN SELECT RAISE(ABORT, 'Posted financial history is immutable'); END;
CREATE TRIGGER nicejobs_wallet_ledger_valid_insert BEFORE INSERT ON NiceJobsWalletLedger WHEN NEW.status <> 'POSTED' OR NEW.amountMinor = 0 OR NEW.currency <> (SELECT currency FROM NiceJobsWallet WHERE id = NEW.walletId) OR (NEW.type = 'CREDIT' AND (NEW.amountMinor < 0 OR NEW.earningId IS NULL)) OR (NEW.type = 'SETTLEMENT' AND (NEW.amountMinor > 0 OR NEW.statementId IS NULL)) OR (NEW.type = 'REVERSAL' AND (NEW.reversesId IS NULL OR NEW.amountMinor <> -(SELECT amountMinor FROM NiceJobsWalletLedger WHERE id = NEW.reversesId) OR NEW.walletId <> (SELECT walletId FROM NiceJobsWalletLedger WHERE id = NEW.reversesId))) BEGIN SELECT RAISE(ABORT, 'Invalid financial ledger entry'); END;
