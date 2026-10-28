-- Preserve existing brand IDs while recording company-scoped parent brands.
ALTER TABLE "Brand" ADD COLUMN "parentBrandId" TEXT;
CREATE INDEX "Brand_parentBrandId_idx" ON "Brand"("parentBrandId");
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_parentBrandId_fkey" FOREIGN KEY ("parentBrandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
