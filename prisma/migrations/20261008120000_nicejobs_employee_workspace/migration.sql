-- CreateTable
CREATE TABLE "NiceJobsDailyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "supersedesId" TEXT,
    "taskSnapshot" TEXT NOT NULL,
    "blockerSnapshot" TEXT NOT NULL,
    "notes" TEXT,
    "correctionReason" TEXT,
    "submittedByUserId" TEXT NOT NULL,
    "submittedByPersonId" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsDailyReport_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsDailyReport_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "NiceJobsDailyReport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsDailyReport_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorPersonId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEvidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskEvidence_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Extend canonical records without rebuilding existing tables.
ALTER TABLE "NiceJobsAssignment" ADD COLUMN "onboardingId" TEXT REFERENCES "NiceJobsOnboarding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsAssignment" ADD COLUMN "readinessReviewId" TEXT REFERENCES "NiceJobsTrainingReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsAssignment" ADD COLUMN "activatedAt" DATETIME;
ALTER TABLE "NiceJobsAssignment" ADD COLUMN "activatedByUserId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "NiceJobsAssignment_onboardingId_key" ON "NiceJobsAssignment"("onboardingId");
CREATE UNIQUE INDEX "NiceJobsAssignment_readinessReviewId_key" ON "NiceJobsAssignment"("readinessReviewId");
CREATE INDEX "NiceJobsAssignment_managerId_status_id_idx" ON "NiceJobsAssignment"("managerId", "status", "id");
ALTER TABLE "Task" ADD COLUMN "niceJobsAssignmentId" TEXT REFERENCES "NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD COLUMN "evidenceRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Task_niceJobsAssignmentId_assigneePersonId_status_id_idx" ON "Task"("niceJobsAssignmentId", "assigneePersonId", "status", "id");
ALTER TABLE "ExecutionBlocker" ADD COLUMN "niceJobsAssignmentId" TEXT REFERENCES "NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExecutionBlocker" ADD COLUMN "reporterUserId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExecutionBlocker" ADD COLUMN "reason" TEXT;
ALTER TABLE "ExecutionBlocker" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "ExecutionBlocker_niceJobsAssignmentId_status_id_idx" ON "ExecutionBlocker"("niceJobsAssignmentId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsDailyReport_supersedesId_key" ON "NiceJobsDailyReport"("supersedesId");

-- CreateIndex
CREATE INDEX "NiceJobsDailyReport_assignmentId_reportDate_id_idx" ON "NiceJobsDailyReport"("assignmentId", "reportDate", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsDailyReport_assignmentId_reportDate_revision_key" ON "NiceJobsDailyReport"("assignmentId", "reportDate", "revision");

-- CreateIndex
CREATE INDEX "TaskEvidence_taskId_actorPersonId_createdAt_idx" ON "TaskEvidence"("taskId", "actorPersonId", "createdAt");
