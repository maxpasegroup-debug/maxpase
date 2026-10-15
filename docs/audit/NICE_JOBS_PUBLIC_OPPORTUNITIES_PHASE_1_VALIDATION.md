# Nice Jobs opportunities Phase 1 validation

## Results

- PASS: application/recruitment/onboarding focused rerun, 78 tests. Includes initial draft creation/idempotency, employer-brand separation, required publication disclosures, offer compensation gates, applicant session isolation and configured read-only SIA authorization/replay.
- PASS: final application/portal rerun, 41 tests, including applicant enrollment audit rollback.
- PASS: npm.cmd run lint; npm.cmd run typecheck; npm.cmd run prisma:validate; production build.
- PASS: local HTTP checks of /sites/jobs/opportunities and /sites/jobs/signup returned 200; catalogue included Jobs/Internships navigation.
- PASS: fresh preview at http://127.0.0.1:3008/sites/jobs/opportunities returned 200 after the production build. The earlier port-3007 development process returned 500 after build output regeneration; stopping its confirmed owned process tree (root PID 2868) was denied by Windows. No unrelated process was targeted. The fresh preview root PID is 69644.
- BLOCKED: full npm.cmd test run reported 519 passed and 2 failed (521 total). The onboarding publication fixture lost its description; corrected and passed in the focused rerun. The remaining leads lifecycle test uses a fixed injected performance clock with a wall-clock task completion timestamp and fails the closed-period validation at tests/nicejobs-leads.test.ts. Production checks were not weakened to accommodate this fixture. No clean full-suite pass is claimed.
- BLOCKED: creating real local drafts via the guarded configure-nicejobs-opportunities command returned Access denied, including after explicit user approval. Draft creation is verified in isolated test databases only; no real database write is claimed. Authorized administrators can use the existing workspace command, or run the script in a permitted local terminal.
- NOT RUN: visual/browser/mobile/screen-reader validation. No connected browser is available and playwright-core is not installed locally. No dependencies were installed.
- NOT RUN: production domains, TLS, deployment, external providers and live SIA model validation.

No production migration, seed, reset, commit, push or deployment was performed. The pre-existing dirty worktree was retained. The phase introduces no schema migration. git diff --check passed, with existing line-ending warnings only.

## Files changed by this phase

- src/server/nicejobs/input.ts, opportunity-configuration.ts, initial-opportunities.ts, service.ts, applications.ts, applicant-access.ts, application-guidance.ts, recruitment.ts.
- src/server/auth/account-realm.ts and service.ts.
- src/server/portals/sites.ts and src/middleware.ts.
- src/server/sia/applicant-context.ts, input.ts, context.ts, registry.ts and service.ts.
- src/app/sites/[site]/page.tsx, actions.ts, login/page.tsx, login/form.tsx; new opportunities/page.tsx and signup/page.tsx, signup/form.tsx.
- src/app/app/nicejobs/workspace.tsx, actions.ts, application-workspace.tsx, application-form.tsx, application-actions.ts; new opportunity-editor.tsx, opportunity-disclosure.tsx and applicant-sia-guide.tsx; src/app/globals.css.
- tests/nicejobs-applications.test.ts, nicejobs-recruitment.test.ts, nicejobs-onboarding.test.ts, nicejobs-employee.test.ts, nicejobs-leads.test.ts, nicejobs-knowledge.test.ts, nicejobs-performance.test.ts, portals.test.ts; tests/fixtures/nicejobs-opportunity.ts.
- scripts/configure-nicejobs-opportunities.ts; docs/architecture/NICE_JOBS_PUBLIC_OPPORTUNITIES_PHASE_1.md; this validation report.

Some listed files already contained earlier uncommitted work; this inventory is not a claim that their entire diff belongs to this phase.

## Remaining business and configuration decisions

All three real jobs must stay drafts. Junior Academic Advisor needs legally reviewed engagement/classification, actual commission rates, verification and payment rules, incentive terms, canonical division mapping, location/arrangement and assigned manager. Business Automation Manager needs engagement/classification, compensation/incentives, location/arrangement and assigned manager. Defence Career Mentor additionally needs Nidus's exact registered employer name, verification evidence and an authorized canonical recruitment relationship; the current service intentionally refuses an unrelated external employer. First Oppo needs its complete opportunity brief before a real internship listing can exist.

Applicant contact remains UNVERIFIED; contact verification/recovery delivery is not implemented. Applicant SIA requires explicit active read-only agent/tool grants and reports unavailable otherwise. The later Nice Jobs Boss PIN account and autonomous actions are not part of this phase.
