-- CreateTable
CREATE TABLE "SiaRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "toolKey" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCost" REAL,
    "rationale" TEXT,
    "auditId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiaRun_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "SiaIdentity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaRun_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "AuditEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiaAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siaId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "requesterPersonId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "toolKey" TEXT NOT NULL,
    "parameters" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "authorization" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "requestId" TEXT,
    "resultId" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'NOT_RUN',
    "failureCode" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "auditId" TEXT,
    "executedAt" DATETIME,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiaAction_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "SiaIdentity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaAction_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaAction_requesterPersonId_fkey" FOREIGN KEY ("requesterPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaAction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OperationalRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaAction_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "AuditEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SiaContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siaId" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LEGACY',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "projectId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "ownerPersonId" TEXT,
    "confidence" REAL,
    "reviewAt" DATETIME,
    "expiresAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiaContext_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "SiaIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiaContext_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaContext_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiaContext_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SiaContext" ("createdAt", "id", "key", "organizationId", "siaId", "updatedAt", "value") SELECT "createdAt", "id", "key", "organizationId", "siaId", "updatedAt", "value" FROM "SiaContext";
DROP TABLE "SiaContext";
ALTER TABLE "new_SiaContext" RENAME TO "SiaContext";
CREATE INDEX "SiaContext_siaId_organizationId_category_status_idx" ON "SiaContext"("siaId", "organizationId", "category", "status");
CREATE UNIQUE INDEX "SiaContext_siaId_organizationId_key_key" ON "SiaContext"("siaId", "organizationId", "key");
CREATE TABLE "new_SiaIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'SIA',
    "title" TEXT NOT NULL DEFAULT 'MAXPASE GROUP Virtual CEO',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "description" TEXT,
    "configuration" TEXT,
    "configurationVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SiaIdentity" ("createdAt", "id", "metadata", "name", "status", "title", "updatedAt") SELECT "createdAt", "id", "metadata", "name", "status", "title", "updatedAt" FROM "SiaIdentity";
DROP TABLE "SiaIdentity";
ALTER TABLE "new_SiaIdentity" RENAME TO "SiaIdentity";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SiaRun_siaId_organizationId_createdAt_idx" ON "SiaRun"("siaId", "organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiaRun_userId_siaId_idempotencyKey_key" ON "SiaRun"("userId", "siaId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SiaAction_requestId_key" ON "SiaAction"("requestId");

-- CreateIndex
CREATE INDEX "SiaAction_siaId_organizationId_status_idx" ON "SiaAction"("siaId", "organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SiaAction_requesterUserId_siaId_idempotencyKey_key" ON "SiaAction"("requesterUserId", "siaId", "idempotencyKey");
