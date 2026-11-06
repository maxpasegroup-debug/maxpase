ALTER TABLE "NiceJobsIncentiveEarning" ALTER COLUMN "snapshotId" DROP NOT NULL;
ALTER TABLE "NiceJobsIncentiveEarning" ADD COLUMN "admissionId" TEXT;
CREATE UNIQUE INDEX "NiceJobsIncentiveEarning_admissionId_key" ON "NiceJobsIncentiveEarning"("admissionId");
ALTER TABLE "NiceJobsIncentiveEarning" ADD CONSTRAINT "NiceJobsIncentiveEarning_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "NiceJobsAdmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NiceJobsIncentiveEarning" ADD CONSTRAINT "nicejobs_earning_exactly_one_source" CHECK (("snapshotId" IS NOT NULL) <> ("admissionId" IS NOT NULL));
DROP INDEX "NiceJobsIncentiveEarning_assignmentId_policyId_periodStart__key";
CREATE UNIQUE INDEX "nicejobs_performance_earning_period_unique" ON "NiceJobsIncentiveEarning"("assignmentId", "policyId", "periodStart", "periodEnd") WHERE "snapshotId" IS NOT NULL;
CREATE INDEX "nicejobs_earning_period_idx" ON "NiceJobsIncentiveEarning"("assignmentId", "policyId", "periodStart", "periodEnd");
CREATE INDEX "nicejobs_admission_sequence_idx" ON "NiceJobsAdmission"("referralId", "status", "verifiedAt", "id");

CREATE OR REPLACE FUNCTION nicejobs_earning_calculation_immutable_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."assignmentId", NEW."policyId", NEW."policyVersionId", NEW."snapshotId", NEW."admissionId", NEW."periodStart", NEW."periodEnd", NEW."currency", NEW."amountMinor", NEW."eligibility", NEW."calculation", NEW."creatorUserId")
    IS DISTINCT FROM
    ROW(OLD."assignmentId", OLD."policyId", OLD."policyVersionId", OLD."snapshotId", OLD."admissionId", OLD."periodStart", OLD."periodEnd", OLD."currency", OLD."amountMinor", OLD."eligibility", OLD."calculation", OLD."creatorUserId")
  THEN RAISE EXCEPTION 'Incentive calculation is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
