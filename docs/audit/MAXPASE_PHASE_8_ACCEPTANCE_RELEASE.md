# MAXPASE Phase 8 — acceptance and controlled release register

Recorded 2026-10-30. **Overall: BLOCKED for production activation.** This is a local acceptance record for the current, uncommitted Phase 1–7 worktree, based on `main` at `e8f484b`. It is not a signed release artifact or a real-account, browser, database, backup, or production acceptance. No traffic, account, programme, payment, or provider was activated by this review.

## Evidence obtained in this pass

All local commands below used an explicitly nonworking localhost `DATABASE_URL` in the child process so they could not reach the database named in the local `.env`. No database query, migration, seed, backup, or restore was run.

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Static and mocked service/UI tests | **PASS** | Vitest: 52 files, 217 tests passed. Selected every test file that does not instantiate `createPostgresFixture`; this includes Boss/brand reporting, director reports, Startup Skool and Labs UI, and Nice Jobs presentation checks. These are not database or browser journeys. |
| Lint | **PASS** | `npm run lint`. |
| TypeScript | **PASS** | `npm run typecheck`. |
| Prisma schema | **PASS** | `npm run prisma:validate`; validation does not apply a migration or verify a live database. |
| Production build | **PASS** | `npm run build` exited 0; Next.js compiled and generated all 22 static pages. This is a build check, not a live route or database check. |
| PostgreSQL integration, migration and safeguards | **BLOCKED** | No verified `TEST_DATABASE_URL`, `MAXPASE_CI_DATABASE_CONFIRMED`, local PostgreSQL service, `psql`, `pg_dump`, or `pg_restore` is available in this workspace. The repository's isolated fixture requires a confirmed localhost PostgreSQL 16 `maxpase_ci` target and creates separate disposable fixture databases. No CI run for this dirty worktree exists. |
| Git diff whitespace and register link | **PASS** | `git diff --check` on tracked changes; scoped trailing-whitespace scan of this new register and the historical-note edit found none; the new relative link resolves. Git does not include untracked files in `diff --check`. |

## Journey acceptance matrix

Record a date, authorized test-account reference, environment, result, defect reference, and redacted evidence link for each run. An existing account, role title, fixture, or source test does not prove current authorization. Never put PINs, passwords, session cookies, full database URLs, customer answers, or private documents in this register.

| Journey | Minimum complete walkthrough | Current status |
| --- | --- | --- |
| Boss on `maxpase.com` | Sign in, inspect Group → company → brand, open source records behind counts, create/review a scoped staff draft, confirm denial outside scope, sign out. | **BLOCKED** — no real-account/browser evidence for this worktree. |
| Director on `airaskillcity.com` | Sign in, see assigned divisions only, drill from each available count to the source, review a decision with independent authority, confirm revocation. | **BLOCKED** — no verified director appointment or browser/database run. |
| Employee on `airaskillcity.com` | Sign in as advisor or Labs developer, complete authorized follow-up or assigned work, record evidence, verify sibling-brand/customer denial. | **BLOCKED** — named accounts, assignments and live invitation evidence absent. |
| Startup Skool applicant and student on `airastartupskool.com` | Apply, see accurate status, receive human decision; only an independently authorized admission/enrolment opens the founder workspace. Verify proposed tiers never collect payment. | **BLOCKED** — Kerala tier/terms, reviewer, mentor, participant consent and provider evidence remain pending in `STARTUP_SKOOL_KERALA_PILOT.md`. |
| Labs customer on `airalabs.online` | Submit enquiry with consent, authenticate, see only own approved proposal/project/review requests; verify another customer's direct URL is denied. | **BLOCKED** — verified customer account, live provider and browser isolation evidence absent. |
| Nice Jobs candidate/worker on `nicejobs.online` | Sign up and verify email, browse only published jobs, apply, see status, follow reviewed offer/orientation, enter worker space only after separate activation. | **BLOCKED** — job publication/terms/manager and participant approval register remains blocked. No real offer or earnings action is authorized. |

## Cross-cutting release gates

The previously agreed initial acceptance criteria are: a manager identifies the next action within 30 seconds and completes approval/follow-up without losing company context; keyboard workflows have no critical accessibility issue; representative staging requests meet p95 <= 2 seconds and p99 <= 5 seconds; authorization, isolation, replay and audit rollback have zero failures. These are **targets, not measured results**. Production concurrency and backup RPO/RTO still require approved targets.

| Gate | Required evidence | Current status |
| --- | --- | --- |
| PostgreSQL and security | On a verified disposable PostgreSQL target: fresh migration and readiness, all 13 triggers, cross-company/customer access, session-realm isolation, revocation, replay, audit rollback, concurrent financial writes and scoped source-count reconciliation. Full CI must pass for the exact reviewed commit. | **BLOCKED** locally; no target. |
| Browser and mobile usability | Desktop and mobile journeys at 320 px and 390 px, keyboard, 200% zoom and screen reader; long names, loading/empty/error states, focus and confirmations. Record browser/device and redacted screenshots. | **NOT RUN**. Static markup tests are not visual or assistive-technology acceptance. |
| Domains and provider configuration | Verify five host mappings, TLS certificates, exact host-only cookie behaviour and provider delivery/consent with approved test identities. | **NOT RUN**. |
| Backups and rollback | Confirm a current recoverable PostgreSQL backup and separate private file backup where content exists. Restore into a new isolated target, check schema/ledger/13 triggers/scoped reads/file references, measure RPO/RTO, rehearse matching-artifact rollback and post-snapshot effect reconciliation. | **NOT RUN**. Historical backup claims are not current restore evidence. |
| Monitoring and ownership | Confirm readiness/liveness alerts, failed-job/provider and backup-age alerts, on-call owner, approved RPO/RTO, release owner and rollback operator. | **NOT VERIFIED**. |
| Commercial and employment gates | Approved issuer/tax/written terms, programme and job publication, manager/reviewer authority, offers, payroll and payment controls for each brand. | **BLOCKED** wherever the relevant approval register remains open. |

## Controlled order and stop rule

1. Freeze and review the complete Phase 1–7 worktree, including untracked files; select a clean commit and require CI for that exact revision. A passing prior CI run is not evidence for this worktree.
2. Complete the isolated PostgreSQL migration, security and backup/restore rehearsal. Resolve any failure before proceeding.
3. Accept the Boss Group/brand controls, then the Skill City director and employee workplace with verified scoped accounts. Keep new employee activation behind existing approval and invitation controls.
4. Accept Labs customer isolation, Startup Skool applicant status and approved student access, then Nice Jobs candidate access. Activate a public programme, job, offer, worker or payment path only when its separate business gate passes. A brand landing page can exist while its gated workflows remain unavailable.
5. Verify all five domains at the deployed edge, mobile/accessibility, alerts and rollback. Release owner records a signed go/no-go decision for each brand. **Production activation, deployment and traffic changes require a separate approved operation.**

On any failed authorization, replay, migration, financial integrity or restore check: stop the affected rollout, preserve evidence and the current database, and use `MIGRATION_RUNBOOK.md` and `BACKUP_RESTORE.md`. Do not reset a database, edit the migration ledger, replay uncertain provider messages or assume an older application can read a newer schema.

The older `MAXPASE_WORKPLACE_PHASE_10_ACCEPTANCE.md` and `MAXPASE_WORKPLACE_PHASE_11_RELEASE_PREPARATION.md` are historical records from the former SQLite period. The active database procedure is the PostgreSQL section of `MIGRATION_RUNBOOK.md` and `BACKUP_RESTORE.md`; their dated incident statements must be reverified for the selected release.
