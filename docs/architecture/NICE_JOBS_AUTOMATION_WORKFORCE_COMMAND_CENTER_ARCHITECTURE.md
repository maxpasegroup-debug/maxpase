# Nice Jobs Automation and Workforce Command Center Architecture

Career Hub experience Phase 5 composes the six-section management panel and audited read-only preparation described in [Hybrid Control Panel](NICE_JOBS_HYBRID_CONTROL_PHASE_5.md). Existing Phase 10 execution restrictions remain authoritative; real pilot/launch evidence is separate.

Phase 10 reuses the canonical `OperationalEvent`, `AutomationRule`, `AutomationRun`, `ScheduledJob`, `Notification`, `Reminder`, audit, authorization and SIA tool registry. It does not create a second event bus, scheduler, approval engine or notification delivery service. Phases 01-09 remain authoritative for workforce lifecycle and finance.

## Automation lifecycle

`AutomationRule` is the stable, division-scoped identity and owner. `NiceJobsAutomationVersion` holds a validated allowlisted definition and monotonically numbered versions. A human owner drafts and submits; a different active human person with `nicejobs.automation.review` and canonical automation authority publishes. Publication rechecks owner identity and recipient authorization. SQLite guards published definition material against update/delete. Later edits create a draft version; old published material remains historical. Pause/resume/archive and all other commands use server-side capability and revision checks with operational events and audit in the same transaction.

Only three pre-existing pairs are executable: overdue task to owner notification, pending approval to approver reminder, and blocked project to attention notification. The generic `Workflow`/`ControlPoint` system is not silently bypassed for high-impact actions: no such action is allowlisted. Independent publication review is a workflow-specific two-person gate, not a canonical multilevel `SiaApproval`; more complex automation approvals require an explicitly configured control point before expansion. Neither employment decisions, financial postings, settlements nor external messages are available as automation actions.

Event processing accepts only committed, successful canonical operational events with a resolved same-division resource and current owner, processor, action and recipient authority. The event reference is unique; the run and resulting notification/reminder/audit commit atomically. A replay returns the prior run only when the pinned published-version fingerprint matches. A new published version deliberately rejects replaying an old reference instead of applying a changed action to it. A failed transaction leaves no run or notification.

## Jobs, retries and exceptions

`ScheduledJob` is a persisted UTC schedule with interval, max runs, max attempts, cursor and bounded 25-resource pages. Explicit authorized `PROCESS_DUE` claims and scans due work. There is **no independent scheduler or queue provider configured**, so recording a job does not mean it will run automatically. Runtime deployment must add a durable invocation mechanism before relying on deadlines. No browser timer drives execution.

Each job transaction commits its runs, notifications, state and audit together. Unique references prevent repeated effects. Retry is limited to recognized SQLite/Prisma transient contention codes, with exponential one-to-three-attempt backoff. Permanent failures stop the job; a persisted `NiceJobsOperationalException` is keyed by the failed job and may be assigned, acknowledged, started, resolved or reopened with revision checks, human owner validation, audit and preference-aware notification. There is no automatic replay of a terminal failure. An operator must inspect and configure a new job. Run failure diagnostics expose codes, not stack traces.

## Command center and access

`createWorkforceCommandCenter` reads real assignment, onboarding, request, task, follow-up, blocker, performance, PIP, incentive, settlement, finance exception, automation and operational-exception sources. It counts within authorized direct Nice Jobs divisions; unavailable permissions are `NOT_AUTHORIZED`, unconfigured requirements/providers are `NOT_CONFIGURED`, and accessible zero is `0`. Bounded next-action items use source/product and destination-read checks. Counts are exact database counts at request time, not cached indicators. Source links retain the selected division. Lists use keyset pagination and bounded choice sets. The query plan remains a local SQLite plan; no 100,000-worker throughput claim is made.

Corporate and Jobs portal workspaces use their existing separate sessions, origin/rate checks and server-derived actor identity. Capabilities are registered but not auto-granted to real users. Future operators require explicit reviewed role assignments. The read-only `get_workforce_command` SIA tool is disabled until independently configured in the canonical registry; when enabled it requires human **and** agent scope and source permissions plus `executive.read`. It exposes bounded counts/signals, not raw private records or execution authority. Worker SIA remains limited to the worker's own data. SIA cannot publish, process, assign, pay or change employment state.

## Data and rollout

Migration `20261009122905_nicejobs_automation_command` adds rule/run columns and version/exception tables without rebuilding populated legacy automation tables. Unique version and exception keys, indexes and published-definition triggers are included. Applying locally is not a production migration or rollout. SQLite backup/restore, migration drift, workload performance, host scheduler, monitoring, browser/device accessibility, domain/TLS and production auth need independent operational verification. No business policy, production recipient, schedule, rate or financial value is seeded.
