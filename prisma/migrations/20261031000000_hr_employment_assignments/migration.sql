CREATE TYPE "EmploymentState" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');
CREATE TYPE "HrAssignmentState" AS ENUM ('DRAFT', 'ACTIVE', 'TRANSFERRED', 'ENDED');

CREATE TABLE "Employment" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "status" "EmploymentState" NOT NULL DEFAULT 'DRAFT',
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "designation" TEXT,
  "decisionReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Employment_companyId_status_idx" ON "Employment"("companyId", "status");
CREATE INDEX "Employment_personId_companyId_idx" ON "Employment"("personId", "companyId");
CREATE UNIQUE INDEX "Employment_one_open_per_person_company" ON "Employment"("personId", "companyId") WHERE "status" <> 'ENDED';
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HrAssignment" (
  "id" TEXT NOT NULL,
  "employmentId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "departmentId" TEXT,
  "managerPersonId" TEXT,
  "designation" TEXT NOT NULL,
  "status" "HrAssignmentState" NOT NULL DEFAULT 'DRAFT',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "decisionReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HrAssignment_employmentId_status_idx" ON "HrAssignment"("employmentId", "status");
CREATE INDEX "HrAssignment_brandId_status_idx" ON "HrAssignment"("brandId", "status");
CREATE INDEX "HrAssignment_managerPersonId_idx" ON "HrAssignment"("managerPersonId");
CREATE UNIQUE INDEX "HrAssignment_one_open_per_brand" ON "HrAssignment"("employmentId", "brandId") WHERE "status" IN ('DRAFT', 'ACTIVE');
ALTER TABLE "HrAssignment" ADD CONSTRAINT "HrAssignment_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrAssignment" ADD CONSTRAINT "HrAssignment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrAssignment" ADD CONSTRAINT "HrAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrAssignment" ADD CONSTRAINT "HrAssignment_managerPersonId_fkey" FOREIGN KEY ("managerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
