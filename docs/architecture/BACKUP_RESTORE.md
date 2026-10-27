# Backup And Restore

## PostgreSQL release procedure

The active Prisma datasource and migration chain now target PostgreSQL. The SQLite procedures below are historical and must not be used for a PostgreSQL launch. Production PostgreSQL backup, monitoring and restoration remain **NOT VERIFIED**.

- Back up the verified Railway PostgreSQL service using the operator-approved managed backup or `pg_dump` with a privately supplied connection reference. Never put credentials in command arguments, committed files or shared logs. Include private uploaded objects on `maxpase-volume` separately; database migration does not justify removing that volume.
- Restore into a **new isolated PostgreSQL database**, never over the live target. Verify schema, migration checksum, all 13 triggers, row counts, scoped access, audit, file references and application readiness before switching a release. Exercise failure and rollback with a matching application artifact and secret versions.
- Stop writes/processors for a cutover; preserve and reconcile post-backup communication and financial effects. Encryption, retention, RPO/RTO, restore ownership and monitoring require explicit owner approval and measured evidence.

## Historical SQLite procedure (retired)

## Ownership And Inventory

Release owner approves recovery; deployment operator creates/restores snapshots; security/data owner manages encryption, access, retention and deletion. These are operational responsibilities, not new named application-role authority.

Back up the SQLite database (including authoritative people/access, requests/approvals, audit, SIA context/action records, integrations, message/event identities and rate/job state), matching release artifacts/lockfile/migrations, deployment configuration and separately secured secret-manager versions. Nice Jobs now supports optional private filesystem objects: include all referenced blobs/versions, metadata and separately managed encryption keys where applicable. Production storage configuration/retention remains NOT VERIFIED. Never bundle plaintext secrets into ordinary application backups/logs.

## Snapshot

`npm run backup:sqlite -- <existing-source-file> <new-backup-file>` opens the source read-only, verifies integrity/FKs, uses SQLite VACUUM INTO with a bound destination parameter and verifies the resulting standalone snapshot. It refuses existing destinations. This avoids an inconsistent live file copy, including WAL-mode sources. Provision a private destination directory with enough space and reviewed ownership; the script does not provision encryption, remote upload or retention. Verify hashes/manifests privately and perform periodic isolated restore drills. For deployments with concurrent external activity, quiesce processors/writes to align the snapshot and provider reconciliation boundary.

Never copy only the live .db while omitting a required WAL/journal. A snapshot contains sensitive business and audit data; encrypt at rest and in transit with organizational key management, least-privileged backup access and separation from the application host.

## Restoration Order

1. Stop traffic, all writers and bounded processors; preserve the current incident database for investigation.
2. Restore the correct release and privately supplied configuration/key versions. Provision a NEW isolated private database path; never overwrite a live database.
3. Recover the verified database snapshot. Recover private files/reference consistency before re-enabling delivery if storage exists. Restore secret references without exposing actual values in UI/logs.
4. Verify integrity/FKs, migration ledger/checksums, expected schema and authorized scoped reads. Run health/readiness and human login/access/approval/audit verification. Review stale sessions and deliberately revoke them after security compromise.
5. Reconcile external effects since the snapshot: provider-confirmed message references, idempotency keys, UNKNOWN/SENDING states and webhook receipts. Restored queues may predate real sends; do not blindly process them. Disable processors until authorized provider reconciliation can prove safe handling. Live provider reconciliation is not configured here.
6. Restore traffic only after release owner approval, record actual data-loss window and elapsed recovery time, then review monitoring and follow-up.

## Proposed Frequency And Retention

Starting proposal, not an implemented SLA: daily encrypted full snapshots, pre-release snapshots and additional four-hour snapshots when the business requires that recovery point; retain daily copies for 30 days and monthly copies for 12 months subject to data-owner approval, privacy policy and available storage. Keep at least one separate failure-domain copy. Run monthly isolated restoration drills and a drill before major migrations. Set and measure RPO/RTO against actual workloads; snapshot spacing bounds potential data loss, not a guaranteed recovery point, and restore duration is not yet a production guarantee.

## Evidence

Wave 03 readiness verifies the release manifest but **does not** prove a backup exists or can be restored. Before launch retain actual privately verified snapshot hash, release/migration and secret-version manifest, destination encryption/access/retention evidence, restore date/reviewer, integrity/FK/schema/scope/audit checks, reconciliation decision and measured RPO/RTO. Record approved targets separately from achieved figures; production snapshot retention, encryption, restore drill and backup-freshness alerting remain NOT VERIFIED. Do not include secret values in ordinary recovery manifests.

`npm run validate:migrations` creates a temporary database, applies/reapplies the real migration chain, checks drift/integrity, inserts a clearly non-business recovery probe, snapshots it, restores into another NEW temporary file, verifies probe/integrity/FKs and removes only that generated temporary directory. This isolated local database recovery check was actually run. [Nice Jobs Programme Phase 7](NICE_JOBS_PROGRAMME_PILOT_PHASE_7.md) adds an actual quiesced fixture database/blob restore through the authorized content service, including missing-object and revoked-access checks. Production database/private-file recovery, external infrastructure, remote retention and encryption-provider recovery remain NOT RUN.
