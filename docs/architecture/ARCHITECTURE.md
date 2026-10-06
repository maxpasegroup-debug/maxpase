# Architecture

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
