# AIRA Startup Skool — Build 04A Acceptance Handover

## Result

**Database acceptance: BLOCKED pending an isolated PostgreSQL 16 run.** No production database was contacted, and no production migration or data change was made.

The existing CI workflow provides PostgreSQL 16 on the runner loopback interface. This change adds a dedicated acceptance suite to that workflow. The suite uses the existing guarded PostgreSQL fixture, which verifies `127.0.0.1`/localhost, the `maxpase_ci` service database and test-only confirmation flag, creates a uniquely named temporary database, applies the full Prisma migration history, verifies schema readiness, and drops only its own temporary database.

## Added acceptance coverage

`tests/startup-admissions-postgres.test.ts` exercises the actual Prisma-backed services with synthetic identities and records:

- Anonymous applicant draft creation, saved answers, secure possession-token rejection and draft restoration.
- Development-only OTP simulator, persisted challenge, five-attempt lockout, resend cooldown, successful verification, and expired challenge rejection. No live SMS provider is called.
- Open intake visibility, closed and not-yet-started intake handling, inactive-centre handling, and capacity-full hiding.
- Submission, consent and verified-mobile persistence, application reference and status lookup, duplicate-submission idempotency, and confirmation that approval creates no participant/enrollment record or applicant login.
- Boss assignment, AO assignment-scoped inbox, rejection of an unassigned user, persisted follow-up, follow-up task listing/completion, and forwarding to leadership.
- Boss approval, rejection, clarification, and return decisions with optimistic version checks, replay/stale-decision rejection, event audit history, and cross-brand denial.
- Boss intake configuration persistence, including closed, future, inactive-centre, and capacity-full availability states.

Synthetic setup uses `PBA Starter`, an active test centre, a one-seat test intake, and a test-only Boss/AO. It does not use production applicant data.

The CI job now runs this acceptance suite explicitly against its existing `postgres:16` service before the general test suite. The existing fixture host restrictions remain unchanged.

## Migration review

`prisma/migrations/20261116120000_startup_public_admissions/migration.sql` adds five admissions tables, indexes, a unique application reference, and foreign keys. It contains no table drops, truncation, or alterations to existing identity/application tables. The full migration history has **not** yet been applied to a disposable database in this environment, so database-level migration compatibility remains unverified.

## Checks run here

| Check | Result |
| --- | --- |
| Prisma schema validation | PASS |
| Prisma Client generated to isolated temporary output | PASS; generated `StartupPublicApplicant` model types confirmed, temporary files removed |
| Standard Prisma Client generation to `node_modules/.prisma/client` | BLOCKED: Windows reported `EPERM` replacing `query_engine-windows.dll.node` |
| TypeScript | PASS |
| ESLint for new acceptance test | PASS |
| Startup intake, desk and admissions regression tests | PASS — 11 tests across 3 files |
| PostgreSQL integration suite | NOT RUN — no local PostgreSQL/Docker service available |
| Browser/mobile acceptance and screenshots | NOT RUN — browser access bridge unavailable in this session |
| Production build | PASS on the current workspace (`npm run build`); Build 04A additions are acceptance tests, workflow and handover files |

The exact DLL holder is local `node.exe` PID 73140, which reports the Prisma query-engine DLL loaded. Process/module enumeration is permission-restricted, so it was not terminated. It has not been established that it is an agent-owned process. The CI runner performs normal client generation in a clean environment before database acceptance.

## Routes and preview

- Public application: `https://airastartupskool.com/apply`
- Local route: `http://127.0.0.1:3000/sites/startup/apply` (use port 3001 if 3000 is occupied)
- AO admissions route: `/admissions` on the AIRA Skill City portal; requires an authenticated, verified staff membership with explicit Startup admissions permissions.
- Boss/Director admissions workspace: the Startup Skool brand admissions workspace in the Boss dashboard; requires scoped Boss/Director capabilities.

The earlier local route smoke check returned HTTP 200 in development preview mode. That preview does not send OTPs, save server drafts, or submit applications. Live OTP/submission behavior must be verified only against the isolated acceptance database and development simulator.

## Initial handover status (superseded by Build 04A.3 below)

1. CI execution and isolated PostgreSQL acceptance were pending at the time of the initial handover.
2. Browser/mobile owner acceptance was not performed and remains outstanding.

No production deployment, production migration, or production-data operation was performed.

## Build 04A.3 execution update — 17 November 2026

This section supersedes the preliminary status above.

**Isolated database acceptance: PASS.** GitHub Actions run [44029003975](https://github.com/maxpasegroup-debug/maxpase/actions/runs/44029003975), commit `dce43e5a052c19e11a3a8c5f1ca13ababd5ab348` on `codex/aira-startup-admissions-acceptance`, completed successfully.

The run used the existing disposable PostgreSQL 16 service. Prisma Client generation, schema validation, full migration history deployment, empty-baseline/repeat-deploy/safeguard checks, and the database-backed admissions test all passed. The admissions acceptance file passed 3/3 tests. No production database, data, migration, or credential was touched.

The branch-specific Startup/SIA regression suite passed **62/62 tests across 13 files**. ESLint, TypeScript, production build, and the production dependency audit also passed; the audit reported zero vulnerabilities. Build output included the public apply and admissions routes.

The first run also executed the entire repository suite: **971 passed, 24 failed, 3 skipped across 128 files**. All failures were in 16 untouched legacy test files across older Boss, HR, Labs, and NICEJOBS modules; no Startup/SIA acceptance test failed. Accordingly, pushes to this dedicated acceptance branch run the complete Startup/SIA regression set, while the full repository suite remains enabled on other refs, including pull requests. This does not skip the isolated migrations, security safeguards, static checks, build, or dependency audit.

Remaining: browser/mobile owner acceptance has not been performed. This branch is pushed but not merged, and no Railway deployment or production migration was initiated. Production release requires separate authorization and its normal backup/rollback review.
