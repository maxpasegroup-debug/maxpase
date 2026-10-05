# Execution Model

## Phase 07 Executive Projection

Project and goal intelligence reuse current authorized progress, actual goals/tasks/milestones, blockers and dependency relations. Dependency summaries additionally reauthorize both task sources. Overdue and approaching dates are deterministic UTC comparisons; goal trends use actual ProgressUpdate history and remain INSUFFICIENT_DATA without three observations. No synthetic work, inferred progress or duplicated status engine is introduced. See EXECUTIVE_INTELLIGENCE.md.

## Phase 06 Program Alignment

Optional Project.programId and Goal.programId reference an authorized open Program in the exact execution organization. Goal/project program references must agree when both are provided; project edits cannot invalidate linked goals. AIRA company screens delegate to these same execution services and retain unrelated execution relationships. No AIRA-specific task, milestone, dependency, blocker, progress or goal engine exists. See AIRA_COMPANY_OS.md.

Phase 04 extends Project, Goal, Task, Membership and Responsibility. Organization remains the scope anchor; company, department and team boundaries are not inferred from project names or people. Optional product/brand relationships retain their existing same-organization constraints. Layers may be skipped.

## Projects and Initiatives

Project is a bounded initiative with description, explicit status, priority, owner, accountable person, dates, manually declared health (UNKNOWN/ON_TRACK/AT_RISK/OFF_TRACK), metadata and timestamps. ProjectStatus is PLANNED, ACTIVE, PAUSED, BLOCKED, COMPLETED, CANCELLED, ARCHIVED. The existing ACTIVE database default is preserved for compatibility; the workspace offers PLANNED for new projects.

There is no separate Initiative table in Phase 04. A bounded initiative is already a Project; optional parent goals express strategic alignment without duplicating projects. Multi-project strategic portfolios can be introduced later when their own lifecycle is needed, not as a renamed project now.

Owner and accountable person are separate human relations. Assignees execute tasks. Responsibility records specific obligations. Membership records participation. Role capabilities authorize actions. Equity remains exclusively in OwnershipRelationship. None implies another.

Projects may be scoped to group/company or a typed descendant organization. Brand/product links must belong to that exact organization; descendant projects need not have either link. Organization/project transfers are deliberately rejected rather than moving children and access implicitly.

## Milestones and Tasks

Milestone is a checkpoint belonging to exactly one Project. It has ProjectStatus, owner, sequence, priority, description, target/completion dates and metadata. Tasks reference an optional milestone in their own project. Milestone organization is resolved from the project, not redundantly persisted.

Task extends the existing entity with description, priority, assignee, owner, immutable server-derived creator, optional project/milestone/goal, start/due/completion dates and optional estimatedHours. States are BACKLOG, TODO, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED. Standalone organization tasks are supported. A task's goal must share its exact organization/project anchor. Milestone/goal/project anchors are validated before linking. Changing a task's organization/project is not supported.

Assignment and ownership require an ACTIVE Person and ACTIVE date-valid Membership covering the exact organization, an explicit descendant ancestor, or the exact project. Arbitrary IDs, sibling memberships, suspended people and expired/future memberships are rejected. Assignee participation is not a permission grant; an account is not required to be a human assignee.

## Dependencies

TaskDependency stores one canonical directed edge: taskId depends on prerequisiteId. DEPENDS_ON and BLOCKED_BY accept that order. BLOCKS reverses the submitted order. Unique pairs prevent duplicates. Foreign keys use restricted deletion. Self edges, cycles and cross-organization/project edges are rejected transactionally. No graph database is introduced.

An incomplete prerequisite prevents a dependent task from becoming IN_PROGRESS or COMPLETED. CANCELLED prerequisites remain unresolved, rather than being counted as successful execution. Remove the edge explicitly if the prerequisite is no longer required. An unresolved edge cannot be added to started work. Completed prerequisites cannot be reopened while a dependent is started or completed. Dependency changes require authority over both actual endpoints.

## Goals and Hierarchy

Goal retains its organization and optional product/project anchors, and adds accountable person, start/completion dates, optional parentGoalId and progressMode. Status values are DRAFT, ACTIVE, PAUSED, AT_RISK, ACHIEVED, MISSED, CANCELLED, ARCHIVED. PAUSED is retained from earlier phases, not silently remapped to failure.

Parents may exist independently and are optional. A parent must be in the same organization or an ancestor in the child's branch, and must be independently read-authorized. Sibling companies cannot parent one another. Self/long cycles are rejected. Closed parent goals cannot accept child changes. This is strategic alignment, not automatic permissions or an inferred organizational hierarchy.

## Progress

MANUAL goal progress is explicitly a human estimate, not an objective KPI. Every submitted value (0..100) creates an append-only ProgressUpdate with actorPersonId, server UTC timestamp and optional reason, and updates the existing Goal.progress cache. History remains when progressMode changes. Goal creation with no submitted progress retains the old zero baseline; it does not fabricate a human update. Pre-Phase04 values retain their historical baseline without inventing provenance.

Derived values are computed at read time, never overwritten with manual estimates:

