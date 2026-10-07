CREATE TABLE "NiceJobsApplication" (
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
 FOREIGN KEY ("candidateId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("versionId", "divisionId") REFERENCES "NiceJobsVersionArea"("versionId", "divisionId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "NiceJobsApplicationSequence" (
 "year" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
 "value" INTEGER NOT NULL
);
CREATE TABLE "NiceJobsApplicationHistory" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "applicationId" TEXT NOT NULL,
 "revision" INTEGER NOT NULL,
 "eventId" TEXT NOT NULL,
 "action" TEXT NOT NULL,
 "previousState" TEXT NOT NULL,
 "nextState" TEXT NOT NULL,
 "internalReason" TEXT,
 "candidateMessage" TEXT,
 "evidence" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("applicationId") REFERENCES "NiceJobsApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NiceJobsApplication_reference_key" ON "NiceJobsApplication"("reference");
CREATE UNIQUE INDEX "NiceJobsApplication_applicationId_key" ON "NiceJobsApplication"("applicationId");
CREATE UNIQUE INDEX "NiceJobsApplication_activeKey_key" ON "NiceJobsApplication"("activeKey");
CREATE INDEX "NiceJobsApplication_companyId_candidateId_id_idx" ON "NiceJobsApplication"("companyId", "candidateId", "id");
CREATE INDEX "NiceJobsApplication_companyId_divisionId_status_id_idx" ON "NiceJobsApplication"("companyId", "divisionId", "status", "id");
CREATE INDEX "NiceJobsApplication_companyId_divisionId_id_idx" ON "NiceJobsApplication"("companyId", "divisionId", "id");
CREATE INDEX "NiceJobsApplication_companyId_versionId_status_id_idx" ON "NiceJobsApplication"("companyId", "versionId", "status", "id");
CREATE UNIQUE INDEX "NiceJobsApplicationHistory_eventId_key" ON "NiceJobsApplicationHistory"("eventId");
CREATE UNIQUE INDEX "NiceJobsApplicationHistory_applicationId_revision_key" ON "NiceJobsApplicationHistory"("applicationId", "revision");
