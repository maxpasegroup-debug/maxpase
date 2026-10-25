-- Reversal intent remains separate from the immutable original entry.
CREATE TABLE "NiceJobsWalletReversalProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adjustmentId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    CONSTRAINT "NiceJobsWalletReversalProposal_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "NiceJobsWalletAdjustment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NiceJobsWalletReversalProposal_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "NiceJobsWalletLedger" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NiceJobsWalletReversalProposal_adjustmentId_key" ON "NiceJobsWalletReversalProposal"("adjustmentId");
CREATE INDEX "NiceJobsWalletReversalProposal_ledgerId_idx" ON "NiceJobsWalletReversalProposal"("ledgerId");
