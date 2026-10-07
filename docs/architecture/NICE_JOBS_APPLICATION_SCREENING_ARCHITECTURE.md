# Nice Jobs Application And Screening Architecture

Phase 02 extends the accepted workforce and job template foundation. It does not replace authentication, identity, business graph, publication, authorization, audit, workflows or notifications. Nice Jobs remains a product of AIRA Skill City Private Limited under Career Hub, not a separate company. This implementation stops at SHORTLISTED or a controlled terminal outcome.

## Application And Identity

`NiceJobsApplication` is separate from `NiceJobsWorkerProfile` and `NiceJobsAssignment`. Applying never creates a workforce profile, assignment, employment approval or activation. Candidate identity is the existing active Person linked to an active User. Reviewed Career Hub membership must explicitly grant `organization.read` and `nicejobs.application.self`. There is no anonymous submission, registration shortcut, second identity store or fabricated membership in the job's business division.

Each application stores candidate, original submitting User, company and exact version/business division. The composite foreign key to `NiceJobsVersionArea` prevents an application from naming an area absent from that version. The immutable version retains its template and configuration. Business relationships are checked against the canonical active company/product on every access, not accepted from client claims.

A random UUID reference is used in URLs and actions. The primary submitted candidate identifier is `NJ-<UTC year>-<six-or-more-digit sequence>`. `NiceJobsApplicationSequence` uses a database upsert/increment inside the submission transaction; `applicationId` is unique in the database. Revision compare-and-set and rollback protect numbering on stale, concurrent or failed requests. A draft has no submitted Application ID. Internal database IDs are not the candidate-facing label.

## Job Availability And Version Integrity

Only the current PUBLIC PUBLISHED template/version, with an active eligible business area, receives new drafts and submissions. DRAFT, REVIEW, INTERNAL, PAUSED, ARCHIVED and historical versions cannot receive new submissions. Paused or superseded drafts are retained but not editable/submittable; permitted withdrawal remains available.

The two accepted seeded jobs remain INTERNAL DRAFT with null configuration. An intentional audience mutation uses existing `nicejobs.job.publish` authority at company and every version area, a bounded reason, template revision and transactional audit. Audience changes are limited to never-published jobs. This lets JOB-001 and JOB-002 become PUBLIC before an explicit publication decision without automatically exposing the catalogue or inventing criteria.

Applications already submitted retain their original published version even after a newer version is published. Their review uses that original configuration, provided the template is still published and the version has published history. Newer rules never silently replace historical criteria. Published configuration cannot be edited; create a new draft version instead.

## Configuration And Form Validation

The existing schemaVersion 1 reference configuration is preserved. `application`, `eligibility` and `screening` also accept strict structured configurations; legacy references are not executable rules and evaluate as NOT_CONFIGURED.

Application forms contain at most 40 uniquely keyed fields. Supported types: TEXT, TEXTAREA, NUMBER, DATE, SELECT, MULTI_SELECT, BOOLEAN, PHONE, EMAIL, DOCUMENT_REFERENCE. Required and conditional requirements are evaluated server-side. Conditional predicates are bounded EQ/INCLUDES/GTE/LTE data, not expressions or code. Unknown fields, duplicate keys/options, cyclic dependencies, invalid types, impossible dates, inactive conditional answers and mismatched rule/field types are rejected. Payloads are bounded to 64KB, scalar text to 4,000 characters and choice sets to 40 items. Browser checks are supplementary.

DOCUMENT_REFERENCE is an opaque reference, not a file upload, URL fetch or verified document. Rules relying on it require recorded human review. This phase adds no document provider or automated document validation. Do not collect sensitive data simply for future use.

Authorized managers can configure fields, conditional requirements, eligibility predicates, weighted screening questions, pass mark, review flags, duplicate policy and rejection categories on unpublished drafts. No route is hard-coded to a job code or title. The UI preserves unrelated reference configuration sections.

## Lifecycle And Evaluation

States are DRAFT, SUBMITTED, ELIGIBILITY_REVIEW, SCREENING, SHORTLISTED, REJECTED, WITHDRAWN and CLOSED. Clients cannot set a status, evaluator, company, candidate or result directly.

- Candidate: create/save DRAFT; validated DRAFT to SUBMITTED; policy-permitted withdrawal.
- Human manager with evaluate permission: evaluate configured eligibility; ELIGIBLE enters SCREENING, otherwise ELIGIBILITY_REVIEW.
- Eligibility outcomes: ELIGIBLE, INELIGIBLE, NEEDS_REVIEW; missing criteria remain NOT_CONFIGURED. Configured unevaluated applications show PENDING.
- Screening outcomes: PENDING, PASSED, FAILED, NEEDS_REVIEW; missing criteria remain NOT_CONFIGURED. Scores are weighted percentages against an explicitly saved pass mark; required questions must also match.
- Missing/conditional answers and review flags produce NEEDS_REVIEW, never an invented pass. A human resolution is allowed only after a recorded NEEDS_REVIEW result, with evaluate authority, a reason and append-only evidence. NOT_CONFIGURED cannot be overridden as a pass.
- Shortlist: explicit shortlist capability, SCREENING state, ELIGIBLE and PASSED results, recorded screening evidence, published job history and matching revision. Never automatic.
- Reject: explicit reject capability, reviewable state, required management reason and a configured category when categories exist. Candidate-visible message is separate and optional.
- Close: explicit close capability, only REJECTED/WITHDRAWN records. SHORTLISTED is a stop boundary, not a later-stage transition.

