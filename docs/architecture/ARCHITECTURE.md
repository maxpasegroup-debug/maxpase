Phase 03 recruitment extension: [Nice Jobs interview, human approval and offer architecture](NICE_JOBS_INTERVIEW_APPROVAL_OFFER_ARCHITECTURE.md). Existing Phase01/02 identity, scope, audit and human authority boundaries remain in force. Offer acceptance does not activate workforce assignments.

# Architecture

Current Boss structure phase: [Boss Group Structure Phase 1](BOSS_GROUP_STRUCTURE_PHASE_1.md). The six-destination Boss view reuses the existing source-authorized services; staff-domain migration and NEXA execution remain gated.

## AIRA Labs Business Operations

The `airalabs.online` public site and six-section staff workspace provide a scoped first enquiry-to-delivery slice using canonical operations, approval, people, executive record, and project services. See [AIRA Labs Business Operations](AIRA_LABS_BUSINESS_OPERATIONS.md). Production activation is blocked by unverified accounts, independent approval, legal issuer, and commercial delivery configuration.

## Nice Jobs Phase 10

Phase 10 Nice Jobs automation and Workforce Command Center reuse canonical events, jobs, notifications, authorization and SIA. See [Nice Jobs Automation and Command Architecture](NICE_JOBS_AUTOMATION_WORKFORCE_COMMAND_CENTER_ARCHITECTURE.md). The scheduler/provider remains unconfigured.

Nice Jobs Phase 02 adds a version-bound candidate application/screening service and scoped gateway views, reusing identity, authorization, publication, events and notifications. See [Application And Screening](NICE_JOBS_APPLICATION_SCREENING_ARCHITECTURE.md). This boundary stops at shortlist and adds no SIA recruitment authority.

## Nice Jobs Workforce Phase 01

`src/server/nicejobs` provides the versioned template/profile/assignment foundation under the existing AIRA Career Hub Product boundary. The shared corporate `/app/nicejobs` and Nice Jobs gateway management views use existing identities, branded sessions, scoped authorization and transactional operational audit. No new recruitment, task, approval, SIA, finance or disciplinary engine is introduced. See NICE_JOBS_WORKFORCE_ARCHITECTURE.md for strict scope/version/pagination and deferred capabilities.

## Boss Navigation And Design Phase 2

The shared authenticated shell uses one navigation model (`src/lib/workspace-navigation.ts`) for six groups: Overview, Companies, Work, Decisions, People and System. Existing Boss views and domain workspaces remain intact beneath those groups. Company labels are projected only from currently authorized profiles; navigation visibility never grants authority. Allowlisted Boss filters and company context travel through group links and detailed-module return links. A native modal mobile drawer preserves keyboard focus and returns focus to its trigger. Shared application styles provide readable table scrolling, semantic text-plus-color statuses and visible focus. Physical-device and screen-reader acceptance remain manual, not full WCAG certification.

Detailed-module links namespace saved Boss filters as `bossStatus`, `bossFrom`, etc., plus `returnView` and `bossCompanyId`; they never submit a project status as a task/approval status. Module GET filter forms preserve this allowlisted return context. Back restores the original Boss company/view/filters even after a module applies its own filters. Workforce links use that module's existing `organization` filter contract; group-wide business registries do not claim to be filtered by a company parameter they cannot process.

Own-account timezone preferences are persisted on User and audited transactionally. Boss defaults to Asia/Kolkata (IST); other unset accounts default to UTC. A shared display context formats Boss, executive, operational and communication timestamps in that preference. UTC instants, recurrence schedules, date-only domain fields and explicitly labeled UTC date-filter boundaries are unchanged. No credentials, permission grants, SIA execution or business models are redesigned.

## MAXSPACE Group Finalization

The current group/product identity is MAXSPACE GROUP / MAXSPACE OS. The existing root ids, maxpase-group slug, auth/session contracts and migration history are retained. /app/boss reuses executive/domain/Business Graph services with current scoped authority, not another engine. See MAXSPACE_GROUP_ARCHITECTURE.md for confirmed companies/domains, explicit PIN provisioning and external/manual production prerequisites.

## F06 Surgical Remediation

Authorization loads selected identity fields and bounded principal membership/role/permission batches, then resolves grant anchors/ancestors and explicitly authorized descendants inside the requested SIA scope. Business Graph reuses that hierarchy rather than scanning every organization again. Paths and capability-ID projections are reused only within the current access context; grants are never cached across requests. Narrow get_tasks reads only source-authorized tasks, their independently readable endpoints and governed memory; other read tools retain scoped executive/graph projections. Nested role/member/approval/instance-transition reads use collection-wide child batches rather than per-parent include expansion. Existing transaction, independent human approval, confirmation and provider-disabled boundaries remain. See docs/audit/F06_SIA_CONTEXT_SCALABILITY_REMEDIATION.md for reproduced failure, local evidence and remaining production prerequisites.

## Remediation Wave 03

No architectural/domain/authorization redesign. Executive reuses shared people-only options and opt-in already-authorized task sources for SIA rather than duplicate collection reads. Decision memory projects50 recent entries with explicit truncation and request-local history reuse; scope/capabilities remain checked per reference. Memory/final response enforce a1MiB byte guard with explicit capacity failure. Health remains process-only; readiness verifies the complete release migration manifest plus required runtime columns, never migrates or depends on disabled providers. See `docs/audit/REMEDIATION_WAVE_03.md` for local evidence and unresolved production acceptance, not launch certification.

## Phase 10 Hardening

