# AIRA Startup Skool — Phase 1 AO Workspace

## Delivered

- Employee portal route: `/sites/skillcity/gateway?view=startup-operations`; the Startup Skool employee portal uses the existing `airaskillcity.com/gateway?view=startup-operations` host route.
- AO landing dashboard with open inbox, overdue items, reports due, items forwarded to leadership, and existing admissions queue counts when the user has admissions permissions.
- Inbox submissions for updates, reports, requests, and bills. Each record captures its submitter, department, centre/location, due date, optional bill amount, supporting documents, current status, and append-only status history.
- AO/Startup leadership can record review transitions: in review, needs information, checked, forwarded to leadership, completed, or declined. Terminal statuses cannot be edited through the AO transition action.
- Centre Manager role template `startup-centre-manager` allows an employee to see their own submissions and create submissions. The AO and Startup Skool Division Director templates receive scoped inbox management permissions.
- PDF and image attachments are privately stored through the existing content storage directory and are served only after validating the signed-in user, Startup Skool division, parent inbox record, and attachment reference.
- Existing admissions remain in their existing public/legacy application records and review UI; the AO dashboard links to that queue instead of copying applications into the operations inbox.

## Data and access

Operational items reuse `ExecutiveRecord` (`kind=STARTUP_OPS_ITEM`) with `ExecutiveHistory`, so no Prisma schema change or migration is required. Attachments reuse the existing private `NiceJobsContentFile` storage metadata model and content directory. All queries are limited to the active AIRA Startup School division under AIRA Skill City. Submitters can see only their own items; inbox management requires the explicit `startup.operations.manage` permission. Role names alone do not grant access.

To make the new menu available to an existing AO, the authorized Boss must prepare the updated Startup Skool role templates so the AO membership receives the new scoped permissions. New centre managers must be appointed with the `Startup Skool Centre Manager` role. No production role update or deployment is performed by this local change.

## Scope limits

This is a single-submission inbox, not a recurring report scheduler or physical centre register. Centre/state/district are captured on each submission as descriptive location fields. Bill submission does not approve a budget, issue payment, or reconcile accounts. Leadership forwarding records a handoff state; it does not approve an admission or spend. The existing applicant workflow remains separate.

## Verification

TypeScript and focused ESLint were run after implementation; results are reported with the delivery. No production database, migration, deployment, commit, or push is part of this phase.
