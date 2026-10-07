# Nice Jobs Phase 03: Interview, Management Approval And Offers

## Ownership And Scope

Nice Jobs remains the existing product distributed through AIRA Career Hub under AIRA Skill City. Applications, interviews, evaluations and offers belong to the application's real business division. Candidate access remains identity-bound through Career Hub; operational management remains division-scoped. No new company, person, user, candidate, workflow engine, notification engine or document editor is introduced.

The immutable published Job Version is the configuration source for both accepted jobs (JOB-001 and JOB-002) and future jobs. Existing reference-only configuration stays readable; a reference alone cannot authorize execution. Interview questions, offer terms, compensation, incentives and approval identities are never seeded as real business data. Missing structured configuration is NOT CONFIGURED. Draft configuration uses the existing job-edit capability, optimistic revision and transactional audit; published versions cannot be edited.

## Lifecycle

SHORTLISTED -> INTERVIEW -> MANAGEMENT_REVIEW -> APPROVED / REJECTED -> OFFER -> OFFER_ACCEPTED / OFFER_DECLINED.

Only an explicit configured interview waiver permits SHORTLISTED -> MANAGEMENT_REVIEW without interview evidence. Cancellation or no-show returns to SHORTLISTED; historical rounds remain intact. Interview completion without required evaluations remains in INTERVIEW. Recommendations and numerical scores never authorize hiring. Further review cancels the previous request, preserves its evidence and permits a fresh round/request. Only the latest interview round is actionable.

## Interview And Scheduling

`NiceJobsInterview` references the existing application (therefore its pinned Job Version/company/division/candidate), creator and assigned users. Supported methods: ONLINE, OFFLINE, PHONE, VIDEO. Duration, minimum/maximum panel size and evaluation requirements come from the version; panel size is capped at ten. States are PENDING, SCHEDULED, RESCHEDULE_REQUESTED, COMPLETED, CANCELLED, NO_SHOW.

Management creation/scheduling requires current `nicejobs.application.read` and `nicejobs.interview.schedule` in the actual division. Panel members must be active users with active human identities and scoped application-read/interview-read/evaluate access. Candidate identity and duplicate human identities are rejected. Captured person IDs are rechecked on evaluation, preventing account reassignment from inheriting interview authority.

Interview schedules are explicit UTC instants. The UI labels scheduling and date-filter inputs UTC; display uses the user's stored timezone (IST fallback). Duration does not imply calendar availability. Candidates see only their own status, method, time, duration, location/reference and instructions. Rescheduling is a candidate reasoned request, not a client-selected new schedule. Only management can reschedule; attendance completion is an explicit action after the scheduled instant. Page reads cannot complete interviews.

The interviewer picker searches only active company/division membership candidates, with 25-row pages and an ID cursor. Selection is a discovery hint, not authority: server mutation checks every selected user's full current authorization, including expiry/scope and all necessary capabilities. The picker supports direct division membership and company descendant membership; broader inherited authority can be submitted through the same validated service boundary but is not automatically enumerated by this picker.

## Private Evaluation

`NiceJobsInterviewer` binds a current user and captured human identity to one interview. `NiceJobsInterviewEvaluation` has one immutable submission per assigned interviewer. Question types: TEXT, SINGLE_SELECT, MULTI_SELECT, RATING, YES_NO; configuration includes stable key, order, required, weight, active and options. Questions/selection options and keys must be distinct. Answers are bounded to 64 KB and validated against active configured questions; scores are 0-10. Weighted percentage is evidence, not approval.

Recommendations: RECOMMEND, DO_NOT_RECOMMEND, NEEDS_REVIEW. Private notes and answers remain in the evaluation, not candidate-facing events/notifications. Assigned interviewers see only their own evaluation; managers with management-review authority see the bounded panel evidence. Unassigned interviewers cannot enumerate unrelated interview records. Candidates receive none of the questions, answers, scores, private notes, recommendations, panel identities or internal approval records. Corrections require a future explicit revision mechanism; duplicate submission cannot overwrite evidence.

## Human Management Approval

Version configuration maps each applicable division to an existing active `ControlPoint`. The policy must be an independent APPROVAL/HUMAN_DECISION, in that exact division, with `allowSelfApproval=false`, no unrelated project binding, and `nicejobs.management.approve` as its required permission and each rule's capability. No hard-coded manager/director role names are used.

The engine creates an existing `OperationalRequest` with `NICE_JOBS_RECRUITMENT` resource binding, and submits the existing generic `SiaApproval` chain in the same transaction. This table name is historical; it does not grant SIA employment authority. Generic sequential/parallel chain behavior is retained. Required request/control permissions remain mandatory in addition to recruitment capabilities. All approvers remain current, active, assigned, independent humans with `approval.decide` and the decision-specific recruitment permission.

Application review status distinguishes NOT_CONFIGURED, NOT_REQUESTED, PENDING, NEEDS_REVIEW, APPROVED and REJECTED. Generic inbox decisions verify the same application's request binding, current management-review stage and published job/template. A generic decision does not silently change the candidate's released application stage: an authorized release reconciles the completed chain. Decisions performed through the recruitment workspace reconcile and release in the same transaction. Private comments stay separate from an explicitly supplied candidate message.

