# Migration Runbook

## PostgreSQL launch procedure (supersedes the historical SQLite steps below)

Status: **NOT AUTHORIZED FOR PRODUCTION EXECUTION**. The PostgreSQL baseline has not been applied to an isolated PostgreSQL target or proven against real concurrent finance writes. Do not use Railway production as a test database.

1. Verify the intended PostgreSQL service, database name, ownership and connection reference privately. Back up both the Railway PostgreSQL service and any existing `maxpase-volume` contents; the volume may hold uploaded files. Do not delete either service or volume.
2. Configure an independent, ephemeral `maxpase_ci` PostgreSQL target. CI requires a URL-safe `MAXPASE_CI_POSTGRES_PASSWORD` repository secret. `npm run prisma:validate`, `npm run prisma:generate` and `npm run validate:migrations` use the active PostgreSQL schema and one baseline migration. The validator only accepts a confirmed local `maxpase_ci` target through `TEST_DATABASE_URL` and `MAXPASE_CI_DATABASE_CONFIRMED=true`; it refuses populated databases and never resets them.
3. Before a production release, require the full PostgreSQL integration suite, all 13 safeguard and concurrency checks, repeated migration deploy, readiness, authorized workflow tests, a backup restore drill and release-owner approval. The legacy SQLite test suite is not PostgreSQL evidence.
4. Only in a separately authorized release window, supply the existing Railway PostgreSQL `DATABASE_URL` privately to the application service, with stable `AUTH_SECRET`, canonical `APP_ORIGIN`, secure cookies and other required provider settings. Do not embed credentials in source or logs. Stop writers and run `npx prisma migrate deploy` explicitly against the verified target. Never use `migrate reset`, `db push`, `migrate dev`, or a manual "mark applied" shortcut against production.
5. Require `npx prisma migrate status`, `/api/ready` success, migration checksum/trigger checks, scoped sign-in, permissions, finance denial and audit smoke tests before traffic. `/api/health` proves process liveness only. Keep the previous release artifact and verified backup for rollback.
6. On failure, hold traffic, preserve the failed database for investigation, and restore into a **new** database target before a reviewed connection switch. Reconcile effects after the backup time, including external sends and financial intents; never replay blindly.

The remainder of this file records the former SQLite runbook for historical audit only. **Do not execute those SQLite commands for the PostgreSQL release.**

## Historical SQLite procedure (retired)

Responsibility: reviewed deployment operator executes; release owner approves; security/data owner controls backup access. No production DATABASE_URL was supplied or accessed during Phase 10.

1. Verify the intended environment and absolute database path privately. Record release ID and current `prisma migrate status`; compare _prisma_migrations with reviewed source ordering/checksums and inspect unfinished migrations. Do not log the connection configuration or secrets.
2. Stop writes and explicit bounded processors. Take a consistent SQLite snapshot with `npm run backup:sqlite -- <source-file> <new-backup-file>`; the destination must not exist. Verify integrity, FK consistency, storage permissions and recoverability. Save the previous release plus separately secured configuration/secrets/file manifests.
3. Validate the complete chain against a fresh isolated database using `npm run validate:migrations` on the build runner. Never use migrate reset, db push, migrate dev or automatic schema recreation against production.
4. With the reviewed production environment set by the secret manager, run `npx prisma migrate deploy` as an intentional deployment step. Capture safe tool results and applied migration IDs. Twelve migrations now exist: Phase 10 added the security rate table/indexes; Wave 02 adds only nullable ScheduledJob.scanCursor, scanStartedAt and scanRuleVersion. Wave 03 changes no schema/migration SQL. Earlier applied migrations remain unchanged.
5. Run `npx prisma migrate status` and `npx prisma migrate diff --from-url <privately-supplied-url> --to-schema-datamodel prisma/schema.prisma --exit-code`. Prefer a controlled wrapper/environment lookup so connection values do not appear in shared shell history. Prisma differences block traffic; do not resolve them by destructive commands.
6. Verify SQLite `PRAGMA integrity_check` = ok, empty `PRAGMA foreign_key_check`, expected indexes/unique constraints, all migration completion records, application readiness and a scoped authenticated read/write/approval/audit check. Verify required audits commit with writes and SIA tools/grants were not implicitly activated.
7. If migration fails, keep traffic/processors stopped. Preserve the failed database and diagnostic artifact privately; never repeatedly apply unknown DDL or mark success manually. Investigate under INCIDENT_RUNBOOK.md. Restoring a snapshot is the rollback path; Prisma down-migrations are not implemented.
8. Restore the verified pre-migration snapshot to a NEW isolated path first, verify it, then use a reviewed service-manager/database-path switch to restore the matching prior release. Do not overwrite a live SQLite file or omit WAL/journal handling. Reconcile all post-snapshot writes and uncertain external sends before allowing traffic. A restoration must not replay communication queues blindly.

Fresh deployment followed by repeat deploy, schema diff and integrity checks is exercised locally; migration SQL itself is ordered one-time DDL, not independently rerunnable SQL. Prisma's migration ledger provides repeat-deploy safety. Production migration, restore and operator recovery timings remain NOT RUN.

## Wave 03 Readiness Manifest

Readiness now compares all 12 non-rolled-back completed migration ledger entries/checksums with the release-owned manifest in `src/server/security/readiness.ts`, rejects missing/unfinished/duplicate/unknown active entries, and probes Session plus the three ScheduledJob continuation columns. The regression test compares the manifest to actual source SQL bytes. A later intentional migration must update this manifest and its evidence; never generate expected checksums from the live database to make a failure pass.

This is a release-ledger/runtime-probe gate, not complete schema drift, integrity/FK, storage, backup or recovery validation. Continue steps5-6; a modified schema with an untouched ledger can require separate diff/integrity checks. Apply migrations with traffic/writers stopped, switch matching release deliberately, and keep an older release from serving a newer unexpected ledger. No production migration was executed in Wave 03.
