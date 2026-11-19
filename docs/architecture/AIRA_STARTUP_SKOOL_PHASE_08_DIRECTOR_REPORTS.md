# AIRA Startup Skool Phase 08 — Director Reports and Rollout Checks

## Delivered

- Added a Startup Skool Director Reports workspace at the existing employee gateway: `/sites/skillcity/gateway?view=startup-reports` (the domain-aware gateway path resolves under the configured Skill City portal).
- Added `startup.reports.read`, granted by the Startup Skool Division Director role template only. The report service requires that permission in the Startup Skool division; a user cannot access it by changing the URL or by holding an unrelated title.
- Added period, state, district, centre, and department filters. Values are selected from the current Startup Skool records. Period options include available record months and an all-period view.
- Added summary reporting for prospects, recorded calls, callbacks due, linked applications and lead-to-application rate; public and legacy admissions; centre proposals/readiness/setup tasks; budgets, expenses/bills and payroll review state; active headcount and staffing gaps; grievance counts; and missing supporting documents/property end dates.
- Report access writes the `startup.reports.viewed` operational/audit event in the existing audit path. Event metadata contains the selected period and filter names, not applicant, grievance, or payroll-line details.
- Replaced Startup Skool workspace navigation with the nine requested menu labels, linking to the existing workspaces and sections. Links are shown only when the account is authorized for the corresponding view. Admissions opens the existing protected admissions route.

## Data and interpretation

- The report reads existing Startup Skool records only; it creates no duplicate application, lead, centre, payroll, or grievance records.
- Admissions counts combine submitted public SIA applications and existing legacy Startup applications. An application is counted once within its source.
- Conversion means a lead with an explicit accepted application link divided by the filtered lead count. Possible matches are not treated as conversions.
- Payroll report shows period and run status only. It does not expose salary amounts or individual payroll lines.
- Grievance reporting shows aggregate open/overdue counts only. It does not return grievance details.
- “Checked / completed” counts AO work-inbox records with `CHECKED`, `FORWARDED_TO_LEADERSHIP`, or `COMPLETED` status. The report separately shows awaiting-review and forwarded counts.
- Readiness counts Setup centres whose setup checklist is non-empty and fully completed.
- Missing-document counts include centres without attachments and document-register entries with no stored files. Renewal counts use centre property end dates only. The current document register has no structured expiry date, so other document renewals cannot be reliably counted yet.
- Payroll runs are not assigned to a centre/department in the current model. Payroll status is therefore omitted when the report is narrowed by state, district, centre, or department.
- Report queries have explicit row caps. When a source reaches a cap, the UI warns that figures may be incomplete; apply filters before using them for decisions.

## Access and audit verification

Focused tests: `tests/startup-reports-desk.test.ts`.

- A caller without `startup.reports.read` is rejected before report data is returned and no view event is logged.
- An authorized report view logs the scoped audit event, and the test asserts that applicant/payroll details are absent from the event metadata.
- The permission is checked server-side against the `aira-startup-school` division. The Director role template is the only template updated for this report permission.

## Existing production data and release

- No migration or database write is needed to add the read permission to the in-code permission registry/role template.
- Existing Director memberships may need the Boss role-template preparation action to refresh their role capabilities before this view becomes available. Do that through the normal authorized Boss workflow; do not grant the permission to AO, HR, caller, or centre-manager roles.
- No production accounts, permissions, data, or database were changed in this implementation.
- Before rollout, verify role template preparation for the intended Division Director, confirm the AO and caller cannot open the report route, and check the `startup.reports.viewed` event after an authorized report view.
- The data records and operational reporting remain dependent on the preceding phases being deployed and their additive schema migration being applied through the normal reviewed release process.
