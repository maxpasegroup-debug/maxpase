-- CreateTable
CREATE TABLE "NiceJobsTrainingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "configuration" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsTrainingPlan_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NiceJobsVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsOnboarding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "readinessStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "reviewerUserId" TEXT,
    "reviewerPersonId" TEXT,
    "readinessReviewerUserId" TEXT,
    "readinessReviewerPersonId" TEXT,
    "startedAt" DATETIME,
    "orientationCompletedAt" DATETIME,
    "ojtStartedAt" DATETIME,
    "ojtCompletedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NiceJobsOnboarding_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "NiceJobsApplication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsOnboarding_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "NiceJobsOffer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsOnboarding_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NiceJobsTrainingPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsOnboarding_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsOnboarding_readinessReviewerUserId_fkey" FOREIGN KEY ("readinessReviewerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsTrainingProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "onboardingId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "NiceJobsTrainingProgress_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "NiceJobsOnboarding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsTrainingSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "progressId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "score" REAL,
    "actorUserId" TEXT NOT NULL,
    "actorPersonId" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsTrainingSubmission_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "NiceJobsTrainingProgress" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsTrainingSubmission_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsTrainingReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "onboardingId" TEXT NOT NULL,
    "submissionId" TEXT,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "privateNotes" TEXT NOT NULL,
    "feedback" TEXT,
    "requirements" TEXT,
    "reviewerUserId" TEXT NOT NULL,
    "reviewerPersonId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsTrainingReview_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "NiceJobsOnboarding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsTrainingReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "NiceJobsTrainingSubmission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsTrainingReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsTrainingReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OperationalEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTrainingPlan_versionId_key" ON "NiceJobsTrainingPlan"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOnboarding_reference_key" ON "NiceJobsOnboarding"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOnboarding_applicationId_key" ON "NiceJobsOnboarding"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOnboarding_offerId_key" ON "NiceJobsOnboarding"("offerId");

-- CreateIndex
CREATE INDEX "NiceJobsOnboarding_status_id_idx" ON "NiceJobsOnboarding"("status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsOnboarding_planId_status_id_idx" ON "NiceJobsOnboarding"("planId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsOnboarding_readinessStatus_id_idx" ON "NiceJobsOnboarding"("readinessStatus", "id");

-- CreateIndex
CREATE INDEX "NiceJobsOnboarding_reviewerUserId_reviewerPersonId_status_id_idx" ON "NiceJobsOnboarding"("reviewerUserId", "reviewerPersonId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsOnboarding_readinessReviewerUserId_readinessReviewerPersonId_status_id_idx" ON "NiceJobsOnboarding"("readinessReviewerUserId", "readinessReviewerPersonId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsTrainingProgress_onboardingId_phase_status_id_idx" ON "NiceJobsTrainingProgress"("onboardingId", "phase", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsTrainingProgress_onboardingId_id_idx" ON "NiceJobsTrainingProgress"("onboardingId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTrainingProgress_onboardingId_phase_key_key" ON "NiceJobsTrainingProgress"("onboardingId", "phase", "key");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTrainingSubmission_progressId_attempt_key" ON "NiceJobsTrainingSubmission"("progressId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTrainingReview_submissionId_key" ON "NiceJobsTrainingReview"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTrainingReview_eventId_key" ON "NiceJobsTrainingReview"("eventId");

-- CreateIndex
CREATE INDEX "NiceJobsTrainingReview_onboardingId_kind_id_idx" ON "NiceJobsTrainingReview"("onboardingId", "kind", "id");

-- CreateIndex
CREATE INDEX "NiceJobsTrainingReview_reviewerUserId_kind_outcome_id_idx" ON "NiceJobsTrainingReview"("reviewerUserId", "kind", "outcome", "id");
