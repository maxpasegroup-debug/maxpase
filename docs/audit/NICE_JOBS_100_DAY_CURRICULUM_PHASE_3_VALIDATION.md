# Nice Jobs 100-Day Curriculum Builder: Phase 3 Validation

Report date: 2026-10-13 (user timezone). Scope: the existing job-to-training setup sequence's Phase 3 only.

## Gates

| Item | Status | Evidence |
| --- | --- | --- |
| Day 1-100 editor and draft validation | PASS | Ten stage selectors, ten day buttons per stage, one editable day, honest incomplete/review labels and escaped content |
| Calendar and working-day scheduling | PASS | Explicit timezone/weekdays; IST and 23/25-hour DST tests; day-opening and Day 100 closing rules |
| Runtime execution and access controls | PASS | Full 100-row enrolment schedule; reviewed evidence; early-day, reviewer-change and cross-company denial; pinned plan unchanged |
| Curriculum completeness/publication gate | PASS | Missing/duplicate days, evidence, milestones, final assessment and unavailable learning files block review; duration alone is insufficient |
| Relevant regression suite | PASS | Final 206 tests across 13 suites; exact command below |
| Lint and TypeScript | PASS | npm.cmd run lint; npm.cmd run typecheck |
| Production build compilation | PASS | npm.cmd run build; 21 static pages and dynamic application routes generated |
| Prisma schema validation | PASS | npm.cmd run prisma:validate |
| Migration / client regeneration | NOT RUN | No Prisma schema change; existing configuration/progress models reused |
| Isolated HTTP preview | PASS | Authenticated synthetic role renders the actual curriculum editor and library link; no real jobs/offers/workers created |
| Scoped whitespace and documentation links | PASS | git diff --check on tracked task paths plus direct checks for new/previously untracked files |
| Physical mobile, browser visual, keyboard and screen reader QA | NOT RUN | Browser inventory returned apps=[] and browsers=[]; SSR/HTTP tests are not interactive browser verification |
| Each real role has a reviewed complete schedule | BLOCKED | CEO intends to upload media; actual role content and nominated reviewers/approval remain outstanding |
| Production launch | BLOCKED | Real role approvals plus the prior secure storage/scanning/migration and operational launch gates remain |

## Commands

- npm.cmd test -- tests/nicejobs-curriculum.test.ts tests/nicejobs-programme.test.ts tests/nicejobs-onboarding.test.ts tests/nicejobs-applications.test.ts tests/nicejobs-recruitment.test.ts tests/nicejobs-employee.test.ts tests/nicejobs-participant-workspace.test.ts tests/nicejobs-dashboard.test.ts tests/nicejobs-knowledge.test.ts tests/nicejobs-content-files.test.ts tests/nicejobs-content-handler.test.ts tests/nicejobs-control-navigation.test.ts tests/portals.test.ts
- npm.cmd run lint
- npm.cmd run typecheck
- npm.cmd run build
- npm.cmd run prisma:validate
- node_modules/.bin/tsx.cmd scripts/verify-nicejobs-curriculum-preview.ts
- git diff --check -- src/server/nicejobs/onboarding-input.ts src/server/nicejobs/onboarding.ts src/server/nicejobs/input.ts src/server/nicejobs/service.ts src/app/app/nicejobs/training-configuration.tsx src/app/app/nicejobs/onboarding-workspace.tsx src/app/app/nicejobs/workspace.tsx src/app/globals.css tests/nicejobs-onboarding.test.ts

The first full-curriculum integration fixture was correctly stopped by the existing pre-offer policy/comprehension gate. The fixture was updated to complete those existing human attestation and quiz flows, not to bypass the gate. A new SSR test initially expected a missing milestone while its fixture had already marked stage-end milestones; its fixture was corrected to remove that milestone before asserting the validation message. Final fresh runs are the evidence above, not intermediate failures.

The relevant suite covers programme permissions/revocation, three-job draft restrictions, workflow replay, offer/orientation policy gates, onboarding evidence and transactional rollback, activation boundaries, applicant/worker isolation, knowledge/file access and the new curriculum calendar/completeness controls. It is not a claim that the full repository or production test suite ran.

## Preview and Safety

The previously approved isolated preview database under .private/content-preview/isolated-FAkkgN was verified by purpose, exact local SQLite path and localhost origin before use. The verification script uses only generated author@content-preview.invalid credentials, normal corporate session issuance and scoped job creation. The session is revoked afterward. It creates/reuses only ISOLATED-CURRICULUM, an empty unpublished synthetic role; no real catalogue identities are seeded or published.

Local sign-in: http://127.0.0.1:3009/staff/login. Generated test credentials remain in .private/content-preview/isolated-FAkkgN/preview-accounts.json. After sign-in, open:

http://127.0.0.1:3009/app/nicejobs?view=templates&versionId=cmv68gjbc0008u0d088kboia6

The preview server was restarted only after its exact project command/PID was verified; unrelated processes were not stopped. Existing development/production databases and provider accounts were not used. Existing private-upload draft restrictions remain. No grant, offer, worker activation, incentive/payout policy, payment or external message is created by this phase.

## Files Changed in This Phase

- New canonical curriculum helper: src/server/nicejobs/curriculum.ts.
- Existing model/service integration: src/server/nicejobs/onboarding-input.ts, input.ts, programme-checklist.ts, service.ts, onboarding.ts, learning-summary.ts.
- UI: src/app/app/nicejobs/curriculum-builder.tsx, training-configuration.tsx, workspace.tsx, onboarding-workspace.tsx; src/app/globals.css.
- Tests: tests/nicejobs-curriculum.test.ts, nicejobs-programme.test.ts, nicejobs-onboarding.test.ts, nicejobs-dashboard.test.ts; tests/fixtures/nicejobs-programme.ts. Synthetic programme fixtures now supply actual 100-day content only within isolated tests.
- Preview tool: scripts/verify-nicejobs-curriculum-preview.ts.
- Documentation: docs/architecture/NICE_JOBS_100_DAY_CURRICULUM_PHASE_3.md; docs/architecture/NICE_JOBS_JOB_PROGRAMME_SETUP_PHASE_1.md; this report.

Existing tracked and untracked work from earlier phases is preserved. Repository-wide diffs include that earlier work and are not this phase's change list. Nothing is staged, committed, pushed or deployed.

## Remaining Business and Manual Decisions

For Academic Advisor - Junior, Business Automation Manager and Defence Career Mentor, the CEO must upload/review the learning media and configure each day's practical outcomes and evidence rubric, stage-end milestone assessments, final assessment, post-offer orientation and readiness. Nominate actual authorized OJT/publication/readiness reviewer accounts. Choose calendar/working days, valid programme timezone and selected weekdays, and explicitly confirm the supported fixed-date/no-pause/no-rescheduling rules. Then review and approve the current job/curriculum version through existing controls.

Only fixed dates are supported now; configurable pause/reschedule execution and holiday calendars are NOT implemented. Preview date/participant UI and actual media accessibility need manager/device review. Account creation or an existing draft is not evidence of reviewer authorization or legal/employment approval. Nidus legal-employer verification and all outstanding pilot/business approvals remain unresolved.

Completion gate remains BLOCKED for the real roles. Phase 4 is not started.
