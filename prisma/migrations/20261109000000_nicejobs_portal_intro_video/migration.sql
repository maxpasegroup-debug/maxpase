CREATE TABLE "NiceJobsPortalSetting" (
    "id" TEXT NOT NULL DEFAULT 'nice-jobs',
    "companyId" TEXT NOT NULL,
    "introVideoTitle" TEXT NOT NULL DEFAULT 'What is NICEJOBS?',
    "introVideoFileId" TEXT,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsPortalSetting_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NiceJobsPortalSetting" ADD CONSTRAINT "NiceJobsPortalSetting_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "NiceJobsPortalSetting_companyId_idx" ON "NiceJobsPortalSetting"("companyId");
CREATE UNIQUE INDEX "NiceJobsPortalSetting_introVideoFileId_key" ON "NiceJobsPortalSetting"("introVideoFileId");
ALTER TABLE "NiceJobsPortalSetting" ADD CONSTRAINT "NiceJobsPortalSetting_introVideoFileId_fkey"
FOREIGN KEY ("introVideoFileId") REFERENCES "NiceJobsContentFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
