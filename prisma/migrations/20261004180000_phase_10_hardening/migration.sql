CREATE TABLE "SecurityRateBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "SecurityRateBucket_key_windowStart_key" ON "SecurityRateBucket"("key", "windowStart");
CREATE INDEX "SecurityRateBucket_expiresAt_idx" ON "SecurityRateBucket"("expiresAt");
CREATE INDEX "Task_organizationId_status_dueDate_idx" ON "Task"("organizationId", "status", "dueDate");
CREATE INDEX "CommunicationMessage_organizationId_status_createdAt_idx" ON "CommunicationMessage"("organizationId", "status", "createdAt");
CREATE INDEX "SiaContext_siaId_organizationId_status_updatedAt_idx" ON "SiaContext"("siaId", "organizationId", "status", "updatedAt");
CREATE INDEX "OperationalEvent_organizationId_status_createdAt_idx" ON "OperationalEvent"("organizationId", "status", "createdAt");
