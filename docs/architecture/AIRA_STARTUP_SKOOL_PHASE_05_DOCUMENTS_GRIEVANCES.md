# AIRA Startup Skool — Phase 5: Documents and Grievances

## Delivery

The Startup Skool operations workspace now contains a searchable private records register and a grievance case queue. Both are part of the existing Startup Skool employee operations view; no separate portal or database model was added.

### Records register

- Record areas: centre, programme, employee, vendor, and admissions.
- Search and area filters run on the authorized workspace results.
- Centre setup attachments from Phase 4 appear in the register without being copied or duplicated.
- New PDF and image files are stored using the existing private NICEJOBS content storage and `NiceJobsContentFile` metadata, scoped to AIRA Skill City and the Startup Skool division.
- Uploads are limited to validated PDFs/images up to 20 MB, checked for integrity on retrieval, and access is logged.
- Employee and admissions files are always restricted. Other records can also be marked restricted.
- Employee and admissions uploads link to existing employment and submitted application records. Vendor records use a supplied vendor name/reference because this workflow does not create vendor master records.
- The register does not copy employee master-profile documents from HR. Those remain in the existing HR document source and permission model.

### Grievances

- Staff with the submit permission can file a categorized case with severity, location, optional centre, and a short narrative.
- Authorized case managers can assign/reassign an active Startup Skool officer, set a due date, record actions, update working status, and record a resolution.
- Serious (high/urgent) and overdue open cases are flagged for leadership escalation. Escalation is an explicit, audited action; no admission, employment, payment, or property decision is made by the case queue.
- Sensitive cases store their true title/narrative in the private record payload and use a generic database title. Users without sensitive-case read permission see a masked case reference, status, severity, owner, due date, and escalation state. They can coordinate assignment and escalation but cannot read or edit the narrative, action history, or resolution.
- Sensitive detail access is permission-based, not granted because of a job title. The authorized submitter can see their own submitted grievance; they do not gain access to other cases.
- Updates use record versions to reject stale concurrent edits, and actions/status changes are recorded in executive history and operational events.

## Permission map

The `startup.records.*` and `startup.grievance.*` capabilities are registered and included in Startup Skool role templates. The Startup Skool Administrative Officer can manage the register and coordinate all grievances, including masked sensitive-case assignment/escalation. Sensitive document/case read is separate and is included for the Startup Skool Director. Centre managers can read their assigned centre material and submit grievances; department submitters can submit grievances without browsing the register.

Role templates only define available capabilities; existing staff must have the appropriate active Startup Skool membership/role grant before these permissions take effect.

## Routes and changed files

- Existing employee workspace route: Startup Skool operations view in `/gateway` (and the existing `/sites/skillcity/gateway` portal route).
- Existing private download route: `/sites/skillcity/operations-files/[fileId]`, extended with a record-scoped `recordId` authorization path.
- Server operations: `src/server/skillcity/startup-records-grievances-desk.ts`.
- UI/actions: `src/app/sites/skillcity-ui/startup-records-grievances-workspace.tsx`, `startup-operations-workspace.tsx`, and `startup-operations-actions.ts`.
- Authorization: `src/server/authorization/registry.ts`, `src/server/skillcity/role-templates.ts`, and `src/server/skillcity/staff-roles.ts`.
- Workspace assembly/download route: `src/server/skillcity/employee-dashboard.ts` and `src/app/sites/[site]/operations-files/[fileId]/route.ts`.

## Database and validation

- No Prisma schema change or migration is required. New documents and grievances use existing `ExecutiveRecord`, `ExecutiveHistory`, `NiceJobsContentFile`, and private content storage infrastructure.
- TypeScript: `npm.cmd run typecheck` passed.
- Focused ESLint across the new service, workspace, action, dashboard integration, and private download route passed.
- Database-backed acceptance, real storage upload, and browser/mobile acceptance were not run in this implementation session. Production behavior is therefore not claimed as independently verified.

## Remaining operational setup

1. Ensure role templates are prepared and the intended staff have active, explicitly scoped Startup Skool permissions.
2. Confirm `NICEJOBS_CONTENT_DIR` points to the approved persistent private volume in each deployed environment.
3. Run isolated PostgreSQL and upload/download acceptance, including tests that AO cannot retrieve sensitive files or view sensitive grievance narratives and that a Director with explicit sensitive-read permission can.
4. Review the retention schedule and authorized grievance escalation contacts before production use.
