ALTER TABLE "NiceJobsKnowledgeVersion" ADD COLUMN "captions" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NiceJobsKnowledgeVersion" ADD COLUMN "transcript" TEXT NOT NULL DEFAULT '';
CREATE TABLE "NiceJobsContentFile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "uploaderUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL CHECK ("bytes" > 0 AND "bytes" <= 67108864),
  "digest" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NiceJobsContentFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NiceJobsContentFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NiceJobsContentFile_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NiceJobsContentFile_uploaderUserId_idempotencyKey_key" ON "NiceJobsContentFile"("uploaderUserId", "idempotencyKey");
CREATE INDEX "NiceJobsContentFile_companyId_organizationId_id_idx" ON "NiceJobsContentFile"("companyId", "organizationId", "id");
