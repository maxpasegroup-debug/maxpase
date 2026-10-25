-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "website" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Brand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Brand" ("createdAt", "description", "id", "metadata", "name", "organizationId", "slug", "status", "updatedAt") SELECT "createdAt", "description", "id", "metadata", "name", "organizationId", "slug", "status", "updatedAt" FROM "Brand";
DROP TABLE "Brand";
ALTER TABLE "new_Brand" RENAME TO "Brand";
CREATE UNIQUE INDEX "Brand_organizationId_slug_key" ON "Brand"("organizationId", "slug");
CREATE TABLE "new_CompanyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT,
    "legalName" TEXT NOT NULL,
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
INSERT INTO "new_CompanyProfile" ("createdAt", "description", "displayName", "groupId", "id", "identifiers", "legalName", "metadata", "organizationId", "status", "updatedAt") SELECT "createdAt", "description", "displayName", "groupId", "id", "identifiers", "legalName", "metadata", "organizationId", "status", "updatedAt" FROM "CompanyProfile";
DROP TABLE "CompanyProfile";
ALTER TABLE "new_CompanyProfile" RENAME TO "CompanyProfile";
CREATE UNIQUE INDEX "CompanyProfile_organizationId_key" ON "CompanyProfile"("organizationId");
CREATE INDEX "CompanyProfile_groupId_idx" ON "CompanyProfile"("groupId");
CREATE TABLE "new_CompanyRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromCompanyId" TEXT NOT NULL,
    "toCompanyId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyRelationship_fromCompanyId_fkey" FOREIGN KEY ("fromCompanyId") REFERENCES "CompanyProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompanyRelationship_toCompanyId_fkey" FOREIGN KEY ("toCompanyId") REFERENCES "CompanyProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CompanyRelationship" ("createdAt", "fromCompanyId", "id", "metadata", "relationship", "status", "toCompanyId", "updatedAt") SELECT "createdAt", "fromCompanyId", "id", "metadata", "relationship", "status", "toCompanyId", "updatedAt" FROM "CompanyRelationship";
DROP TABLE "CompanyRelationship";
ALTER TABLE "new_CompanyRelationship" RENAME TO "CompanyRelationship";
CREATE UNIQUE INDEX "CompanyRelationship_fromCompanyId_toCompanyId_relationship_key" ON "CompanyRelationship"("fromCompanyId", "toCompanyId", "relationship");
CREATE TABLE "new_DepartmentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DepartmentProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DepartmentProfile" ("createdAt", "id", "organizationId", "updatedAt") SELECT "createdAt", "id", "organizationId", "updatedAt" FROM "DepartmentProfile";
DROP TABLE "DepartmentProfile";
ALTER TABLE "new_DepartmentProfile" RENAME TO "DepartmentProfile";
CREATE UNIQUE INDEX "DepartmentProfile_organizationId_key" ON "DepartmentProfile"("organizationId");
CREATE TABLE "new_Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "productId" TEXT,
    "ownerPersonId" TEXT,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "targetDate" DATETIME,
    "progress" REAL NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Goal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Goal_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Goal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Goal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Goal" ("createdAt", "id", "metadata", "organizationId", "projectId", "status", "title", "updatedAt") SELECT "createdAt", "id", "metadata", "organizationId", "projectId", "status", "title", "updatedAt" FROM "Goal";
DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";
CREATE TABLE "new_GroupProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GroupProfile" ("createdAt", "description", "id", "metadata", "name", "organizationId", "status", "updatedAt") SELECT "createdAt", "description", "id", "metadata", "name", "organizationId", "status", "updatedAt" FROM "GroupProfile";
DROP TABLE "GroupProfile";
ALTER TABLE "new_GroupProfile" RENAME TO "GroupProfile";
CREATE UNIQUE INDEX "GroupProfile_organizationId_key" ON "GroupProfile"("organizationId");
CREATE TABLE "new_Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "scope" TEXT NOT NULL DEFAULT 'ORGANIZATION',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Membership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Membership" ("createdAt", "id", "metadata", "organizationId", "personId", "status", "title", "updatedAt") SELECT "createdAt", "id", "metadata", "organizationId", "personId", "status", "title", "updatedAt" FROM "Membership";
DROP TABLE "Membership";
ALTER TABLE "new_Membership" RENAME TO "Membership";
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");
CREATE UNIQUE INDEX "Membership_personId_organizationId_key" ON "Membership"("personId", "organizationId");
CREATE TABLE "new_Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "parentId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Organization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Organization" ("createdAt", "description", "id", "metadata", "name", "parentId", "slug", "status", "type", "updatedAt") SELECT "createdAt", "description", "id", "metadata", "name", "parentId", "slug", "status", "type", "updatedAt" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_type_idx" ON "Organization"("type");
CREATE INDEX "Organization_parentId_idx" ON "Organization"("parentId");
CREATE TABLE "new_OwnershipRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "ownerPersonId" TEXT,
    "ownerOrgId" TEXT,
    "percentage" REAL,
    "ownershipType" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" DATETIME,
    "effectiveTo" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OwnershipRelationship_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OwnershipRelationship_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OwnershipRelationship_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OwnershipRelationship" ("companyId", "createdAt", "effectiveFrom", "effectiveTo", "id", "metadata", "ownerOrgId", "ownerPersonId", "percentage", "status", "updatedAt") SELECT "companyId", "createdAt", "effectiveFrom", "effectiveTo", "id", "metadata", "ownerOrgId", "ownerPersonId", "percentage", "status", "updatedAt" FROM "OwnershipRelationship";
DROP TABLE "OwnershipRelationship";
ALTER TABLE "new_OwnershipRelationship" RENAME TO "OwnershipRelationship";
CREATE INDEX "OwnershipRelationship_companyId_idx" ON "OwnershipRelationship"("companyId");
CREATE INDEX "OwnershipRelationship_ownerPersonId_idx" ON "OwnershipRelationship"("ownerPersonId");
CREATE INDEX "OwnershipRelationship_ownerOrgId_idx" ON "OwnershipRelationship"("ownerOrgId");
CREATE TABLE "new_Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Permission" ("createdAt", "description", "id", "key", "name", "scope", "updatedAt") SELECT "createdAt", "description", "id", "key", "name", "scope", "updatedAt" FROM "Permission";
DROP TABLE "Permission";
ALTER TABLE "new_Permission" RENAME TO "Permission";
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "legalName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Person" ("createdAt", "displayName", "email", "id", "legalName", "metadata", "phone", "updatedAt") SELECT "createdAt", "displayName", "email", "id", "legalName", "metadata", "phone", "updatedAt" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PRODUCT',
    "lifecycle" TEXT NOT NULL DEFAULT 'CONCEPT',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("brandId", "createdAt", "description", "id", "metadata", "name", "organizationId", "slug", "status", "updatedAt") SELECT "brandId", "createdAt", "description", "id", "metadata", "name", "organizationId", "slug", "status", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_organizationId_slug_key" ON "Product"("organizationId", "slug");
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT,
    "brandId" TEXT,
    "ownerPersonId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "startDate" DATETIME,
    "targetDate" DATETIME,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("createdAt", "description", "id", "metadata", "name", "organizationId", "productId", "slug", "status", "updatedAt") SELECT "createdAt", "description", "id", "metadata", "name", "organizationId", "productId", "slug", "status", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "Project"("organizationId", "slug");
