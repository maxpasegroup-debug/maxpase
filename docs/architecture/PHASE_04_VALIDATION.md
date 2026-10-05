# Phase 04 Validation

Validated locally on Windows with Node 22.14, Prisma 6.16.2, Next 15.5.27 and SQLite. This is development validation, not production deployment or browser/device certification.

## PASS

- Vitest: 79 tests across seven files; 20 execution tests, with earlier 59 regression tests preserved. Coverage includes projects, archival/reopening, company/department/project isolation, owner/accountable separation, active/date-valid assignment, milestones and derived progress, dependency direction/cycles/completion/reopen restrictions, goal hierarchy/cycles/manual history, blockers, calendar/UTC deadlines, responsibility/project membership, attention/overdue, filters, transactional audit rollback and historical migration preservation.
- ESLint: npm run lint, zero errors/warnings.
- TypeScript: tsc --noEmit.
- Production compilation: npm run build, all App Router routes generated successfully. This does not mean production has been deployed.
- Prisma schema validation and client generation.
- Existing database migrate deploy/status: all five migrations applied, no reset, earlier migration files preserved.
- Fresh empty SQLite database: native migrate deploy applied all five migrations, status up to date. Empty-file initialization used Node's native SQLite because of the known Windows fresh-file engine behavior.
- Schema drift: migrate diff from the existing database to schema.prisma, no difference.
- Existing and fresh SQLite integrity_check=ok; foreign_key_check returned no violations.
- Historical migration fixture preserves row IDs and foreign keys while normalizing INACTIVE Project to PAUSED, DONE Task to COMPLETED with legacy timestamp, and CANCELED Goal to CANCELLED without losing manual progress.
- Development seed retains all 60 canonical AIRA roles with no automatic employee assignments. Execution tables remain empty after HTTP test cleanup; no fake projects/goals/tasks/milestones/progress/blockers are seeded.
- Authorization/security tests include cross-company and department denial, project-only access, owner/assignment non-escalation, unauthorized reopening, legacy mutation routing, hidden derived-progress protection and atomic audit failure.
- HTTP smoke checks 11 business routes (including execution redirects), 12 workforce routes and nine execution overview/registry views. It checks unauthenticated redirect and unknown-route not-found output. Opt-in temporary project/task fixtures verify actual project detail and next-action rendering, then clean only their exact IDs, related test audits and temporary authentication session.
- Production dependency audit: npm audit --omit=dev --audit-level=high reports zero vulnerabilities after targeted overrides. Prisma remains 6.16.2 and Next remains 15.5.27. deepmerge-ts 8.0.2, effect 3.20.1 and postcss 8.5.28 overrides are installed and locked; client generation, native migrations, config merge compatibility, tests and build were revalidated.

## BLOCKED / Residual Risk

- In-app browser bootstrap reports Browser is not available: iab; discovery returns an empty browser list. No visual screenshot, responsive viewport or browser-driven form validation is claimed. HTTP assertions only check server rendering, not interactive browser behavior.
- Full dependency audit has two moderate findings in the development-only Vitest/@vitest/mocker tree (GHSA-82fw-gwwq-j7x9). Its suggested fix changes the test-runner major version. No force upgrade was performed as part of execution architecture. Only vitest run is used here; a mock/dev server is not exposed. A separate reviewed toolchain upgrade remains advisable. These findings are not in the production-only audit tree.

## MANUAL VALIDATION

Once browser tooling or a human browser is available, check desktop/mobile layout, long labels, table scrolling, keyboard focus and native selects; create/edit/reopen projects; create/order/complete milestones; assign and reopen tasks; add/remove dependencies; create/resolve blockers; record manual estimates and inspect history; switch goal progress basis; create project members and separately delegate capabilities; manage task/milestone responsibilities; apply each filter; verify unauthorized/empty/error/pending states and unknown derived progress. Use development records, not fabricated live business facts.

## NOT RUN

Production deployment, production database selection/migration/rollback rehearsal, browser/device certification, authenticated browser form automation, load testing, full independent penetration testing and Phase05 modules.

## Changed Modules

Prisma schema and new 20261002160000_phase_04_execution migration; domain execution input/service and legacy business delegation; workforce responsibility target/membership validation; authorization engine/grant loader/registry; execution routes/actions/manager/field definitions/workspace/loading/error; app navigation and CSS; business route redirects; execution and regression tests; HTTP smoke; package.json/package-lock security overrides; README and architecture/domain/business/database/authorization/SIA/execution documentation.

## Important Decisions

Existing identities, architecture and permission keys are retained. No separate Initiative or Attention table is added. Progress is explicitly manual or derived, with null for unknown. Dates are UTC. Historical projects remain readable through explicit dated grants; write closure is enforced by the domain services, not by disabling historical access. Deletion is archival/cancellation/revocation, not destructive CRUD. All important mutations and audits share a transaction. Project member roles and Responsibility reuse Phase03. SIA execution remains disabled. Phase05 has not started.

## Reproduction

Run npm test, npm run lint, npm run typecheck, npm run build, npx prisma validate and npx prisma migrate status. Start the development server, then run npx tsx --env-file=.env scripts/http-smoke.ts. To also verify project detail using temporary local test records, set MAXPASE_SMOKE_FIXTURE=true for that command; records and test audits are removed in finally. Never target a shared/production database for local smoke fixtures. Do not use database reset or npm audit fix --force to hide failures.
