-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CompanyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT,
    "legalName" TEXT,
    "displayName" TEXT NOT NULL,
    "shortName" TEXT,
    "companyType" TEXT,
    "country" TEXT,
    "region" TEXT,
    "description" TEXT,
    "identifiers" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompanyProfile_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CompanyProfile" ("companyType", "country", "createdAt", "description", "displayName", "groupId", "id", "identifiers", "legalName", "metadata", "organizationId", "region", "shortName", "status", "updatedAt") SELECT "companyType", "country", "createdAt", "description", "displayName", "groupId", "id", "identifiers", "legalName", "metadata", "organizationId", "region", "shortName", "status", "updatedAt" FROM "CompanyProfile";
DROP TABLE "CompanyProfile";
ALTER TABLE "new_CompanyProfile" RENAME TO "CompanyProfile";
CREATE UNIQUE INDEX "CompanyProfile_organizationId_key" ON "CompanyProfile"("organizationId");
CREATE INDEX "CompanyProfile_groupId_idx" ON "CompanyProfile"("groupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
