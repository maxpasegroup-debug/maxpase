# AIRA Startup Skool — Phase 7 HR and Payroll Operations

## Implemented workspace

The employee portal now has a Startup Skool HR & Payroll view at the existing Skill City gateway:

- /gateway?view=startup-hr
- /sites/skillcity/gateway?view=startup-hr

The view uses AIRA Skill City employment records and the existing startup-school brand assignment. It does not create duplicate employee identities.

## Responsibilities and visibility

- **Startup Skool HR Manager:** view Startup Skool assignments, set centre, position, joining/exit dates and assignment status, prepare centre workforce reports, maintain a brand-scoped payroll rule draft, prepare a monthly payroll register and view its line items/payslips after Director authorization.
- **Centre Manager:** submit attendance, leave-summary and staffing reports only for a centre assigned to them.
- **Administrative Officer:** see workforce reports, check or request corrections, and identify centres still missing checked attendance. The AO response contains no salary or employee pay line.
- **Startup Skool Director:** view aggregate payroll totals, verify accountant-reviewed rule drafts, and authorize release after a different user prepared the payroll register. Employee pay lines and payslips are not returned to Director views.

All actions are permission-checked on the server and leave an operational event/history entry. The actions use the existing employee portal; no title-only authorization is added.

## Payroll workflow

1. HR records the accountant name and written review reference with an isolated Startup Skool rule draft.
2. A different authorized Director checks the written decision and activates the rules.
3. HR assigns every in-scope employee to an active centre and enters effective-dated compensation in the existing HR data.
4. Centre managers submit monthly reports. The AO checks each active centre's attendance report.
5. HR prepares a draft register using Startup Skool brand assignments, active monthly compensation, and the active scoped rules.
6. A different authorized Director authorizes the release, with a reference and note.
7. HR can download payslips only after authorization. The action records release authorization; it does not make a bank transfer.

The new migration adds nullable brand scope to payroll rule sets and runs and an operating-centre field to existing HR assignments. Existing company-level payroll records remain brandId = NULL. A partial unique index keeps the old company-wide period unique while allowing one register per distinct brand and month.

## Payroll calculation boundary

The register uses full-month base and variable compensation plus scoped accountant-reviewed earning/deduction components. Attendance and leave figures are checked as payroll readiness inputs but do not automatically adjust compensation. Proration, statutory deductions, tax treatment, overtime, final settlement, and actual money movement still require an accountant-approved policy and the existing payment process. Partial-month employees are excluded and reported in the run snapshot for separate review.

## Roles

The Startup Skool HR Manager role template is startup-hr-manager. Centre managers use the existing startup-centre-manager role. The existing Startup Skool AO and Director roles receive only their named workforce-review and payroll-summary capabilities. The role templates must be prepared through the existing Boss role-template flow before appointments receive these new permissions.

## Migration and release

Migration:

prisma/migrations/20261119120000_startup_hr_payroll/migration.sql

The migration is additive and has **not** been applied to any database. No production data was changed. Generate Prisma Client, deploy this migration through the reviewed release process, then prepare the role templates and assign authorized staff.

## Validation performed

- prisma validate: passed.
- prisma generate: passed.
- npm run typecheck: passed.
- Focused ESLint on changed TS/TSX files: passed.
- Production build: passed with a 6 GB Node heap before the final payroll period/amount guard refinements. Those final refinements passed typecheck and focused ESLint; repeat the build before release. The default 4 GB Node heap exited with an out-of-memory error.
- No automated tests were added or run in this phase.

## Remaining release checks

- Apply migration only to an isolated acceptance database first, then use the standard reviewed production migration release.
- Repeat the production build after the final payroll guard refinements.
- Confirm actual Startup Skool assignments, active centres, accountant-approved rules, and employee compensation data before preparing a real payroll.
- Complete database-backed authorization and payroll acceptance before production release.
