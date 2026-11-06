-- Company-owned sources require separate human approval and an environment-bound secret.
CREATE TABLE "NiceJobsSourceConnection" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "credentialReference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','ACTIVE','DISABLED')),
  "approvalReference" TEXT,
  "creatorUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  CONSTRAINT "NiceJobsSourceConnection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NiceJobsSourceConnection_companyId_status_id_idx" ON "NiceJobsSourceConnection"("companyId", "status", "id");
ALTER TABLE "NiceJobsSourceConnection" ADD CONSTRAINT "NiceJobsSourceConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsSourceConnection" ADD CONSTRAINT "NiceJobsSourceConnection_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsSourceConnection" ADD CONSTRAINT "NiceJobsSourceConnection_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Durable, untrusted company event receipts. Receipt alone never verifies a business outcome.
CREATE TABLE "NiceJobsSourceEvent" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "referralId" TEXT,
  "admissionId" TEXT,
  "externalEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL CHECK ("eventType" IN ('APPLICATION_CREATED','APPLICATION_UPDATED','ADMISSION_APPROVED','PAYMENT_RECEIVED','PAYMENT_REFUNDED','ADMISSION_CANCELLED')),
  "externalApplicationId" TEXT,
  "externalAdmissionId" TEXT,
  "externalTransactionId" TEXT,
  "amountMinor" BIGINT,
  "currency" TEXT,
  "fingerprint" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK ("status" IN ('PENDING_REVIEW','UNMATCHED','VERIFIED','REJECTED')),
  "failureCode" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedByUserId" TEXT,
  "submittedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewEvidence" TEXT,
  CONSTRAINT "NiceJobsSourceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NiceJobsSourceEvent_payment_shape" CHECK (
    ("eventType" IN ('PAYMENT_RECEIVED','PAYMENT_REFUNDED') AND "externalTransactionId" IS NOT NULL AND "amountMinor" > 0 AND "currency" IS NOT NULL)
    OR ("eventType" NOT IN ('PAYMENT_RECEIVED','PAYMENT_REFUNDED') AND "externalTransactionId" IS NULL AND "amountMinor" IS NULL AND "currency" IS NULL)
  )
);
CREATE UNIQUE INDEX "NiceJobsSourceEvent_connectionId_externalEventId_key" ON "NiceJobsSourceEvent"("connectionId", "externalEventId");
CREATE UNIQUE INDEX "NiceJobsSourceEvent_companyId_externalTransactionId_eventType_key" ON "NiceJobsSourceEvent"("companyId", "externalTransactionId", "eventType") WHERE "externalTransactionId" IS NOT NULL;
CREATE INDEX "NiceJobsSourceEvent_companyId_eventType_status_id_idx" ON "NiceJobsSourceEvent"("companyId", "eventType", "status", "id");
CREATE INDEX "NiceJobsSourceEvent_referralId_eventType_status_id_idx" ON "NiceJobsSourceEvent"("referralId", "eventType", "status", "id");
CREATE INDEX "NiceJobsSourceEvent_companyId_externalTransactionId_idx" ON "NiceJobsSourceEvent"("companyId", "externalTransactionId");
ALTER TABLE "NiceJobsSourceEvent" ADD CONSTRAINT "NiceJobsSourceEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "NiceJobsSourceConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsSourceEvent" ADD CONSTRAINT "NiceJobsSourceEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsSourceEvent" ADD CONSTRAINT "NiceJobsSourceEvent_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "NiceJobsReferralLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsSourceEvent" ADD CONSTRAINT "NiceJobsSourceEvent_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "NiceJobsAdmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsSourceEvent" ADD CONSTRAINT "NiceJobsSourceEvent_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsSourceEvent" ADD CONSTRAINT "NiceJobsSourceEvent_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
