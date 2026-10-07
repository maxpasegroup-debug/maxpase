# Nice Jobs Workforce Architecture

## Purpose And Product Boundary

Nice Jobs is a workforce operating product, not a conventional public job board. The existing `maxpase-group` root (current group-facing name MAXSPACE GROUP) -> AIRA SKILL CITY PRIVATE LIMITED -> AIRA Career Hub -> Nice Jobs Product/Brand remains authoritative. No new company, division, login database, role engine, workflow engine or SIA is introduced.

Long-term lifecycle: apply, screen, interview, approve, offer, orientation, OJT, activate, work, report, performance, incentive, wallet and settlement. Phase 01 implements only versioned job definitions, minimal workforce identity/assignment records and explicit human lifecycle attestations. It does not implement those downstream engines.

## Current Catalogue

| Code | Job | Business areas | Engagement | Initial state |
| --- | --- | --- | --- | --- |
| JOB-001 | Academic Advisor - Junior (display uses the supplied em dash) | AIRA Startup School; AIRA Skill Studio | Part-time / incentive-based | DRAFT, INTERNAL, v1 |
| JOB-002 | Business Development Manager | AIRA Labs | Part-time / incentive-based | DRAFT, INTERNAL, v1 |

The idempotent, transactional `seedKnown` operation requires explicit create authority in the company and every referenced area. It verifies existing catalogue identity and refuses conflicts rather than overwriting. Development seeding calls it after reviewed development-administrator provisioning. Management offers the same explicitly authorized catalogue action. No live seeding, vacancies, compensation, targets, applications, workers, performance, leads or earnings are invented. Future availability says **More jobs coming soon**. New job definitions can be created through the UI without code changes; they still create no vacancy.

## Entities And Historical Integrity

- `NiceJobsTemplate`: company Organization, existing Nice Jobs Product, unique company/code, template lifecycle, visibility, optimistic revision and current published version pointer.
- `NiceJobsVersion`: immutable-after-publication title, description, engagement, optional department/context, version number, optional configuration, publication timestamp and optimistic revision. `NiceJobsVersionArea` references the existing business divisions. This handles a job covering multiple business areas without duplicating the job.
- `NiceJobsWorkerProfile`: only Person and company references plus timestamps. It creates no User, Membership, permissions, payroll identity, contact information or speculative personal attributes.
- `NiceJobsAssignment`: workforce profile, exact Job Version, actual division, optional existing Person manager, PREPARED/ACTIVE/SUSPENDED/ENDED status, worker lifecycle, revision and nullable dates. Company, job template and engagement are authoritative relational projections of the profile/version, not independently editable copies.

Assignments pin the exact historical version and business area. Publishing v2 updates the template pointer but never edits v1 or migrates its assignments. Only the current published version of a PUBLISHED template accepts new assignments. Draft/review, paused, archived and superseded versions do not. Published Jobs filters use the current-pointer relation **before database pagination**; historical versions are labeled explicitly in the all-versions view. No hard deletion, assignment retargeting or published-version editing is exposed.

The initial conservative policy allows one open assignment per company/person. The transaction checks this before insertion, and the relational unique key also protects identical duplicates. SQLite write conflicts fail explicitly; retry after refresh, never report an unconfirmed success. Multi-job policy, job moves, ending assignments and date editing are deferred, not assumed. No employment dates are inferred from publication, assignment or activation.

## Configuration Boundary

Optional strict versioned JSON (`schemaVersion: 1`) has bounded requirement descriptions in Education, Experience, Skills, Languages, Availability, Location, Documents and Assessment categories. Optional eligibility, application, screening, interview, orientation, OJT, SOP, daily-work, KPI, reporting, incentive, PIP and exit/disciplinary sections hold bounded reference/notes only. No executable expression, script, target, compensation calculation or arbitrary unknown property is accepted. These are dormant configuration references, not an interpreter or evidence of an enabled engine. Null is **Not configured yet**. Ordinary draft edits preserve existing configuration.

Detailed SOP, daily work, targets, training, OJT content, incentive rules and PIP rules are intentionally deferred. No Academic Advisor eligibility or business targets are seeded.

## Lifecycle And Control

Unpublished versions move DRAFT -> REVIEW -> PUBLISHED (authorized direct DRAFT -> PUBLISHED is also supported); REVIEW -> DRAFT is available through the controlled service. Published templates may PAUSE/resume, or ARCHIVE permanently. Every change resolves the real resource and validates the expected revision, permission and area relationship. A new draft alongside a live version does not pause or rewrite the published version.

Worker states are APPLICANT, APPROVED, OFFERED, OFFER_ACCEPTED, ORIENTATION, OJT, ACTIVE, SUSPENDED and reserved EXITED. Explicit humans may record sequential attestations through these states with required reason/context and confirmation in the UI; ACTIVE/SUSPENDED have explicit human transitions. This is **not evidence that an offer, screening, training or OJT engine ran**. The human must have completed the real-world step outside Phase 01. Server timestamps/audit record the attestation, not invented business completion dates. EXITED/termination and assignment end are deliberately refused. There is no automated activation, suspension, disciplinary process, scheduler or agent action.

