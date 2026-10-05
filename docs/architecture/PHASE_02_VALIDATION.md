# Phase 02 Validation

## Database Recovery and Migration

The existing Phase 01 database had been created with explicit SQL, without Prisma migration history. The first migrate dev reported drift and requested a reset. No reset was performed.

1. Created a separate SQLite baseline using prisma/migrations/20261002120000_phase_01_foundation/migration.sql.
2. Ran prisma migrate diff from that baseline database to the existing dev.db with --exit-code. Result: no difference detected, exit 0.
3. Recorded only the verified existing baseline with prisma migrate resolve --applied 20261002120000_phase_01_foundation.
4. Generated Phase 02 SQL with prisma migrate diff from that baseline to the canonical Prisma schema.
5. Applied Phase 02 through prisma migrate deploy and subsequently applied the separate nullable-legal-name refinement. All three migrations are tracked.
6. Initialized an empty separate SQLite file with Node DatabaseSync, then ran Prisma migrate deploy against that fresh database. All three migrations applied successfully through native Prisma tooling.
7. Ran prisma migrate dev against the existing database. It reports already in sync with no pending migrations.

The generated SQL preserves rows with INSERT SELECT before replacing SQLite tables. It also normalizes Phase 01 foreign keys to Prisma's ON UPDATE CASCADE default, which explains replacements of otherwise unchanged tables. It removes User.personId uniqueness and makes CompanyProfile.groupId nullable. It adds the Phase 02 relationship fields and defaults. No business rows are dropped as part of this migration.

Fresh SQLite creation initially failed with an undiagnostic Schema engine error. Initializing the empty file resolved that creation issue and native deploy succeeded. Separate migration tests execute all three SQL files against a newly created temporary database and assert PRAGMA integrity_check=ok and zero foreign_key_check violations. Prisma validation and client generation pass independently. No production database was accessed.

## Tests

Database-backed tests use an isolated Node SQLite temporary database, not dev.db. They execute both migrations and call the actual Prisma domain service. Coverage includes group/company consistency, directional company links, owner exclusivity and percentage/date ranges, flexible hierarchy and rejected moves, person/account separation, membership dates/scope, brand/product/project/goal links, assignment scope, company isolation, role delegation, and atomic audit rollback.

Node 22.14 or newer is required for the integration test's built-in node:sqlite API. Node currently labels that API experimental; this is a test-only dependency.

## Browser and Production

The browser skill was loaded and its runtime initialized, but discovery returned no browser backends. Visual checks of desktop/mobile layout and browser-driven form workflows require manual validation. A production build is a local compilation check, not production deployment validation. No production environment was accessed.

Production rollout still requires deployment-specific secrets, HTTPS cookies, database choice/backups and deliberate migration review. Existing Phase 01 local credential defaults are development settings.

## Final Local Results

| Check | Status | Evidence |
| --- | --- | --- |
| Tests | PASS | 5 files, 35 tests; 28 database-backed business tests plus 7 foundation tests |
| Lint | PASS | npm run lint |
| TypeScript | PASS | npm run typecheck |
| Build | PASS | npm run build; all App Router routes compiled successfully |
| Prisma schema/client | PASS | prisma validate and prisma generate |
| Existing database | PASS | migrate dev already in sync; migrate status up to date; migrate diff to canonical schema reports no difference |
| Fresh migration deploy | PASS | All three migrations applied through Prisma to an initialized empty SQLite file |
| SQL integrity | PASS | dev.db integrity_check=ok; foreign_key_check returns no rows |
| Safe seed | PASS | One company, zero ownership, brand and product records; existing admin preserved |
| HTTP smoke | PASS | All 11 authenticated business registries, unauthenticated redirect and unknown-route not-found state |
| Visual/browser forms | MANUAL VALIDATION | No browser backend available; viewport screenshots and form interactions not run |
| Production deployment | NOT RUN | No production environment accessed |

HTTP smoke uses scripts/http-smoke.ts against loopback only. With the local development server running, execute npx tsx --env-file=.env scripts/http-smoke.ts. It creates a short-lived test session for the existing development admin, cleans that session in finally, and never creates business data or logs session secrets. Next's streamed not-found response may carry HTTP 200; the smoke test verifies the actual not-found state.
