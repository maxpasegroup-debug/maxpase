Phase 03 recruitment extension: [Nice Jobs interview, human approval and offer architecture](NICE_JOBS_INTERVIEW_APPROVAL_OFFER_ARCHITECTURE.md). Existing Phase01/02 identity, scope, audit and human authority boundaries remain in force. Offer acceptance does not activate workforce assignments.

# Authorization Model

## AIRA Labs Business Operations

Registered `labs.*` capabilities grant nobody access by themselves. Every command resolves active Labs membership, actual resource scope and current owner; issue/approve requires independent canonical review and current permission. A Labs PIN session cannot bypass project/task authorization or first-use rotation. See [AIRA Labs Business Operations](AIRA_LABS_BUSINESS_OPERATIONS.md).

Nice Jobs email OTP establishes authentication/email control only. Signup retains its existing restricted applicant role; login/reset do not expand membership, role, company/division scope, worker readiness or approval authority. Session issuance rechecks current portal access, and self-service reset is limited to Jobs-realm accounts. No Boss, real pilot participant or independent approver is provisioned by this authentication change. See [Email Authentication](NICE_JOBS_EMAIL_AUTHENTICATION.md).

## Nice Jobs Phase 10

Phase 10 registers explicit Nice Jobs command, automation and exception capabilities without auto-granting them. Publishing requires an independent active human reviewer; processing rechecks owner, processor, resource, action and recipient. See [Nice Jobs Automation and Command Architecture](NICE_JOBS_AUTOMATION_WORKFORCE_COMMAND_CENTER_ARCHITECTURE.md).

Nice Jobs Phase 02 registers explicit `nicejobs.application.self/read/evaluate/shortlist/reject/close` capabilities without automatic grants. Own access requires reviewed Career Hub access and Person ownership; management requires the appropriate capability at the application's actual division. Private application notifications resolve ownership and Career Hub distribution scope through the existing canonical resource adapter. See [Phase 02](NICE_JOBS_APPLICATION_SCREENING_ARCHITECTURE.md).

## Nice Jobs Phase 01

Explicit `nicejobs.job.read/create/edit/publish/pause/archive` and `nicejobs.worker.read/assign/transition` reuse current scoped membership/capability evaluation in an AIRA window. Company/job-area mutations, worker division/person reads and date-valid membership checks use actual records. No role/job title grants authority; registry additions grant no employee or agent access. Nice Jobs realm sessions cannot authenticate corporate actions. See NICE_JOBS_WORKFORCE_ARCHITECTURE.md.

## Phase 10 Review

Current identity, dated membership, compatible role, explicit capability, actual resource and dual-principal SIA boundaries remain unchanged. Runtime sessions confer identity only; grants are recomputed for each service operation so role/membership revocation applies while a cookie remains valid. In-context ancestry reuse and batched project discovery do not cache decisions across requests or remove source checks. Reviewed-memory query scope/expiry precedes paging and source authorization precedes result limits; inaccessible records cannot crowd out visible memories. Existing cross-company/project/executive/communications regressions and the added memory test validate these boundaries. No UI-only authorization or role-title bypass is added.

## Phase 09 Communication Access

integration.read/manage; communication.read/draft/send/process/policy.manage/consent.manage/template.manage; and automation.read/manage/process are explicit scoped capabilities in the existing registry. Services resolve actual resources, current Person/membership/contact, recipient and independent control scope. A processor never replaces the creator/agent's revoked authority. Reviewer communication/person reads and existing approval assignment/policy checks are revalidated at approval consumption. Canonical roles and SIA receive no automatic grants. See COMMUNICATIONS_INTEGRATIONS.md.

## Phase 08 Dual Principal Boundary

An internal AgentConstraint on createAccessContext uses the existing active ancestry/grant evaluator to materialize the human/agent/requested-scope intersection. Domain service factories accept this internal resolver before source queries and aggregates. SIA gets no GLOBAL capability or human impersonation. Current tool activation, actual resource scope and independent current approval are rechecked before the narrow create_task gateway. Shared identity configuration/tool activation requires management/delegation across its assigned scopes. Memory never confers authority. See SIA_VIRTUAL_CEO.md.

## Phase 07 Executive Access

executive.read intersects every existing source-domain read before summaries. decision/kpi/risk/opportunity read/manage, decision.decide and attention.manage are explicit scoped keys, not designation privileges. Decisions require the designated active Person and decision.decide; operational approvals retain Phase 05 assignment/policy checks. Historical attention revalidates its source. NO_DATA prevents inaccessible categories masquerading as available zeroes. Filters, selectors, company names, metrics and trends retain source checks. See EXECUTIVE_INTELLIGENCE.md.

