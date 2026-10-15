# Nice Jobs Phase 07: SOP, Resources and Internal Communication

## Subsequent Secure Library Extension

The historical Phase 07 storage/deferred descriptions below record that phase's boundary. The job/programme setup sequence's [Secure Content Library Phase 2](NICE_JOBS_SECURE_CONTENT_LIBRARY_PHASE_2.md), dated 2026-10-13, subsequently implements scoped uploads and authenticated private delivery while reusing these canonical resource/version/review models. Legacy unresolved private references remain unavailable. This extension does not enable external provider delivery, automatic publication or workforce activation.

## Boundary

Phase 07 extends the accepted Nice Jobs / AIRA Career Hub workforce product. Company, actual business division, immutable job versions, Person/User, readiness-backed assignments, Tasks, leads, follow-ups, blockers, authorization, audit, events, notification preferences and worker SIA remain canonical. This phase builds content machinery, not the organization's operating policies. No real SOPs, resources, messages, grants or workforce records are seeded.

Repository audit found no document/file/media storage domain or content-search engine. Existing training contains version-bound text, links and private references; it is not silently converted into published operational SOPs. CommunicationMessage/Thread are provider delivery records requiring integration and consent, not workforce announcements. Their contracts are unchanged.

The internal workforce communication adapter reuses immutable CommunicationTemplate for published subject/body and canonical Notification for optional recipient delivery. A Nice Jobs publication stores audience/lifecycle and points to the canonical template; it does not introduce another provider, message sender, notification ledger or communication executor. Published message body is removed from the draft column when the template is created transactionally.

## Content Identity and Versions

NiceJobsKnowledge is a stable company-bounded identity with kind SOP, RESOURCE or COMMUNICATION. NiceJobsKnowledgeVersion stores numbered versions, owner, organization scope, audience, visibility, title/summary/purpose, dates, priority, acknowledgement requirement and kind-specific metadata.

SOP has ordered NiceJobsSopStep rows with instruction, optional checklist, warning, escalation, published resource-version and Task references. Resources contain exactly one bounded reference text, approved HTTPS link or opaque private-storage reference, plus a document/PDF/image/video/link/template/checklist/reference type. No uploaded bytes or invented storage provider are introduced.

Draft content can be edited with expected revision. SUBMIT moves DRAFT to IN_REVIEW. An independently authorized person records review with a reason. PUBLISH requires that reviewer's current real identity/capability and a different publisher person. A second account for the author is not independent review. Review and publication never grant worker authority.

Published content cannot be edited. SOP/resource material changes use NEW_VERSION, copied into a new draft from the latest published version. Only the new version's publication replaces the current-version projection; old content, explicit work references and receipts remain unchanged. Version uniqueness prevents concurrent duplicate drafts. Communications are corrected by a new communication, not silently rewritten.

ARCHIVE requires authorized management and a reason; it changes availability metadata, not historical published content. Workers may resolve previously published/archived explicit historical versions only if current source permission, audience and dates still permit access. Management historical access remains independently scoped.

## Dates and Message Lifecycle

SOP/resources use DRAFT, IN_REVIEW, PUBLISHED and ARCHIVED. Communications additionally support SCHEDULED. SCHEDULE requires independent review and a future UTC instant. Publication is an explicit authorized operation, not an always-running worker. It cannot precede the scheduled or effective time and cannot publish already expired content. Scheduled content never becomes published merely because a page is opened.

EXPIRED is a read-time projection for published content at/after expiry; stored publication evidence is preserved. Worker lists, detail and SIA exclude expired content. Review dates are advisory recorded dates, not an invented expiry or certification policy. Date entry is explicitly UTC; display uses existing account IANA timezone.

## Visibility and Targeting

All content is internal and capability-authorized. WORKER versus MANAGEMENT visibility is explicit. Supported targets: COMPANY, DIVISION, JOB, JOB_VERSION, ASSIGNMENT and MANAGER_GROUP. Target fields must match the selected audience. Company audience uses company scope; all other targets use an actual company division.

Job targets belong to the canonical company/product. Job-version targets require a historically published version eligible in the actual division. Assignment targets require canonical current readiness-backed activation, active membership and date-valid assignment. Manager-group targeting uses the recorded canonical manager Person relationship, never a role-name grant.

Workers use their unique current active assignment. Title alone is never access. The SQL predicate includes company, currently source-authorized company/division scopes, WORKER visibility, publication/dates and matching job/version/assignment/manager audience before pagination or search results return. Company-wide content requires an actual company-scoped source capability; a division grant is not silently broadened upward.

Restricted referenced resources/tasks/SOPs are filtered in bounded queries before detail rendering. Hidden references are masked, not exposed as guessed private IDs. Worker content-read does not confer management draft access, publishing or generic Task access.

## Receipts and Acknowledgement

NiceJobsKnowledgeReceipt is unique per exact version and canonical assignment. READ, ACK and INBOX_ARCHIVE resolve the authenticated worker server-side; no worker or actor ID is accepted. GET does not mark read or acknowledge.

ACK requires an explicitly configured acknowledgement requirement and current acknowledgement capability. Evidence/reference is a human attestation, not proof of competence, agreement, activation or certification. Earlier version receipts remain distinct after a new version is published. Replays reauthorize current identity/assignment/source before returning prior evidence.

