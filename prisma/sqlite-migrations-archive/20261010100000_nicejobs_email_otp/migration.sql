ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" DATETIME;

CREATE TABLE "EmailAuthChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "providerRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailAuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailAuthChallenge_purpose_check" CHECK ("purpose" IN ('LOGIN', 'RESET')),
    CONSTRAINT "EmailAuthChallenge_status_check" CHECK ("status" IN ('PENDING', 'SENT', 'CONSUMED', 'FAILED', 'CANCELLED')),
    CONSTRAINT "EmailAuthChallenge_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5)
);
CREATE INDEX "EmailAuthChallenge_userId_purpose_status_idx" ON "EmailAuthChallenge"("userId", "purpose", "status");
CREATE INDEX "EmailAuthChallenge_expiresAt_idx" ON "EmailAuthChallenge"("expiresAt");
