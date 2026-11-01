ALTER TABLE "Employment" ADD COLUMN "employmentType" TEXT;

CREATE TABLE "HrCompanyOnboardingConfig" (
  "companyId" TEXT NOT NULL,
  "proposedPortalHost" TEXT,
  "proposedSenderEmail" TEXT,
  "decisionReference" TEXT,
  "updatedByUserId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrCompanyOnboardingConfig_pkey" PRIMARY KEY ("companyId")
);
ALTER TABLE "HrCompanyOnboardingConfig" ADD CONSTRAINT "HrCompanyOnboardingConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
