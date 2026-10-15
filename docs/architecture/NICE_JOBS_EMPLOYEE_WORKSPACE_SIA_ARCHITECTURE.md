# Nice Jobs Employee Workspace & SIA Architecture

Phase 05 extends accepted Phases 01-04. Nice Jobs remains the existing AIRA Career Hub product within AIRA SKILL CITY PRIVATE LIMITED. Person, User, Membership, JobVersion, WorkerProfile, JobAssignment, Task, ExecutionBlocker, notifications, operational events/audit and SIA are reused. No company, authentication, task, workflow, approval, notification, storage or AI engine is duplicated.

## Authorized Activation

READY is Phase 04's activation-ready state, not active employment. ACTIVATE is an explicit confirmed independent human operation requiring nicejobs.worker.activate, worker.assign, person visibility and onboarding access in the actual business division. It validates accepted offer/acceptance audit, historically published pinned JobVersion, immutable training-plan fingerprint, current mandatory completion/assessment/duration checks, independent retained READY review and its successful canonical audit/event. The candidate needs active, date-valid membership covering the actual business division. The action neither creates membership nor grants permissions. Missing business membership is an explicit provisioning gate.

The existing WorkerProfile is upserted for company/Person; the existing Assignment is created ACTIVE/ACTIVE with the exact onboarding, readiness review, activation actor/time, explicit start date and optional existing Person manager. Unique onboarding/review bindings, the existing open-assignment conflict policy, fingerprinted actor-bound idempotency and one transaction protect duplicate activation. A different manager/start date cannot replay an activation. Conflicting legacy prepared/active assignments require deliberate reconciliation, not silent conversion.

Existing Phase 01 attestation and ACTIVE/SUSPENDED states remain unchanged. Legacy attestations without verified activation provenance do not unlock this new workspace. No disciplinary, termination, exit or automatic reactivation workflow is added. Actual inactive, future-start, ended, revoked or non-readiness-backed assignments cannot receive new workforce work or use the worker workspace.

## Worker And Management Interfaces

The branded Nice Jobs gateway opens My Day for an authorized active worker. My Day, My Work, Training, Resources, SIA and Profile are the six employee destinations. Training opens the accepted personal onboarding area. Resources exposes existing assigned task instructions only, not a sharing engine. Corporate routes reuse these components; portal/corporate session audiences and origin/rate controls remain separate. Portal operations revalidate current Career Hub gateway access as well as business-division worker authority.

My Day uses only the authenticated Person's unique active assignment. It shows actual pending work, exact authorized due-today/overdue/completed counts, a qualified priority within the current bounded work window, completed work, own blockers, report state and accountable manager. Empty, unavailable and unauthorized are distinct; missing deadlines/instructions/managers are not invented. My Work provides all/today/pending/completed/overdue, search and keyset paging. Task priority uses canonical LOW/NORMAL/HIGH/CRITICAL, never a conflicting URGENT enum.

Active Workforce has company/division/job/manager/status/attention/search filters, database paging and bulk permission-qualified in-progress/overdue/blocker summaries. Ready for Activation is a separate actual readiness source. Worker detail exposes independently authorized tasks, reports and blockers plus explicitly permitted assignment, manager and reminder actions. Manager pickers use existing active members, bounded searchable paging and fresh server membership validation. Relationship/title never grants management authority. Missing managers are explicit attention, not fabricated identities.

## Canonical Tasks, Evidence And Blockers

Management assignment calls the existing execution service in the transaction and binds its canonical Task to the active NiceJobsAssignment. Workers can only start/complete that assignment's own assigned tasks with nicejobs.work.read and nicejobs.work.perform. Self-work read is restricted to the exact active assignment and assignee, and does not grant generic task.read or division-wide execution-list access. Management retains independent workspace.read, person.read and source task permissions. A narrow internal resolver permits exactly that validated task state operation; it does not confer generic task.manage, reassignment, priority/deadline changes or task creation. Existing dependency, closed project/milestone/goal and open-blocker checks remain authoritative. Revision compare-and-swap plus shared task revision increments prevent stale concurrent updates.

TaskEvidence is a small append-only private evidence relation, not another task/content/storage engine. Typed bounded text/private-reference/existing-record evidence is server validated. Existing private storage fails closed when unconfigured; linked resources use canonical actual-scope access. The shared task-save path also requires current assigned-worker evidence for evidenceRequired tasks, preventing legacy management screens bypassing that gate. No large media bytes/public upload is added.

ExecutionBlocker is extended with optional workforce assignment, reporting account, reason and revision. OPEN/RESOLVED canonical states are retained. Workers may report own task or worker-level blockers; independent scoped managers resolve them explicitly with reason/audit. Reporting does not punish the worker or invent a performance score. Resolution does not silently restart/complete the task. No duplicate blocker engine or automatic escalation is introduced.

## Daily Reports And Time

NiceJobsDailyReport stores assignment, local report date, captured timezone, authenticated account/Person, actual server task/blocker snapshots, notes and submission time. The worker cannot supply completion arrays, ownership or scores. Only today's actual state is supported; backdated reconstruction is explicitly rejected. Submission requires source task/blocker reads. More than 100 tasks or 50 blockers fails rather than silently persisting a partial report.

