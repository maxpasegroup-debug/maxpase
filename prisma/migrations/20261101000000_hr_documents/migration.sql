CREATE TYPE "HrDocumentStatus" AS ENUM ('UPLOADING','ACTIVE','FAILED','REPLACED','ARCHIVED');

CREATE TABLE "HrDocumentCategory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrDocumentCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrDocumentCategory_companyId_key_key" ON "HrDocumentCategory"("companyId", "key");
ALTER TABLE "HrDocumentCategory" ADD CONSTRAINT "HrDocumentCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HrDocument" (
  "id" TEXT NOT NULL,
  "employmentId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "brandId" TEXT,
  "categoryKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "assetId" TEXT,
  "publicId" TEXT NOT NULL,
  "resourceType" TEXT,
  "format" TEXT,
  "status" "HrDocumentStatus" NOT NULL DEFAULT 'UPLOADING',
  "replacesId" TEXT,
  "uploaderUserId" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrDocument_assetId_key" ON "HrDocument"("assetId");
CREATE UNIQUE INDEX "HrDocument_publicId_key" ON "HrDocument"("publicId");
CREATE UNIQUE INDEX "HrDocument_replacesId_key" ON "HrDocument"("replacesId");
CREATE INDEX "HrDocument_companyId_brandId_status_createdAt_idx" ON "HrDocument"("companyId","brandId","status","createdAt");
CREATE INDEX "HrDocument_employmentId_categoryKey_createdAt_idx" ON "HrDocument"("employmentId","categoryKey","createdAt");
ALTER TABLE "HrDocument" ADD CONSTRAINT "HrDocument_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrDocument" ADD CONSTRAINT "HrDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrDocument" ADD CONSTRAINT "HrDocument_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrDocument" ADD CONSTRAINT "HrDocument_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "HrDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrDocument" ADD CONSTRAINT "HrDocument_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
