# Nice Jobs Incentive, Wallet and Settlement Architecture

Phase 09 extends the accepted workforce, evidence, authorization and operational-control architecture. It does not implement payroll, taxes, banking, payment delivery or Phase 10 automation. No actual rates, balances, compensation or business policies are seeded.

## Authoritative Boundaries

Canonical readiness-backed assignments identify workers, actual divisions and published job versions. Published Phase 08 performance frameworks and snapshots supply evidence; raw tasks, lead activity, reports and performance scores never directly credit money. Explicit `nicejobs.finance.*` capabilities are registered independently of job titles and must be assigned by an authorized human.

`createFinanceService` implements transactional commands. Corporate and Nice Jobs portal routes use their existing isolated authentication sessions, origin checks, portal policy and rate limits. Identity comes from the verified session, not a client-supplied actor. Resource, assignment, company, division and product relationships are resolved server-side. Financial resources also pass through canonical operation/notification resource authorization.

## Policy and Eligibility

`NiceJobsIncentivePolicy` is a stable company/division/job-version process identity. `NiceJobsIncentiveVersion` pins a published performance framework, metric, supported currency, effective interval, explicit eligibility, exact calculation rule, rounding and approval/settlement control points.

Lifecycle: `DRAFT -> REVIEW -> PUBLISHED -> ARCHIVED`. Review requires an independent human person, including across multiple accounts. Publication rechecks reviewer authority and configuration. Published material is immutable; later versions require a later effective date. Status, revision and publication timestamps are not substitutes for a fresh independent review. Archived versions preserve history but cannot generate new calculations.

Eligibility is explicitly configured: active/readiness requirement, minimum actual, eligible performance states and optional PIP exclusions. PIP-dependent evaluation requires independent PIP read access. Missing/unsupported configuration produces no payable result. Positive recorded source evidence is mandatory even for fixed/percentage rules; a policy is never assumed from a job title.

Supported rules: fixed amount, per integer canonical count, explicit-base percentage in integer basis points, threshold and ascending highest-matching tier. `CUSTOM_POLICY` is represented but deliberately unsupported/nonpayable. No user expressions, dynamic code or inferred revenue execute. Percentage bases are policy values, not evidence of a sale or payment.

## Money

Money is signed integer minor units in Prisma `BigInt`/SQLite INTEGER. APIs and UI projections serialize it as decimal strings. Arithmetic, precision conversion, thresholds and monetary rounding use `bigint`; never `Number`, floating-point multiplication or currency conversion. Supported precision is INR/USD/EUR/GBP/AED (2), JPY (0), KWD (3). Unknown currencies fail closed. The +/-9,000,000,000,000 minor-unit bound is a technical safety limit, not a compensation policy. Inputs exceeding currency precision or the bound are rejected rather than silently rounded.

## Calculation and Approval

`NiceJobsIncentiveEarning` binds assignment + stable policy + closed `[start,end)` period uniquely. Its immutable calculation freezes policy, metric, actual input, source references, evidence coverage/sample metadata, rule, rounding, currency, result and calculation timestamp; canonical immutable policy/snapshot references and hashes remain attached. Correcting a performance snapshot or publishing a new policy cannot create another earning for the same stable policy period. Financial corrections require independent approved adjustments/reversals.

Calculation does not credit a wallet. Lifecycle: `CALCULATED -> UNDER_REVIEW -> APPROVED/REJECTED`, then explicitly controlled `POSTED` after approval. Draft calculations may be `VOIDED`; rejected/voided history is retained. Zero is a calculated zero, not missing data, and cannot create a zero ledger entry. Ineligible and unsupported results have a null payable amount, not fabricated earnings.

Canonical `OperationalRequest`, `ControlPoint`, `ApprovalRule`, `SiaApproval`, audit and notifications provide configurable sequential/parallel human chains. Financial control points must be active, same-division, independent and require the matching financial approval capability. The shared approval recipient guard rejects beneficiary self-approval across account aliases, mismatched request/control/resource binding and SIA requests. Creator self-approval remains forbidden by canonical independent control policy. Generic approval routes cannot bypass these checks. Generic decisions/cancellation/expiry atomically update the financial record; unsuccessful settlements release claims while retaining voided statements.

Posting rechecks current human approval authority, actor capability, source access, uniqueness and revision. Revoked approval authority prevents new financial posting but does not rewrite already posted historical money.

## Wallet and Corrections

`NiceJobsWallet` has assignment, currency, status and revision, not an editable balance. Wallet opening requires actual active readiness-backed employment and an applicable published currency policy. Authorized historical self reads do not disappear merely because an assignment ended; current account and scoped permission are still required.