Default withdrawal states are DRAFT/SUBMITTED/ELIGIBILITY_REVIEW/SCREENING and are configurable only within these pre-shortlist states. Shortlisted or terminal applications cannot be withdrawn; stale/repeated commands fail. ACTIVE_PER_VERSION uniqueness uses candidate Person plus version, across business divisions and linked accounts. Terminal rejection/withdrawal/closure releases the unique active key. ONE_PER_VERSION keeps it. Future versions have independent keys. No policy permits two simultaneous active applications to the same version.

## Authorization And Privacy

Own access requires current reviewed Career Hub capabilities and exact Person ownership in the database predicate. Management reads use `nicejobs.application.read` at the actual application division. Evaluate/shortlist/reject/close are separate permissions at that division, revalidated within each transaction. Role names, job codes, user-supplied actors and UI visibility never confer authority. Forged company/scope filters fail closed. The company authorization window reuses the existing bounded F06 resolver.

Candidate responses exclude internal reasons, audit IDs, evaluator identity, rule comparisons, score/weights/pass mark and management rejection categories. They show the job/company/division, existing candidate name, submitted Application ID/date, status, eligibility/screening status, visible message and next action. Draft answers/form fields belong to the candidate; no private application can be enumerated through a submitted number.

Corporate mutations use current corporate sessions and exact-origin checks. Nice Jobs mutations use its existing signed gateway forwarding envelope, exact host/origin, brand cookie/JWT audience and current portal membership. The server obtains actor identity from the session. Both action paths use the authenticated rate budget. Separate realms remain non-interchangeable.

## Audit, Evidence And Notifications

Every create, save, submit, evaluation, human review, shortlist, rejection, withdrawal and close records an existing canonical audit/operational event in the same database transaction. `NiceJobsApplicationHistory` stores versioned decision evidence and bounded private reason, linked by unique operational event ID. It is not another generic audit engine. Unique application/revision guarantees one history entry per mutation. Manager history resolves actor labels from real operational events using one bounded batch query; history pages cap at 25 plus a sentinel.

Generic event registration reserves `nicejobs.*` so reported events cannot impersonate recruitment decisions. Canonical event metadata excludes application answers, hidden scoring rules and internal notes; private evaluation evidence is exposed only through the scoped application service. Audit failure rolls back application changes, sequence allocation, evidence and generated notifications.

Existing in-app Notification and NotificationPreference services are reused. NICE_JOBS_APPLICATION is a canonical resource adapter: it resolves the real application, requires Person ownership and reviewed self access, and derives the Career Hub product distribution scope. Application business scope and its mutation audit remain the original business division; notification distribution scope is Career Hub. Recipient, source identity, resource ownership and scope are validated; no client can supply an arbitrary recipient. Mark-read reuses these controls. Messages contain only submitted ID/status, never scores or private reasons.

No new delivery table, external channel or live provider is introduced. Existing IN_APP opt-out is honored. Delivery is omitted if the original submitting account is inactive, no longer owns the candidate identity, or lacks current self/notification/organization access; the application transition remains audited. If an authorized, enabled delivery fails, the entire mutation rolls back. Notification references are unique per application reference/revision.

## Screens And Scale

Use `/app/nicejobs?view=applications` for management. The existing jobs gateway supports `view=opportunities`, `view=my-applications` and `view=applications`; local preview remains `/sites/jobs/gateway`. Job template and workforce screens stay intact. Candidate screens provide one job/apply form, draft review, submit, own history summary and permitted withdrawal. Management screens provide scoped company/division/job-version/status filters, candidate/Application ID search, decision controls and paged evidence. Permission-aware application navigation hides unavailable manager destinations. Existing return-context parameters are preserved.

Application and opportunity lists use database keyset pagination, default 25/max100, limit+1, explicit company/ownership/scope predicates and bounded relation includes. Application indexes match candidate/company, division/status, division/id and version/status queries. Division choices cap at12, job-version choices at50 with a separately authorized selected-version lookup. There is no global candidate/application materialization, per-row authorization loop or increased transaction timeout. Substring search can scan the selected authorized scope and is not a search-engine capacity claim.

The 5,000-record isolated fixture checks bounded disjoint pages/filtering. The concurrent submission test checks one accepted transition and number. Neither proves 100,000 concurrent workers, production throughput, SQLite contention, retention or production SLOs.

## Database, Rollout And Deferred Work

`20261007120000_nicejobs_applications` is additive: Application, ApplicationSequence and ApplicationHistory tables, restrictive identity/company/version-area FKs and uniqueness/pagination indexes. Existing table data is not rewritten. Readiness adds the intentional checksum and required application columns. Fresh/repeated migrations, drift/FK integrity, local populated upgrade and restoration are recorded in the validation report.

Live rollout requires a separate reviewed production backup/migration/deploy and explicit capability adoption by approved roles. No production migration, deployment, Boss provisioning, credential reset or provider setup is performed here. The known jobs require deliberate public publication and real saved criteria; old unconfigured applications cannot be silently migrated or awarded passes. Do not drop populated Phase 02 tables as an application rollback strategy.

SIA gains no Nice Jobs recruitment tool or autonomous decision authority. Future tools must obey existing human AND agent authorization, approval/confirmation, controlled execution and audit boundaries. SIA is not hiring, rejection or employment authority.

Interviews, schedules/scoring, management approval workflows, offers/letters, orientation, OJT, activation, daily work, leads/follow-ups, SOP/training content, performance/PIP, incentives, wallet/settlement/payout and termination automation remain deferred. Phase 03 is not started. See `../audit/NICE_JOBS_PHASE_02_VALIDATION.md` for exact validation evidence and limitations.