Inbox archive is assignment-private and requires any mandatory acknowledgement first. Archived inbox entries do not inflate My Day unread counts or remain in worker SIA's current message window. Read/acknowledgement can still be inspected through authorized historical detail. Manager receipt history requires person-read in addition to content authority and is cursor-paged; lack of access is explicit.

## Operational References

NiceJobsKnowledgeWorkLink explicitly pins a published SOP version to canonical Task, lead or follow-up. Scope and source access are validated when linking. A work reference does not assign all SOPs to all tasks and is not another workflow or task engine.

Worker task/lead/follow-up screens link to Related SOP. The resolver checks current ownership/source authority first, then returns only matching authorized version references. Reassignment cannot leave a former owner with contact/work-linked SOP access. Job and pinned-version audience provide separately configured job relevance.

## Worker and Manager Interfaces

The accepted My Day/My Work/Training/SIA/Profile experiences remain. SOP, Resources and Messages are added to simple worker navigation and both branded/corporate sessions. My Day shows permission-qualified unread/pending-acknowledgement observations, not fake metrics. Missing authority is NOT AUTHORIZED; an authorized empty content library is EMPTY.

Workers browse/search/filter paginated libraries and open exact published versions, read structured steps, follow authorized resources and explicitly mark read/acknowledge/archive permitted communications. Resource detail includes related job/version and related SOP references where authorized. Work-related SOP links retain exact historic versions.

Management Content has separate SOP/resource/message tabs, scoped creation/editing, independent review, publication, archive, next-version creation, audience choices, bounded work-reference/recipient pickers and paged acknowledgement history. Scope/capabilities are always checked server-side; navigation and controls never confer authority. Filters are literal server-side title/summary search, status/type/priority/acknowledgement and unread filters, not a full search engine.

## Notifications and Audit

Publication does not broadcast automatically. NOTIFY explicitly selects at most 25 actual worker assignments, validates each active assignment/audience/current source authority, and uses the canonical recipient resolver and notification preferences. New SOP/resource versions and messages can use this same operation; a SOP_CHANGE communication can explicitly reference a published SOP version. Private or out-of-scope content cannot be notified to unauthorized recipients. No email, WhatsApp or other external integration runs.

Creation, draft updates/visibility changes, review, publication, archive, version creation, work links, read/acknowledgement/inbox archive and explicit notification operations write canonical operational events/audit. Actor-bound UUID idempotency keys and fingerprints protect replay; revisions protect concurrent draft/state edits. Mutation, steps, canonical template, receipts, notifications and audit share a database transaction. Audit/storage failures roll back the mutation rather than reporting false success.

Registered capabilities (not automatic grants): nicejobs.knowledge.read/manage/review/publish/ack; nicejobs.sop.read; nicejobs.resource.read; nicejobs.message.read. Publishing and independent reviewing are separate current authorities. Notification delivery additionally requires notification.manage. Receipt identities require person.read; assignment targeting/pickers require workspace/person access.

## SIA Knowledge Boundary

The existing get_worker_day remains the only worker read tool. Worker day extends its projection with three independently source-gated knowledge windows. Every source uses the current human AND selected agent capability intersection before SQL retrieval, and applies the same worker audience/private-content filters. No executive or management-content tool is enabled for workers.

Deterministic answers contain actual authorized titles/version, summaries, bounded steps/reference text and internal communication text. Missing authorized content produces an explicit unavailable-content response, never an invented official SOP/policy. Stored instructions are DATA, not tool authority. Publication, editing, archiving and acknowledgement requests are rejected by the worker assistant; all writes require separately authorized human forms.

SIA windows are bounded, not complete historical change-diff analysis. Contact data, management content, unrelated companies/workers and private storage handles are excluded. Existing response-size guards remain authoritative. No model provider, embeddings service or autonomous manager is added.

## Storage, Search and Scale

PrivateAttachmentResolver remains authorization-only and unavailable by default. Creation/publication of private references must pass that adapter; actual download/delivery is NOT CONFIGURED. Plain text references and approved HTTPS links work without a storage provider. Opening an external link is navigation, not provider delivery or permission to retrieve private files.

Default library page is 25; maximum 100. Detail steps are capped at 30. Related references are bulk-loaded, not per-step lookups. Receipt history uses 25-row cursor pages. Configuration and management pickers are bounded to 50; operators narrow scope for larger catalogues. Work-linked SOP results are capped at 25. SIA windows contain five current versions per kind and five steps per SOP, qualified as a bounded window.

Indexes anchor company/kind, scope/visibility/status/current, job/version, assignment/manager, type and work/receipt identities. Search remains scoped literal substring matching on title/summary, not an FTS/embedding index. No full collection or history is loaded into the browser. The local scale fixture uses 1,001 resources and one activated worker; 25/100-row requests use the same measured query count. Production 100,000-worker capacity is NOT VERIFIED.

## Database and Deferred Work

Five additive models and canonical foreign-key inverses; no destructive Phase 01-06 table migration or provider-record contract change. Release readiness includes the explicit migration/hash and runtime probes. Fresh, populated, repeat, drift, integrity and isolated restoration checks are recorded under docs/audit.

Deferred: Phase 08+, real SOP/policy authoring, file uploads/private delivery, external providers, full-text search, background publication/broadcast automation, performance/PIP/incentives/wallet/settlement/payroll/payouts/termination, model-provider assistance and production rollout/capacity certification.
