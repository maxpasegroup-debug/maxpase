# Operations Model

## Boss Dashboard Launch Validation

Dashboard-development Phase 5 uses populated, disposable fixtures for workflow acceptance, cross-company/realm/replay/audit regressions and read-cost checks. The existing request/approval/notification/reminder/escalation mutation boundaries remain unchanged. Read-only executive projections batch identical scope decisions only within a source list; no cross-request authorization cache or mutation shortcut exists. Work table scroll regions are explicitly named and keyboard-focusable. Launch evidence and unperformed physical-device, assistive-technology, manager, production concurrency, monitoring/backup and rollback gates are recorded in `docs/audit/BOSS_DASHBOARD_LAUNCH_VALIDATION.md`; no operational control is treated as approved merely because its UI or benchmark passes.

## Boss Dashboard Development Phase 4: Operational Workflows

This UI development phase consumes the existing operational model; it is not a new domain-build phase. Company-aware Boss shortcuts launch existing project, task, goal and request editors only when the current access context permits their capability. My assignments, reminders, escalations and activity retain their existing services. Task follow-up links preselect the actual resource for reminder/escalation creation. Assignment eligibility, recipient access, scope and meaningful state transitions remain server-validated.

The approval inbox projects authorized request descriptions, expiry, workflow version, scoped policy names and the same request's approval chain/comments/decision timestamps. History is expanded in one bounded batch for the already-authorized visible page, with a fresh resource gate; executive counters do not expand every request's chain. Existing communication previews require both communication.read and person.read. No arbitrary payload, credentials or audit metadata enter the inbox. Missing evidence is explicit; a supporting request is not a newly invented document or independently verified evidence. Chain readiness and current assigned-human authority gate the UI, and the existing transactional decide service rechecks authority at execution. Confirmation is required for both approval and rejection. A persistent workspace result remains visible when a completed row leaves the Pending filter.

Search and allowlisted sorting operate before pagination. Non-reference sorts use the existing bounded authorized result (5,000-record ceiling), deterministic reference tie-breaking and 50-row pages. An inaccessible/deleted cursor does not restart the list silently. This is not a search engine or a historical snapshot across concurrent edits. Search/filter disclosures keep mobile work surfaces compact.

Saved filters are explicit per-user/per-workspace/per-company browser preferences, limited to ten named presets. Only allowlisted bounded filter values are retained; no credentials, action payloads, actor authority, cursor or arbitrary return URL is saved. Loading a preset issues an ordinary server-authorized query. Browser persistence is not cross-device/account storage or a permission grant. Each user's company namespace is separate; clearing browser storage removes presets. Boss return company/view/filter parameters remain independent of workspace filters. Human-entered request descriptions and decision comments are displayed verbatim; enum formatting never changes evidence filenames or prose.

The header's unread indicator counts only unexpired notifications addressed to the authenticated user whose current scope and underlying resource are readable. The badge describes all accessible scopes; opening it retains the selected company filter. Missing authority/capacity is unavailable, not zero. Read/unread mutations remain recipient-controlled. Activity continues to project real scoped audit records rather than a duplicate history store.

Operational forms provide pending, confirmation, success, controlled failure and synchronous duplicate-click guards. Existing request/reminder/transition/reference idempotency and approval replay rejection remain authoritative. Execution editor click protection is not a new durable exactly-once guarantee for project/task creation after an unknown network outcome; users must refresh/check the existing record before retrying an uncertain save. No schema migration, new background worker, SIA execution capability or approval-policy bypass is introduced. The existing requester-confirmed SIA gateway and independent human approval boundary are unchanged.

Verification is recorded in MAXSPACE_GROUP_ARCHITECTURE.md. Representative mutations run only against a disposable local database; production smoke validation must not seed or decide demonstration work.

## Phase 09 Shared Operations Consumer

Communication messages reuse existing independent request/approval chains, with immutable rendered preview bindings and additional reviewer communication/person reads. Message-linked request content cannot be edited. requireApprovedRequest reuses current approvedAuthority; saveReminder accepts an internal transaction for registered automation outputs. Notifications and executive blocked-project attention remain existing mechanisms. The generic SIA executionEnabled boundary remains false. See COMMUNICATIONS_INTEGRATIONS.md.

## Phase 08 Controlled Task Gateway