Corrections append an immutable revision pointing to the latest report with a required correction reason. Unique assignment/date/revision and supersedes reference prevent duplicate/colliding corrections; no historical report is overwritten. Read DTOs exclude private historical task/blocker snapshots. Reports do not calculate performance, incentives, salary or compensation.

All stored timestamps are UTC instants. Calendar report dates and My Day use existing account timezone (UTC if absent), with Intl-based local-day boundaries including 23/25-hour DST days. Deadlines remain exact instants and retain the execution model's UTC date-only semantics. Submitted report timezone stays fixed.

## SIA Digital Manager Boundary

The shared registration lookup and configuration catalogue combine audience-specific executive and worker catalogues. The accepted executive tool catalogue does not enumerate assignment-specific worker tools. Both use the same immutable contracts, tool authority, conversation service and audit; a worker conversation still selects only get_worker_day. This preserves generic executive projections without weakening worker identity requirements.

The existing SIA service/provider/registry, SiaRun, usage provenance and audit are extended, not replaced. get_worker_day is a registered READ_ONLY WORKFORCE tool requiring nicejobs.workspace.self. WORKER conversation requests can only select that tool; they cannot select an executive/communication/write tool through natural language. Tool activation, current human AND AGENT scoped capability intersection, actual active worker identity and exact division are checked before sources. Current authority is rechecked after retrieval and on replay. No executive.read permission is required or implicitly granted to workers.

Bounded context contains own assignment/job/version/company/division, authorized tasks, due/overdue/completed work, own source-authorized blockers/reports, linked readable goals and recipient-private relevant notifications. It excludes recruitment/training decision notes, unrelated workers/companies, management records, financial records and unrestricted audit/memory. Business text is DATA. The existing deterministic provider supplies evidence-based briefing/task assistance and explicit report/blocker next steps; no external model or invented natural-language completion is enabled.

Task changes, reports, blocker creation/resolution and reminders occur only through confirmed authorized platform operations, never the read tool. Existing independent approval/confirmation controls for other SIA tools are untouched. Activation, employment status, discipline, termination and compensation are never autonomously executed. No new SIA write executor is added. Registered capabilities/tools confer no grants by themselves; real SIA availability depends on reviewed identity, enabled get_worker_day and explicit scoped human/agent grants. Disabled/unconfigured/unauthorized UI states are explicit.

## Notifications, Audit And Failures

Existing preference-aware in-app notifications cover actual activation, task assignment/state, reports, blockers, manager updates and explicit due/overdue/report/blocker/pending reminders. Recipients must be active currently authorized worker/manager accounts for the actual assignment. Assignment is a canonical resource adapter; revoked worker authority cannot read its notifications. Reminders validate real current conditions and emit one explicit notification, not an endless scheduler. No external provider is configured.

Activation, task state/evidence, report/correction, blocker/resolution, manager/reminder and SIA request/result audit are required transactional writes. Actor is session-derived; scope is resolved from real resources. UUID command references and fingerprint/person binding reject replay mismatch. Audit/notification failure rolls mutation outputs back. UI has confirmation, pending/duplicate disable, success and sanitized errors. Permission revocation is evaluated on each operation, including replay.

## Database And Scale

20261008120000_nicejobs_employee_workspace creates only DailyReport and TaskEvidence and ALTER-adds nullable/defaulted fields/FKs to canonical Assignment, Task and ExecutionBlocker without rebuilding prior tables. Existing rows remain legacy/unactivated. Indexes cover activation uniqueness, manager/status, assignment/assignee/status, report date/revision, evidence/task/actor and assignment/blocker status.

Scope/ownership predicates precede source pagination. Lists default25/max100; My Day task/completed/blocker windows cap25; reports/notifications10; linked goals25; manager pickers25 with search/cursor; workforce selector options100. Bulk attention queries only the current assignment page, never one query per worker. My Day counts are restricted to one actual assignment. SIA uses bounded source DTOs and the shared serialized-byte budget. 100,000-worker concurrency, production cost and SLO remain NOT VERIFIED, not inferred from an isolated 1,500-task fixture.

## Phase 06+ Boundary

No lead pool/routing/assignment/manual entry/customer follow-up, detailed SOP, resource-sharing engine, performance score/PIP, incentives, wallet, settlement, salary, payout, termination or autonomous employment actions are added. Real training content, private media storage, approved membership/capability adoption and SIA configuration remain explicit operator setup. No production deployment or live provider configuration is included.

See ../audit/NICE_JOBS_PHASE_05_VALIDATION.md for exact verification results and remaining limitations.

## Nice Jobs Phase 06

Daily lead work and follow-ups extend the canonical workforce, workflow, audit, notification and read-only SIA boundaries. See [Phase 06 architecture](NICE_JOBS_DAILY_WORK_LEADS_FOLLOWUPS_ARCHITECTURE.md) for scoped policies, ownership history, controlled transitions, reports, indexed queues and deferred provider execution. No Phase 07 or autonomous SIA authority is introduced.
