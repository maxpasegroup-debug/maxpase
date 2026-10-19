# Nice Jobs Phase 06: Daily Work, Leads and Follow-ups

## Scope and Sources of Truth

Phase 06 extends accepted Phases 01-05. Person, User, workforce profiles, immutable job versions, readiness, assignments, Tasks, daily reports, ExecutionBlocker, authorization, events, notifications and SIA remain canonical. No provider, compensation, scoring, employment-decision or Phase 07 subsystem is added.

Nice Jobs is the AIRA Career Hub product of the AIRA Skill City company. Lead work belongs to its actual business division, not automatically the Career Hub distribution division. An active account, active membership and capabilities remain mandatory. A job title or manager relationship is never authority.

The engine can serve published Academic Advisor and BDM versions in their configured business areas. Accepted catalogue coverage is not expanded silently. Unpublished versions, missing area eligibility or missing operational policies mean NOT CONFIGURED, not an enabled sales process. No real leads, workflows, grants, targets or commercial policies are seeded.

## Data Model

- NiceJobsLeadPolicy binds one immutable published WorkflowDefinition to one company/division, explicitly eligible published job versions, allowed source identifiers, follow-up-required states and opt-in claim/unassignment flags. Policy configuration is immutable; revisions require a new policy.
- NiceJobsLeadEligibility relates a policy to exact historical job versions. Workers are not silently upgraded to a newer version.
- NiceJobsLead stores scoped contact identity, normalized international phone, optional normalized email/location, source/reference, priority and revision. Current ownership is an indexed reference to the canonical workforce assignment. Lifecycle status comes exclusively from its WorkflowInstance/current state, not a second status column.
- NiceJobsLeadAssignment preserves assigned actor/time/reason and end time/status. Ownership changes close previous history instead of deleting it. The current-owner reference is a query projection maintained in the same transaction.
- NiceJobsLeadActivity is an append-oriented index into the real OperationalEvent/audit record, not a parallel audit ledger. Shared versus management-only visibility is enforced before pagination. A captured worker-assignment reference supports reports after reassignment.
- NiceJobsLeadFollowup binds the lead, historical ownership segment and actual workforce assignment. It stores UTC schedule, contact type/purpose, notes, revision, completion, outcome and next action.
- Daily reports gain a nullable immutable operationalSnapshot. ExecutionBlocker gains a nullable lead reference. Historical records retain their original columns and values.

Foreign keys restrict deletion. Scoped phone/email indexes support duplicate detection. External source references are unique within company/division/source, including when a user explicitly accepts a possible contact duplicate.

## Configured Lifecycle

The existing workflow engine owns definitions, publication, states, transitions, version checks, required capabilities, control checks and current human approvals. No universal sales pipeline is installed. Authorized configuration can define NEW/ASSIGNED/IN_PROGRESS/FOLLOW_UP/QUALIFIED/CONVERTED/NOT_INTERESTED/UNREACHABLE/CLOSED or other suitable keys.

Lead creation starts its workflow transactionally. Lead transitions pass through the lead boundary and then the canonical workflow engine in the same transaction. Generic workflow endpoints and recurring workflow starts reject lead resources; this prevents bypassing lead ownership/follow-up invariants. The trusted transaction bridge delegates only workflow.read/workflow.transition at the validated lead division. Transition-specific permissions and approval/control requirements remain untouched.

The configured transition permission is checked against the caller's actual authority before delegation. Independent verification proof is revalidated with the verifier's current real access context, not the worker's delegated context. Revoked verifier authority and missing independent human approval deny the transition.

Configured follow-up-required states must be noninitial and nonterminal. Entering one requires a scheduled follow-up for the current ownership segment. Completing/cancelling the last follow-up in that state requires another scheduled action. Reassignment in such a state requires the new owner's next follow-up atomically, or an explicit permitted transition first. Unassignment requires both explicit policy and an appropriate state.

Terminal transitions never create another follow-up. Existing scheduled follow-ups require explicit cancellation confirmation. Closed leads cannot receive normal operational writes.

## Identity and Duplicate Review

Manual creation requires management and pool-read capability in the actual policy division. Company, division, actor and ownership are resolved server-side; strict commands reject forged fields. Phones require an explicit international country code; no country is guessed. Source values are identifiers, not integrations.

Likely phone/email duplicates are queried only inside authorized company/division scope. No merge is performed. The first submission returns bounded authorized matches and a ten-minute HMAC review token using the existing runtime authentication secret. Separate-record creation requires that token plus an explicit reason. Input changes, contact-set/revision changes and token expiry invalidate the review. More than 25 matches requires reconciliation instead of a partial warning. External reference uniqueness cannot be bypassed.

There is no existing file-import framework. previewImport accepts at most 100 validated internal rows, performs a bounded bulk duplicate lookup and in-batch comparison, and returns zero writes. Future file loaders must use this preview and the same authorized, duplicate-protected creation handler; no CSV/Excel UI or provider ingest is claimed.

## Ownership

Assignment requires explicit lead-assignment, workforce-read and person-read access. The target must be ACTIVE with valid readiness-backed activation, date-valid business membership, correct company/product/division and an eligible pinned job version. A worker cannot use management assignment to assign to themselves.

