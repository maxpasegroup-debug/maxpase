# Nice Jobs Phase 08: Performance, Reports and PIP

## Scope And Repository Audit

Phase 08 extends the accepted AIRA Career Hub / Nice Jobs product. Company, actual business division, Person/User, memberships, pinned published Job Versions, readiness-backed workforce assignments, Tasks, leads, follow-ups, daily reports, blockers, training, SOPs, resources, communications, authorization, operational events, audit and notification preferences remain canonical.

The repository already has execution Goals/ProgressUpdates and executive KPI observations. Neither defines version-bound workforce measurement expectations or immutable worker performance evidence. They are not replaced or duplicated. Daily Reports remain operational submissions; Performance Snapshots reference those reports rather than becoming another report-submission system. Support uses existing Tasks, training, SOPs and resources.

No actual job KPI, quota, target, performance policy, disciplinary rule, workforce record or capability grant is seeded. Synthetic fixtures exist only in isolated validation databases. Phase 09 and later financial/automation systems are outside this phase.

## Framework And Metrics

NiceJobsPerformanceFramework is a stable company/division/published-job-version identity. NiceJobsPerformanceVersion records number, owner, expected revision, status, effective date, period, IANA timezone and a strictly validated definition. States are DRAFT, PUBLISHED and ARCHIVED. Scope and pinned job version cannot change during draft editing. Publication requires current framework authority and a valid historically published job version eligible in the actual division.

Published metric/target material is immutable. A material change creates a new draft version from the latest published version, then requires explicit editing/publication. Its effective date must be later than its predecessor. Historical snapshots retain the exact version used. A new snapshot cannot select an older version when a newer version already applies; explicit corrections may reference an archived historical version.

Definitions contain at most 30 unique metric keys with name, description, unit, category, HIGHER/LOWER/RANGE direction, registered source, COUNT/PERCENTAGE method, visibility, active flag and optional effective dates. Targets are explicit minimum/maximum/range values; attention boundaries are explicit too, never an assumed percentage tolerance. Invalid bounds, methods or dates are rejected server-side. There is no formula/script engine, arbitrary universal score, salary rule or inferred target.

Without a configured target, status is NOT_MEASURED even if an observed count is available. Unauthorized sources return null actuals and NOT_AUTHORIZED coverage, not zero. Missing source policy is NOT_CONFIGURED. Empty percentage denominators are NOT_MEASURED. The overall status is computed only from visible/currently source-authorized results; partially measured results cannot silently become ON_TRACK. Metric status is ON_TRACK, ATTENTION, BELOW_EXPECTATION or NOT_MEASURED. Variance and calculation explanations accompany results.

## Canonical Evidence

Registered adapters measure task completions/overdue/blocked work, currently assigned leads, recorded contact actions, configured lead outcomes, follow-up completion/misses, daily-report submission, orientation/OJT completion, SOP acknowledgements and open blockers. Evidence is a typed canonical reference, not a duplicated operational record.

Counts and denominators use scoped database predicates. Each metric retains at most 25 sample references plus full observed count, sampling status, coverage and calculation explanation. Percentage adapters use explicit task/follow-up cohorts. Latest daily-report correction heads count once. REPORT_COMPLETE remains NOT_CONFIGURED because no canonical completeness policy exists; attendance, duration/rate, manual invented actuals and generic custom formulas are not implemented.

Completion/event measurements use recorded timestamps. Open/blocked/overdue work and current lead outcomes are generation-time observations constrained to the period, not reconstructed historical state. A historical generation performed later may observe a changed open-state/ownership projection. The snapshot preserves what was measured and when; an explicit correction records any later change. Human-recorded contact is an attestation, not evidence of provider delivery.

Source permissions are independent of performance-read permission. Worker task work-read does not confer generic task authority. Leads, reports, training, SOPs and blockers require their own current source capabilities. Worker training measurements require onboarding.self in the actual assignment division; a Career Hub grant is not silently extended into Labs. Project-only Task grants are not broadened into division workforce aggregates.

