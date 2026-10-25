CREATE TABLE "ExecutiveRecord" (
 "id" TEXT NOT NULL PRIMARY KEY, "kind" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "projectId" TEXT,
 "ownerPersonId" TEXT NOT NULL, "title" TEXT NOT NULL, "status" TEXT NOT NULL, "payload" TEXT NOT NULL,
 "sourceKey" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0, "dueAt" DATETIME,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "ExecutiveHistory" (
 "id" TEXT NOT NULL PRIMARY KEY, "recordId" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
 "fromStatus" TEXT, "toStatus" TEXT NOT NULL, "reason" TEXT NOT NULL, "observation" REAL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("recordId") REFERENCES "ExecutiveRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExecutiveRecord_sourceKey_key" ON "ExecutiveRecord"("sourceKey");
CREATE INDEX "ExecutiveRecord_organizationId_kind_status_idx" ON "ExecutiveRecord"("organizationId","kind","status");
CREATE INDEX "ExecutiveRecord_projectId_kind_status_idx" ON "ExecutiveRecord"("projectId","kind","status");
CREATE INDEX "ExecutiveRecord_dueAt_idx" ON "ExecutiveRecord"("dueAt");
CREATE INDEX "ExecutiveHistory_recordId_createdAt_idx" ON "ExecutiveHistory"("recordId","createdAt");