Approval validity is rechecked before preparing, reviewing, issuing and responding to an offer: active policy, correct application/division binding, no expiry, complete chain, audit evidence and current approver identities/capabilities. Revocation fails closed. Archived/paused templates cannot acquire new hiring approval/issuance/acceptance; scoped cancellation, offer withdrawal and expiry cleanup remain possible.

## Offers And Versioning

`NiceJobsOffer` references the application and creator. One active offer per application is enforced by a nullable unique key; `(applicationId, number)` identifies a distinguishable version. States: DRAFT, READY, ISSUED, VIEWED, ACCEPTED, DECLINED, EXPIRED, WITHDRAWN.

Offer templates use structured content on the existing Job Version, with an optional external template reference. Existing communication templates are messaging-specific and are not reused as legally significant employment content. There is no new document editor/storage service. Preparing stores an immutable JSON snapshot of company, division, job title/version, engagement and explicitly configured start date, compensation, incentives, expectations, terms and validity. Missing values remain null/NOT CONFIGURED. No compensation computation, incentive engine or terms are fabricated.

Preparation and review require `nicejobs.offer.read/prepare`; review requires actual nonempty terms. Issuance additionally requires `nicejobs.offer.issue`, a reviewed READY version and current independent approval. No automatic issuance. Changes withdraw the unaccepted active version under `nicejobs.offer.withdraw` and create a new distinguishable DRAFT with a new snapshot; the old snapshot is never overwritten. Accepted offers cannot be revised, withdrawn or expired. Draft/ready offers are invisible to candidates.

VIEWED means an explicit authenticated candidate acknowledgement of reviewing the specific version, not telemetry inferred from GET/navigation. Acceptance/decline verifies candidate ownership, identity, exact offer reference, active status/version, application stage, current approval authority and expiry. Response timestamps and exact snapshot survive retries. Identical accepted/declined responses return the recorded result without a second audit/notification; conflicting or stale commands fail. Decline reason is required only when configured. ACTIVE_PER_VERSION releases the duplicate application key after terminal decline/rejection; ONE_PER_VERSION retains it.

UTC expiry is `issuedAt + configured validityDays * 24 hours`, not a local calendar/DST engine. Null validity means no configured expiry, not an invented default. Reads expose expired validity without mutating evidence; acceptance fails immediately at or after the deadline. An authorized explicit expiry action records EXPIRED and its audit. No background scheduler/provider is added.

## Authorization, Transactions And Notifications

The ten additional capabilities distinguish interview viewing/scheduling/evaluation, management review/approval/rejection and offer viewing/preparation/issuance/withdrawal. Permissions are registered in the existing registry; migration does not grant them to roles, users or SIA. Existing installations need explicit reviewed permission registration/role adoption. The development seed/provisioning routines have existing grant behavior; they were not run to silently widen local authority.

Server actions resolve actor identity from the existing corporate or jobs-portal session, require the appropriate origin/realm and consume the existing authenticated rate budget. Client-supplied company, actor, candidate, status and unknown command fields are rejected. Bound resource adapters use the actual application's product/company/division, not client assertions. Candidate-management self-dealing is prohibited.

Application revision plus record revision/status compare-and-swap, unique evaluation/version/active-offer constraints and existing request idempotency protect against duplicate commands. All domain mutations, history, canonical OperationalEvent, AuditEvent, approval changes and applicable Notification writes share a Prisma transaction. Audit/notification failure rolls back the business mutation. Optional internal notification delivery honors recipient access and preferences; no alert substitutes for state. Candidate notices cover scheduling/rescheduling/cancellation/completion/decision/offer updates; assigned interviewers receive scheduling notices, and the scheduler receives a reschedule request. Existing approval alerts notify assigned humans. Offer creator notices cover readiness/acceptance/decline. No external email/WhatsApp/video/calendar provider is configured.

## Bounded Reads And Migration

Application pipeline supports company, division, pinned job version, status, candidate/application-ID search and inclusive UTC interview date range. Scope predicates precede database pagination. Application pages default 25, maximum 100; interview and offer history pages return 25 plus one sentinel. Interview panels are capped at ten and approval chains at 100. Related names/evidence use bounded joins, not one query per list row. Interview schedule, application/status, assignment and offer/version indexes support these boundaries. No 100,000-user production throughput claim is made from local fixtures.

Migration `20261007140000_nicejobs_recruitment` adds four tables and nullable review-request binding / default-false further-review flag to existing applications. SQLite performs a preserving table redefinition; all existing application columns, unique keys and indexes survive. FK restrictions retain historical evidence. Readiness manifest includes its SHA-256 and interview/offer/application schema probes. Fresh/repeated migration, populated pre-Phase03 upgrade, drift, integrity and backup restore/re-upgrade are validated independently.

## SIA And Phase Boundary

No recruitment execution tool is registered for SIA. SIA cannot autonomously approve/reject employment, change terms or issue offers. Future summaries/reminders must respect private evidence and the existing human approval/tool authorization boundary. Generic event registration cannot forge reserved `nicejobs.*` events.

Offer acceptance creates neither `NiceJobsWorkerProfile` nor `NiceJobsAssignment` and changes no user/person to an active worker. "Orientation" is only a future-stage next-step indicator. Orientation, training, OJT, activation, employee workspace, daily tasks, leads, follow-ups, SOP, resources, performance/PIP, incentive execution, wallet, settlement, salary, payout and termination remain deferred to Phase04+.
