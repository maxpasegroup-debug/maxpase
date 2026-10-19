# Nice Jobs Orientation & OJT Architecture

Phase 04 extends the accepted workforce, application and recruitment architecture. Nice Jobs remains a product of AIRA SKILL CITY PRIVATE LIMITED distributed through AIRA Career Hub; training belongs to the application's actual business division. No new company, person, account, workforce identity, task engine, assessment engine, notification engine or storage system is introduced.

## Lifecycle And Activation Boundary

An authenticated candidate with a valid, historically published Job Version, accepted active offer and canonical candidate acceptance audit may explicitly enroll. Merely opening a page never enrolls, acknowledges, grades, completes or reviews anything.

Controlled states: NOT_STARTED -> ORIENTATION -> OJT -> READINESS_REVIEW -> READY or NOT_READY. NEEDS_REVIEW retains READINESS_REVIEW. An authorized administrator may reopen NOT_READY/readiness follow-up to OJT or cancel unfinished onboarding. READY and CANCELLED are final. READY means ready for a later activation phase, not ACTIVE.

Phase 04 never calls workforce assignment/lifecycle mutation, creates WorkerProfile/JobAssignment/Task, routes leads, allocates daily work, calculates earnings or enables an employee workspace. Existing Phase 01 manually attested workforce lifecycle controls are unchanged and are not used by onboarding.

## Shared Configuration And Worker Progress

JobVersion configuration contains structured orientation, OJT and readiness sections. Legacy reference-only sections remain readable but are NOT CONFIGURED for executable training. Configuration editing requires job-edit authority plus orientation.manage or ojt.configure at the company and every old/new business area affected. Published versions are immutable; edit a new draft version.

NiceJobsTrainingPlan is an immutable, normalized JSON snapshot shared by all enrollments of one JobVersion, protected by unique versionId and SHA-256 fingerprint. NiceJobsOnboarding uniquely references the existing Application, accepted Offer and shared plan. Candidate, company, division and version are derived through canonical relations, not duplicated identities. NiceJobsTrainingProgress stores individual assignments, attempts and authoritative completion separately. No media bytes are stored.

Orientation supports up to 10 ordered modules with 12 lessons each. Required modules/lessons determine the denominator; optional content is never counted as a mandatory pass. At least one mandatory lesson is required. Supported types: TEXT, VIDEO, AUDIO, DOCUMENT, IMAGE, LINK, QUIZ and ACKNOWLEDGEMENT. Completion is explicit ACKNOWLEDGE, server-graded QUIZ or assigned MENTOR_REVIEW; module/lesson keys and ordering must be distinct. No real content is seeded.

OJT supports 10 ordered stages with 10 activities each: READ, WATCH, LISTEN, PRACTICE, SUBMIT, ROLEPLAY, OBSERVE, COMPLETE_FORM and QUIZ. Each defines instructions, expected outcome, requiredness, evidence/review policy, explicit attempt limit, optional elapsed-day deadline and content reference. These are training requirements, not production Tasks. OJT is created only after mandatory orientation completion is recorded.

## Assessment And Readiness

Training quizzes reuse Phase 02 typed form validation and weighted predicate evaluation. Pass marks and attempt limits are explicitly configured, with field/operator/type compatibility checked. The candidate DTO contains question fields, never expected values, predicates or pass marks. The client cannot submit a score or completion status. Failed attempts remain immutable and consume the configured limit.

Practical assessment requires configured human criteria, evidence and the assigned independent OJT reviewer. PASS, FAIL and NEEDS_REVIEW are retained as review outcomes. A missing required assessment blocks readiness; an explicit requireAssessment=false policy produces NOT_REQUIRED, never a fabricated pass.

Readiness verifies mandatory orientation, OJT, required assessments/reviews, configured duration, configured readiness criteria and an assigned currently authorized independent human reviewer. Requesting review is not a decision. READY can be issued only by the assigned human with readiness.review authority, never by the candidate, another manager merely by title, a GET request or SIA.

Each immutable readiness decision retains the exact JobVersion/Offer/plan fingerprint, criteria, requirement checks, individual completion states, last attempt/score/review references, reviewer identity, reason, released feedback, time and canonical event/audit link. NOT_READY and NEEDS_REVIEW preserve prior attempts and decisions.

## Evidence And Private Content

