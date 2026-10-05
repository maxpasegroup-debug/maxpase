ALTER TABLE "ScheduledJob" ADD COLUMN "scanCursor" TEXT;
ALTER TABLE "ScheduledJob" ADD COLUMN "scanStartedAt" DATETIME;
ALTER TABLE "ScheduledJob" ADD COLUMN "scanRuleVersion" INTEGER;