Assignment preparation validates active/date-valid non-project membership covering its actual division for the worker and any manager, `person.read` for the operator, current job publication and division eligibility. Self-supervision and cross-company humans are refused. Transition recording rechecks current worker membership and person visibility. Assignment ownership grants no login access or capability.

## Authorization And Audit

Reuse `createAccessContext` with an AIRA company window. New explicit GROUP-scope capabilities: `nicejobs.job.read/create/edit/publish/pause/archive` and `nicejobs.worker.read/assign/transition`. Registering capabilities does not grant them to existing employees, canonical designations or SIA. Existing explicit Boss provisioning/development bootstrap can adopt them through its existing reviewed role workflow; this phase does not run Boss provisioning against production or rotate credentials.

Job definition changes require company authority plus every old/new business area. Multi-area job reads require visibility of every area; template-wide pause/archive also checks the actual current published version. Worker queries intersect worker-read and person-read scopes at the database boundary. Forged company/division filters are denied, not silently emptied. Actual Person identity and organization relationships are resolved server-side. Corporate actions use the existing corporate session plus required same-origin mutation check. Nice Jobs gateway actions use its exact host/origin, existing brand session audience and current portal membership. No submitted actor ID is accepted. Corporate and sibling portal cookies remain non-interchangeable.

All creates, edits, version creation, publication/review/pause/archive, assignments and lifecycle/status changes use existing `operationalEvent` plus canonical audit in the same transaction. Required audit failure rolls back mutations including profile insertion. Actor, scope, resource, from/to or version/revision, and bounded human reason are preserved. Work history is derived from these records; there is no duplicate history engine. Existing activity readers still require their independent activity/audit permission.

## Management UI

Corporate workspace: `/app/nicejobs`, under People navigation. Branded workspace: existing `nicejobs.online/gateway?view=templates|published|drafts|workforce`, and non-production `/sites/jobs/gateway` preview. The gateway retains its separate authentication and no corporate routes are exposed on branded hosts.

Job lists include title/code, company, business areas, engagement, version, status and timestamps. Detail views include configuration availability, controlled draft editing, publication, new version, pause and archive when allowed. Workforce lists include person, pinned job/version/company/division, assignment/lifecycle, nullable start date and manager. GET filters support company/division/job/status/lifecycle/search and keyset paging. Worker and manager selectors query at most 25 authorized existing people, with search and next-page support. Pending, success, sanitized failure, confirmation and stale/duplicate submission refusal are present. Tables scroll in focusable named regions; no physical-device or screen-reader acceptance is inferred.

## Scalability And SIA

All Nice Jobs list sources use database keyset `id > cursor`, ordered IDs, limit+1 (default 25, max100) and selected scalar relationships; no workforce-wide in-memory filtering/count or hierarchy materialization. Area collections cap at12; people selectors cap25. Indexes cover company/code and lifecycle, template/version, profile/person and assignment division/id, division/status/id, division/lifecycle/id, profile/status/id and version/id. Principal authorization uses the existing bounded F06 scope window, not worker enumeration. Substring search may still scan the selected authorized scope; it is not a full-text engine or production throughput promise.

An isolated 100,001-worker fixture validates 25-row disjoint pages and index selection, not 100,000 concurrent users or a production SLO. SQLite retains the existing single shared persistent-file architecture. Production writes, lock contention, retention and later database evolution require separate measured rollout; do not silently replace it in this phase.

Future SIA workforce tools must call these bounded source-authorized services through the existing **human AND agent** scoped resolver and existing confirmation/risk/approval/audit gateway. Phase 01 exposes **no workforce SIA tool or execution authority**; the service does not impersonate an agent using a caller-supplied human ID. No unrestricted dump, autonomous suspension, disciplinary decision or termination is enabled.

## Database And Rollout

`20261007100000_nicejobs_workforce` is additive: five relational tables with restrictive existing-identity references and pagination indexes. Previous migration SQL is unchanged; readiness includes the intentional release checksum and assignment columns. Register capabilities and seed the known draft catalogue only through explicit reviewed operations after migration. No production migration, provisioning, seed or deploy is part of this phase.

Fresh/repeat deploy, Prisma drift, integrity/FKs and isolated restore use `npm run validate:migrations`. Focused tests additionally migrate a populated pre-Phase01 fixture, preserve its Person ID, restore a pre-phase snapshot and reapply the additive migration. Older artifacts ignore these tables; do not drop tables or downgrade a live database containing new assignments. Full application rollback and production load/TLS/device usability remain operator/manual gates. The prior Nice Jobs TLS hostname finding remains unresolved by this implementation.

See `docs/audit/NICE_JOBS_PHASE_01_VALIDATION.md` for exact validation results and limitations. Phase 02 and every downstream engine remain untouched.
