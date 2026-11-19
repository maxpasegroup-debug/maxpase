# AIRA Startup Skool — Phase 6: Budgets, Expenses, Purchases, and Bills

## Delivery

Phase 6 adds centre and department finance workflows to the existing Startup Skool Operations Desk. Records use the existing `ExecutiveRecord`, `ExecutiveHistory`, `NiceJobsContentFile`, private content storage, and operational-event infrastructure. No database migration was added.

### Budget workflow

- The AO prepares a budget proposal with centre, district (from the centre record), department, financial year, amount, purpose, and assumptions.
- A proposal remains pending until an authorized Startup Skool Director approves or declines it.
- Only an approved allocation can be selected for a purchase, expense, bill, or reimbursement request.
- Budgets display approved amount, committed approvals, actual paid amount, and remaining uncommitted balance.
- A centre / district report groups approved allocation, commitments, and actual paid amounts.

### Requests, approval, and payment

- Centre managers, department submitters, the AO, and Director roles with submission permission can submit purchase, expense, bill, and reimbursement requests against a matching approved centre/department/period allocation.
- Bill and reimbursement submissions require a PDF/image. Other request types can attach a bill at submission or add one after approval.
- The AO reviews submitted requests and routes them to the Director. The AO can approve only requests within the Director-configured routine request limit.
- The approval limit is stored as a scoped Startup Skool policy. It defaults to zero, so no AO approval is possible until a Director explicitly sets a limit. The Director can set zero to route all requests to Director review.
- Director decision is enabled only after the AO routes the request. Budget requests always go to Director review.
- Approval checks remaining funds again in a serializable database transaction. If concurrent approvals compete for the same budget, one may fail and must be retried after refresh.
- Recording payment requires an authorized payment-record permission and a payment reference. An approval does not mark a request paid.
- Alerts identify due unpaid requests, approved items without bills, and committed spend beyond a budget allocation.

## Access controls

New permissions: `startup.finance.read`, `startup.finance.submit`, `startup.finance.manage`, `startup.finance.approve.routine`, `startup.finance.approve.all`, `startup.finance.policy.manage`, and `startup.finance.payment.record`.

The Startup Skool AO can manage requests and approve routine requests only up to the configured limit. The Startup Skool Director can manage the policy and decide requests routed by the AO. Centre managers and department submitters can submit; requesters see their own requests while authorized finance managers/reviewers see the scoped queue. Capabilities are enforced by server services, not UI visibility alone.

## Routes and changed files

- Finance UI is embedded in the existing Startup Skool operations view in `/gateway` and `/sites/skillcity/gateway`.
- Finance records: `src/server/skillcity/startup-finance-desk.ts`.
- Finance UI: `src/app/sites/skillcity-ui/startup-finance-workspace.tsx`.
- Actions and private bill download: `startup-operations-actions.ts` and `src/app/sites/[site]/operations-files/[fileId]/route.ts`.
- Role/permission registration: `src/server/authorization/registry.ts`, `src/server/skillcity/role-templates.ts`, and `src/server/skillcity/staff-roles.ts`.

## Validation and remaining work

- No schema migration was added.
- TypeScript and focused ESLint checks were run during implementation; final results are in the Phase 6 handover response.
- Database-backed finance acceptance and browser/mobile acceptance were not run in this session.
- Before use, prepare/refresh the role templates and active Startup Skool grants. The Director must explicitly set the AO limit and approve budget allocations. Configure and verify private persistent storage. Review the accounting treatment, retention rules, and payment-reference practice with the responsible finance professional before using this as a formal accounting ledger.
- This is an operational approval and tracking workflow; it does not initiate bank transfers or create statutory accounting entries.