Existing SIA_PROPOSAL requests additionally admit the fixed create_task contract. Request creation and siaBoundary accept an internal transaction so SiaAction proposal and authoritative request/audit can commit atomically. The generic boundary still reports executionEnabled=false. A separate requester-confirmed gateway rechecks current independent approval, exact immutable parameters and human/agent capabilities, and creates/verifies one ordinary task in a transaction. No workflow/approval policy is duplicated or automatically decided. See SIA_VIRTUAL_CEO.md.

## Phase 07 Executive Projection

The command center summarizes authorized existing requests, assigned SiaApproval decisions, private notifications, reminders, workflow failures, escalations and source-validated events. It does not clone workflow or approval policy. Attention handling and strategic decision lifecycles do not change underlying work or execute tools. Executive lifecycle namespaces are reserved against manual event forgery. See EXECUTIVE_INTELLIGENCE.md.

## Phase 06 Company Resources

PROGRAM, BATCH and LOCATION extend the existing resource resolver and shared operational target picker. Batch scope derives from its Program. AIRA workflow launch resolves the real company resource, then calls the same workflow/approval service; definitions and policies remain exact-scoped. Decisions do not activate offerings or execute actions. Program/batch/location/participant/company lifecycle event namespaces are reserved to service mutations. All Phase 05 SIA gates remain unchanged. See AIRA_COMPANY_OS.md.

Phase 05 adds controlled operational processes to the existing business, people, authorization and execution models. It does not replace tasks, goals, memberships, responsibilities, audit records or SIA identities. No business workflow, request, approval, notification or metric is seeded as fictional work.

## Events and Activity

OperationalEvent is a scoped, structured index of a meaningful business event: event type, trusted actor, organization, optional project, entity type/ID, creation timestamp, explicit processing result, metadata, unique reference and optional correlation ID. Its unique auditId connects to the canonical AuditEvent. Mutation, audit and operational event are persisted in the same transaction. Task/project/goal/milestone execution mutations and scoped workforce mutations emit events through their existing audit helpers. Other historic audit entries remain valid; Phase 05 does not backfill invented events.

Explicit event registration resolves the actual resource and requires event.manage. References are organization-namespaced, and a stored fingerprint rejects altered bodies or actor replays. Metadata is bounded to 16,000 serialized characters. The public event projection excludes metadata; activity is derived from actual audits with actor, time, action, resource and result, not copied into another activity table. Activity excludes IP addresses, internal metadata, credentials and payloads. event.read and activity.read are separate scoped log capabilities. Events are limited to the latest 200 results; activity inspects the latest 500 candidate audits. Overview failed-event counts use an uncapped scoped count.

Manual observations are marked USER_REPORTED; real mutation events project as DOMAIN_MUTATION. Lifecycle namespaces (task/project/workflow/approval and other implemented domains) are reserved to their service mutations. event.manage cannot fabricate task completion or approval decisions by registering a lifecycle event. Future provider ingestion must establish its own trusted origin; a human observation is not a verified external delivery.

## Workflow Definitions

WorkflowDefinition owns versioned states and transitions. Organization/project/key/version uniquely identify a definition. Definitions start DRAFT, publish ACTIVE, and can be ARCHIVED. Draft graphs may be edited through the service. Published definitions cannot be edited; changes require a new version. Each graph has exactly one initial state, at least one terminal state, unique keys, reachable states and no terminal-state outgoing transitions. Nonterminal states require an outgoing transition. Business state names are configurable, not a universal hard-coded approval sequence.

WorkflowTransition connects explicit from/to states and requires a registered capability. Optional reason and control-point requirements are declarative conditions. No script/expression evaluator or arbitrary action dispatcher is installed. Configuring a capability requires the author's current delegation authority for that capability in the exact scope.

## Workflow Instances and Transitions

WorkflowInstance represents one execution, bound to an immutable definition, actual resource, scope and trusted human creator. It stores its current state, version and processing status. Instances are PENDING while in nonterminal states and SUCCEEDED on terminal completion. WorkflowHistory records actor, from/to states, transition, reason, prior version, timestamp, fingerprint and idempotency key.

The transition service validates active identity, resource access, workflow.transition, the transition-specific capability, definition status, expected version, current/from state and required control. Compare-and-set and unique instance/version history prevent competing transitions. Identical authorized retries return the prior history; altered requests fail. Clients cannot directly set workflow state. Workflow transitions do not silently mutate the underlying task/project/goal status; those retain Phase 04 rules.

## Requests and Approvals

