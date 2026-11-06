-- Assign a stable public Nice Jobs identifier to self-registered participants.
-- Existing accounts retain their person and user IDs. The public ID is never a login secret.
ALTER TABLE "Person" ADD COLUMN "niceJobsId" TEXT;
CREATE UNIQUE INDEX "Person_niceJobsId_key" ON "Person"("niceJobsId");

UPDATE "Person" AS p
SET "niceJobsId" = 'NJ-' || to_char(p."createdAt" AT TIME ZONE 'UTC', 'YYYY') || '-' || upper(substr(md5(p.id), 1, 20))
WHERE p."niceJobsId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "User" AS u
    WHERE u."personId" = p.id AND u."jobsPhone" IS NOT NULL
  )
  AND p.metadata LIKE '%"authenticationRealm":"jobs"%'
  AND p.metadata LIKE '%"identitySource":"SELF_REGISTRATION"%';

-- A single profile cannot have two simultaneously active earning assignments.
CREATE UNIQUE INDEX "NiceJobsAssignment_one_active_profile"
ON "NiceJobsAssignment"("profileId") WHERE status = 'ACTIVE';

-- A referral belongs to exactly one activated assignment and pinned job version.
CREATE TABLE "NiceJobsReferralLink" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'REVOKED')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "NiceJobsReferralLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NiceJobsReferralLink_assignmentId_key" ON "NiceJobsReferralLink"("assignmentId");
CREATE UNIQUE INDEX "NiceJobsReferralLink_token_key" ON "NiceJobsReferralLink"("token");
CREATE INDEX "NiceJobsReferralLink_companyId_status_id_idx" ON "NiceJobsReferralLink"("companyId", "status", "id");
ALTER TABLE "NiceJobsReferralLink" ADD CONSTRAINT "NiceJobsReferralLink_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsReferralLink" ADD CONSTRAINT "NiceJobsReferralLink_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsReferralLink" ADD CONSTRAINT "NiceJobsReferralLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- External outcomes remain pending until a different authorized human verifies evidence.
CREATE TABLE "NiceJobsAdmission" (
  "id" TEXT NOT NULL,
  "referralId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "externalApplicationId" TEXT,
  "externalAdmissionId" TEXT NOT NULL,
  "eventReference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK ("status" IN ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REVERSED')),
  "evidenceReference" TEXT NOT NULL,
  "verificationEvidenceReference" TEXT,
  "recordedByUserId" TEXT NOT NULL,
  "verifiedByUserId" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "NiceJobsAdmission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NiceJobsAdmission_eventReference_key" ON "NiceJobsAdmission"("eventReference");
CREATE UNIQUE INDEX "NiceJobsAdmission_companyId_externalAdmissionId_key" ON "NiceJobsAdmission"("companyId", "externalAdmissionId");
CREATE INDEX "NiceJobsAdmission_referralId_status_id_idx" ON "NiceJobsAdmission"("referralId", "status", "id");
CREATE INDEX "NiceJobsAdmission_companyId_status_id_idx" ON "NiceJobsAdmission"("companyId", "status", "id");
ALTER TABLE "NiceJobsAdmission" ADD CONSTRAINT "NiceJobsAdmission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "NiceJobsReferralLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsAdmission" ADD CONSTRAINT "NiceJobsAdmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsAdmission" ADD CONSTRAINT "NiceJobsAdmission_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsAdmission" ADD CONSTRAINT "NiceJobsAdmission_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
