CREATE TABLE "NexaIdentity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "NexaDirective" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nexaId" TEXT NOT NULL,
  "bossUserId" TEXT NOT NULL,
  "directorUserId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siaId" TEXT,
  "actionId" TEXT,
  "bossInstruction" TEXT NOT NULL,
  "groupPlan" TEXT NOT NULL,
  "directorBrief" TEXT NOT NULL,
  "siaPreparation" TEXT,
  "decisionReason" TEXT,
  "outcome" TEXT NOT NULL DEFAULT 'AWAITING_DIRECTOR',
  "status" TEXT NOT NULL DEFAULT 'DIRECTOR_REVIEW',
  "version" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "decidedAt" DATETIME,
  "preparedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NexaDirective_nexaId_fkey" FOREIGN KEY ("nexaId") REFERENCES "NexaIdentity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NexaDirective_bossUserId_fkey" FOREIGN KEY ("bossUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NexaDirective_directorUserId_fkey" FOREIGN KEY ("directorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NexaDirective_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NexaDirective_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "SiaIdentity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NexaDirective_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "SiaAction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NexaDirective_actionId_key" ON "NexaDirective"("actionId");
CREATE UNIQUE INDEX "NexaDirective_bossUserId_idempotencyKey_key" ON "NexaDirective"("bossUserId", "idempotencyKey");
CREATE INDEX "NexaDirective_directorUserId_organizationId_status_idx" ON "NexaDirective"("directorUserId", "organizationId", "status");
CREATE INDEX "NexaDirective_organizationId_status_createdAt_idx" ON "NexaDirective"("organizationId", "status", "createdAt");