OperationalRequest is an extensible envelope with type, requester, title/description, resource, scope, immutable control policy, optional workflow/state-version binding, expiry, timestamps and creator-bound idempotency fingerprint. Lifecycle: DRAFT -> SUBMITTED -> APPROVED or REJECTED; cancellation and expiry are explicit alternatives. Only the requester may edit or submit a draft. Scoped request.manage may cancel an undecided request. Approval does not itself execute the requested business action.

The existing SiaApproval table is extended rather than duplicated. siaId becomes optional for generic approvals; new request, stage, assignee, capability, decision actor/comment/time fields describe generic human decisions. Older unbound SIA approval rows are preserved but cannot be decided or adopted by the new operational service. Operational approval statuses are PENDING, APPROVED, REJECTED, CANCELLED and EXPIRED.

ControlPoint approval rules configure ordered stages and explicit users/capabilities. Multiple reviewers in a stage are parallel and unanimous: all must approve before the next stage may act. Any rejection rejects the request and cancels remaining decisions. No role names imply authority and no manager chain is inferred. The same reviewer cannot occupy multiple stages. Policies are immutable; archive and create a replacement for changes. No automatic approval is supported.

Human independence uses canonical Person identity, not just User IDs: alternate logins for the same Person cannot approve their own request or occupy multiple chain positions. Requester identity is derived from the original trusted creation audit. Submitted approval metadata pins the assigned human; account-to-Person reassignment cannot transfer a pending approval. Approval consumption compares current human identity with the actual decision audit and current workflow version. Person names and account labels never establish independence.

Submission validates every approver's active user/person/membership, actual resource read, approval.read, approval.decide and assigned capability. Decisions revalidate those requirements, the control's capability, assigned identity, non-self policy, pending request, expiry, stage order and workflow version. Approval consumption revalidates current authority, including revoked membership/capability. Decisions are compare-and-set; replay never repeats a decision or its audit.

## Notifications and Preferences

Notification stores a recipient, actual resource/scope, type, title/message, priority, read timestamp, creation/expiry and recipient/reference uniqueness. Notifications are emitted only for real assignment, approval, reminder, escalation or explicit authorized notice events. Assignment notifications go to eligible active accounts for the assigned Person; a Person without a login is still assignable. Ineligible accounts are skipped, not provisioned or granted access. Explicit recipient requests reject invalid/unreadable recipients.

Only the recipient may list or change read state, and access to the underlying resource and notification.read are revalidated. Preferences are personal and separately stored by user/type/channel. Specific type overrides ALL. Opted-out IN_APP delivery is suppressed. EMAIL, WHATSAPP, SMS and PUSH preferences are stored only: there are no external providers or delivery promises. No external outbox consumer exists.

Approval decisions, rejection, cancellation and expiry retire obsolete approval-required alerts atomically with audited notification.expired events. Completed approval history remains in requests, decisions and activity instead of an obsolete urgent queue entry.

## Reminders and Recurrence

Reminder binds resource, recipient, instant, reason and organization/reference identity. Lifecycle: PENDING -> PROCESSING -> SUCCEEDED, with FAILED or CANCELLED alternatives. Due processing revalidates current access and recipient eligibility, generates one notification, and records completion atomically. Opt-out suppresses delivery while still completing the reminder. A failed reminder must be replaced explicitly; no silent retry loop exists.

RecurringWork is anchored to an organization/project and either a validated task template or published workflow definition. Frequencies: DAILY, WEEKLY, MONTHLY, with positive interval, finite maxOccurrences (1-1000) and optional end date. Owner identity and actual permissions are revalidated at generation; templates use the existing task service in the same transaction, including assignment and closed-project safeguards. Invalidated assignments fail explicitly at generation. Workflow generation uses the standard instance validator. RecurringOccurrence uniquely identifies schedule/time and generated result.

Dates are UTC instants. Date-only inputs mean UTC midnight; time-containing inputs require an explicit offset or Z. Date-only Through filters include the entire UTC day. Phase 05 recurrence uses timezone=UTC only. Monthly runs clamp the original anchor day to the target month's length without drifting the following month (January 31 -> February 28/29 -> March 31). DAILY/WEEKLY use UTC calendar arithmetic, not local daylight-saving time. UI timestamps are labeled UTC.

processDue is an explicit authorized batch (1-100 items, UI 25). It processes due reminders, recurring items and expiring requests only within operations.process scope. Each recurrence produces at most one occurrence per call; backlog is not expanded indefinitely. ACTIVE recurrence can pause, cancel, or finish; FAILED recurrence requires explicit authorized reactivation. No timer, daemon, startup worker or external scheduler is installed. A later scheduler must call this same bounded service with an authorized principal, never bypass it.

