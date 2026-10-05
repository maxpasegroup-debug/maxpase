# Database Model

## Phase 10 Migration And Recovery

20261004180000_phase_10_hardening is the eleventh migration. It adds SecurityRateBucket (hashed/pseudonymous budget key, window, expiry, count, unique key/window, expiry index) and non-destructive composite indexes for task deadlines, outbound message queues, scoped SIA memory and failed operational events. Earlier migration SQL remains unchanged. Fresh/repeated deploy, drift/integrity/FKs and isolated snapshot/restore are checked by scripts/validate-migrations.ts. Production migration/restore are NOT RUN; SQLite requires one persistent shared file and intentional migration/backup steps. See MIGRATION_RUNBOOK.md and BACKUP_RESTORE.md.

## Phase 09 Migration

20261004150000_phase_09_communications adds Integration, CommunicationPolicy/Consent/Template/Thread/Message, IntegrationEvent, AutomationRule/Run, ScheduledJob and CommunicationRateBucket. Restrictive organization, project, user/person, SIA, control/request and operational-event foreign keys preserve existing identities. Unique request/message/event/template/rate/run references and version CAS protect replay; strict JSON contracts remain serialized SQLite text. Earlier applied migrations are unchanged. See COMMUNICATIONS_INTEGRATIONS.md.

## Phase 08 Migration

20261004140000_phase_08_sia extends SiaIdentity configuration/description and SiaContext memory governance while preserving all existing IDs. Legacy memory defaults LEGACY/DRAFT. New SiaRun/SiaAction use restrictive identity/user/person/organization/project/request/audit foreign keys, creator/identity/key uniqueness, action/request uniqueness and scoped indexes. Polymorphic memory source and action result references resolve through current domain services; JSON contracts remain serialized SQLite text. Prior applied migrations are unchanged. See SIA_VIRTUAL_CEO.md.

## Phase 07 Migration

20261004130000_phase_07_executive adds ExecutiveRecord and append-only ExecutiveHistory without altering existing business row identities. Restrictive organization/project/person/user foreign keys, unique source/reference identity, version CAS and scoped/history indexes protect records. Payloads use strict server contracts serialized as JSON text. KPIs hold only explicit human observations; no synthetic historical snapshots or seeded metrics exist. See EXECUTIVE_INTELLIGENCE.md.

## Phase 06 Migration

20261004120000_phase_06_company_os adds Program, Batch, Location and BatchParticipant with restrictive foreign keys, scoped indexes and unique company/program reference and batch/person identities. Existing Product, Project, Goal and Responsibility gain nullable relationships; old responsibility kinds default RESPONSIBLE. Prior migrations and row IDs are preserved. SQLite table redefinitions copy historical columns unchanged. Company/division/target/participant semantics are enforced by shared services. See AIRA_COMPANY_OS.md and PHASE_06_VALIDATION.md.

## Phase 05 Migration

20261002170000_phase_05_operations preserves all prior migrations and extends SiaApproval with nullable SIA identity, request/stage/assignee/capability/decision fields. New operational tables hold versioned workflow graphs/runs/history, controls/rules/checks, requests, events linked one-to-one to audit, notifications/preferences, reminders, recurrence/occurrences and escalations. Compound uniqueness enforces command/recipient/schedule identity. Relational foreign keys are restrictive; polymorphic resource/entity and operational project references are validated server-side. JSON metadata/payloads remain serialized text for SQLite compatibility. See OPERATIONS_MODEL.md and PHASE_05_VALIDATION.md.

## Phase 04 Migration

20261002160000_phase_04_execution extends Project, Goal, Task and Responsibility without changing existing IDs or earlier migration files. It adds Milestone, TaskDependency, ProgressUpdate and ExecutionBlocker with real foreign keys and lookup indexes. Milestone scope derives from Project. Project uses its own execution status enum. Historical Project INACTIVE/SUSPENDED becomes PAUSED, Task DONE/CANCELED becomes COMPLETED/CANCELLED (legacy completion timestamp uses updatedAt), and Goal/SiaGoal CANCELED becomes CANCELLED. Existing PAUSED goals and NORMAL priorities remain compatible. Manual progress history is append-only; old values retain their baseline without invented actors. Services enforce exactly-one blocker/responsibility targets, scope, cycles and transitions; SQLite foreign keys/unique edges preserve identity. See EXECUTION_MODEL.md and PHASE_04_VALIDATION.md.

## ORM

Prisma is the canonical schema source. The development datasource is SQLite for local Phase 01 validation. Production database selection can change later through controlled migration planning.

## Foundational Tables

The schema includes users, sessions, people, organizations, group profiles, company profiles, company relationships, ownership relationships, memberships, roles, permissions, brands, products, projects, goals, tasks, audit events, system configuration, and SIA foundation tables.

## Integrity

The schema uses primary keys, foreign keys, uniqueness constraints, timestamps, and indexes on common lookup paths such as organization, actor, and entity references.

No fabricated legal, ownership, or financial details are seeded.

## Phase 02 Migration

20261002130000_phase_02_business_graph is generated against the verified Phase 01 baseline and applied through Prisma migrate deploy. The Phase 01 migration file is preserved. It extends existing tables, changes User.personId from unique to many-to-one, permits nullable company group association, adds membership scope/dates and business lifecycle/assignment relationships, and normalizes ON UPDATE CASCADE foreign keys to Prisma defaults.

JSON metadata remains serialized text for existing SQLite compatibility. Unknown legal and ownership facts remain nullable. The follow-up Phase 02 migration 20261002140000_phase_02_unknown_legal_names makes CompanyProfile.legalName nullable without altering the already-applied migration. Domain services enforce owner exclusivity, percentage/date validation, same-organization business links and valid hierarchy; foreign keys and unique indexes enforce referential identity. All three SQL migrations are exercised by the integration test with integrity and foreign-key checks. See PHASE_02_VALIDATION.md for the verified baseline and tooling history.

## Phase 03 Migration

20261002150000_phase_03_people_access preserves earlier migrations and existing row IDs. It adds Person status/profile, Role status/category/canonical/principalType, Membership projectId/scopeKey, ReportingRelationship, Responsibility and SiaRoleAssignment. Membership's unique identity changes from personId/organizationId to personId/organizationId/scopeKey; existing rows default to scopeKey=organization. Code now uses personId_organizationId_scopeKey selectors. Project memberships derive their scope key server-side and remain anchored to the actual owning organization.

Human/agent compatibility, reporting cycles, typed responsibility targets and anti-escalation checks are domain invariants. Foreign keys, compound uniqueness and indexes preserve relational identity. The existing and fresh database both pass native Prisma migration validation; all four SQL migrations also run in isolated test databases. See PHASE_03_VALIDATION.md.
