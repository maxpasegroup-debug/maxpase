Phase 03 recruitment extension: [Nice Jobs interview, human approval and offer architecture](NICE_JOBS_INTERVIEW_APPROVAL_OFFER_ARCHITECTURE.md). Existing Phase01/02 identity, scope, audit and human authority boundaries remain in force. Offer acceptance does not activate workforce assignments.

# Database Model

## AIRA Labs Business Operations

This slice adds no tables or migrations. It uses canonical ExecutiveRecord/History, OperationalEvent/AuditEvent, OperationalRequest/Approval, Reminder/Notification, Project/Task and existing SystemConfiguration. Scoped unique references and versioned mutations protect duplicates and replay. See [AIRA Labs Business Operations](AIRA_LABS_BUSINESS_OPERATIONS.md).

Nice Jobs email authentication adds nullable `User.emailVerifiedAt` and `EmailAuthChallenge` through the additive `20261010100000_nicejobs_email_otp` migration. Challenges store keyed code digests, user/email/credential/purpose binding, delivery state, attempt count, expiry and consumption evidence, never plaintext codes. Existing identities/roles and employment/financial models are unchanged. See [Email Authentication](NICE_JOBS_EMAIL_AUTHENTICATION.md); existing users are not backfilled as verified and deployment database migration remains a reviewed release action.

## Nice Jobs Phase 10

Phase 10 migration `20261009122905_nicejobs_automation_command` additively extends automation rule/run storage and adds version/exception tables, indexes and published-material triggers. See [Nice Jobs Automation and Command Architecture](NICE_JOBS_AUTOMATION_WORKFORCE_COMMAND_CENTER_ARCHITECTURE.md).

Nice Jobs Phase 02 adds `NiceJobsApplication`, `NiceJobsApplicationSequence` and `NiceJobsApplicationHistory` in additive migration `20261007120000_nicejobs_applications`. UUID references, unique submitted IDs/active keys, revisioned evidence and a restrictive version-area composite FK protect integrity. Candidate/division/status/version keyset indexes support bounded reads. See [Phase 02](NICE_JOBS_APPLICATION_SCREENING_ARCHITECTURE.md).

## Nice Jobs Phase 01

`20261007100000_nicejobs_workforce` adds five restrictive relational tables for template/version/area/profile/assignment and scoped paging indexes. Existing identities and prior migrations are preserved. Runtime readiness verifies its explicit checksum; migration never runs at startup. Published snapshots and assignments retain historical references; nullable dates/configuration remain unknown. See NICE_JOBS_WORKFORCE_ARCHITECTURE.md for the release/restore boundary.

## Account Timezone Preference

`20261006090000_account_timezone` adds nullable `User.timezone` using an additive SQLite ALTER TABLE. The value is a validated IANA timezone; null preserves existing accounts and resolves to IST for the Boss account or UTC otherwise. This is a display preference, not a replacement for recurrence timezone or UTC timestamps. Own-account preference saves and `account.timezone_updated` audit events share a transaction. Earlier migrations remain unchanged; readiness verifies the new checksum and column. Apply the migration to the persistent application SQLite database before serving the new client. No credential reseeding or database reset is required.

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

## Nice Jobs Phase 04

See [Nice Jobs Orientation & OJT Architecture](NICE_JOBS_ORIENTATION_OJT_ARCHITECTURE.md) for the accepted-offer gate, immutable shared JobVersion training plans, worker-specific progress, private evidence, assigned human reviews and readiness. READY is activation-ready only; this extension creates no active workforce assignment, production tasks, compensation or autonomous SIA execution. Existing Phase 01-03 boundaries remain in force.

## Nice Jobs Phase 05

See [Nice Jobs Employee Workspace & SIA Architecture](NICE_JOBS_EMPLOYEE_WORKSPACE_SIA_ARCHITECTURE.md) for explicit readiness-backed human activation on the existing Assignment, canonical task/evidence and blocker integration, immutable daily report corrections, bounded employee/management views and registered read-only worker SIA context. Existing identities, source authorization, human/agent intersection, transactional audit and notification controls are preserved. Legacy attestations do not unlock this workspace; no automatic grants, employment-status executor or Phase 06+ features are enabled.

## Nice Jobs Phase 06

Daily lead work and follow-ups extend the canonical workforce, workflow, audit, notification and read-only SIA boundaries. See [Phase 06 architecture](NICE_JOBS_DAILY_WORK_LEADS_FOLLOWUPS_ARCHITECTURE.md) for scoped policies, ownership history, controlled transitions, reports, indexed queues and deferred provider execution. No Phase 07 or autonomous SIA authority is introduced.

Nice Jobs Phase 07 extends the canonical model with scoped immutable SOP/resource versions and internal workforce publications backed by existing communication templates, notifications and audit. See [SOP, Resources And Internal Communication](NICE_JOBS_SOP_RESOURCES_COMMUNICATION_ARCHITECTURE.md) for audience, acknowledgement, storage and human/agent source boundaries. No provider or autonomous authority is added.

## Nice Jobs Phase 08

See [Performance, Reports And PIP](NICE_JOBS_PERFORMANCE_REPORTS_PIP_ARCHITECTURE.md) for version-bound configurable expectations, canonical source evidence, immutable snapshots/corrections, scoped reporting, private/released reviews and human-governed improvement plans. Existing identity, source authorization, transactional audit/notification and human/agent intersection remain authoritative. Seven additive models; no invented real targets, automatic discipline, compensation system or autonomous SIA PIP authority.

## Nice Jobs Phase 09 Financial Boundary

See [Nice Jobs Incentive, Wallet and Settlement Architecture](NICE_JOBS_INCENTIVE_WALLET_SETTLEMENT_ARCHITECTURE.md). Versioned explicit policies and evidence-backed calculations use canonical independent human approvals. Exact minor-unit, append-only wallets separate pending/available/review-reserved/payout-reserved funds from unconfirmed external payment. Immutable statements, approved compensating reversals, scoped reconciliation and audit-backed commands preserve company isolation. No real rates are seeded, no financial SIA write tool is registered, and no payout provider or Phase 10 automation is enabled.

## Training Control Ledger

CONTROL_PROPOSAL/CONTROL_DECISION reuse append-only NiceJobsTrainingReview requirements and mandatory event/audit linkage. Extensions change only canonical incomplete progress deadlines transactionally; accepted plan/offer records stay frozen. Participant reminder envelopes use existing Reminder records with a namespaced enrollment reference and processing guard. Phase 6 adds no schema migration. See [training management](NICE_JOBS_TRAINING_MANAGEMENT_PHASE_6.md).
