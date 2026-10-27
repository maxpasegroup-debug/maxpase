-- CreateTable
CREATE TABLE "NiceJobsInterview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" DATETIME,
    "duration" INTEGER NOT NULL,
    "location" TEXT,
    "instructions" TEXT,
    "completedAt" DATETIME,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NiceJobsInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "NiceJobsApplication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsInterview_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsInterviewer" (
    "interviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    PRIMARY KEY ("interviewId", "userId"),
    CONSTRAINT "NiceJobsInterviewer_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "NiceJobsInterview" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsInterviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsInterviewEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "scores" TEXT NOT NULL,
    "weightedScore" REAL NOT NULL,
    "notes" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsInterviewEvaluation_interviewId_userId_fkey" FOREIGN KEY ("interviewId", "userId") REFERENCES "NiceJobsInterviewer" ("interviewId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "snapshot" TEXT NOT NULL,
    "activeKey" TEXT,
    "issuedAt" DATETIME,
    "expiresAt" DATETIME,
    "viewedAt" DATETIME,
    "acceptedAt" DATETIME,
    "declinedAt" DATETIME,
    "declineReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NiceJobsOffer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "NiceJobsApplication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsOffer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NiceJobsApplication" (
    "reviewRequestId" TEXT,
    "reviewNeedsMore" BOOLEAN NOT NULL DEFAULT false,
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "applicationId" TEXT,
    "candidateId" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "eligibilityStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "screeningStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "answers" TEXT NOT NULL DEFAULT '{}',
    "candidateMessage" TEXT,
    "activeKey" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NiceJobsApplication_reviewRequestId_fkey" FOREIGN KEY ("reviewRequestId") REFERENCES "OperationalRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsApplication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsApplication_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsApplication_versionId_divisionId_fkey" FOREIGN KEY ("versionId", "divisionId") REFERENCES "NiceJobsVersionArea" ("versionId", "divisionId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_NiceJobsApplication" ("activeKey", "answers", "applicationId", "candidateId", "candidateMessage", "companyId", "createdAt", "creatorUserId", "divisionId", "eligibilityStatus", "id", "reference", "revision", "screeningStatus", "status", "submittedAt", "updatedAt", "versionId") SELECT "activeKey", "answers", "applicationId", "candidateId", "candidateMessage", "companyId", "createdAt", "creatorUserId", "divisionId", "eligibilityStatus", "id", "reference", "revision", "screeningStatus", "status", "submittedAt", "updatedAt", "versionId" FROM "NiceJobsApplication";
DROP TABLE "NiceJobsApplication";
ALTER TABLE "new_NiceJobsApplication" RENAME TO "NiceJobsApplication";
CREATE UNIQUE INDEX "NiceJobsApplication_reviewRequestId_key" ON "NiceJobsApplication"("reviewRequestId");
CREATE UNIQUE INDEX "NiceJobsApplication_reference_key" ON "NiceJobsApplication"("reference");
CREATE UNIQUE INDEX "NiceJobsApplication_applicationId_key" ON "NiceJobsApplication"("applicationId");
CREATE UNIQUE INDEX "NiceJobsApplication_activeKey_key" ON "NiceJobsApplication"("activeKey");
CREATE INDEX "NiceJobsApplication_companyId_candidateId_id_idx" ON "NiceJobsApplication"("companyId", "candidateId", "id");
CREATE INDEX "NiceJobsApplication_companyId_divisionId_status_id_idx" ON "NiceJobsApplication"("companyId", "divisionId", "status", "id");
CREATE INDEX "NiceJobsApplication_companyId_divisionId_id_idx" ON "NiceJobsApplication"("companyId", "divisionId", "id");
CREATE INDEX "NiceJobsApplication_companyId_versionId_status_id_idx" ON "NiceJobsApplication"("companyId", "versionId", "status", "id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsInterview_reference_key" ON "NiceJobsInterview"("reference");

-- CreateIndex
CREATE INDEX "NiceJobsInterview_applicationId_status_id_idx" ON "NiceJobsInterview"("applicationId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsInterview_scheduledAt_applicationId_idx" ON "NiceJobsInterview"("scheduledAt", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsInterview_applicationId_number_key" ON "NiceJobsInterview"("applicationId", "number");

-- CreateIndex
CREATE INDEX "NiceJobsInterviewer_userId_interviewId_idx" ON "NiceJobsInterviewer"("userId", "interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsInterviewEvaluation_interviewId_userId_key" ON "NiceJobsInterviewEvaluation"("interviewId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOffer_reference_key" ON "NiceJobsOffer"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOffer_activeKey_key" ON "NiceJobsOffer"("activeKey");

-- CreateIndex
CREATE INDEX "NiceJobsOffer_applicationId_status_id_idx" ON "NiceJobsOffer"("applicationId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOffer_applicationId_number_key" ON "NiceJobsOffer"("applicationId", "number");