Self-claim is disabled by default. It requires an explicitly claim-enabled policy, claim/read/perform permissions, a unique active eligible assignment and an unassigned lead at the expected revision. The claim queue exposes minimal contact summaries, not phone/email, before ownership is acquired.

Reassignment/unassignment cancels previous scheduled follow-ups with explicit audit evidence, preserves history and immediately revokes the old owner's access and replay authority. Notifications target the new currently authorized owner; old owners do not retain access to the transferred contact.

## Follow-up and Daily Work

SCHEDULED, COMPLETED and CANCELLED are persisted controlled states. DUE and MISSED are server-derived projections: a scheduled timestamp at/before now is due, and one before the user's current local day is missed. Overdue means scheduledAt < now. Due-today totals mean scheduled in the whole local calendar day, including later today. Categories can overlap; they are not additive totals.

Input times are explicitly UTC in the current forms and ISO instants in commands. Displays and day/report boundaries use the account IANA timezone, falling back to UTC. Existing timezone helpers handle DST rather than assuming 24-hour days. Scheduling requires a future time. Completion requires recorded outcome and next action. Contact records are human attestations, not proof that a provider sent or delivered a message.

My Day extends its canonical tasks, blockers, notifications and reports with qualified lead data, due/overdue follow-ups and actual activity. My Work links to My Tasks, My Leads, My Follow-ups, My Reports and My Blockers. Source permission absence is NOT AUTHORIZED; no eligible active policy is NOT CONFIGURED; authorized empty results are zero/empty.

Reports derive worked-lead distinct counts, contacts recorded, completed follow-ups and pending follow-ups from server records. Workers cannot supply those counts. Snapshot creation is transactional with the report/audit. It is bounded at 1,000 worked leads per day and fails explicitly rather than storing partial totals. No scoring or incentive calculation is performed.

Manager pool filters are server-side, scoped and cursor-paged. Workforce operational summaries use bulk grouped reads for page assignment IDs rather than querying each worker. Person details continue to require person-read access. Management notes are excluded from worker and SIA histories in the database query.

Navigation preserves company/division context but clears incompatible workforce and lead status filters when switching workspaces. Duplicate review retains entered contact fields and requires a separate explicit confirmation and reason; rejected submissions are not silently reset or merged.

## Authorization and Execution

New capabilities are registered, not granted automatically: nicejobs.lead.policy.manage, nicejobs.lead.pool.read, nicejobs.lead.manage, nicejobs.lead.assign, nicejobs.lead.claim, nicejobs.lead.self.read and nicejobs.lead.perform.

All writes require explicit platform confirmation and actor-bound UUID idempotency keys. Expected lead/follow-up revisions guard concurrent edits. Replay revalidates current actor, membership, policy, resource and mutation authority before returning stored evidence. Audit, workflow, ownership, follow-up and relevant notification writes share the transaction; persistence failure rolls back the business mutation. Recipient authority and notification preferences are reused from the canonical notification engine. Reminders are explicit due-condition-checked in-app operations; no development polling worker runs.

Manager assistance creates the canonical ExecutionBlocker linked to both lead and workforce assignment. Existing manager resolution remains canonical. No independent escalation or task engine is introduced.

## SIA and Communication Boundary

get_worker_day remains the single read-only worker-context tool. Lead/follow-up queries run only after the current human AND selected agent source-capability intersection. Context contains bounded own lead summaries, due/overdue/upcoming schedules and shared activity, without contact phone/email, private management notes or unrelated workers/divisions. Highest-priority unresolved lead is selected using explicit priority precedence rather than a misleading alphabetic order.

Deterministic assistance reports real counts and records. Assign/reassign, send/import, deadline, employment/compensation and privileged-execution intents are rejected by the worker assistant. SIA creates no lead, follow-up, communication or employment mutation. Actual operations require separately authorized human platform forms and configured workflow approval/control checks.

communicationIntent validates the current lead and action authority and explicitly reports NOT CONFIGURED/providerExecution=false. Future providers must reuse existing communication policy/consent/authorization, human confirmation/approval, provider adapters and delivery evidence. Contact logs are never reinterpreted as sent messages. No provider credentials or new communication engine are added.

## Bounded Reads and Validation

Lead and follow-up queues default to 25 records, maximum 100, with server filters and cursors. Activity, assignment history and lead follow-ups each have independent 25-record cursor pages. Worker context windows are capped at 25; notifications/reports retain existing caps. Manager summaries group over at most 100 current-page assignments. Queries use scoped identity, owner, schedule, source/time and activity indexes. No entire lead/worker/history collection is loaded.

Duplicate review is capped at 25 contacts, import preview at 100 rows/1,000 matches, terminal/reassignment cancellation at 100 schedules and report distinct work at 1,000 leads. Limits fail explicitly and require smaller operations/reconciliation.

Local deterministic scale fixtures test 2,001 leads, stable filtered pagination and query counts independent of page size. This is not evidence of 100,000-worker production capacity. Full result evidence, migrations, restoration and browser/device limitations are recorded in the Phase 06 validation report.

## Deferred

Phase 07+, SOP/resources/communication platforms, full imports, external providers, automation, scoring, compensation/incentives/wallet/payments, employment decisions, production capacity certification and production rollout remain deferred.
