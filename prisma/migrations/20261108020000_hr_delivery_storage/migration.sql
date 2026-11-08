CREATE TYPE "HrLetterDeliveryStatus" AS ENUM ('NOT_SENT', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'UNKNOWN');
CREATE TYPE "HrLetterDocumentStatus" AS ENUM ('NOT_APPLICABLE', 'WAITING_EMPLOYMENT', 'PENDING', 'ARCHIVING', 'STORED', 'FAILED');

ALTER TABLE "HrLetter"
  ADD COLUMN "lastDeliveryEventAt" TIMESTAMP(3),
  ADD COLUMN "storedDocumentId" TEXT,
  ADD COLUMN "documentStorageStatus" "HrLetterDocumentStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "documentStorageStartedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryStatus" "HrLetterDeliveryStatus" NOT NULL DEFAULT 'NOT_SENT';

UPDATE "HrLetter" SET "deliveryStatus" = CASE
  WHEN "status" = 'SENDING' THEN 'SENDING'::"HrLetterDeliveryStatus"
  WHEN "status" = 'SENT' OR "status" IN ('ACCEPTED', 'DECLINED') AND "sentAt" IS NOT NULL THEN 'SENT'::"HrLetterDeliveryStatus"
  WHEN "status" = 'FAILED' THEN 'FAILED'::"HrLetterDeliveryStatus"
  WHEN "status" = 'DELIVERY_UNKNOWN' THEN 'UNKNOWN'::"HrLetterDeliveryStatus"
  ELSE 'NOT_SENT'::"HrLetterDeliveryStatus"
END;

UPDATE "HrLetter" SET "documentStorageStatus" = CASE
  WHEN "storedDocumentId" IS NOT NULL THEN 'STORED'::"HrLetterDocumentStatus"
  WHEN "providerReference" IS NOT NULL AND "employmentId" IS NOT NULL THEN 'PENDING'::"HrLetterDocumentStatus"
  WHEN "providerReference" IS NOT NULL AND "candidateId" IS NOT NULL THEN 'WAITING_EMPLOYMENT'::"HrLetterDocumentStatus"
  ELSE 'NOT_APPLICABLE'::"HrLetterDocumentStatus"
END;

CREATE UNIQUE INDEX "HrLetter_providerReference_key" ON "HrLetter"("providerReference");
CREATE UNIQUE INDEX "HrLetter_storedDocumentId_key" ON "HrLetter"("storedDocumentId");
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_storedDocumentId_fkey"
  FOREIGN KEY ("storedDocumentId") REFERENCES "HrDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HrLetterDeliveryEvent" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "letterId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrLetterDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HrLetterDeliveryEvent_providerEventId_key" ON "HrLetterDeliveryEvent"("providerEventId");
CREATE INDEX "HrLetterDeliveryEvent_letterId_occurredAt_idx" ON "HrLetterDeliveryEvent"("letterId", "occurredAt");
ALTER TABLE "HrLetterDeliveryEvent" ADD CONSTRAINT "HrLetterDeliveryEvent_letterId_fkey"
  FOREIGN KEY ("letterId") REFERENCES "HrLetter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
