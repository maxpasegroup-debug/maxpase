CREATE TABLE "LabsCustomerGrant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "issuedByUserId" TEXT NOT NULL,
  "verificationEvidence" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" DATETIME,
  CONSTRAINT "LabsCustomerGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabsCustomerGrant_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ExecutiveRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabsCustomerGrant_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabsCustomerGrant_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LabsCustomerGrant_leadId_customerUserId_key" ON "LabsCustomerGrant"("leadId", "customerUserId");
CREATE INDEX "LabsCustomerGrant_customerUserId_organizationId_status_idx" ON "LabsCustomerGrant"("customerUserId", "organizationId", "status");
