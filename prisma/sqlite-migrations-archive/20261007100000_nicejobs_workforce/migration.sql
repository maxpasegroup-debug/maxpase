CREATE TABLE "NiceJobsTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "publishedVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("publishedVersionId") REFERENCES "NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "NiceJobsVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "engagement" TEXT NOT NULL DEFAULT 'PART_TIME_INCENTIVE',
    "context" TEXT,
    "configuration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("templateId") REFERENCES "NiceJobsTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "NiceJobsVersionArea" (
    "versionId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    PRIMARY KEY ("versionId", "divisionId"),
    FOREIGN KEY ("versionId") REFERENCES "NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("divisionId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "NiceJobsWorkerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "NiceJobsAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "managerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "lifecycle" TEXT NOT NULL DEFAULT 'APPLICANT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("profileId") REFERENCES "NiceJobsWorkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("versionId") REFERENCES "NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("divisionId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("managerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NiceJobsTemplate_publishedVersionId_key" ON "NiceJobsTemplate"("publishedVersionId");
CREATE INDEX "NiceJobsTemplate_companyId_status_id_idx" ON "NiceJobsTemplate"("companyId", "status", "id");
CREATE UNIQUE INDEX "NiceJobsTemplate_companyId_code_key" ON "NiceJobsTemplate"("companyId", "code");
CREATE INDEX "NiceJobsVersion_templateId_status_id_idx" ON "NiceJobsVersion"("templateId", "status", "id");
CREATE UNIQUE INDEX "NiceJobsVersion_templateId_number_key" ON "NiceJobsVersion"("templateId", "number");
CREATE INDEX "NiceJobsVersionArea_divisionId_versionId_idx" ON "NiceJobsVersionArea"("divisionId", "versionId");
CREATE UNIQUE INDEX "NiceJobsWorkerProfile_companyId_personId_key" ON "NiceJobsWorkerProfile"("companyId", "personId");
CREATE INDEX "NiceJobsAssignment_divisionId_status_id_idx" ON "NiceJobsAssignment"("divisionId", "status", "id");
CREATE INDEX "NiceJobsAssignment_divisionId_id_idx" ON "NiceJobsAssignment"("divisionId", "id");
CREATE INDEX "NiceJobsAssignment_divisionId_lifecycle_id_idx" ON "NiceJobsAssignment"("divisionId", "lifecycle", "id");
CREATE INDEX "NiceJobsAssignment_profileId_status_id_idx" ON "NiceJobsAssignment"("profileId", "status", "id");
CREATE INDEX "NiceJobsAssignment_versionId_id_idx" ON "NiceJobsAssignment"("versionId", "id");
CREATE UNIQUE INDEX "NiceJobsAssignment_profileId_versionId_divisionId_key" ON "NiceJobsAssignment"("profileId", "versionId", "divisionId");
