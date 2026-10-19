# Nice Jobs: Manager Control and Safe Automation (Phase 6)

Updated: 2026-10-13. Job/programme setup sequence, not a replacement of the workforce architecture.

## Manager Entry

Boss panel: Workforce / Training management. The same authorized workspace is available through the Nice Jobs gateway and corporate shell. Existing company, division, version, reviewer, readiness, search and pagination context is retained.

Attention queues filter canonical records before pagination: overdue work, submitted evidence, missing reviewer ownership and readiness decisions. Evidence queue details show only submitted requirements, including requirements beyond the first ordinary history page. Counts cover the displayed enrollments, not invented global metrics. Pending milestones derive from configured milestones with submitted evidence. Overdue and pending review overlap.

Recorded trainer/readiness ownership, scoped reviewer selection, human feedback and milestone decisions reuse existing controls. Recent evidence decisions show recorded reviewer, participant-visible feedback and submission-to-decision time. Only the most recent 25 evidence decisions are displayed; no SLA or all-time average is claimed. Detailed evidence/private notes remain confined to their existing source permissions.

## Independent Intervention Policy

New reviewed programme versions may explicitly select HUMAN_REVIEW_FIXED_CALENDAR for pauses and HUMAN_REVIEW_EXTENSION for deadline extensions. Existing NOT_ALLOWED policies and accepted offers are unchanged. The accepted plan, calendar, legal employer, offer snapshot and evidence remain immutable.

Interventions reuse NiceJobsTrainingReview as CONTROL_PROPOSAL and CONTROL_DECISION, with immutable structured requirements and canonical operational events/audits. No additional enrollment, approval ledger, task system or migration is introduced. Every request and decision requires a private management reason and participant-visible guidance.

An active scoped human with nicejobs.onboarding.manage proposes; an independent human with both nicejobs.onboarding.manage and nicejobs.readiness.review decides. Independence compares user AND person identity. Approval requires the requester to retain the same active identity and scoped authority. An authorized independent human can reject a stale/revoked request without applying its effects. Candidates, readers, foreign scopes and SIA cannot decide. A pending proposal is not an applied action. Only one proposal may remain pending. Actor-bound idempotency and enrollment revisions prevent duplicate requests/decisions; audit/event and effects share one transaction. The proposal cap never prevents deciding an already pending request.

Control history is bounded to 100 records, with new proposals stopped conservatively before exceeding that limit. Current effects are derived from audited decisions; missing/foreign audit proof fails closed. Approval history is not a reusable permission token.

| Control | Effect | Boundary |
| --- | --- | --- |
| Pause / resume | Independently approved pause blocks training submissions, reports, evidence decisions and readiness progression; resume releases the pause | Fixed calendar continues; neither deadlines nor opening dates shift automatically |
| Deadline extension | Changes only the incomplete selected OJT requirement's deadline after independent approval | Explicit offset-bearing instant; future, later than current deadline; maximum cumulative 90 elapsed days from original deadline; no early lesson opening or evidence completion |
| Programme change | Audits a reviewed proposal referencing a different approved complete version of the same job/division and its fingerprint | NOT_APPLIED_REQUIRES_NEW_OFFER_AND_ENROLLMENT; accepted enrollment/offer/evidence never rewritten or transferred automatically |

Readiness duration uses the later of the original programme finish and any extended OJT deadline. Completion/evidence/assessment and human readiness remain mandatory. Pause/extension/change does not authorize employment, compensation, incentives or money movement.

A programme-change proposal approval is NOT an enrollment transfer. The separately reviewed offer, candidate consent/acceptance and explicit target enrollment remain prerequisites. Applying a transfer to an already unique accepted application is deliberately unsupported; this release does not invent a migration or overwrite an employment record.

## Reminders and Assistance

Managers may explicitly schedule bounded internal reminders for the actual participant account, assigned OJT reviewer or assigned readiness reviewer. The server derives IDs and canonical resource scope; client-supplied recipients are rejected. Existing reminder.manage, notification/source access and current recipient authority apply. Offset-bearing times normalize to UTC; schedules are limited to the next 90 elapsed days. Latest 20 accessible schedules show pending/processing/result states; pending is not delivered.

The canonical operational reminder processor remains separately authorized and explicitly invoked. No endless development worker or automatic external communication runs. Participant reminders use a Career Hub organizational envelope with a namespaced enrollment reference; a source guard checks the accepted enrollment, actual participant identity, current self permissions and the manager's source read/manage permissions at creation and processing. This does not widen the self-only application resource contract. Reviewer reminders remain bound to the enrollment's business division. Scheduling permission in one scope does not confer permission in the other. Closed/revoked sources fail explicitly at processing; no notification is sent. Cancellation retains independent scope checks. A succeeded internal processing record is not proof of external delivery; notification preferences remain authoritative.

SIA get_training_management is an audited READ_ONLY tool, disabled unless explicitly configured for a current identity and permitted by both human and agent scope. It uses canonical enrollment reads through that permission intersection, bounded to ten active enrollments, with live source revalidation on replay. Summaries omit private evidence, report narrative, offer terms and financial data. Draft guidance is labelled deterministic/rule-based, never sent or executed. The existing SIA run carries its authority and audit reference.

No employment, compensation, payment or worker-activation approval tool is introduced. External communication continues to require the existing provider readiness, recipient consent, approved policy, independent human approval and explicit dispatch controls. This view schedules internal reminders only.

## Readiness and Pilot

Human readiness review and worker activation remain separate. READY is labelled ready for activation, not employed/activated. The activation link leads to a separately authorized existing workflow and cannot bypass source evidence or employment approval.

The three real jobs remain unpublished. Managers, participants, legal-entity verification, engagement/compensation terms and approved content still require the recorded pilot decisions. No real offers, assignments, financial policies or payments are created. See [pilot approval register](../audit/NICE_JOBS_PILOT_APPROVAL_REGISTER.md) and [Phase 6 validation](../audit/NICE_JOBS_TRAINING_MANAGEMENT_PHASE_6_VALIDATION.md).
