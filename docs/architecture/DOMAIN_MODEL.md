Phase 03 recruitment extension: [Nice Jobs interview, human approval and offer architecture](NICE_JOBS_INTERVIEW_APPROVAL_OFFER_ARCHITECTURE.md). Existing Phase01/02 identity, scope, audit and human authority boundaries remain in force. Offer acceptance does not activate workforce assignments.

# Domain Model

## AIRA Labs Business Operations

An unassigned public enquiry is a pending scoped operational receipt. Assigned prospects and quotations are distinct discriminated ExecutiveRecords; accepted work links to a canonical Project and Task records. Quote approval uses existing OperationalRequest, Approval and ControlPoint. See [AIRA Labs Business Operations](AIRA_LABS_BUSINESS_OPERATIONS.md).

## Nice Jobs Phase 10

Phase 10 adds immutable Nice Jobs automation versions and operational exceptions around existing rule, run, job, event and audit entities. See [Nice Jobs Automation and Command Architecture](NICE_JOBS_AUTOMATION_WORKFORCE_COMMAND_CENTER_ARCHITECTURE.md).

Nice Jobs applications are separate from workforce profiles/assignments. Each references the existing candidate Person/User, company and exact JobVersion/VersionArea, with controlled submission/review/shortlist/rejection/withdrawal states and private evaluation evidence. See [Phase 02](NICE_JOBS_APPLICATION_SCREENING_ARCHITECTURE.md); no employment activation is implied by an application.

## Nice Jobs Workforce Foundation

Existing Nice Jobs Product -> NiceJobsTemplate -> immutable published NiceJobsVersion -> existing division via NiceJobsVersionArea. Existing Person -> company-bounded NiceJobsWorkerProfile -> version-pinned NiceJobsAssignment. These are job/workforce records, not Users, Memberships, canonical Roles, employment dates or permission grants. See NICE_JOBS_WORKFORCE_ARCHITECTURE.md.

## Phase 09 Communication Models

Integration -> CommunicationThread -> one normalized CommunicationMessage; CommunicationPolicy references existing ControlPoint/OperationalRequest, CommunicationConsent references existing Person, and CommunicationTemplate holds immutable versions. IntegrationEvent normalizes verified receipt provenance, while AutomationRule/AutomationRun/ScheduledJob describe finite registered internal processing. CommunicationRateBucket enforces durable bounded budgets. These do not duplicate approvals, people, notifications or recurrence. See COMMUNICATIONS_INTEGRATIONS.md.

## Phase 08 SIA

SiaIdentity gains structured personality and versioned configuration. Existing SiaContext becomes governed reference memory (legacy rows remain unadopted). SiaRun records private creator-bound orchestration/usage, and SiaAction binds immutable proposed parameters to the existing OperationalRequest/SiaApproval policy and verified result. No duplicate human, project, task, decision or approval identity is introduced. See SIA_VIRTUAL_CEO.md.

## Phase 07 Executive Records

ExecutiveRecord discriminates KPI, DECISION, RISK, OPPORTUNITY and ATTENTION payload/lifecycle contracts; ExecutiveHistory preserves human decisions, handling and explicit sourced observations. Metrics, company/project health, changes and briefing are authorized read-time projections of existing facts. A strategic decision is not SiaApproval and cannot execute work; operational approvals remain the shared policy-controlled resource. See EXECUTIVE_INTELLIGENCE.md.

## Phase 06 Reusable Company Domains

Program (PROGRAM/SERVICE), Batch, Location and unique BatchParticipant extend the existing graph. Unknown prices, dates, capacity and address data are nullable. Ownership/academic/operational/trainer/mentor/team responsibility extends existing Responsibility; no role or assignment confers permission. Product.divisionId, Project.programId and Goal.programId preserve shared company/execution identity. See AIRA_COMPANY_OS.md for actual scope/lifecycle rules.

## Phase 05 Operations

WorkflowDefinition -> WorkflowState/WorkflowTransition -> WorkflowInstance -> WorkflowHistory. ControlPoint -> ApprovalRule -> OperationalRequest -> existing extended SiaApproval. ControlCheck represents non-approval verification at an instance version. OperationalEvent links canonical audit to a business event; activity is a safe audit projection. Notification/NotificationPreference, Reminder, RecurringWork/RecurringOccurrence and Escalation cover operational attention without replacing task assignment or responsibility. SIA_PROPOSAL is a request type, not execution authority. See OPERATIONS_MODEL.md.

## Phase 04 Execution

Project and Goal now have separate explicit execution lifecycles and accountable humans. Task is extended with assignment, ownership, creator, deadlines and checkpoint links. New relational Milestone, TaskDependency, ProgressUpdate and ExecutionBlocker records supply checkpoints, canonical dependency edges, manual estimate provenance and structured blockers. Responsibility and Membership are reused, not duplicated. EXECUTION_MODEL.md is authoritative for current progress, dates, transitions and execution relationship rules; it supersedes the earlier plain Goal.progress description.

## Core Concepts

- Group: parent business ecosystem.
- Company: legal or business entity under a group.
- Brand: market-facing identity.
- Product: product, service, or platform.
- Project: temporary or strategic initiative.
- User: authenticated account.
- Person: human identity/profile.
- Membership: a person's relationship with an organization.
- Role: designation or function.
- Permission: actual capability.

These concepts are intentionally separate.

## Phase 02 Business Structure

The canonical extensions and invariants are documented in [BUSINESS_GRAPH.md](BUSINESS_GRAPH.md). Companies add nullable legal name, short name, type, country, region and documented identifiers; group affiliation may be nullable for standalone companies. Ownership adds explicit type and notes. Brand website is nullable and validated as HTTP(S). Products add product/service/platform type and a recorded lifecycle. Projects add human owner, priority and dates, plus optional brand. Goals add human owner, description, priority, target date, product and explicit progress. Membership adds dates and explicit organization/descendant scope. Multiple authenticated User records may reference one Person without copying that person's identity.

Groups remain distinct from legal companies. Organizational profiles share identity through their Organization record. Division and business unit use the existing OrganizationType; no duplicate division tree is introduced.

## Organization Hierarchy

`Organization` supports flexible nesting with typed records for group, company, department, and team profiles. Not every company has to use every layer.

The supported conceptual hierarchy is:

MAXPASE GROUP -> COMPANY -> DIVISION/BUSINESS UNIT -> DEPARTMENT -> TEAM -> PEOPLE.

## Ownership

Ownership is explicit data through `OwnershipRelationship`. It can reference a person owner or an organization owner. Roles do not imply ownership.

## Phase 03 People and Access

Person adds lifecycle status and optional profile without collecting private HR data. User remains the authenticated account and can be suspended/deactivated/reactivated independently. Membership adds nullable projectId and server-derived scopeKey while retaining organization context. Role adds lifecycle, optional category, canonical designation protection and human/agent identity type. ReportingRelationship and Responsibility model separate, explicit human relationships. SiaRoleAssignment binds the existing non-human SiaIdentity to scoped agent roles.

See [PEOPLE_ACCESS.md](PEOPLE_ACCESS.md) for invariants, services and access boundaries, and [AIRA_CANONICAL_ROLES.md](AIRA_CANONICAL_ROLES.md) for all 60 locked designations.

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
