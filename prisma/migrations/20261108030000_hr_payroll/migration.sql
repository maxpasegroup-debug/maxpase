CREATE TYPE "HrPayrollRuleSetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "HrPayrollRunStatus" AS ENUM ('DRAFT', 'REVIEWED', 'RECONCILED', 'VOID');
CREATE TYPE "HrPayrollPaymentStatus" AS ENUM ('RECORDED', 'RECONCILED');

CREATE TABLE "HrCompensation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employmentId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "monthlyBasePaise" BIGINT NOT NULL,
  "monthlyVariablePaise" BIGINT NOT NULL DEFAULT 0,
  "decisionReference" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCompensation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrCompensation_employmentId_effectiveFrom_key" ON "HrCompensation"("employmentId", "effectiveFrom");
CREATE INDEX "HrCompensation_companyId_effectiveFrom_idx" ON "HrCompensation"("companyId", "effectiveFrom");
ALTER TABLE "HrCompensation" ADD CONSTRAINT "HrCompensation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrCompensation" ADD CONSTRAINT "HrCompensation_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HrPayrollRuleSet" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "componentsSnapshot" TEXT NOT NULL,
  "status" "HrPayrollRuleSetStatus" NOT NULL DEFAULT 'DRAFT',
  "accountantName" TEXT,
  "accountantReviewReference" TEXT,
  "accountantReviewedAt" TIMESTAMP(3),
  "recordedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrPayrollRuleSet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HrPayrollRuleSet_companyId_status_createdAt_idx" ON "HrPayrollRuleSet"("companyId", "status", "createdAt");
CREATE UNIQUE INDEX "HrPayrollRuleSet_one_active_per_company_key" ON "HrPayrollRuleSet"("companyId") WHERE "status" = 'ACTIVE';
ALTER TABLE "HrPayrollRuleSet" ADD CONSTRAINT "HrPayrollRuleSet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HrPayrollRun" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" "HrPayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
  "ruleSetId" TEXT NOT NULL,
  "ruleSnapshot" TEXT NOT NULL,
  "excludedEmployeesSnapshot" TEXT NOT NULL DEFAULT '[]',
  "totalGrossPaise" BIGINT NOT NULL,
  "totalDeductionsPaise" BIGINT NOT NULL,
  "totalNetPaise" BIGINT NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "reviewReference" TEXT,
  "reviewedByUserId" TEXT,
  "reconciliationReference" TEXT,
  "reconciledAt" TIMESTAMP(3),
  "reconciledByUserId" TEXT,
  "voidReference" TEXT,
  "voidedAt" TIMESTAMP(3),
  "voidedByUserId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrPayrollRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrPayrollRun_companyId_period_not_void_key" ON "HrPayrollRun"("companyId", "period") WHERE "status" <> 'VOID';
CREATE INDEX "HrPayrollRun_companyId_status_period_idx" ON "HrPayrollRun"("companyId", "status", "period");
ALTER TABLE "HrPayrollRun" ADD CONSTRAINT "HrPayrollRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrPayrollRun" ADD CONSTRAINT "HrPayrollRun_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "HrPayrollRuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HrPayrollLine" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "employmentId" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "employeeEmail" TEXT,
  "designation" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "monthlyBasePaise" BIGINT NOT NULL,
  "monthlyVariablePaise" BIGINT NOT NULL,
  "ruleEarningsPaise" BIGINT NOT NULL,
  "grossPaise" BIGINT NOT NULL,
  "deductionsPaise" BIGINT NOT NULL,
  "netPaise" BIGINT NOT NULL,
  "componentsSnapshot" TEXT NOT NULL,
  "payslipDocumentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrPayrollLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrPayrollLine_payslipDocumentId_key" ON "HrPayrollLine"("payslipDocumentId");
CREATE UNIQUE INDEX "HrPayrollLine_runId_employmentId_key" ON "HrPayrollLine"("runId", "employmentId");
CREATE INDEX "HrPayrollLine_employmentId_createdAt_idx" ON "HrPayrollLine"("employmentId", "createdAt");
ALTER TABLE "HrPayrollLine" ADD CONSTRAINT "HrPayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HrPayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrPayrollLine" ADD CONSTRAINT "HrPayrollLine_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrPayrollLine" ADD CONSTRAINT "HrPayrollLine_payslipDocumentId_fkey" FOREIGN KEY ("payslipDocumentId") REFERENCES "HrDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HrPayrollPayment" (
  "id" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "paymentReference" TEXT NOT NULL,
  "evidenceReference" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "status" "HrPayrollPaymentStatus" NOT NULL DEFAULT 'RECORDED',
  "reconciledAt" TIMESTAMP(3),
  "recordedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrPayrollPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrPayrollPayment_lineId_key" ON "HrPayrollPayment"("lineId");
ALTER TABLE "HrPayrollPayment" ADD CONSTRAINT "HrPayrollPayment_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "HrPayrollLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