Existing hierarchy/domain boundaries are unchanged. auth/service.ts adds tested transactional session/audit lifecycle, strict runtime configuration, exact origin validation and durable security budgets. security diagnostics expose fixed codes/correlation IDs only. Health/readiness are explicit runtime checks, never migration triggers. Authorization reuses loaded ancestry and batches agent project lookup within the current context; no cross-request access cache is added. Reviewed memory is source-authorized before bounded retrieval. See PRODUCTION_DEPLOYMENT.md and PHASE_10_VALIDATION.md for runbooks, measured results and launch blockers. This is the final build phase; an independent full-system audit remains separate.

## Phase 09 Communication Boundary

src/server/communications owns strict input, credential/provider adapters, normalized message/event service and finite registered automation. Message intents reference existing operational requests/controls; notifications, reminders, authorization and audits are reused. /app/communications and a bounded verified webhook endpoint extend the existing shell. Only explicit human-confirmed processing can dispatch; no live provider or autonomous SIA executor is configured. See COMMUNICATIONS_INTEGRATIONS.md.

## Phase 08 SIA Orchestration

The existing src/server/sia boundary now owns registry/input/provider/context/service modules. An internal agent constraint in the centralized access engine intersects human and agent grants before existing domain queries/metrics. SiaIdentity/SiaContext are extended, SiaRun/SiaAction preserve controlled request/action provenance, and /app/sia adds the protected executive interface. Only independently approved and explicitly confirmed create_task has a narrow write executor; generic Phase 05 execution remains disabled. See SIA_VIRTUAL_CEO.md.

## Phase 07 Executive Layer

executive-input.ts and executive-service.ts add deterministic authorized projections over existing execution/operations sources. ExecutiveRecord/ExecutiveHistory store only human definitions, strategic decisions, risk/opportunity context and attention handling, not duplicate business status or metrics. The protected /app/executive command center is the default authenticated entry. No AI or SIA executor is introduced. See EXECUTIVE_INTELLIGENCE.md.

## Phase 06 Company Implementation

AIRA is a company facade over shared MAXPASE services, not a new system. company-input.ts defines reusable program/batch/location/participation contracts; aira-service.ts resolves the fixed authorized company context and delegates shared mutations. company-structure.ts validates division/company semantics. The shared responsibility, product, execution and operational resource models are extended in place. Company UI lives at /app/aira. See AIRA_COMPANY_OS.md.

## Phase 05 Operations

The operations service extends the existing execution/workforce audit helpers with transactionally linked operational events. Definitions, instances, controls, requests and human decisions are separate resources governed by the Phase 03 authorization engine. In-app notifications, finite UTC recurrence and explicit bounded processing remain in-process database operations. The protected operations UI uses server services/actions, never direct client database access. SIA proposals remain non-executable. See OPERATIONS_MODEL.md.

## Phase 04 Execution

execution-input.ts and execution-service.ts extend the existing domain module. Execution pages/actions consume authorized services; legacy business project/goal saves delegate to this boundary. Typed responsibility and project membership continue through workforce services. Execution overview/attention and progress are factual read-time projections. See EXECUTION_MODEL.md.

## Stack

- Framework: Next.js App Router
- Language: TypeScript
- ORM: Prisma
- Development database: SQLite via `DATABASE_URL=file:./dev.db`
- Authentication: email/password with bcrypt hashes and HTTP-only JWT session cookies
- Authorization: RBAC plus organization scope
- Tests: Vitest
- UI: native React/Next components with global CSS

## Module Shape

The codebase is organized by domain boundary:

- `src/server/auth`
- `src/server/authorization`
- `src/server/audit`
- `src/server/domain`
- `src/server/sia`
- `src/app`

Future modules should follow this pattern before creating generic shared folders.

## Deployment Rule

Database migrations are explicit. The app must not execute production migrations during startup.

## Phase 02 Services and UI

src/server/domain/business-input.ts contains domain-boundary Zod validation. business-service.ts implements authorized registries, context queries and transactional saves/audit. business-workspace.ts supplies authorized management availability. authorization/business-scope.ts resolves the existing organization ancestry and membership date conditions. The existing authorization grant loader supports transaction clients.

App Router management views live at /app/business/[kind] and call server actions. Pages consume domain services and never query Prisma directly. Authenticated sessions supply actor identity. Inputs are validated at the operation; client controls are only ergonomic. Scope transfers and hierarchy reparenting require a later controlled migration. Phase 01's overview remains at /app/foundation.

See BUSINESS_GRAPH.md for exact semantic and authorization rules and PHASE_02_VALIDATION.md for migration recovery evidence.

## Phase 03 Workforce and Access

workforce-input.ts and workforce-service.ts extend the existing domain boundary. authorization/engine.ts supplies explainable resource decisions and delegation; authorization/assignments.ts shares role checks with Phase 02. registry.ts defines the added capabilities. SIA's access.ts inspects scoped identity/tool eligibility without execution.

Workforce App Router views use server actions and domain DTOs. Search and active-organization filters are validated server-side. No UI component directly queries Prisma. See PEOPLE_ACCESS.md and PHASE_03_VALIDATION.md.

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

## Nice Jobs Training Management

The job/programme Phase 6 manager workspace reuses canonical enrollment/progress/review, reminder, notification, SIA and audit services. Accepted plans remain frozen; independently reviewed interventions never activate workers or approve money. See [Manager Control Phase 6](NICE_JOBS_TRAINING_MANAGEMENT_PHASE_6.md).
