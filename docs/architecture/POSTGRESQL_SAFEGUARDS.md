# PostgreSQL Safeguard Mapping

Status (2026-10-26): **VERIFIED ON ISOLATED LOCAL POSTGRESQL 16; CURRENT-COMMIT CI FAILED 2 OF 790 TESTS; PRODUCTION POSTGRESQL 18 UNMIGRATED**. The active baseline is `prisma/migrations/20261025000000_initial/migration.sql`. The original SQLite SQL is preserved in `prisma/sqlite-migrations-archive`. A fresh local database applied the migration; repeat deploy, readiness, 13 enabled triggers, direct financial denials, transactional rollback, and concurrent posting checks passed. GitHub Actions rerun `40273303463` used disposable PostgreSQL 16 and reached the full test step (788 passed, 2 failed); the build step did not run. Local results do not prove PostgreSQL 18 compatibility or production sign-in. The production schema and Boss account were not changed.

| SQLite trigger | PostgreSQL invariant | Local PostgreSQL check |
| --- | --- | --- |
| `nicejobs_wallet_ledger_no_update` | Posted ledger rows cannot change. | Direct SQL update denial and rollback. |
| `nicejobs_wallet_ledger_no_delete` | Posted ledger rows cannot be deleted. | Direct SQL delete denial and rollback. |
| `nicejobs_wallet_ledger_valid_insert` | Posted status, nonzero amount, wallet currency and type/reference/sign rules. | Valid/invalid insert matrix. |
| `nicejobs_policy_version_immutable` | Published incentive terms cannot change. | Published versus draft update matrix. |
| `nicejobs_earning_calculation_immutable` | Earning calculation source and amount cannot change. | Direct SQL mutation denial. |
| `nicejobs_adjustment_proposal_immutable` | Financial proposal material cannot change. | Direct SQL mutation denial. |
| `nicejobs_statement_snapshot_immutable` | Statement source/snapshot immutable; approved/voided state cannot be reversed. | State-transition matrix. |
| `nicejobs_payout_no_false_confirmation` | No payout state update without a configured executor. | Any update denied; no payment implied. |
| `nicejobs_payout_valid_intent` | Only internal, approved, ledger-backed payout intent. | Forged/provider/amount cases. |
| `nicejobs_wallet_identity_immutable` | Wallet assignment and currency cannot change. | Direct SQL mutation denial. |
| `nicejobs_ledger_approved_source` | Approved human-origin earning/adjustment/settlement and bounded balance. | Concurrent posting, duplicate/replay, negative/overflow and SIA-source denial. |
| `NiceJobsAutomationPublishedMaterialImmutable` | Published rule definition/review material cannot change. | Published versus draft updates. |
| `NiceJobsAutomationPublishedDeleteForbidden` | Published automation version cannot be removed. | Published versus draft deletes. |

The ledger-source trigger updates the wallet revision before calculating the balance. Local concurrent PostgreSQL tests exercised posting and rollback; production concurrency remains unverified. The application still uses optimistic wallet revision checks and an independent human approval boundary. The DB trigger is the final enforcement layer for direct writes and concurrent requests. No payout provider is configured.

The baseline must pass an empty-database migration, repeat deployment, all safeguard cases above, rollback/audit tests, and recovery on an isolated PostgreSQL service. Any mismatch blocks launch; do not bypass a guard or mark a migration applied manually.
