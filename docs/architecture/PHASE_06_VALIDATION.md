# Phase 06 Validation

Local validation date: 2026-10-04, Asia/Calcutta. Phase 07 has not started. SIA execution remains disabled.

## PASS

- Existing MAXPASE architecture, company profile, authorization engine, identity/role registry, responsibility, execution, workflow/approval, notification and audit systems reused.
- Four canonical AIRA divisions and company-owned Nice Jobs platform under Career Hub seeded idempotently. Labs candidates remain unregistered; no programs, batches, locations, people, participants, projects, goals, revenue or KPIs are seeded.
- Reusable Program, Batch, Location and BatchParticipant schemas, actual company/division relationship guards, nullable unknown data, UTC dates, capacity and lifecycle checks.
- Shared Responsibility gains program/batch/location targets, kind and optional responsible team while retaining its explicit human-contact contract. Shared Product receives divisionId; Project/Goal receive programId.
- Fixed server-resolved AIRA context, exact vs descendant capabilities, project-only grant boundaries, cross-company/reference/actor forgery checks, membership revocation, safe DTOs and transactional audit.
- Shared Program/Batch/Location workflow/request/notification targets and configured human approvals. Workflow approval does not activate an offering or execute work. SIA execution prohibition remains covered by Phase 05 regression tests.
- All 120 tests in nine files pass with `npm.cmd test -- --no-file-parallelism`: 16 Phase 06 integration/security tests plus all 104 earlier tests. Initial integration runs caught an incorrectly configured test workflow and an omitted-field product relationship guard; both were corrected and the full suite rerun.
- Lint, standalone TypeScript and optimized production build pass. Build success is not production deployment validation.
- Prisma Client generation and schema validation pass. Existing local database is current with seven migrations; schema drift check reports no difference.
- New `20261004120000_phase_06_company_os` migration applied to the existing database without reset. All seven migrations also deploy into a separate fresh `phase06-clean.db`. Native integrity_check returns ok and foreign_key_check returns no rows in both databases. Prisma's initial missing-file initialization returned a generic schema-engine error; creating an empty SQLite database with the native tool then rerunning deploy succeeded. No existing database was replaced.
- Repeated development seed preserves the existing User/Person, all 60 canonical role definitions, zero canonical human role assignments, and the existing non-human SIA identity. New registry keys are provisioned only through the existing explicit development administrator bootstrap.
- Authenticated HTTP smoke checks pass for 66 application views: 11 business, 12 workforce, nine execution, 15 operations and 19 AIRA views. Temporary real program/batch/location, shared project/task and control/workflow/request/approval fixtures render. Authentication redirects and unknown-route handling pass. This is HTTP rendering, not browser interaction.
- Exact fixture IDs, dependent approvals/history/states, generated notices/events/audits and temporary session removed in finally cleanup. Post-smoke database has User=1, Person=1, canonical roles=60, assigned canonical roles=0 and no fixture programs/batches/locations/requests/events. Known structural seed records remain.
- `npm.cmd audit --omit=dev --registry=https://registry.npmjs.org` reports zero production dependency vulnerabilities.

## BLOCKED

- Browser inventory through the available Computer Use API returns `apps=[]`, `browsers=[]`. No browser backend was substituted. Screenshots, desktop/mobile visual checks and actual interactive form submissions are not claimed.
- Full dependency audit reports seven development-only vulnerabilities: two moderate Vitest/@vitest/mocker findings (GHSA-82fw-gwwq-j7x9), and five high findings in the braces/micromatch/fast-glob/Next ESLint chain (GHSA-vfj7-8cjw-p6xm). npm proposes breaking changes including Vitest 5.0.3 and an eslint-config-next downgrade. No force upgrade or unrelated toolchain migration was made. This residual risk is not hidden by the clean production audit.

## MANUAL VALIDATION

