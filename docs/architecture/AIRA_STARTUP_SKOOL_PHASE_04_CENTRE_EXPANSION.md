# AIRA Startup Skool — Phase 4: Centre and Expansion Management

## Workspace

Centre management is part of the existing Startup Skool operations desk in the Skill City employee workspace (`?view=startup-operations`). It adds a **Centres & expansion** section alongside the existing Work Inbox, admissions snapshot, tasks, reports, requests and bills.

## Lifecycle

`PROPOSED → UNDER_REVIEW → APPROVED → SETUP → OPENING_REVIEW → ACTIVE → RENEWAL_REVIEW or CLOSURE_REVIEW → ACTIVE or CLOSED`

An authorized approver may decline a proposal during review. The AO may prepare proposals, send them for review, manage setup tasks, request opening review and start renewal or closure review. Proposal approval, opening, renewal approval and closure require the separate `startup.centre.approve` permission, and the person who created the proposal cannot approve it themselves.

## Centre record

Each record captures centre name and type, state, district, proposed address, property arrangement, commitment terms, setup and monthly cost estimates, lease term, expected opening and property end dates, manager, notes, supporting documents, setup tasks, readiness summary, lifecycle status, and decision history.

Rent, lease, purchase and partner proposals require commitment details and at least one supporting PDF/image before they can be proposed. Estimates remain planning information. They are not approved spending, a signed contract, or a payment. The approver's lifecycle decision is recorded with actor, reason and time before the site is marked approved. Existing-site records do not require property commitment documents.

Opening review requires at least one setup task, every task marked complete, and an AO readiness summary. An authorized approver must then approve the opening before the centre becomes active.

## Access and records

- New scoped permissions: `startup.centre.read`, `startup.centre.manage`, and `startup.centre.approve`.
- Startup Skool AO and company AO templates receive read/manage; the Startup Skool Director receives read/manage/approve; the centre-manager template receives read, with assigned-centre filtering.
- Supporting documents use existing private content storage and the authenticated operations-files route; access is checked against the centre record and division.
- Centre data and history use the existing `ExecutiveRecord`, `ExecutiveHistory`, operational event and `NiceJobsContentFile` models. No schema migration was added.

## Verification and limits

- TypeScript `node_modules\\.bin\\tsc.cmd --noEmit`: passed.
- Focused ESLint on the centre desk, role definitions, operations actions and workspaces: passed.
- `git diff --check` on Phase 4 changes: passed.
- Database-backed and browser acceptance were not run. No production data was accessed or changed.
- Role permissions are defined in code but need authorized role-template preparation before existing accounts receive them.
- The current workspace reads a maximum of 500 centre records and 150 manager options. Editing proposal terms after creation is not exposed; if property commitment terms materially change before approval, decline and resubmit the proposal.
