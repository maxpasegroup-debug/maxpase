# AIRA Startup Skool AO Operating Charter — Phase 0

**Status:** Proposed operating rules for owner review; not yet encoded as system permissions or approval policy.
**Operating scope:** AIRA Startup Skool division of AIRA Skill City Private Limited.

## 1. Operating structure

Use one internal operating hierarchy:

**Central → State → District → Centre**

Each physical branch or community centre is an operating location and cost centre under Startup Skool. A location record does not create a separate legal company. Every centre has a unique code, state and district, manager, approved operating status, assigned budget, staff, documents, admissions activity, open tasks, and reporting period.

## 2. Responsibilities

| Role | Owns and does | System access boundary |
|---|---|---|
| **CEO / Director** | Sets direction; decides admissions and exceptions reserved for leadership; approves centre commitments, budgets, payroll release, and spending above delegated limits; reviews AO reports. | Startup Skool-wide oversight and approval records. Access to sensitive details is granted when needed for a decision or investigation. |
| **Administrative Officer (AO)** | Runs the Startup Skool operating inbox; coordinates centres and departments; checks submissions; tracks admissions, leads, calls, grievances, documents, budgets, bills, and staffing status; prepares consolidated reports for the CEO / Director. | Startup Skool-wide operational status. Applicant details for the admissions function. Financial details needed to check and route requests. Restricted grievance and employee details only where assigned or necessary for an authorized task. |
| **Centre Manager** | Runs one assigned centre; submits local attendance, admissions support, expense requests, facility issues, and periodic reports; completes assigned tasks. | Their assigned centre and its active work. No access to other centres' private records by default. |
| **Department Lead** | Submits the department plan, work progress, staffing needs, purchases, risks, and supporting documents; responds to AO requests. | Their department's records and submissions. |
| **HR** | Maintains employee records; manages onboarding, employment changes, attendance and leave inputs, payroll calculation, payslips, and HR document retention reviews. | Employee personal data and payroll records required for HR work. |
| **Finance** | Checks supporting bills, budget coding, commitments, reconciliation, and payroll totals; prepares payment records under the approved process. | Financial records required for finance work. No general access to grievance or employee identity documents. |

The AO coordinates the operating system and reports to the CEO / Director. A job title alone does not grant a permission; access is attached to the Startup Skool role and location or record scope.

## 3. Approval and escalation rules

Until the owner publishes spending limits, **all spend requests require Director / CEO approval before commitment**. The system must not infer an approval from a comment, task completion, or uploaded bill.

When limits are approved, record both a per-request limit and a cumulative period limit. Apply these rules:

| Decision | Proposed route |
|---|---|
| Complete, in-budget routine request within the AO's written limit | AO may approve only after the limits are configured and the AO has the explicit permission. |
| Above the AO limit, unbudgeted, new vendor, or budget transfer | AO checks the request and evidence; Director / CEO approves. |
| Centre proposal, lease, land purchase, construction, or long-term commitment | AO coordinates due diligence and documents; Director / CEO approval is required before commitment, subject to any additional company approval required. |
| Payroll register | HR prepares; AO checks completeness and exceptions; Finance checks totals and supporting records; Director / CEO authorizes release. |
| Admission decision | AO checks and forwards the application; authorized admissions leadership records approval or rejection. |
| Sensitive or unresolved grievance | AO triages and routes to the designated reviewer; Director / CEO handles escalations and conflicts of interest. |
| AO's own expense, payroll, or grievance | AO cannot approve or close their own record; assign an independent reviewer. |

The application must store the approver, decision, date, reason, amount or scope, and supporting evidence. Changes after approval return to review when they materially change cost, scope, or terms.

## 4. Record visibility

Use four practical data labels:

- **Public:** approved public programme and centre information.
- **Internal:** plans, tasks, and routine status reports.
- **Confidential:** applicant contact details, employee information, vendor quotations, and financial records.
- **Restricted:** sensitive grievances, identity documents, bank details, payroll details, and authentication information.

The AO can see cross-centre operational summaries. Access to detailed records is permission-checked by function and assignment. Centre Managers see their own centre. HR and Finance see their respective private records. Grievance access is limited to the assigned handler and authorized escalation role. Authentication secrets are never visible to HR or the AO.

## 5. Record retention and handling

Do not set a guessed number of retention days. Before live use, the owner should record a reviewed retention period and decision reference for each record category, with advice from the company's finance or legal advisers where appropriate.

| Record category | Phase 0 handling rule | Retention decision |
|---|---|---|
| Call and lead activity | Store factual outcomes and next steps; do not store unnecessary sensitive notes. Do not record calls by default. Respect contact preferences and do-not-contact requests. | Pending owner-approved schedule. |
| Applications and admission decisions | Retain application status, consent evidence, review history, and decision trail. | Pending owner-approved schedule. |
| Employee and payroll records | HR-controlled access; preserve payroll and employment history against accidental deletion. | Pending HR / finance review and owner approval. |
| Bills, budgets, approvals, and payments | Keep the approval and reconciliation evidence linked to the financial entry. | Pending finance review and owner approval. |
| Centre contracts and premises documents | Keep the approved proposal, contract version, renewals, and decision evidence together. | Pending owner-approved schedule. |
| Grievances | Restrict access, preserve action history, and avoid copying sensitive details into general task notes. | Pending owner-approved schedule. |
| Audit events | Append-only for normal users; removal is not a dashboard action. | Set a company schedule before launch. |

Until each schedule is approved, records should be archived or flagged for review rather than automatically deleted. Deletion requires a recorded, authorized retention decision and must respect linked records.

## 6. Required system fields

Every operational request, report, approval, and task should capture:

- AIRA Skill City company and Startup Skool division scope.
- State, district, and centre where applicable.
- Department and record owner.
- Status, priority, due date, and reporting period.
- Supporting documents and their access classification.
- Submitter, reviewer, decision, timestamps, and change history.
- Budget code or cost centre for financial records.

## 7. Owner decisions required before enforcing Phase 0

1. AO per-request approval limit and cumulative monthly limit in INR.
2. Centre Manager local purchase limit, if any.
3. Which named role is the final approver when the CEO and Director are unavailable.
4. Finance reviewer and payroll release authorizer.
5. Retention periods and decision references for the record categories above.
6. Grievance escalation owner and independent route for complaints involving the AO or a Director.

Until these decisions are recorded, the system should allow submission, review, and routing while keeping reserved approvals pending.

## 8. Relationship to the current application

The current Startup Skool AO role is admissions-focused. This charter proposes broader Startup Skool operations access; it does not silently expand existing permissions. Future implementation should add the approved permissions and screens in phases, with tests proving centre, HR, grievance, and finance boundaries.