## Escalations and Control Points

Escalation records an explicit trigger, resource, level, responsible human, reason, timestamp, status and reference. Supported conditions are pending approval, overdue task, blocked project, at-risk goal or explicitly confirmed required action. Trigger truth is checked at creation; escalation.manage and the responsible recipient's resource/escalation.read access are required. Escalations remain OPEN until explicitly RESOLVED. Nothing automatically escalates all overdue work.

ControlPoint kinds: APPROVAL, VALIDATION, CONFIRMATION, VERIFICATION, HUMAN_DECISION. Controls share exact workflow/resource scope. Human kinds require a configured approval chain; the other kinds require an authorized ControlCheck at the current instance version. Failed checks may be explicitly re-evaluated with a reason, preserving prior attempts in audit/events. A passed check is immutable for that version. Verification cannot substitute for a human approval.

## SIA Human Boundary

SIA_PROPOSAL requests reference an existing active SiaIdentity and one registered foundational tool. Proposal preparation requires sia.propose, request.manage, resource access and the tool's capability. Payloads are bounded; a tool key is not executable code. SIA proposals always require independent human approvers with sia.approve_action; self-approval policies are rejected.

The inspection path is: proposed action -> human capability and policy -> current independent approvals -> agent capability/tool allowlist -> future controlled execution -> verification -> audit. siaBoundary exposes capability/tool status, current human approval validity and verificationStatus=NOT_RUN. executionEnabled remains false regardless of approved request or enabled tool. No execution adapter, autonomous principal, intelligence engine, external call or verified-action claim is installed. Future execution must independently revalidate every gate, bind approval to the exact action/version and preserve verification evidence; a stored approval is not unrestricted authority.

Every Phase 05 SIA proposal reports approvalRequired=true for its human policy, even if the tool contract itself is low risk and reports toolApprovalRequired=false. A tool-level flag cannot downgrade the proposal's mandatory human boundary.

## Integrity, Failure and Authorization

Canonical resource resolution rejects forged organization/project pairs and supports ORGANIZATION, PROJECT, TASK, GOAL, MILESTONE, REQUEST, INSTANCE and APPROVAL. Wrapped operational resources also require underlying resource reads; reference depth is bounded. Foreign keys cover organizations, users, definitions/states, policies/rules, approvals, checks, occurrences and audit linkage. Polymorphic entity/resource IDs and operational projectId fields are resolved/validated by the service; they are not general-purpose relational foreign keys.

All important mutations and their audits/events are atomic. The Phase 04 task service accepts an internal transaction for recurring generation instead of nesting a transaction. Idempotency is persisted for instance creation, transition history, requests, explicit events, notifications, reminders, escalations and occurrences. Configurations represent distinct intentional records, not replayable business commands. Server actions derive actors from the authenticated session and never trust supplied actor/user/scope fields.

Processing failures roll back the item's outputs, then record a bounded safe FAILED/PROCESSING_FAILED result in a separate audited transaction. If failure audit persistence is unavailable, processing raises explicitly rather than pretending success. User interfaces return controlled errors, never Prisma errors or stack traces. Concurrent mutation collisions reject or return a valid prior result; no duplicate output is allowed.

Failure-state writes also revalidate the processor's actual resource access. An unauthorized processor cannot turn a denied attempt into a FAILED reminder/recurrence mutation; the item stays unchanged and the operation raises a controlled denial.

In-app generation is transactional; OperationalEvent is not an external delivery queue. A future external channel/outbox must persist its delivery intent atomically, use per-delivery keys, and add explicit retry/verification state. No distributed infrastructure is introduced here.

## UI and Phase Boundary

/app/operations provides actual pending approvals, overdue accessible tasks, blocked projects, unresolved escalations, important unread notifications and failed-event counts. Queues include My Tasks, Approvals, Requests, Notifications, Activity, Workflows, Runs, Events, Reminders, Recurring Work, Escalations, Control Points, Preferences and SIA Proposals. Structured state/transition and stage editors avoid raw configuration JSON. Filters cover status, user responsibility, scope, type, priority, read state, entity and UTC date boundaries as relevant. My Tasks always uses the authenticated Person; the existing Tasks workspace retains general assignee filtering.

Phase 06 domain products, HR, payroll, finance, CRM, communications, full AIRA operations, advanced analytics and SIA intelligence/autonomous execution are out of scope. See PHASE_05_VALIDATION.md for measured verification and manual gaps.
