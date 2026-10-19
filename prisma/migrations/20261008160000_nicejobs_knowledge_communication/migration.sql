-- CreateTable
CREATE TABLE "NiceJobsKnowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NiceJobsKnowledge_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledge_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsKnowledgeVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "current" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'WORKER',
    "jobId" TEXT,
    "jobVersionId" TEXT,
    "assignmentId" TEXT,
    "managerId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "body" TEXT,
    "resourceType" TEXT,
    "url" TEXT,
    "privateReference" TEXT,
    "communicationType" TEXT,
    "communicationTemplateId" TEXT,
    "relatedVersionId" TEXT,
    "requiredAck" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "effectiveAt" DATETIME,
    "reviewAt" DATETIME,
    "expiresAt" DATETIME,
    "scheduledAt" DATETIME,
    "reviewedByUserId" TEXT,
    "reviewedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NiceJobsKnowledgeVersion_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "NiceJobsKnowledge" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "NiceJobsTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeVersion_jobVersionId_fkey" FOREIGN KEY ("jobVersionId") REFERENCES "NiceJobsVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeVersion_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeVersion_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeVersion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeVersion_communicationTemplateId_fkey" FOREIGN KEY ("communicationTemplateId") REFERENCES "CommunicationTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeVersion_relatedVersionId_fkey" FOREIGN KEY ("relatedVersionId") REFERENCES "NiceJobsKnowledgeVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsSopStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "checklist" TEXT,
    "warning" TEXT,
    "escalation" TEXT,
    "resourceVersionId" TEXT,
    "taskId" TEXT,
    CONSTRAINT "NiceJobsSopStep_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NiceJobsKnowledgeVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsSopStep_resourceVersionId_fkey" FOREIGN KEY ("resourceVersionId") REFERENCES "NiceJobsKnowledgeVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsSopStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsKnowledgeReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "readAt" DATETIME,
    "acknowledgedAt" DATETIME,
    "archivedAt" DATETIME,
    "evidenceReference" TEXT,
    CONSTRAINT "NiceJobsKnowledgeReceipt_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NiceJobsKnowledgeVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeReceipt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "NiceJobsAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NiceJobsKnowledgeWorkLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "taskId" TEXT,
    "leadId" TEXT,
    "followupId" TEXT,
    CONSTRAINT "NiceJobsKnowledgeWorkLink_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NiceJobsKnowledgeVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeWorkLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeWorkLink_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "NiceJobsLead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsKnowledgeWorkLink_followupId_fkey" FOREIGN KEY ("followupId") REFERENCES "NiceJobsLeadFollowup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NiceJobsKnowledge_companyId_kind_idx" ON "NiceJobsKnowledge"("companyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeVersion_communicationTemplateId_key" ON "NiceJobsKnowledgeVersion"("communicationTemplateId");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeVersion_organizationId_visibility_status_current_id_idx" ON "NiceJobsKnowledgeVersion"("organizationId", "visibility", "status", "current", "id");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeVersion_jobId_jobVersionId_status_current_idx" ON "NiceJobsKnowledgeVersion"("jobId", "jobVersionId", "status", "current");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeVersion_assignmentId_managerId_status_current_idx" ON "NiceJobsKnowledgeVersion"("assignmentId", "managerId", "status", "current");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeVersion_resourceType_status_current_id_idx" ON "NiceJobsKnowledgeVersion"("resourceType", "status", "current", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeVersion_contentId_number_key" ON "NiceJobsKnowledgeVersion"("contentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSopStep_versionId_order_key" ON "NiceJobsSopStep"("versionId", "order");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeReceipt_assignmentId_readAt_acknowledgedAt_archivedAt_idx" ON "NiceJobsKnowledgeReceipt"("assignmentId", "readAt", "acknowledgedAt", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeReceipt_versionId_assignmentId_key" ON "NiceJobsKnowledgeReceipt"("versionId", "assignmentId");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeWorkLink_taskId_idx" ON "NiceJobsKnowledgeWorkLink"("taskId");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeWorkLink_leadId_idx" ON "NiceJobsKnowledgeWorkLink"("leadId");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeWorkLink_followupId_idx" ON "NiceJobsKnowledgeWorkLink"("followupId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeWorkLink_versionId_taskId_key" ON "NiceJobsKnowledgeWorkLink"("versionId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeWorkLink_versionId_leadId_key" ON "NiceJobsKnowledgeWorkLink"("versionId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeWorkLink_versionId_followupId_key" ON "NiceJobsKnowledgeWorkLink"("versionId", "followupId");
