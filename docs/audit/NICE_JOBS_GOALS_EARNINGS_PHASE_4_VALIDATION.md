# Career Hub Experience Phase 4 Validation

Date: 2026-10-10. Implemented locally only; no commit, push, deployment, live migration or seed. Existing dirty worktree retained. This is experience phase 4, not original Nice Jobs phase 04.

## Results

| Check | Status | Evidence |
| --- | --- | --- |
| Targeted integration/security regressions | PASS | Seven files, 132 tests, exit 0; command below. |
| Final goals/workforce rerun | PASS | Two files, 31 tests, exit 0 after final authorization/projection changes. |
| ESLint | PASS | `npm.cmd run lint`, exit 0. Final build also ran lint. |
| TypeScript | PASS | `npm.cmd run typecheck`, exit 0; final production build also checked types. |
| Production build | PASS | `npm.cmd run build`, exit 0, all 21 static pages generated. This is a local build, not deployment validation. |
| Local HTTP smoke | PASS | Fresh port-3009 preview: public opportunities 200; unauthenticated jobs Today/Wallet and corporate Work return 307 to their respective login. No authenticated workflow/browser claim. |
| Prisma schema | PASS | `npm.cmd run prisma:validate`, exit 0. |
| Whitespace/integrity review | PASS | `git diff --check`, exit 0; existing line-ending warnings only. No actual `next-env.d.ts` or `tsconfig.json` diff after build. |
| Full repository suite | NOT RUN | Only the explicitly listed relevant suites ran. |
| New migrations/live seed | NOT RUN | No new schema or migration required; no workspace/business database writes. Tests use isolated temporary SQLite databases and existing migrations. |
| Browser/mobile/screen-reader usability | NOT RUN | No authenticated rendered browser/device validation in this phase. |
| Production domains/TLS/authentication/load | NOT RUN | Local implementation and regressions do not establish production sign-off. |
| Real incentive rules and manager controls | BLOCKED | Require business-reviewed publication, actual assigned managers and explicit scoped capability/control configuration. No rates or role grants invented. |
| External payout delivery | BLOCKED | Provider not configured; no paid/transfer confirmation exposed. |

```powershell
npm.cmd test -- tests/nicejobs-goal-plan.test.ts tests/nicejobs-employee.test.ts tests/nicejobs-finance.test.ts tests/nicejobs-performance.test.ts tests/nicejobs-participant-workspace.test.ts tests/operations.test.ts tests/execution.test.ts
npm.cmd test -- tests/nicejobs-goal-plan.test.ts tests/nicejobs-employee.test.ts
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run prisma:validate
git diff --check
```

## What the tests establish

- Participant proposal, bounded cumulative 10/20/30-day and daily planning, strict confirmation/actor/scope input validation.
- Canonical assigned independent manager approval; preapproval activation denial; preserved original target during material changes; generic goal edit/manual-progress bypass denial.
- Idempotent replay and mismatch rejection; cross-company access denial; unavailable SIA denial and authorized human/agent source drafting.
- Goal creation, request preparation and active-target replacement roll back when transactional audit fails; no partial archive/activation survives.
- Generic approval cannot use a replaced manager; current active goal stays visible despite a newer bounded draft-history window.
- Ordered skill milestones use reviewed/completed canonical evidence, not submissions or elapsed time. Manager-created evidence-required responsibility Tasks preserve training-plan, stage, progress and approved-goal references.
- Existing finance regressions cover independently reviewed policy versions, immutable calculation/evidence, current approver authority, beneficiary self-approval denial, append-only ledger, duplicate posting, reservations, reversal, historical wallet access and unconfigured payout. Goal/skill commands create no wallet or incentive entries.
- Existing performance, generic execution and operational approval regressions remain passing. Finance scale regression exercised 315 fixture wallets with a bounded 25-row result; observed local timing is not a production SLO.

The added SIA fixture initially exposed a nested transaction timeout. It was fixed by reading five authorized task IDs inside the existing transaction; no timeout extension or permission weakening was used. The final focused rerun passed. Early TypeScript nullable-resource errors were also corrected and rechecked.

Preview: `http://127.0.0.1:3009/sites/jobs/gateway`. Only the verified task-owned npm preview tree on port 3009 (root 82112) was stopped after builds; it was restarted hidden with root 78916. Other development/test processes were not terminated. Process inspection needed escalation after the sandbox denied CIM access. The smoke used HTTP GET only, without credentials, cookies or business mutations.

## Manual validation

MANUAL VALIDATION remains required with actual authorized accounts: create a draft outcome in Today/Work; inspect checkpoint quantities and daily steps; submit to the configured assigned manager; reject and approve separate proposals; activate a material change and confirm the old target remains intact until activation. Check manager replacement and permission revocation while sessions remain open.

Verify long outcomes and units, keyboard confirmation/focus, narrow screens, screen readers, and readable wallet tables. Confirm rule disclosures obey finance permissions. Assign a skill-backed responsibility and verify the task/evidence/source history. Compare an already posted wallet before and after goal rejection/change and skill progression; levels must never reserve/debit money. Payout intent must still say provider not configured, not paid.

## Changed in this phase

New server modules: `goal-plan.ts`, `goals.ts`, `goal-approval.ts`, `skill-levels.ts` under `src/server/nicejobs`.

New UI: `goal-form.tsx`, `goals-panel.tsx`, `earnings-summary.tsx` under `src/app/app/nicejobs`.

Updated UI/action modules: `employee-workspace.tsx`, `lead-form.tsx`, `finance-workspace.tsx`, `application-actions.ts` in that directory. Existing seven-section routes/session isolation remain in place.

Updated shared guards: `src/server/domain/execution-service.ts`, `operations-service.ts`, `operations-scope.ts`.

Tests: new `tests/nicejobs-goal-plan.test.ts`, extended `tests/nicejobs-employee.test.ts` using existing isolated recruitment/training/activation fixtures.

Documentation: this report, `docs/architecture/NICE_JOBS_GOALS_EARNINGS_PHASE_4.md`, workforce architecture cross-reference.

No dependencies, Prisma schema, migrations, seed data, credentials, production variables, providers or unrelated business modules were changed by this phase. Existing modifications from earlier phases remain uncommitted and untouched outside the listed integration points.
