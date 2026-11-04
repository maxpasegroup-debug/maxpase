-- Store successful Nice Jobs TARA turns on their existing audited SIA run.
ALTER TABLE "SiaRun" ADD COLUMN "conversationPrompt" VARCHAR(2000),
ADD COLUMN "conversationResponse" TEXT,
ADD COLUMN "conversationContext" VARCHAR(240);

CREATE INDEX "SiaRun_userId_conversationContext_createdAt_idx"
ON "SiaRun"("userId", "conversationContext", "createdAt");