Evidence accepts bounded text, private document/image/video/form references or existing Project/Task/Goal/Program/Batch/Location/Milestone references. Existing resource authorization resolves actual scope; another division's record is rejected even if the candidate can read it. References are revalidated at human review.

The existing PrivateAttachmentResolver is reused and its default unavailable implementation fails closed. There is no unrestricted upload, public file serving or invented provider. Private content/evidence submissions fail explicitly when delivery/storage access is unconfigured. Approved LINK lessons require HTTPS; acknowledgement does not claim measured video/audio playback. Reviewer projections mask private storage handles and linked-record identifiers. Private notes are visible only to the currently assigned authorized OJT reviewer; candidates receive only explicitly released review feedback.

## Authorization And Transactions

Capabilities: nicejobs.onboarding.self/read/manage, nicejobs.orientation.manage, nicejobs.ojt.configure/assign/review and nicejobs.readiness.review. Candidate self access requires active user/person, Career Hub membership, organization.read and application.self. All management/review operations use the actual application division and active company/product relationship. A candidate cannot manage or review their own onboarding. Assigned reviewers are bound to both User and Person; identity remapping/revocation cannot inherit a stale assignment.

My Reviews is assigned-only. Reviewers do not need broad application/hiring-history access. Scoped picker eligibility uses active, effective human memberships and explicit capability joins, not role titles; selected reviewers are freshly checked server-side. Capabilities are registered but this phase does not grant them to existing users automatically or run the broad development seed. Deployment operators must adopt approved permission assignments through existing access administration/provisioning.

All mutations run in one database transaction with compare-and-swap enrollment/progress revisions. Canonical operational event and audit, attempt/review, and eligible in-app notification persist together. Failure rolls back the mutation. UUID idempotency keys are fingerprinted with authenticated actor/context and validated on replay; unique application/offer enrollment, progress key and attempt/review constraints provide additional duplicate protection. Enrollment is naturally idempotent for the same accepted application. No client-supplied actor/company/person is trusted. Internal errors are sanitized by existing authenticated, origin-validated and rate-limited actions.

Notifications reuse preference-aware in-app delivery and current recipient/resource authorization. Started/enrolled/completed training, evidence/review, readiness decisions and explicit administrative reminders are recorded. Overdue OJT reminder selection validates due time and incomplete state. No live provider or endlessly running scheduler is installed. SIA receives no onboarding execution tool or autonomous approval/activation authority.

## Time And Query Bounds

All persisted timestamps are UTC instants. dueDays and durationDays are exact elapsed 24-hour periods from the OJT start, not local calendar midnights; daylight-saving changes do not alter these durations. Initial UI deadline dates are explicitly labeled UTC. Existing account timezone preferences and other recruitment displays remain unchanged.

Management/candidate/review pages apply company/product/ownership/permission/assignment predicates before keyset pagination (default 25, maximum 100). Enrollment detail reads at most 222 progress rows; displayed requirements are capped at 25 plus one next required item, with at most 10 attempts each. Readiness history is capped at 25. Shared plans are joined, not fetched per worker; one loaded access context is reused for page decisions. Status, plan/status, readiness, reviewer identity/status and progress/attempt indexes support bounded reads. Filter choices are capped at 100 and reviewer assignment options at 25. Bulk rows are not loaded globally. Workforce scale of 100,000+ is an architectural target, NOT production-load verified.

## Interfaces And Validation

Corporate and Nice Jobs portal reuse one workspace implementation but retain their separate session audiences/origin controls. Views: My Onboarding, Onboarding and My Reviews. The accepted offer offers explicit enrollment. Candidate UI prioritizes one next required action, distinguishes missing configuration/reviewer assignment and uses authoritative required-item progress. Management has company/division/job-version/status/readiness/reviewer/search filters and bounded pagination. Draft training editors preserve unrelated Phase 01-03 configuration, use typed controls and require confirmation. Mutations have pending, success, failure and duplicate-submission controls.

Additive migration: 20261008100000_nicejobs_onboarding. It creates only the five training tables, foreign keys and indexes. See [Phase 04 validation](../audit/NICE_JOBS_PHASE_04_VALIDATION.md) for exact test, migration, browser and remaining validation evidence. No production deployment, physical-device, screen-reader or 100,000-worker capacity claim is made.