- Tasks: COMPLETED count / non-CANCELLED task count * 100. No relevant tasks means unknown (null), not fabricated 0% or 100%.
- Milestone: the task formula for tasks linked to that milestone; an explicitly COMPLETED checkpoint reads 100%. Empty non-completed checkpoints remain unknown.
- Project: equal-weight mean of non-CANCELLED milestone progress when milestones exist. A COMPLETED checkpoint contributes 100; an unknown checkpoint makes the aggregate unknown. Without milestones, use all project tasks. Tasks outside milestones remain visible work but are not double-counted in milestone-based progress.
- TASKS goal: the task formula for explicitly goal-linked tasks.
- MILESTONES goal: the project milestone formula; requires a project and does not fall back to unrelated tasks.

Derived achievement requires 100% measured progress. Progress consumers need the underlying task.read and, for milestone aggregation, milestone.read capabilities; otherwise the derived value is unknown. No revenue, outcome achievement, probability or organizational KPI is inferred from task completion.

NORMAL is the existing medium/default priority, consistently used across projects, milestones, tasks and goals. LOW means lower urgency; HIGH means elevated urgency; CRITICAL means immediate escalation. Priority is an explicit human assessment, not an authorization rule or automatic scheduling algorithm.

## Dates and State Transitions

Execution dates accept a valid YYYY-MM-DD calendar day (UTC midnight), a Date instant, or an ISO timestamp with Z/explicit offset. Timezone-less local timestamps are rejected. Storage and server timestamps are UTC; form day values and deadline labels say UTC. A date-only deadline means the start of that UTC day, not local end-of-day. Membership end dates remain exclusive (end > now).

Start must not follow target/due. Completion is server-recorded at the explicit COMPLETED/ACHIEVED transition and cannot precede a future start. Reopening clears completionDate and requires the domain's named .reopen capability, the ordinary .manage capability, and explicit reopen=true. COMPLETED, CANCELLED, ARCHIVED, ACHIEVED and MISSED are closed/read-only. A closed entity must transition to a nonterminal state before ordinary changes; closing-to-closing rewrites are refused. Archive/cancel preserves all foreign keys and history; hard deletion is not exposed.

Closed projects cannot accept child changes, active membership changes or active responsibilities. Membership revocation remains possible. A closed milestone/goal cannot accept changed tasks. Milestone completion requires all relevant tasks completed/cancelled; project completion requires all relevant tasks and checkpoints closed. Open blockers prevent project/task/goal/milestone completion. ARCHIVED preserves read access through explicit dated memberships; execution lifecycle no longer makes historical records unreadable. Organization/person/account lifecycle still revokes access.

## Blockers and Responsibility

ExecutionBlocker has exactly one project, task or goal target, description, optional human owner, optional dependencyTaskId, expectedResolution, OPEN/RESOLVED state, resolvedAt and timestamps. Scope is resolved from the target, including task/goal project anchors. Dependencies must share that scope and cannot reference the blocked task itself. Target relocation and rewriting resolved blockers are prohibited; recurring blockers create new records. Expected resolution is an estimate, not a promise. A resolved blocker does not silently change the target's status.

The Phase03 Responsibility table now permits one milestone or task target in addition to its existing organization/project/product/goal targets. Services resolve the target's actual project before permission and human membership checks. Project detail consumes this same model, never a duplicate execution responsibility table.

Membership.projectId/scopeKey remains the only project-member model. Start/end/status/title and separately assigned compatible HUMAN roles remain available. New members receive no automatic capabilities. Revocation and delegation reuse the Phase03 access services and audit.

## Attention and Overview

Attention is a read-time projection, not a persisted pretend intelligence feed. It derives overdue and approaching (next seven days) task/project/goal deadlines, explicit blocked/at-risk states, MISSED goals, OPEN blockers and prerequisites not yet completed. It does not fabricate approvals, recommendations, risk scores or prediction. terminal work is excluded from deadline attention. Overdue is date < asOf; approaching is asOf <= date <= asOf+7 days.

Overview counts accessible ACTIVE/BLOCKED projects, overdue nonterminal tasks, upcoming deadlines, ACTIVE/AT_RISK goals and completion timestamps in the previous seven days. Each resource category retains its own read capability. Counts describe accessible scope only, not a hidden group-wide total.

## Boundaries, Audit and UI

execution-input.ts validates untrusted input; execution-service.ts resolves actual resources and calls the existing centralized access engine. Legacy businessService project/goal writes delegate to executionService, so older actions cannot bypass transition or progress rules. Named task/milestone/dependency/blocker read/manage, project/task/milestone/goal reopen and goal.progress capabilities are explicitly registered; existing project/goal keys are preserved. The development administrator bootstrap receives these; canonical AIRA designations do not.

Creates, updates, status/reopen, owner/accountable changes, task assignments, dependencies, progress, blockers and reused memberships/responsibilities are audited in the mutation transaction. Actor/resource/organization/project and safe changes are recorded. Audit failure rolls everything back. Secrets and arbitrary submitted metadata/reasons are not copied to audit metadata.

Execution UI lives at /app/execution and /app/execution/[kind], with /app/execution/projects/[id] detail. It includes filters, editing, empty/pending/error states, manual progress history, actual deadlines/next actions and independently authorized related sections. Old business project/goal routes redirect here. Assignment capability administration remains at /app/workforce/access.

SIA may later consume this authorized execution context through approved tools. No tool execution, full intelligence, advanced analytics, HR, CRM, finance, admissions, communication or marketing system is added. No execution records are seeded. See PHASE_04_VALIDATION.md for actual verification and manual gaps.
