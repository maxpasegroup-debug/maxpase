-- AlterTable
ALTER TABLE "NiceJobsDailyReport" ADD COLUMN "operationalSnapshot" TEXT;

-- CreateTable
CREATE TABLE "NiceJobsLeadPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "allowedSources" TEXT NOT NULL,
    "followupRequiredStates" TEXT NOT NULL,
    "claimAllowed" BOOLEAN NOT NULL DEFAULT false,
    "unassignAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsLeadPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLeadPolicy_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLeadPolicy_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLeadPolicy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsLeadEligibility" (
    "policyId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,

    PRIMARY KEY ("policyId", "versionId"),
    CONSTRAINT "NiceJobsLeadEligibility_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "NiceJobsLeadPolicy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLeadEligibility_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NiceJobsVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "workflowInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "location" TEXT,
    "metadata" TEXT,
    "source" TEXT NOT NULL,
    "externalReference" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "currentWorkerAssignmentId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NiceJobsLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLead_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLead_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "NiceJobsLeadPolicy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLead_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "WorkflowInstance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLead_currentWorkerAssignmentId_fkey" FOREIGN KEY ("currentWorkerAssignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsLeadAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "workerAssignmentId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" DATETIME,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "NiceJobsLeadAssignment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "NiceJobsLead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLeadAssignment_workerAssignmentId_fkey" FOREIGN KEY ("workerAssignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLeadAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsLeadActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "workerAssignmentId" TEXT,
    "kind" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'WORKER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsLeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "NiceJobsLead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLeadActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OperationalEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLeadActivity_workerAssignmentId_fkey" FOREIGN KEY ("workerAssignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsLeadFollowup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "assignmentHistoryId" TEXT NOT NULL,
    "workerAssignmentId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "outcome" TEXT,
    "nextAction" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NiceJobsLeadFollowup_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "NiceJobsLead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLeadFollowup_assignmentHistoryId_fkey" FOREIGN KEY ("assignmentHistoryId") REFERENCES "NiceJobsLeadAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsLeadFollowup_workerAssignmentId_fkey" FOREIGN KEY ("workerAssignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Add a nullable foreign key without rebuilding historical blocker rows.
ALTER TABLE "ExecutionBlocker" ADD COLUMN "niceJobsLeadId" TEXT REFERENCES "NiceJobsLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "NiceJobsLeadPolicy_companyId_divisionId_status_id_idx" ON "NiceJobsLeadPolicy"("companyId", "divisionId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLeadEligibility_versionId_policyId_idx" ON "NiceJobsLeadEligibility"("versionId", "policyId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsLead_workflowInstanceId_key" ON "NiceJobsLead"("workflowInstanceId");

-- CreateIndex
CREATE INDEX "NiceJobsLead_companyId_divisionId_id_idx" ON "NiceJobsLead"("companyId", "divisionId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLead_companyId_divisionId_phone_idx" ON "NiceJobsLead"("companyId", "divisionId", "phone");

-- CreateIndex
CREATE INDEX "NiceJobsLead_companyId_divisionId_email_idx" ON "NiceJobsLead"("companyId", "divisionId", "email");

-- CreateIndex
CREATE INDEX "NiceJobsLead_currentWorkerAssignmentId_priority_id_idx" ON "NiceJobsLead"("currentWorkerAssignmentId", "priority", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLead_policyId_id_idx" ON "NiceJobsLead"("policyId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLead_companyId_divisionId_source_createdAt_id_idx" ON "NiceJobsLead"("companyId", "divisionId", "source", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsLead_companyId_divisionId_source_externalReference_key" ON "NiceJobsLead"("companyId", "divisionId", "source", "externalReference");

-- CreateIndex
CREATE INDEX "NiceJobsLeadAssignment_leadId_status_id_idx" ON "NiceJobsLeadAssignment"("leadId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLeadAssignment_workerAssignmentId_assignedAt_id_idx" ON "NiceJobsLeadAssignment"("workerAssignmentId", "assignedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsLeadActivity_eventId_key" ON "NiceJobsLeadActivity"("eventId");

-- CreateIndex
CREATE INDEX "NiceJobsLeadActivity_leadId_visibility_id_idx" ON "NiceJobsLeadActivity"("leadId", "visibility", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLeadActivity_workerAssignmentId_kind_createdAt_leadId_idx" ON "NiceJobsLeadActivity"("workerAssignmentId", "kind", "createdAt", "leadId");

-- CreateIndex
CREATE INDEX "NiceJobsLeadFollowup_workerAssignmentId_status_scheduledAt_id_idx" ON "NiceJobsLeadFollowup"("workerAssignmentId", "status", "scheduledAt", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLeadFollowup_leadId_status_id_idx" ON "NiceJobsLeadFollowup"("leadId", "status", "id");
