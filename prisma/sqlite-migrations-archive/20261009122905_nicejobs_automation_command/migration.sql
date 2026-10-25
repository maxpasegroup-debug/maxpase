-- CreateTable
CREATE TABLE "NiceJobsAutomationVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "definition" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewedByUserId" TEXT,
    "reviewedByPersonId" TEXT,
    "reviewedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsAutomationVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsOperationalException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "nextAction" TEXT NOT NULL,
    "resolutionEvidence" TEXT,
    "acknowledgedByUserId" TEXT,
    "acknowledgedAt" DATETIME,
    "resolvedByUserId" TEXT,
    "resolvedAt" DATETIME,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Preserve canonical automation rows and their existing foreign keys.
ALTER TABLE "AutomationRule" ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "AutomationRule" ADD COLUMN "description" TEXT;
ALTER TABLE "AutomationRule" ADD COLUMN "divisionId" TEXT;
ALTER TABLE "AutomationRun" ADD COLUMN "workflowVersionId" TEXT REFERENCES "NiceJobsAutomationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD COLUMN "sourceEventId" TEXT;
ALTER TABLE "AutomationRun" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "AutomationRun" ADD COLUMN "actorUserId" TEXT;
ALTER TABLE "AutomationRun" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AutomationRun" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "AutomationRun" ADD COLUMN "nextRetryAt" DATETIME;
ALTER TABLE "AutomationRun" ADD COLUMN "failureClass" TEXT;
ALTER TABLE "AutomationRun" ADD COLUMN "startedAt" DATETIME;
ALTER TABLE "AutomationRun" ADD COLUMN "finishedAt" DATETIME;
ALTER TABLE "AutomationRun" ADD COLUMN "evidence" TEXT;
CREATE INDEX "AutomationRun_ruleId_status_nextRetryAt_id_idx" ON "AutomationRun"("ruleId", "status", "nextRetryAt", "id");
CREATE INDEX "AutomationRun_sourceEventId_ruleId_idx" ON "AutomationRun"("sourceEventId", "ruleId");

-- CreateIndex
CREATE INDEX "NiceJobsAutomationVersion_ruleId_status_number_idx" ON "NiceJobsAutomationVersion"("ruleId", "status", "number");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsAutomationVersion_ruleId_number_key" ON "NiceJobsAutomationVersion"("ruleId", "number");

-- CreateIndex
CREATE INDEX "NiceJobsOperationalException_companyId_divisionId_status_detectedAt_id_idx" ON "NiceJobsOperationalException"("companyId", "divisionId", "status", "detectedAt", "id");

-- CreateIndex
CREATE INDEX "NiceJobsOperationalException_ownerUserId_status_id_idx" ON "NiceJobsOperationalException"("ownerUserId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOperationalException_companyId_sourceKey_key" ON "NiceJobsOperationalException"("companyId", "sourceKey");

CREATE TRIGGER "NiceJobsAutomationPublishedMaterialImmutable" BEFORE UPDATE OF "definition", "ruleId", "number", "reviewedByUserId", "reviewedByPersonId", "reviewedAt", "publishedAt" ON "NiceJobsAutomationVersion"
WHEN OLD."publishedAt" IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'published automation material is immutable'); END;
CREATE TRIGGER "NiceJobsAutomationPublishedDeleteForbidden" BEFORE DELETE ON "NiceJobsAutomationVersion"
WHEN OLD."publishedAt" IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'published automation cannot be deleted'); END;
