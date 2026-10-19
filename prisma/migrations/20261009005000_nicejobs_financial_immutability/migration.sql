-- Protect material financial snapshots, independent of application entry point.
CREATE TRIGGER nicejobs_policy_version_immutable BEFORE UPDATE ON NiceJobsIncentiveVersion
WHEN OLD.publishedAt IS NOT NULL AND (NEW.definition <> OLD.definition OR NEW.currency <> OLD.currency OR NEW.policyId <> OLD.policyId OR NEW.number <> OLD.number OR NEW.effectiveAt <> OLD.effectiveAt OR NEW.expiresAt IS NOT OLD.expiresAt OR NEW.ownerUserId <> OLD.ownerUserId OR NEW.reviewerUserId IS NOT OLD.reviewerUserId OR NEW.reviewedAt IS NOT OLD.reviewedAt OR NEW.publishedAt IS NOT OLD.publishedAt)
BEGIN SELECT RAISE(ABORT, 'Published incentive policy is immutable'); END;
CREATE TRIGGER nicejobs_earning_calculation_immutable BEFORE UPDATE ON NiceJobsIncentiveEarning
WHEN NEW.assignmentId <> OLD.assignmentId OR NEW.policyId <> OLD.policyId OR NEW.policyVersionId <> OLD.policyVersionId OR NEW.snapshotId <> OLD.snapshotId OR NEW.periodStart <> OLD.periodStart OR NEW.periodEnd <> OLD.periodEnd OR NEW.currency <> OLD.currency OR NEW.amountMinor IS NOT OLD.amountMinor OR NEW.eligibility <> OLD.eligibility OR NEW.calculation <> OLD.calculation OR NEW.creatorUserId <> OLD.creatorUserId
BEGIN SELECT RAISE(ABORT, 'Incentive calculation is immutable'); END;
CREATE TRIGGER nicejobs_adjustment_proposal_immutable BEFORE UPDATE ON NiceJobsWalletAdjustment
WHEN NEW.walletId <> OLD.walletId OR NEW.policyVersionId <> OLD.policyVersionId OR NEW.direction <> OLD.direction OR NEW.amountMinor <> OLD.amountMinor OR NEW.reason <> OLD.reason OR NEW.description <> OLD.description OR NEW.privateNote IS NOT OLD.privateNote OR NEW.creatorUserId <> OLD.creatorUserId
BEGIN SELECT RAISE(ABORT, 'Financial proposal is immutable'); END;
CREATE TRIGGER nicejobs_statement_snapshot_immutable BEFORE UPDATE ON NiceJobsSettlementStatement
WHEN NEW.periodId <> OLD.periodId OR NEW.walletId <> OLD.walletId OR NEW.currency <> OLD.currency OR NEW.amountMinor <> OLD.amountMinor OR NEW.snapshot <> OLD.snapshot OR OLD.status IN ('APPROVED', 'VOIDED') AND NEW.status <> OLD.status
BEGIN SELECT RAISE(ABORT, 'Settlement statement is immutable'); END;
CREATE TRIGGER nicejobs_payout_no_false_confirmation BEFORE UPDATE ON NiceJobsPayoutIntent
BEGIN SELECT RAISE(ABORT, 'No payment executor or provider is configured'); END;
CREATE TRIGGER nicejobs_payout_valid_intent BEFORE INSERT ON NiceJobsPayoutIntent
WHEN NEW.status <> 'PROVIDER_NOT_CONFIGURED' OR NEW.providerReference IS NOT NULL OR NEW.amountMinor <= 0 OR NOT EXISTS (SELECT 1 FROM NiceJobsSettlementStatement s JOIN NiceJobsWalletLedger l ON l.statementId = s.id WHERE s.id = NEW.statementId AND s.status = 'APPROVED' AND s.amountMinor = NEW.amountMinor AND s.currency = NEW.currency AND l.amountMinor = -s.amountMinor AND l.currency = s.currency)
BEGIN SELECT RAISE(ABORT, 'Invalid internal payout intent'); END;
CREATE TRIGGER nicejobs_wallet_identity_immutable BEFORE UPDATE ON NiceJobsWallet
WHEN NEW.assignmentId <> OLD.assignmentId OR NEW.currency <> OLD.currency
BEGIN SELECT RAISE(ABORT, 'Wallet owner and currency are immutable'); END;
CREATE TRIGGER nicejobs_ledger_approved_source BEFORE INSERT ON NiceJobsWalletLedger
WHEN NEW.type NOT IN ('CREDIT', 'ADJUSTMENT', 'REVERSAL', 'SETTLEMENT') OR ABS(NEW.amountMinor) > 9000000000000
OR COALESCE((SELECT SUM(amountMinor) FROM NiceJobsWalletLedger WHERE walletId = NEW.walletId), 0) + NEW.amountMinor NOT BETWEEN 0 AND 9000000000000
OR (NEW.type = 'CREDIT' AND NOT EXISTS (SELECT 1 FROM NiceJobsIncentiveEarning e JOIN NiceJobsWallet w ON w.id = NEW.walletId JOIN OperationalRequest r ON r.id = e.requestId WHERE e.id = NEW.earningId AND e.status = 'APPROVED' AND e.eligibility = 'ELIGIBLE' AND e.amountMinor = NEW.amountMinor AND e.currency = NEW.currency AND e.assignmentId = w.assignmentId AND r.status = 'APPROVED' AND r.siaId IS NULL))
OR (NEW.type IN ('ADJUSTMENT', 'REVERSAL') AND NOT EXISTS (SELECT 1 FROM NiceJobsWalletAdjustment a JOIN OperationalRequest r ON r.id = a.requestId WHERE a.id = NEW.adjustmentId AND a.status = 'APPROVED' AND a.walletId = NEW.walletId AND (CASE WHEN a.direction = 'CREDIT' THEN a.amountMinor ELSE -a.amountMinor END) = NEW.amountMinor AND r.status = 'APPROVED' AND r.siaId IS NULL))
OR (NEW.type = 'SETTLEMENT' AND NOT EXISTS (SELECT 1 FROM NiceJobsSettlementStatement s JOIN NiceJobsSettlementPeriod p ON p.id = s.periodId JOIN OperationalRequest r ON r.id = p.requestId WHERE s.id = NEW.statementId AND s.status = 'APPROVED' AND s.walletId = NEW.walletId AND -s.amountMinor = NEW.amountMinor AND s.currency = NEW.currency AND r.status = 'APPROVED' AND r.siaId IS NULL))
BEGIN SELECT RAISE(ABORT, 'Approved financial source and bounded funds required'); END;
