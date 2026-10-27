-- CreateTable
CREATE TABLE "NiceJobsPerformanceFramework" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "jobVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsPerformanceFramework_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPerformanceFramework_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPerformanceFramework_jobVersionId_fkey" FOREIGN KEY ("jobVersionId") REFERENCES "NiceJobsVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsPerformanceVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "frameworkId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ownerUserId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "effectiveAt" DATETIME NOT NULL,
    "definition" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsPerformanceVersion_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "NiceJobsPerformanceFramework" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPerformanceVersion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsPerformanceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "frameworkVersionId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "supersedesId" TEXT,
    "correctionReason" TEXT,
    "results" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsPerformanceSnapshot_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPerformanceSnapshot_frameworkVersionId_fkey" FOREIGN KEY ("frameworkVersionId") REFERENCES "NiceJobsPerformanceVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPerformanceSnapshot_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "NiceJobsPerformanceSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPerformanceSnapshot_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsPerformanceReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "privateNote" TEXT,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "followup" TEXT,
    "supportTaskId" TEXT,
    "acknowledgedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsPerformanceReview_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "NiceJobsPerformanceSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPerformanceReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPerformanceReview_supportTaskId_fkey" FOREIGN KEY ("supportTaskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsPerformanceAttention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "NiceJobsPerformanceAttention_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "NiceJobsPerformanceSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsPip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "workerMessage" TEXT NOT NULL,
    "privateNote" TEXT,
    "objectives" TEXT NOT NULL,
    "supportActions" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "reviewAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "requiredAck" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" DATETIME,
    "outcome" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsPip_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPip_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "NiceJobsPerformanceSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPip_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsPipReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pipId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "progress" TEXT,
    "comment" TEXT NOT NULL,
    "privateNote" TEXT,
    "evidence" TEXT NOT NULL,
    "nextAction" TEXT,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "changeSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsPipReview_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "NiceJobsPip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsPipReview_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceFramework_companyId_divisionId_jobVersionId_id_idx" ON "NiceJobsPerformanceFramework"("companyId", "divisionId", "jobVersionId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceVersion_frameworkId_status_effectiveAt_id_idx" ON "NiceJobsPerformanceVersion"("frameworkId", "status", "effectiveAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPerformanceVersion_frameworkId_number_key" ON "NiceJobsPerformanceVersion"("frameworkId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPerformanceSnapshot_supersedesId_key" ON "NiceJobsPerformanceSnapshot"("supersedesId");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceSnapshot_assignmentId_periodEnd_id_idx" ON "NiceJobsPerformanceSnapshot"("assignmentId", "periodEnd", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceSnapshot_frameworkVersionId_status_periodEnd_id_idx" ON "NiceJobsPerformanceSnapshot"("frameworkVersionId", "status", "periodEnd", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPerformanceSnapshot_assignmentId_frameworkVersionId_periodStart_periodEnd_revision_key" ON "NiceJobsPerformanceSnapshot"("assignmentId", "frameworkVersionId", "periodStart", "periodEnd", "revision");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceReview_snapshotId_released_id_idx" ON "NiceJobsPerformanceReview"("snapshotId", "released", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceAttention_status_snapshotId_id_idx" ON "NiceJobsPerformanceAttention"("status", "snapshotId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPerformanceAttention_snapshotId_metricKey_key" ON "NiceJobsPerformanceAttention"("snapshotId", "metricKey");

-- CreateIndex
CREATE INDEX "NiceJobsPip_assignmentId_released_status_id_idx" ON "NiceJobsPip"("assignmentId", "released", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPip_managerId_status_reviewAt_id_idx" ON "NiceJobsPip"("managerId", "status", "reviewAt", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPipReview_pipId_released_id_idx" ON "NiceJobsPipReview"("pipId", "released", "id");
