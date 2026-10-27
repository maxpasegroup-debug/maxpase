-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configuration" TEXT NOT NULL,
    "credentialReference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Integration_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunicationPolicy" (
    "projectId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "configuration" TEXT NOT NULL,
    "controlPointId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunicationPolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationPolicy_controlPointId_fkey" FOREIGN KEY ("controlPointId") REFERENCES "ControlPoint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunicationConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunicationConsent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationConsent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunicationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "ownerPersonId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunicationTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationTemplate_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunicationThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "integrationId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "participants" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunicationThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationThread_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunicationMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "threadId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "policyId" TEXT,
    "consentId" TEXT NOT NULL,
    "templateId" TEXT,
    "requestId" TEXT,
    "creatorUserId" TEXT,
    "creatorPersonId" TEXT,
    "siaId" TEXT,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sensitivity" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    "externalReference" TEXT,
    "reference" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "approvalBinding" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" DATETIME,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "failureCode" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" DATETIME,
    "sentAt" DATETIME,
    "deliveredAt" DATETIME,
    "readAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunicationMessage_creatorPersonId_fkey" FOREIGN KEY ("creatorPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationMessage_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "SiaIdentity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommunicationThread" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationMessage_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationMessage_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "CommunicationPolicy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationMessage_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "CommunicationConsent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationMessage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CommunicationTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OperationalRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationMessage_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureCode" TEXT,
    "operationalEventId" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurredAt" DATETIME NOT NULL,
    CONSTRAINT "IntegrationEvent_operationalEventId_fkey" FOREIGN KEY ("operationalEventId") REFERENCES "OperationalEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IntegrationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IntegrationEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "ownerPersonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomationRule_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AutomationRule_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AUTOMATION_SCAN',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "intervalMinutes" INTEGER NOT NULL,
    "maxRuns" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nextRunAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "failureCode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduledJob_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultId" TEXT,
    "failureCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunicationRateBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "CommunicationRateBucket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Integration_organizationId_channel_status_idx" ON "Integration"("organizationId", "channel", "status");

-- CreateIndex
CREATE INDEX "CommunicationPolicy_organizationId_status_idx" ON "CommunicationPolicy"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationConsent_organizationId_personId_channel_key" ON "CommunicationConsent"("organizationId", "personId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationConsent_organizationId_channel_address_key" ON "CommunicationConsent"("organizationId", "channel", "address");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationTemplate_organizationId_key_version_key" ON "CommunicationTemplate"("organizationId", "key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationThread_reference_key" ON "CommunicationThread"("reference");

-- CreateIndex
CREATE INDEX "CommunicationThread_organizationId_projectId_lastActivityAt_idx" ON "CommunicationThread"("organizationId", "projectId", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_requestId_key" ON "CommunicationMessage"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_reference_key" ON "CommunicationMessage"("reference");

-- CreateIndex
CREATE INDEX "CommunicationMessage_organizationId_projectId_status_idx" ON "CommunicationMessage"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "CommunicationMessage_status_nextRetryAt_idx" ON "CommunicationMessage"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_integrationId_externalReference_key" ON "CommunicationMessage"("integrationId", "externalReference");

-- CreateIndex
CREATE INDEX "IntegrationEvent_organizationId_status_receivedAt_idx" ON "IntegrationEvent"("organizationId", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_integrationId_externalEventId_key" ON "IntegrationEvent"("integrationId", "externalEventId");

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_enabled_idx" ON "AutomationRule"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "ScheduledJob_organizationId_enabled_nextRunAt_idx" ON "ScheduledJob"("organizationId", "enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_reference_key" ON "AutomationRun"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationRateBucket_key_key" ON "CommunicationRateBucket"("key");

-- CreateIndex
CREATE INDEX "CommunicationRateBucket_expiresAt_idx" ON "CommunicationRateBucket"("expiresAt");
