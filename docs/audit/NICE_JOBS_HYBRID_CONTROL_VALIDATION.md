# Nice Jobs Hybrid Control And Pilot Validation

## Scope And Outcome

Career Hub experience Phase 5 is implemented locally using existing domain services, authorization, approvals and audit records. Phase 6 real pilot/launch is BLOCKED. No deployment, commit, push, live migration, seeding, real offer issuance, worker activation, incentive configuration, payment or external message dispatch was performed in this task. Existing worktree changes were preserved.

The owner confirmed unpublished draft-only jobs and no authorized real participants. Academic Advisor - Junior's division is Startup School and Skill Studio, under AIRA Skill City Private Limited. AIRA Labs remains that employer's division. Nidus Academy's registered employer and First Oppo's employer/legal identity remain unverified. All managers and formal engagement/compensation/payment approvals are pending. These confirmations are recorded in the pilot gate; persisted business drafts were not changed by this task.

## Engineering Evidence

| Status | Exact command/check | Observed result |
| --- | --- | --- |
| PASS | `npm.cmd test -- tests/nicejobs-control-navigation.test.ts tests/nicejobs-automation-command.test.ts tests/communications.test.ts tests/portals.test.ts` | Initial four-file run: 46 passed. |
| PASS | `npm.cmd test -- tests/nicejobs-control-navigation.test.ts tests/nicejobs-automation-command.test.ts` | Final focused panel/SIA/provenance run: 15 passed in 28.76 seconds. |
| BLOCKED | `npm.cmd test -- nicejobs communications portals sia` | Initial broad run: 304 passed, 1 failed of 305, 18 files. The synthetic lifecycle used fixed dates against actual completion/ledger timestamps. This is not an all-passing broad run. |
| PASS | `npm.cmd test -- tests/nicejobs-leads.test.ts -t "takes one synthetic"` | After a test-only clock correction: 1 passed, 23 skipped, 33.36 seconds. Production period guards were unchanged. |
| PASS | `npm.cmd test -- tests/nicejobs-leads.test.ts` | Fresh disposable-database rerun: all 24 passed, 57.68 seconds, exit 0. |
| BLOCKED | `npm.cmd test -- tests/nicejobs-leads.test.ts tests/operations.test.ts tests/execution.test.ts` | Later run: 49 passed, 21 failed of 70. Operations and execution files passed. Leads encountered a prolonged timeout, subsequent temporary SQLite disk I/O errors (2570) and EBUSY journal cleanup. The environment/lock cause was not positively identified; no destructive cleanup was attempted. |
| PASS | `npm.cmd run lint` | Exit 0 after the test-fixture correction. |
| PASS | `npm.cmd run typecheck` | Exit 0 after the test-fixture correction. |
| PASS | `npm.cmd run build` | Exit 0; Next.js 15.5.27 production compilation, lint/type checks and 21 static pages. |
| PASS | `npm.cmd run prisma:validate` | Schema valid. No schema changes in this task. |
| PASS | `npm.cmd run validate:migrations` | Disposable SQLite migration chain, repeated deployment, drift/integrity checks and isolated snapshot restoration passed. Not production restoration. |
| PASS | `git diff --check` | No whitespace errors; existing CRLF warnings are not a clean-worktree claim. |
| PASS | Local unauthenticated HTTP smoke | Public Jobs opportunities returned 200. Boss overview/System gateway routes redirected to Jobs login (307); corporate Nice Jobs management redirected to corporate login (307). No authenticated visual validation. |
| BLOCKED | `require.resolve('playwright-core')` availability check | Browser harness dependency absent. No dependency was installed. |
| NOT RUN | Full repository test suite | Selected suites only; no full-suite or production sign-off claim. |

The fresh leads-only rerun passed. Earlier failed runs remain part of the evidence; the broad 305-test selection was not rerun in full after the fixture correction.

## Covered Local Controls

- Six capability-filtered groups; canonical company/division context; shared participant detail routes preserved; local record links cannot escape the intended realm.
- Forged company scope, outsider/applicant management access and disabled-first SIA rejected.
- Configured read-only SIA produces an actual run/completion audit receipt; no SiaAction is created; revoking agent authority denies replay.
- Internal automation records distinct current processor and rule owner, action permission, pinned version and result transactionally. Historical/incomplete evidence is not fabricated. Account and audit identifiers require their corresponding permissions.
- Existing isolated suites exercised application/offer/OJT/activation, financial source/reconciliation, message consent, authorization, replay and audit rollback. Synthetic fixtures are not real employment, money or messaging actions.

## Pilot And Production Limitations

| Status | Remaining validation |
| --- | --- |
| BLOCKED | Real pilot: identified authorized managers/participants, approved engagement/performance/compensation/payment terms, Nidus legal entity and First Oppo details. |
| NOT RUN | Authenticated desktop/mobile browser screenshots, physical mobile devices, keyboard workflows and screen readers. |
| NOT RUN | Manager usability sessions: next action within 30 seconds; approval/follow-up without losing company context. |
| NOT RUN | Representative staging HTTP p95 <=2 seconds / p99 <=5 seconds and agreed concurrency. Local query observations are not those latency measurements. |
| BLOCKED | Live WhatsApp/provider contract, credentials, policy and consent verification. No live provider was activated. |
| NOT RUN | Production monitoring, backups, actual restoration, rollback, five-domain TLS/routing and browser authentication-session isolation. |

Local benchmark observations from existing selected tests: the fresh leads run reported `fixtureLeads: 2001, queries: 91, listQueries: 26, milliseconds: 73`; the earlier wallet run reported 315 wallets, 25 returned / 31 queries / 114 ms. They do not establish production capacity or browser response-time percentiles.

## Task Files

New control files: `src/lib/nicejobs-control-navigation.ts`, `src/server/nicejobs/control-panel.ts`, `src/server/nicejobs/automation-provenance.ts`, `src/app/app/nicejobs/boss-workspace.tsx`, `src/app/app/nicejobs/boss-sia.tsx`, `tests/nicejobs-control-navigation.test.ts`.

Updated integration files: Nice Jobs `page.tsx`, `application-actions.ts`, `loading.tsx`, `workforce-control-workspace.tsx`, `knowledge-workspace.tsx`; Jobs gateway `page.tsx`; `globals.css`; Nice Jobs `command-center.ts`, `automation-control.ts`; communications `automation.ts`; SIA `context.ts`, `service.ts`; `tests/nicejobs-automation-command.test.ts`; test-only clock correction in `tests/nicejobs-leads.test.ts`.

Documentation: `NICE_JOBS_HYBRID_CONTROL_PHASE_5.md`, `NICE_JOBS_PILOT_PHASE_6.md`, this report and a cross-reference in `NICE_JOBS_AUTOMATION_WORKFORCE_COMMAND_CENTER_ARCHITECTURE.md`. Many other modified/untracked files predate this task; they were not reverted.

Preview: `http://127.0.0.1:3009/sites/jobs/gateway`. Authentication and current permissions are still required. The preview is not a deployment or a real pilot.