CREATE TABLE "new_Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Role" ("createdAt", "description", "id", "key", "name", "organizationId", "system", "updatedAt") SELECT "createdAt", "description", "id", "key", "name", "organizationId", "system", "updatedAt" FROM "Role";
DROP TABLE "Role";
ALTER TABLE "new_Role" RENAME TO "Role";
CREATE UNIQUE INDEX "Role_organizationId_key_key" ON "Role"("organizationId", "key");
CREATE TABLE "new_SiaApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siaId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiaApproval_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "SiaIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SiaApproval" ("action", "createdAt", "id", "metadata", "requestedByUserId", "siaId", "status", "updatedAt") SELECT "action", "createdAt", "id", "metadata", "requestedByUserId", "siaId", "status", "updatedAt" FROM "SiaApproval";
DROP TABLE "SiaApproval";
ALTER TABLE "new_SiaApproval" RENAME TO "SiaApproval";
CREATE TABLE "new_SiaContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siaId" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiaContext_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "SiaIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiaContext_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SiaContext" ("createdAt", "id", "key", "organizationId", "siaId", "updatedAt", "value") SELECT "createdAt", "id", "key", "organizationId", "siaId", "updatedAt", "value" FROM "SiaContext";
DROP TABLE "SiaContext";
ALTER TABLE "new_SiaContext" RENAME TO "SiaContext";
CREATE UNIQUE INDEX "SiaContext_siaId_organizationId_key_key" ON "SiaContext"("siaId", "organizationId", "key");
CREATE TABLE "new_SiaGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiaGoal_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "SiaIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SiaGoal" ("createdAt", "id", "metadata", "siaId", "status", "title", "updatedAt") SELECT "createdAt", "id", "metadata", "siaId", "status", "title", "updatedAt" FROM "SiaGoal";
DROP TABLE "SiaGoal";
ALTER TABLE "new_SiaGoal" RENAME TO "SiaGoal";
CREATE TABLE "new_SiaIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'SIA',
    "title" TEXT NOT NULL DEFAULT 'MAXPASE GROUP Virtual CEO',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SiaIdentity" ("createdAt", "id", "metadata", "name", "status", "title", "updatedAt") SELECT "createdAt", "id", "metadata", "name", "status", "title", "updatedAt" FROM "SiaIdentity";
DROP TABLE "SiaIdentity";
ALTER TABLE "new_SiaIdentity" RENAME TO "SiaIdentity";
CREATE TABLE "new_SiaTool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siaId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissionKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiaTool_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "SiaIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SiaTool" ("createdAt", "description", "enabled", "id", "key", "metadata", "name", "permissionKey", "siaId", "updatedAt") SELECT "createdAt", "description", "enabled", "id", "key", "metadata", "name", "permissionKey", "siaId", "updatedAt" FROM "SiaTool";
DROP TABLE "SiaTool";
ALTER TABLE "new_SiaTool" RENAME TO "SiaTool";
CREATE UNIQUE INDEX "SiaTool_siaId_key_key" ON "SiaTool"("siaId", "key");
CREATE TABLE "new_SystemConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SystemConfiguration" ("createdAt", "description", "id", "key", "updatedAt", "value") SELECT "createdAt", "description", "id", "key", "updatedAt", "value" FROM "SystemConfiguration";
DROP TABLE "SystemConfiguration";
ALTER TABLE "new_SystemConfiguration" RENAME TO "SystemConfiguration";
CREATE UNIQUE INDEX "SystemConfiguration_key_key" ON "SystemConfiguration"("key");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "goalId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("createdAt", "goalId", "id", "metadata", "organizationId", "projectId", "status", "title", "updatedAt") SELECT "createdAt", "goalId", "id", "metadata", "organizationId", "projectId", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE TABLE "new_TeamProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TeamProfile" ("createdAt", "id", "organizationId", "updatedAt") SELECT "createdAt", "id", "organizationId", "updatedAt" FROM "TeamProfile";
DROP TABLE "TeamProfile";
ALTER TABLE "new_TeamProfile" RENAME TO "TeamProfile";
CREATE UNIQUE INDEX "TeamProfile_organizationId_key" ON "TeamProfile"("organizationId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "personId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "passwordHash", "personId", "status", "updatedAt") SELECT "createdAt", "email", "id", "passwordHash", "personId", "status", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
