# MAXPASE OS

Phase 10 hardening of the MAXPASE OS Phase 01-09 architecture. MAXPASE GROUP remains the root ecosystem; AIRA is the first Company OS and SIA remains permission-controlled.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `AUTH_SECRET` to a strong random value.
3. Run `npm ci --ignore-scripts --no-audit`.
4. Run `npm run prisma:generate`.
5. Apply the checked-in migrations with `npx prisma migrate deploy`.
6. Supply `DEV_BOOTSTRAP_PASSWORD` privately for a new local bootstrap account, then run `npm run seed`. Without it a new seed receives an undisclosed random password. Existing accounts are never overwritten.
7. Start development with `npm run dev`.

## Execution

Open `/app/execution` for real execution overview and attention. Projects, milestones, tasks, goals, members, dependencies, blockers and responsibilities have scoped views and mutation controls. Project details show deadlines, ownership/accountability, progress and next work. Manual goal estimates retain actor/date/reason history. No execution data is seeded. Run the development seed after migration to register new capabilities on the existing development administrator, not on canonical AIRA roles.

See [execution architecture](docs/architecture/EXECUTION_MODEL.md) and [Phase 04 validation](docs/architecture/PHASE_04_VALIDATION.md). The HTTP smoke script also checks execution views; it does not replace visual/device/form validation.

The optional `MAXPASE_SMOKE_FIXTURE=true` smoke setting verifies temporary domain records and removes exact fixtures afterward. Use it only with the local development database. Current dependency findings and unresolved audit/provider/browser/deployment gates are documented in the Phase 10 validation record; historical audit results are not a current clean-audit claim.

Default seeded local account:

- Email: `admin@maxpase.local`
- Password: privately supplied during initial seeding; no fixed password is embedded in source.

Change the seeded password before any shared environment.

## Final Build And Deployment

Open `/app/executive`, `/app/sia`, `/app/aira`, `/app/operations` and `/app/communications` for the implemented authorized workspaces. Email/WhatsApp mocks remain SIMULATED; TalkinLabs and private delivery are NOT CONFIGURED. No unrestricted autonomous SIA execution is enabled.

See [deployment](docs/architecture/PRODUCTION_DEPLOYMENT.md), [migration](docs/architecture/MIGRATION_RUNBOOK.md), [backup/restore](docs/architecture/BACKUP_RESTORE.md), [incidents](docs/architecture/INCIDENT_RUNBOOK.md), [browser/device checklist](docs/architecture/BROWSER_DEVICE_CHECKLIST.md) and [Phase 10 validation](docs/architecture/PHASE_10_VALIDATION.md). Production migration is intentional, never an application-startup step. This workspace is not a validated production deployment.

Run `npm run validate:migrations` for isolated fresh/repeat migration, drift and local recovery checks; `npm run benchmark:local` for small synthetic local query/index samples. These do not establish production recovery or capacity. Liveness is `/api/health`; readiness is `/api/ready`. Missing/insecure production configuration fails closed.

## Business Management

Open /app for the group registry. Navigation includes companies, organization structure, company relationships, ownership, people, memberships, brands, products, projects and goals. Existing foundation information remains at /app/foundation. Creating people creates organization memberships, never authentication accounts. Membership role assignment and scope changes require separate permissions.

Seed data adds only the known AIRA SKILL CITY PRIVATE LIMITED company under MAXPASE GROUP and marks it development-only. No legal identifiers, ownership, websites or operational records are invented. The seed refuses production mode.

## Validation

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npx prisma validate` and `npx prisma migrate status`. Integration tests need Node 22.14 or newer for node:sqlite and use a temporary database.

The existing Phase 01 SQL database was verified before recording its migration baseline. See [migration and validation evidence](docs/architecture/PHASE_02_VALIDATION.md) before repairing any other untracked installation. Never reset a database to hide drift. If Prisma cannot create a fresh SQLite file on Windows, initialize an empty file using SQLite and retry deploy; do not mark an unapplied migration as applied.

See [business graph](docs/architecture/BUSINESS_GRAPH.md) for relationship, authorization and audit semantics. Production rollout and visual browser validation require their own environment.

With the development server running, `npx tsx --env-file=.env scripts/http-smoke.ts` verifies all business registry routes and the authentication redirect using a temporary session that is removed afterward.

## People and Access

Navigation includes people, user accounts, organizations, departments, teams, memberships, roles/designations, capabilities, access/role assignments, reporting, responsibilities and SIA access. Organization selection is validated server-side and includes only permitted descendants. Project memberships remain explicitly project-bound.

The seed preserves all 60 locked AIRA designations without assigning employees or granting role capabilities. It retains the original development administrator and adds an unstaffed, development-labelled department/team example. SIA remains a separate non-human identity with no seeded access or execution.

See [people and access architecture](docs/architecture/PEOPLE_ACCESS.md), [locked AIRA roles](docs/architecture/AIRA_CANONICAL_ROLES.md) and [Phase 03 validation](docs/architecture/PHASE_03_VALIDATION.md). The HTTP smoke script now checks all 23 business/workforce views. Visual/device/form workflows and production deployment have separate validation requirements.