## Phase 06 Company Boundary

program.read/manage, batch.read/manage and location.read/manage are generic explicitly scoped capabilities, not automatic canonical-role grants. AIRA context resolves its existing company/group server-side and requires company.read plus the actual operation scope. Active ancestry excludes sibling/nested companies. Shared project grants remain resource-bound. Program/batch/location references, responsibility teams and product division links are checked against actual records, not submitted tenant IDs. See AIRA_COMPANY_OS.md.

## Phase 05 Operational Access

Explicit workflow/request/approval/notification/reminder/recurrence/escalation/control/event/activity/operations.process and sia.propose capabilities use the existing active identity, dated membership, organization ancestry and project relationship engine. Configuration authors cannot delegate capabilities they do not hold. Approvers must be assigned active users with actual resource reads, scoped decision/policy capabilities and stage eligibility; role names never authorize. Notifications and preferences are recipient/owner private. Human approval consumption revalidates current authority. SIA proposals add independent human sia.approve_action decisions without granting agent tool execution. See OPERATIONS_MODEL.md.

## Phase 04 Execution Access

Execution uses the existing resource-bound access engine. task/milestone/dependency/blocker read/manage, goal.progress and project/task/milestone/goal reopen are explicit capabilities. Creation needs organizational authority; project-scoped grants can create authorized child work but not new projects or company-wide goals. Owners/assignees/members acquire no permissions automatically. Dependencies require authority over both endpoints; typed responsibility/blocker targets resolve their real project. Derived progress requires underlying read capabilities. Project lifecycle no longer revokes historical reads: planned/paused/blocked/closed projects retain dated explicit grants, while execution services enforce closed-state write restrictions and explicit reopening. User/Person/Organization lifecycle still fails closed. Legacy Project/Goal writes delegate to the execution service. See EXECUTION_MODEL.md.

## Rule

Role is not permission. Designation never implies unlimited authority.

The permission chain is:

User -> Person -> Membership -> Organization -> Role -> Permission -> Scope.

## Enforcement

Permission checks belong at the server/domain boundary. UI hiding may improve ergonomics but is not an authorization control.

## Phase 02 Enforcement

Business services evaluate explicit operation keys against target organization ancestry. Membership.scope=ORGANIZATION allows exact scope only; DESCENDANTS permits traversal within the same branch. GLOBAL grants require the named key. No role title, ownership or system.admin shortcut grants other permissions. Company A does not inherit Company B or group access.

Expired, future, suspended and ended memberships grant nothing. Inactive users and organization ancestors cannot authorize operations. Role organizations must match their memberships; incompatible roles are ignored. Existing pure hasPermission no longer authorizes scope-only requests without a resource context.

Business domains have individual read/manage keys for organization, company, membership, ownership, brand, product, project and goal. Membership scope changes additionally require membership.scope.manage; role changes require membership.assign_role with anti-escalation checks. PROJECT-scope grants are excluded from organization-wide business authorization until an explicit project assignment model exists. See BUSINESS_GRAPH.md.

## Scopes

Supported foundational scopes are global, group, company, division, department, team, and project.

High-impact actions, including future SIA actions, must require explicit authorization and approval where appropriate.

## Phase 03 Resource Decisions

The centralized createAccessContext engine resolves decisions through active human identity, dated membership, active organization ancestry and compatible active human roles. It records internal membership/role provenance. Organization scopes and explicit project scopes are distinct. Project membership grants cannot authorize company-wide actions, sibling projects or unrelated companies.

Delegation checks enforce named capabilities, matching GLOBAL authority and sufficient descendant coverage. Role assignment, capability assignment, role reactivation, membership reactivation and shared-account changes cannot create access broader than the actor can delegate. Group, company, department and project boundaries are rechecked at the domain operation.

The Phase 02 PROJECT deferral is superseded by the explicit Membership.projectId/scopeKey anchor. Existing singular-domain permission keys and role-assignment permission remain valid. New capabilities are registered globally and assigned explicitly. Organization switching is authorized per request; diagnostic explanations require access.explain and remove unreadable provenance. See PEOPLE_ACCESS.md.

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

## Training Intervention Authority

Training proposals require current scoped human onboarding management. Decisions require an independent user/person with both onboarding management and readiness review, with requester authority revalidated. Candidate reminders additionally require Career Hub scheduling permission and enrollment-source checks; reviewer reminders stay division-scoped. SIA summaries use the human/agent read intersection only. See [training policy](NICE_JOBS_TRAINING_MANAGEMENT_PHASE_6.md).
