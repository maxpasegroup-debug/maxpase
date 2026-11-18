# AIRA Startup Skool Build 03 — Administrative Admissions Dashboard

## Implementation

Build 03 adds a role-protected admissions desk to the existing Skill City employee portal and a Boss assignment entry. It reuses the Build 02B public applicant, assignment, event, and follow-up models; authenticated legacy applications remain their existing `STARTUP_APPLICATION` ExecutiveRecords. No duplicate application records or Build 03 migration were added.

### Routes

- Skill City employee portal (local route): `/sites/skillcity/admissions`
- Skill City employee portal (mapped domain route): `/admissions` on `airaskillcity.com`
- Boss Startup Skool officer assignment: `/app/boss/brands/{startup-school-brand-id}/admissions/ao-assignments`
- Existing Boss admissions decisions remain at `/app/boss/brands/{startup-school-brand-id}/admissions`.

The AO route requires an authenticated Skill City employee session, explicit `startup.application.read` and `startup.application.triage` access, and the correct company/division scope. AO access is limited to applications currently assigned to that user. Director access requires the scoped Director/Division Director role and `program.manage`; Boss assignment access requires Boss authority and Startup Skool brand scope. A title alone does not grant access.

## Screens and actions

1. **Overview:** totals for applications, new/unassigned submissions, assigned work, follow-up required, leadership review, and approved applications. Counts use database count queries with current program/date/search filters.
2. **Application inbox:** public SIA and legacy applications in one de-duplicated view with search, status/program/date filters, newest/oldest sorting, and 20-row pagination.
3. **Applicant details:** contact information, PBA preference, location, situation, idea, goals, referral, phone/consent state, and event/review history. Public SIA and legacy records are labeled separately.
4. **Assignments:** scoped leaders can assign, reassign, or unassign active verified AO accounts. Public assignments use `StartupAdmissionAssignment`; legacy assignment history uses scoped workflow `ExecutiveRecord`s. Changes use optimistic version checks and audit events.
5. **Follow-up management:** signed-in officers record call/WhatsApp/email/other attempts, outcomes, notes, and optional next dates. Public follow-ups use `StartupAdmissionFollowUp`; legacy follow-ups use workflow records. Actors and timestamps are recorded.
6. **Follow-up tasks:** today, overdue, upcoming, and completed lists with guarded completion actions.
7. **Leadership handoff:** the assigned AO can forward an active application only after explicitly confirming mobile, programme, and location review and entering a review note. Public applications must have verified mobile and current consent. Forwarding changes the record to `IN_REVIEW`; it does not approve admission, enroll a learner, or activate an account.

The existing AO employee workspace now links to the dedicated admissions route. The Boss admissions page links to its officer assignment view.

## Files changed for Build 03

- `src/server/skillcity/startup-admissions-desk.ts`
- `src/app/sites/[site]/admissions/page.tsx`
- `src/app/sites/skillcity-ui/startup-admissions-actions.ts`
- `src/app/sites/skillcity-ui/startup-admissions-forms.tsx`
- `src/app/sites/skillcity-ui/startup-admissions-workspace.tsx`
- `src/app/sites/skillcity-ui/startup-admissions.module.css`
- `src/app/sites/skillcity-ui/administrative-workspace.tsx`
- `src/app/sites/skillcity-ui/workspace.tsx`
- `src/app/app/boss/brands/[id]/admissions/page.tsx`
- `src/app/app/boss/brands/[id]/admissions/ao-assignments/page.tsx`
- `src/middleware.ts` (permits the protected mapped portal route)
- `tests/startup-admissions-desk.test.ts`
- `docs/AIRA_STARTUP_SKOOL_BUILD_03_AO_DASHBOARD.md`

## Validation

- TypeScript: pass (`npx.cmd tsc --noEmit`).
- Focused ESLint: pass with no errors. CSS Module was reported ignored by ESLint configuration; it is covered by the Next build.
- Admissions desk tests: 3 pass. They verify assigned-only AO queue filtering, denial without explicit permission, and an empty queue when the AO has no assignments.
- Production build: pass (`npm.cmd run build`). Next.js compiled the admissions and Boss assignment routes and completed static generation.
- PostgreSQL-backed, populated-account browser, and mobile acceptance: not run. This workspace does not have an isolated local PostgreSQL acceptance database. Production was not accessed or used for tests.

## Local owner preview

Run `npm run dev`, sign in with a local test account that already has a verified active Skill City membership, and open `http://localhost:3000/sites/skillcity/admissions`. The dashboard is intentionally server-backed; its actual records and authorization cannot render without the matching development database and test account. Do not use a production account against local configuration that points at production.

## Release limitations

- Build 03 adds no database migration. It consumes the existing Build 02B applicant schema and migration. The target database must have that existing migration applied before the public SIA tables can be queried.
- The organization, active Startup Skool division, role assignments, permissions, and AO membership need to exist in the target environment before the relevant views become available.
- No production changes, migration, deployment, commit, or push were performed.
- Database-backed acceptance and real AO/Director/Boss account acceptance remain required before production release.
