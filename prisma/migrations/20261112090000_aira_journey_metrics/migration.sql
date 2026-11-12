CREATE TABLE "AiraJourneyDailyMetric" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "eventType" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiraJourneyDailyMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiraJourneyDailyMetric_day_eventType_brand_key"
ON "AiraJourneyDailyMetric"("day", "eventType", "brand");

CREATE INDEX "AiraJourneyDailyMetric_day_idx"
ON "AiraJourneyDailyMetric"("day");
