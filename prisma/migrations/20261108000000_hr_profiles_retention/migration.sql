ALTER TABLE "Employment"
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactRelationship" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT,
  ADD COLUMN "emergencyContactEmail" TEXT;

ALTER TABLE "HrDocumentCategory"
  ADD COLUMN "retentionDays" INTEGER,
  ADD COLUMN "retentionDecisionReference" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "HrDocument"
  ADD COLUMN "retentionDays" INTEGER,
  ADD COLUMN "retentionDueAt" TIMESTAMP(3),
  ADD COLUMN "retentionPolicyReference" TEXT,
  ADD COLUMN "retentionReviewedAt" TIMESTAMP(3),
  ADD COLUMN "retentionReviewReference" TEXT;

ALTER TABLE "HrDocumentCategory"
  ADD CONSTRAINT "HrDocumentCategory_retentionDays_range" CHECK ("retentionDays" IS NULL OR ("retentionDays" >= 30 AND "retentionDays" <= 36500));

ALTER TABLE "HrDocument"
  ADD CONSTRAINT "HrDocument_retentionDays_range" CHECK ("retentionDays" IS NULL OR ("retentionDays" >= 30 AND "retentionDays" <= 36500));