`NiceJobsWalletLedger` is append-only. Types are `CREDIT`, `ADJUSTMENT`, `REVERSAL`, `SETTLEMENT`. Every entry has an authoritative source, exact amount, currency, actor, timestamp and unique reference. Unique earning/adjustment/statement/reversal keys prevent double posting. Database triggers reject updates/deletes, zero entries, unsupported types, mismatched amounts/currencies, unapproved sources and negative/overflowing posted balances.

`NiceJobsWalletAdjustment` is an immutable human proposal under an explicitly configured independent adjustment control. Private notes require separate financial-private capability and are never projected to workers/SIA. `NiceJobsWalletReversalProposal` binds an adjustment to an original entry; approval produces an exact compensating entry. Original entries remain unchanged. Reserved, already reversed, reversal and settlement-debit entries cannot be reversed. Insufficient unreserved funds prevent debit posting.

Balance projections distinguish posted, pending calculation/approval, review-reserved, available and approved-settlement-reserved-for-payout. Confirmed transferred amount is unavailable (`null`), never an inferred zero or successful payment. Wallet summaries use three scoped grouped financial reads for the authorized page, rather than per-wallet ledger reads.

## Settlement and Payout

`NiceJobsSettlementPeriod` pins a stable policy/version and explicit closed UTC instant window, maximum 366 days. Periods cannot overlap within the same policy. This release settles one configured job policy at a time; it is not a whole-company payroll period. Windows apply to ledger posting timestamps, not worker local report dates. No calendar/scheduler silently selects or executes periods.

`NiceJobsSettlementStatement` freezes exact eligible unclaimed ledger lines, currency and total for one wallet. `NiceJobsSettlementLine.activeLedgerId` is a unique reservation claim. Generation is explicit and bounded: at most 100 statements per period and 250 lines per statement. Oversized/nonpositive/insufficient funds fail explicitly; no hidden truncation or invented deductions. Cancellation/rejection releases claims but retains original statement/line history. Approved statements are immutable.

Period lifecycle: `OPEN -> REVIEW -> APPROVAL_GRANTED -> APPROVED -> CLOSED`, with explicit rejection/cancellation/expiry. `APPROVAL_GRANTED` is a human decision, not money movement. `SETTLEMENT_POST` consumes review reservations and records unique negative ledger entries atomically, earmarking the corresponding approved statement for future payout. `CLOSED` is administrative closure, not proof of payment. There is no enabled `PAID`/`SETTLED` transition.

`NiceJobsPayoutIntent` is unique per approved posted statement. Its amount/currency derive from the statement and reconciled debit, not the client. It always reports `PROVIDER_NOT_CONFIGURED`; provider references stay null. Database guards reject invented delivery status or altered intents. No payment executor, bank/provider integration or confirmation endpoint exists. Approved settlement cancellation/settlement-debit reversal is intentionally unsupported; any future repair needs a separately designed approval-backed accounting mechanism, not mutable history.

## Reconciliation and Exceptions

Reconciliation compares ledger ownership/currency/source amounts and states, posted earning/adjustment links, statement line totals/debits and payout boundary. Scoped aggregate/join checks surface mismatches without loading unbounded ledger rows or silently fixing money. `NiceJobsFinanceException` records reconciliation failures, accepted nonpayable or unsupported calculations, and unavailable-provider payout intents with audit/event references. Reconciliation discrepancies report a failed outcome in audit and operational events. Other invalid or unauthorized commands roll back and return explicit errors; they are not all persisted as exceptions. The UI never displays stack traces.

## Views and SIA

Corporate and Nice Jobs gateways share permission-checked worker Wallet/Incentives/Statements/Payout Status and management Policies/Incentives/Wallets/Adjustments/Settlements/Statements/Payouts/Exceptions views. Lists use bounded stable-ID pagination and authorized filters. Worker monetary history is distinct from performance evidence: opening a calculation's source explanation additionally requires current performance and source access, and worker-visible metric classification. Statement line details contain owned ledger history, never management-private notes.

Financial SIA projections use the existing read-only worker tool with human AND agent source authorization: maximum three wallets, three entries each, three statements, no management/private data and no financial write tool. Proposals, approvals, credit/debit, reversal, settlement, payout and compensation changes remain human controlled. Deterministic explanations do not claim provider payment or autonomous authority.

## Atomicity and Migration

Each accepted command, source mutation, canonical approval, event, audit and generated notification commits in one transaction. Actor-bound idempotency fingerprints are checked only after current scope/capability checks; natural financial unique keys provide a second duplicate boundary. Wallet/record revision checks serialize conflicting updates; a busy/stale failure requires refresh/retry, never blind monetary replay. Scheduled/distributed infrastructure is not introduced.

Three additive local migrations introduce 12 financial tables and immutable-financial triggers. No pre-Phase09 table columns are rewritten. The readiness release manifest records intentional migration checksums. Validation uses isolated synthetic fixtures, populated pre09 history, repeated migration, schema drift, integrity, restoration and re-upgrade. Production rollout/backup/restore and real financial policy sign-off remain separate operational gates.
