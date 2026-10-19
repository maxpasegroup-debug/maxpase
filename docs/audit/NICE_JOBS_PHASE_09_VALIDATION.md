# Nice Jobs Phase 09 Validation

Scope: incentive policy, calculation, wallet, settlement and internal payout intent. Local implementation and validation: 2026-10-09, Asia/Kolkata. Architecture: [Incentive, Wallet and Settlement](../architecture/NICE_JOBS_INCENTIVE_WALLET_SETTLEMENT_ARCHITECTURE.md).

## Validation Evidence

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Focused financial regressions | PASS | 20 tests in `tests/nicejobs-finance.test.ts`; final focused run 20/20 in 20.74 seconds |
| Complete regression | PASS | 501 tests across 33 files; final run 485.34 seconds, including accepted earlier phases |
| Lint | PASS | `npm.cmd run lint`, exit 0 |
| TypeScript | PASS | `npm.cmd run typecheck`, exit 0; repeated after restoring generated preview metadata |
| Production build | PASS | `npm.cmd run build`, Next.js 15.5.27, exit 0; local build only |
| Prisma schema | PASS | `npx.cmd prisma validate`, Prisma 6.16.2 |
| Local migration status | PASS | 24 migrations applied; `prisma migrate status` reports up to date |
| Fresh/repeat/drift/restore | PASS | `npm.cmd run validate:migrations`; fresh chain, repeat deploy, zero drift, integrity and isolated snapshot/restore |
| Populated Phase 08 upgrade | PASS | `npx.cmd tsx scripts/validate-nicejobs-finance-upgrade.ts`; preserved original columns in 107 tables, repeated upgrade, drift, integrity, restore and re-upgrade |
| Existing development database | PASS | All 12 financial tables have zero rows; SQLite integrity `ok`, zero foreign key violations, 24 applied migrations. No real rates, policies, balances or payouts seeded |
| Browser workflows | PASS | Isolated Chrome 154.0.8037.98; 68 captures at 320/390/768/1440, zero page errors and no document overflow. Final runner exited 0 after scoped fixture cleanup |
| Visual inspection | MANUAL VALIDATION | Inspected 320px worker wallet and management policy/statement detail. Amounts and long labels remain visible. Development Next overlay can cover content in screenshots |
| Local HTTP preview | PASS | Development preview at `http://127.0.0.1:3004` with a process-local temporary signing secret and existing empty financial database: root, health and ready 200; anonymous corporate and Jobs financial views redirect 307 to their separate login routes |
| Scale fixture | PASS | 315 wallets; first 25 records returned with 31 queries including three grouped financial reads. Single execution 23ms in the final focused run; not an endpoint latency percentile or production capacity test |
| Production | NOT DEPLOYED | Domains/TLS, production provider, monitoring, backups, restore, rollback and live authentication not validated |

Machine-readable browser evidence: [NICE_JOBS_PHASE_09_BROWSER.json](NICE_JOBS_PHASE_09_BROWSER.json). Screenshots are ignored local artifacts under `.next-portal-smoke/`.

## Integrity And Security Coverage

The focused tests cover strict command input; integer minor-unit precision and bounds; unsupported and zero results; immutable policy review/publication/versioning; canonical source evidence and calculation snapshots; independent sequential and parallel approval chains; beneficiary alias self-approval rejection; revocation after approval; actor/scope/company isolation; replay and concurrent posting; append-only ledger and database triggers; approved reversals; reservation and rejection release; immutable statements and payout intent boundary; insufficient balance; private notes; source-access rechecks; reconciliation mismatch; human and agent permission intersection; transactional rollback; and bounded wallet listing. The browser workflow exercises real readiness-backed activation, policy publication, measured task evidence, human decisions, posting, settlement, provider-unavailable payout intent, SIA read context and corporate/Jobs session isolation. Fixture records use synthetic values in isolated databases only.

## Operating Limits

1. The registered `nicejobs.finance.*` capabilities are not automatically granted to real users. Actual rates, eligibility, approvers and control points require authorized human configuration and sign-off.
2. Supported currencies are INR, USD, EUR, GBP, AED, JPY and KWD with their fixed minor-unit precision. There is no FX, tax, payroll, banking, revenue inference or payment provider. `CUSTOM_POLICY` remains nonpayable.
3. Settlement uses explicit UTC posting-time windows for one published job policy at a time, at most 366 days, 100 statements per period and 250 lines per statement. Approved settlement debit reversal is not implemented. `CLOSED` and an internal payout intent do not mean payment occurred.
4. Lists are bounded to 25 by default and 100 maximum. Configuration choices are bounded to 50 without complete typeahead pagination. Scale evidence is one local SQLite fixture, not p95/p99, sustained concurrency or production capacity.
5. Invalid and unauthorized commands return explicit errors and roll back; they are not all persisted as finance exceptions. Accepted nonpayable calculations, unavailable provider intents and reconciliation discrepancies create explicit exception records. Reconciliation does not repair money automatically.
6. Financial source explanations require current performance and source authorization. SIA may read at most three wallets, three entries per wallet and three statements under human AND agent permissions. It has no financial write or payment tool.
7. Browser evidence is local Chrome at simulated viewports with basic focus checks. Physical devices, other browsers, screen readers, complete keyboard and representative-manager usability sessions are NOT RUN. Production deployment, all-domain routing/TLS, monitoring, backups, restore and rollback are NOT RUN.

## Recommended Next Phase

After Phase 09 acceptance and real policy sign-off: **PHASE 10 - AUTOMATION + WORKFORCE COMMAND CENTER**. Phase 10 was not implemented here.