Pending: desktop/mobile company navigation, keyboard and screen-reader controls, program/pricing editor, batch UTC inputs/capacity, location/responsibility forms, participation, workflow launch and shared run controls, approval/read-state actions, error/loading/pending presentation and company entry. Responsive CSS and server/HTTP checks do not establish visual or device validation.

## NOT RUN

Production deployment or production database migrations, physical devices, production load/concurrency certification, complete recruitment/admissions/CRM/LMS/HR/payroll/finance, external communication providers, autonomous SIA execution and intelligence. Later-phase modules are intentionally absent, not mocked.

## Files and Modules Changed

- `prisma/schema.prisma`; new `prisma/migrations/20261004120000_phase_06_company_os/migration.sql`; `prisma/seed.ts`.
- New `src/server/domain/company-structure.ts`, `company-input.ts`, `aira-seed.ts`, `aira-service.ts`.
- `src/server/authorization/registry.ts`: six reusable scoped program/batch/location capabilities.
- `src/server/domain/business-input.ts`, `business-service.ts`: product division validation/canonical protection, employer relationship and referenced-program safeguards.
- `src/server/domain/workforce-input.ts`, `workforce-service.ts`: shared responsibility targets/kinds/team checks and canonical division protection.
- `src/server/domain/execution-input.ts`, `execution-service.ts`: same-scope program links and goal/project consistency.
- `src/server/domain/operations-input.ts`, `operations-scope.ts`, `operations-service.ts`: typed company resource resolution/target choices and reserved lifecycle namespaces, preserving all Phase 05 gates.
- New `src/app/app/aira/layout.tsx`, `page.tsx`, `[kind]/page.tsx`, `labels.ts`, `company-manager.tsx`, `actions.ts`, `loading.tsx`, `error.tsx`.
- `src/app/app/layout.tsx`, `src/app/globals.css`: audited company entry and responsive unframed company navigation/queues/editors.
- `src/app/app/business/form-fields.ts`: employer relationship option in the existing editor.
- `src/app/app/operations/[kind]/page.tsx`: authorized program/batch/location targets in shared operational editors.
- New `tests/aira.test.ts`; expanded `scripts/http-smoke.ts` with company routes/real fixtures and exact-ID cleanup.
- New `AIRA_COMPANY_OS.md`, `PHASE_06_VALIDATION.md`; updated ARCHITECTURE, BUSINESS_GRAPH, DOMAIN_MODEL, AUTHORIZATION_MODEL, OPERATIONS_MODEL, EXECUTION_MODEL, SIA_ARCHITECTURE, DATABASE_MODEL and SECURITY_MODEL in `docs/architecture`.

## Architectural Decisions

AIRA is a facade over one shared OS, not a tenant fork. Programs/services and locations are generic reusable tables. Operational ownership/academics/managers/trainers remain Responsibility records, not implicit role authority or duplicate people. Product retains company ownership while its division expresses an operating home. Batch is the delivery anchor, with participation and trainer/mentor responsibility only, not an LMS. Six generic capabilities avoid redundant speculative aira.* grants. Company context is revalidated per request, never trusted session/client state. Shared workflow/approval and execution services retain their own exact scope, idempotency, state and human gates. Nullable pricing is offering configuration, not accounting. SIA cannot execute.

## Reproduction

```powershell
npm.cmd run prisma:generate
npm.cmd run prisma:validate
npx.cmd prisma migrate deploy
npm.cmd run seed
npm.cmd test -- --no-file-parallelism
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npx.cmd prisma migrate status
npx.cmd prisma migrate diff --from-url file:./prisma/dev.db --to-schema-datamodel prisma/schema.prisma --exit-code
npm.cmd audit --omit=dev --registry=https://registry.npmjs.org
# With the local development server running; temporary fixtures are opt-in.
$env:MAXPASE_SMOKE_FIXTURE='true'
npx.cmd tsx scripts/http-smoke.ts
```

On Windows, stop only the owned development server before Prisma generation to avoid its native DLL lock. Development seed refuses NODE_ENV=production. Production migrations remain deliberate manual deployment steps. Never reset the existing database to reproduce these checks.
