# AIRA Startup Skool — Phase 3: Connect Leads to Admissions

## What changed

- Submitted public SIA and legacy Startup applications are checked against Startup Skool prospect leads using exact normalized phone-number or email matches.
- The admissions inbox shows a possible-match count. A matching enquiry remains a lead; it does not count as an application until the existing application submission flow creates one.
- An authorized admissions reviewer can open an application, inspect the matched lead's source, campaign, programme, centre, district, caller, and call notes, then explicitly link it or mark it as a different person.
- After linking, the authorized AO lead workspace shows the linked application reference and counts it separately from prospect activity. A caller's manually logged "application started/submitted" outcome stays a lead activity and is not counted as a submitted application.
- A link is an auditable association record. The application, lead, and lead call activity stay as separate records; no contact-based merge occurs.
- The AO's existing follow-up and forwarding actions remain unchanged. Forwarding still requires the existing checks and moves the application to leadership review. The existing leadership decision workflow remains the only admission-decision path.
- PBA Starter (30 days) and PBA Pro (180 days) labels are rendered for both application and lead programme values.

## Routes and permissions

- AO admissions workspace: `/sites/skillcity/admissions` (or the equivalent domain-aware Startup Skool admissions route).
- Boss admissions workspace remains available through its existing Boss route.
- Lead-link review is available only to authenticated users granted `startup.lead.manage` for the Startup Skool division. Assignment and applicant-detail access continue to use the existing admissions desk checks.
- Callers and lead managers cannot set an admission decision through the link action. It writes only the link-review association and audit events.

## Matching and review behavior

- Candidate matching is exact on normalized phone digits and/or lowercased email. Names are not used to auto-link.
- A candidate can be explicitly marked `NOT_A_MATCH`; this dismissal is saved for that application and removes that candidate from the open-match count.
- Linking is validated against the current application access scope and the candidate match again on the server. A lead already linked to a different application, or an application linked to another lead, is rejected.
- Concurrent association writes use a serializable transaction and record history. Public applications also receive an application event; legacy applications receive executive history.
- Lead call history is read from existing activity records and displayed in the application detail view. It is not copied or deleted.

## Data and migration

- No Prisma schema or database migration was added. Association and audit data use the existing `ExecutiveRecord` and `ExecutiveHistory` architecture, with kind `STARTUP_LEAD_APPLICATION_LINK` and a deterministic source key per application.
- Existing application, lead, referral/source, and call-history records are preserved.

## Verification performed

- TypeScript: `node_modules\\.bin\\tsc.cmd --noEmit` — passed.
- Focused ESLint on the admissions service, actions, forms, and workspace — passed.
- Database-backed acceptance and browser acceptance were not run in this implementation pass.

## Release note

This is a local implementation only. No production database, deployment, commit, or push was performed. Ensure the Startup AO role has the scoped `startup.lead.manage` permission before expecting the link-review controls to appear. Admission decisions remain restricted to the existing authorized leadership workflow.
