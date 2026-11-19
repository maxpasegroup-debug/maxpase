-- Additive Startup Skool HR scope. Existing company-wide runs/rules remain brandId=NULL.
ALTER TABLE "HrAssignment" ADD COLUMN "operatingCentreId" TEXT;
CREATE INDEX "HrAssignment_operatingCentreId_status_idx" ON "HrAssignment"("operatingCentreId", "status");

ALTER TABLE "HrPayrollRuleSet" ADD COLUMN "brandId" TEXT;
ALTER TABLE "HrPayrollRun" ADD COLUMN "brandId" TEXT;
ALTER TABLE "HrPayrollRuleSet" ADD CONSTRAINT "HrPayrollRuleSet_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrPayrollRun" ADD CONSTRAINT "HrPayrollRun_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "HrPayrollRuleSet_companyId_status_createdAt_idx";
CREATE INDEX "HrPayrollRuleSet_companyId_brandId_status_createdAt_idx" ON "HrPayrollRuleSet"("companyId", "brandId", "status", "createdAt");
DROP INDEX IF EXISTS "HrPayrollRun_companyId_status_period_idx";
CREATE INDEX "HrPayrollRun_companyId_brandId_status_period_idx" ON "HrPayrollRun"("companyId", "brandId", "status", "period");
DROP INDEX IF EXISTS "HrPayrollRun_companyId_period_not_void_key";
CREATE UNIQUE INDEX "HrPayrollRun_company_period_not_void_key" ON "HrPayrollRun"("companyId", "period") WHERE "brandId" IS NULL AND "status" <> 'VOID';
CREATE UNIQUE INDEX "HrPayrollRun_scoped_brand_period_not_void_key" ON "HrPayrollRun"("companyId", "brandId", "period") WHERE "brandId" IS NOT NULL AND "status" <> 'VOID';