On detail/evidence reads, ownership, company/division, active assignment where required, source authority and knowledge audience are rechecked in bounded bulk queries. Revoked/reassigned/restricted references are masked. Public evidence detail exposes only source-specific work fields, never contact email/phone, private grading or management notes. Historical values are not recomputed merely by viewing them.

## Periods, Snapshots And Corrections

DAILY is one calendar day; WEEKLY is an explicit seven-calendar-day window; MONTHLY runs from the first day to the next month's first day. Calendar boundaries use the framework's IANA timezone. CUSTOM supports date boundaries or explicit UTC timestamps. UI date-time entry is labelled UTC; display uses the existing account timezone. End is exclusive. Only closed, positive, assignment-valid periods of at most 366 days can be generated; start cannot precede the framework effective date or assignment start.

NiceJobsPerformanceSnapshot stores canonical assignment/framework-version references, period, strict results, overall status, generation actor/time and revision. Unique assignment/version/period/revision and unique supersedes links prevent duplicate generations/correction forks. A correction must point to the latest head of the exact original period and include a reason. The original remains unchanged; the new head supplies ordinary list/trend projections. Direct editing of historical actuals/scores is not supported.

Trends use at most three corrected, non-overlapping snapshot heads of the same framework version. HIGHER/LOWER monotonic comparisons yield IMPROVING, DECLINING or STABLE. Mixed movements, RANGE, missing values, overlapping periods or insufficient history yield INSUFFICIENT_DATA. There is no AI trend judgment or cross-framework score comparison.

## Review, Attention And Reporting

NiceJobsPerformanceReview is append-only feedback, follow-up/support reference, reviewer and time. Worker-visible feedback is explicitly released; private management notes require performance.private independently. Worker acknowledgement is explicit and own-resource only; GET never acknowledges. Supporting task references are reauthorized on reads.

NiceJobsPerformanceAttention records an explicit manager-created metric flag, reason, revision and resolution. Creation requires a configured threshold breach and positive real evidence. Worker projection substitutes safe support wording for private reasons/resolutions. A flag never automatically creates PIP, discipline, suspension or employment action.

Worker Performance shows own authorized metrics, expectations, actuals, variance, period, evidence, deterministic trend, attention and released feedback. Management adds scoped workforce/job/division/worker/period/search/status filters, details, framework controls and improvement plans. Controls use current capabilities; server validation remains authoritative. Empty, unconfigured and unauthorized states are distinct. Forms retain errors, require confirmation and prevent duplicate submissions.

Report lists default to 25 rows and cap at 100, using newest-period keyset pagination or explicit record order. List evidence IDs are intentionally omitted to avoid per-row source queries; exact references are available on reauthorized detail. Worker report search matches framework name; manager search matches worker name; plan search matches plan title. Worker stored-status filtering is rejected because it could reveal private overall metrics. Manager status filtering requires all canonical source permissions in the selected scope to avoid hidden-source count leakage.

Executive summaries require existing executive.read AND workforce/person/performance access AND all canonical source capabilities in each included actual division. Explicit period filters are mandatory. Grouped counts are bounded to 100 framework/status groups, fail closed beyond that limit, and are labelled snapshots, not unique workers. Only authorized source scopes count; totals are not asserted to cover the whole company. Export is a bounded reauthorized report DTO without private notes; no PDF/export provider is introduced.

## Human-Governed Improvement Plans

NiceJobsPip references a real evidence-backed snapshot and canonical worker assignment. It records an independently active manager Person, private reason/note, worker-visible guidance, dates, required acknowledgement, at most 20 explicit objectives and 20 support actions, expected revision, status and outcome. Objectives contain an evidence-backed baseline, human-configured expected improvement, source, due/review dates, status and guidance. Support actions can reference current authorized Tasks, leads, follow-ups, reports, training, SOP/resources or blockers; they do not create duplicate training/resource/work engines.

Lifecycle: DRAFT -> ACTIVE -> UNDER_REVIEW -> COMPLETED; explicit cancellation is allowed before closure. Activation validates current dates/readiness-backed assignment. Activation alone does not release private management information. Release is a separate authorized human command. Amendments preserve append-only history, clear acknowledgement, withdraw the release and return reviewed plans to ACTIVE, requiring fresh review and explicit re-release. Closed plans cannot be edited.

