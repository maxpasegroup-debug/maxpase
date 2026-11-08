CREATE TYPE "HrCandidateStatus" AS ENUM ('NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'HIRED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "HrLetterKind" AS ENUM ('OFFER', 'APPOINTMENT', 'PROBATION_CONFIRMATION', 'SALARY_CHANGE', 'INCENTIVE');
CREATE TYPE "HrLetterStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'DELIVERY_UNKNOWN', 'FAILED', 'ACCEPTED', 'DECLINED', 'VOID');

CREATE TABLE "HrCandidate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "brandId" TEXT,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "roleTitle" TEXT NOT NULL,
  "source" TEXT,
  "notes" TEXT,
  "status" "HrCandidateStatus" NOT NULL DEFAULT 'NEW',
  "convertedEmploymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrCandidate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrCandidate_convertedEmploymentId_key" ON "HrCandidate"("convertedEmploymentId");
CREATE INDEX "HrCandidate_companyId_status_createdAt_idx" ON "HrCandidate"("companyId", "status", "createdAt");
CREATE INDEX "HrCandidate_brandId_status_idx" ON "HrCandidate"("brandId", "status");
CREATE INDEX "HrCandidate_email_companyId_idx" ON "HrCandidate"("email", "companyId");
ALTER TABLE "HrCandidate" ADD CONSTRAINT "HrCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrCandidate" ADD CONSTRAINT "HrCandidate_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrCandidate" ADD CONSTRAINT "HrCandidate_convertedEmploymentId_fkey" FOREIGN KEY ("convertedEmploymentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HrLetterTemplate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "brandId" TEXT,
  "kind" "HrLetterKind" NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrLetterTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HrLetterTemplate_companyId_brandId_kind_active_idx" ON "HrLetterTemplate"("companyId", "brandId", "kind", "active");
ALTER TABLE "HrLetterTemplate" ADD CONSTRAINT "HrLetterTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrLetterTemplate" ADD CONSTRAINT "HrLetterTemplate_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HrLetter" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "brandId" TEXT,
  "candidateId" TEXT,
  "employmentId" TEXT,
  "templateId" TEXT,
  "kind" "HrLetterKind" NOT NULL,
  "status" "HrLetterStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bodySnapshot" TEXT NOT NULL,
  "dataSnapshot" TEXT NOT NULL,
  "decisionReference" TEXT,
  "acceptanceTokenHash" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "providerReference" TEXT,
  "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastDeliveryError" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrLetter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrLetter_acceptanceTokenHash_key" ON "HrLetter"("acceptanceTokenHash");
CREATE INDEX "HrLetter_companyId_status_createdAt_idx" ON "HrLetter"("companyId", "status", "createdAt");
CREATE INDEX "HrLetter_candidateId_kind_status_idx" ON "HrLetter"("candidateId", "kind", "status");
CREATE INDEX "HrLetter_employmentId_kind_createdAt_idx" ON "HrLetter"("employmentId", "kind", "createdAt");
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "HrLetterTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