NiceJobsPipReview records human REVIEW, WORKER response and private CHANGE history. Human reviews require canonical evidence, reviewer/time, PROGRESSING/NEEDS_MORE_SUPPORT/MEETS_EXPECTATION/NOT_MEETING_EXPECTATION, comments and next action. Completion requires UNDER_REVIEW, an actual human review and an explicit outcome. CHANGE rows retain the full post-command plan version; access requires pip.private. Private review notes and change snapshots are never worker/SIA data.

Workers can see only their own released non-draft plan, acknowledge when configured and submit comments/authorized evidence. They cannot change management decisions. Acknowledgement is receipt, not agreement, competence, legal certification or acceptance of discipline. Review dates are recorded/manual; no always-running scheduler, automatic reminder, inferred PIP, misconduct finding or termination command is added.

## Authorization, Audit And Notifications

Registered capabilities, not automatic grants: nicejobs.performance.framework.read/manage/publish; performance.self.read/read/generate/review/private/attention.manage; nicejobs.pip.self.read/self.respond/read/manage/review/private. Existing active authenticated User/Person, membership dates, company/product/actual-division relationships and source capabilities apply. Management requires person.read, workspace.read and performance.read in addition to each mutation capability. PIP mutation requires current PIP authority; titles and manager relationship alone confer none. Self-management and forged actor/scope fields are rejected.

Actor-bound UUID idempotency references and command fingerprints use the canonical OperationalEvent ledger. Replay reauthorizes current identity/resource/private-note capability before returning a prior result. Expected revisions protect state edits. Operational mutations, reviews, change history, canonical audit/event and eligible in-app notifications share a single database transaction. Audit/notification/storage failures roll back; errors are safe and explicit, without client stack traces.

Released feedback/plans use the canonical Notification recipient resolver, source-bound operational resource types and stored preferences. Notifications contain generic workspace wording, not private notes or plan reasons. Recipient accounts and source authority are validated; account batches cap at 25. No external communication provider, CommunicationMessage delivery or independent audit/notification ledger is added.

## SIA Boundary

The existing get_worker_day read tool is extended; no new executor is enabled. Every performance/PIP query uses the current human AND selected agent capability intersection, own assignment and current source permissions. The window includes three reports with five visible metrics each, up to five latest released feedback records, three released plans with five objectives/support actions each, and currently authorized sample evidence for the latest detail. Existing context-size guards remain active.

Deterministic assistance explains configured actuals/expectations, calculation, missing evidence, released guidance and support actions. Private notes, private flag reasons, unreleased plans, management-only metrics/change history, unrelated workforce and companies are excluded. Stored instructions remain data, never authority. Creating/activating/extending/closing/editing PIP, determining failure, discipline, termination and compensation requests are rejected. SIA does not create SiaAction records or modify any employment/workforce state.

## Database And Scale

Seven additive models: framework, version, snapshot, review, attention, PIP and PIP review. Canonical inverse FK relations are added without accepted table-column rewrites. Indexes cover company/division/pinned version, framework/effective/status, assignment/period/head identity, reviews and PIP status/review dates. Strict bounded JSON definitions/results/objectives follow existing SQLite patterns; typed canonical evidence stays referentially validated in services.

Management configuration choices cap at 50, source pickers at 25 per type, responsible managers at 50, feedback/PIP-review pages at 25, attention flags at 30, executive groups at 100. Narrow scopes are required beyond those picker windows. No unbounded history, whole-workforce browser scan, semantic search or cross-history export is introduced.

The local scale regression uses 1,001 snapshots and one worker, verifying equal database-query counts for 25- and 100-row list requests. This is not production latency/concurrency testing or certification of 100,000 workers. Exact results and fresh/populated/repeat/drift/restore/browser evidence are recorded in the Phase 08 validation report.

## Deferred Systems

Phase 09+: incentives, bonuses, wallet, settlement, salary, payouts, payroll, finance/accounting, termination, workforce command center, large-scale automation and external Meta/Instagram/Google/WhatsApp remain untouched. Real policy/target authoring, capability provisioning and production rollout remain operator responsibilities. No model-provider intelligence or autonomous SIA management is enabled.
