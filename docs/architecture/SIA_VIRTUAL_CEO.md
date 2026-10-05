# SIA Virtual CEO

## Phase 10 Hardened Boundary

The final build does not add autonomous execution, a real model/provider, broader memory authority or unrestricted communication. Source-authorized memory pagination prevents hidden/unreadable rows affecting visible retrieval limits. Existing real-context/tool/approval/confirmation/idempotency/rollback regressions remain authoritative and a starvation/isolation regression is added. Production/provider/browser validation is separate and unperformed where infrastructure is unavailable. See PHASE_10_VALIDATION.md and PRODUCTION_DEPLOYMENT.md.

## Phase 09 Controlled Communication Preparation

send_email/send_whatsapp are immutable HIGH_RISK_WRITE contracts. proposeCommunication checks current human/agent intersection and enabled registered tool, then creates an immutable normalized message and ordinary SIA_PROPOSAL approval request. Independent humans review the actual preview; only explicit requester confirmation and a currently authorized human outbox processor permit dispatch. Generic SIA execute still rejects high-impact actions. There is no live adapter, arbitrary recipient, mass send, impersonation or autonomous communication. Earlier Phase 08 phase exclusions remain historical. See COMMUNICATIONS_INTEGRATIONS.md.

## Phase 08 Boundary

SIA is MAXPASE GROUP's non-human Virtual CEO identity, not a Person, User, employee, service administrator or a role-name bypass. This phase adds controlled executive orchestration to the existing relational system. It does not start Phase 09, integrate external communications or claim a production-ready AI service.

**High-impact autonomous execution is DISABLED.** There is no financial, deletion, access-grant, deployment, legal, arbitrary SQL, shell, filesystem or unrestricted external API tool. A high-risk/critical tool would require a registered server policy and independent human approval; none has an executor in this phase. Approval alone never grants authority.

## Existing Identities Extended

SiaIdentity retains its ID, lifecycle, goals, role assignments, tools and approvals. It gains a description, validated JSON personality/configuration and configurationVersion. Configuration supports name, executive role, communication style/tone, response preferences and decision/operating principles. The defaults contain no fictional biography. Configuration is version-checked and audited. Changing a shared identity or its tool activation requires sia.access.manage and delegation authority across all its assigned scopes, not only the current company.

SiaRoleAssignment remains the AGENT principal access path. Active compatible agent roles and explicit organization/descendant coverage grant named existing capabilities; GLOBAL capabilities remain excluded. Human memberships never inherit these roles. No agent role or enabled tool is added by seeding. Administrators must explicitly grant capabilities through the existing workforce access service and activate registered tools. A newly migrated installation can render SIA's interface without falsely claiming an authorized intelligence context.

## Authorization-Aware Context

createAccessContext optionally accepts an internal AgentConstraint. It materializes exact-scope grants from the intersection of the current human's active grants, SIA's active scoped grants and the requested organization/project branch. It uses the existing ancestry/capability evaluator, not a second permission system. GLOBAL human access is narrowed rather than passed through. Project-only human grants remain project-only; actual project ownership is checked by the same engine.

Domain service factories accept an internal access resolver. SIA passes the constrained resolver to execution, operations, executive, workforce and business reads. Source authorization is applied before queries, derived progress, metrics and company health; filtering a broadly calculated dashboard after aggregation is not permitted. Every read tool requires active human sia.access.read, an active SIA identity, an enabled matching SiaTool, executive.read and its domain capability. Revocation is checked again for tools and action execution. Counts describe authorized coverage, not hidden company-wide totals. NO_DATA remains distinct from zero.

The context service projects safe fields, never an unrestricted database dump. Graph context includes authorized typed organization edges, products/brands/projects/goals, tasks/milestones/dependencies, people/memberships/roles/capabilities/responsibilities and recorded ownership. Hidden endpoints remove edges; labels require their own source visibility. Ownership is recorded data, not inferred authority or aggregated equity. Domain source status and calculated progress are not copied into a second database.

Detail bounds: 200 facts, 100 signals/decisions, 500 graph nodes, 1,000 edges and 100 eligible memory entries. Current authorized metrics retain their source definitions. This is not a benchmarked large-enterprise query planner; underlying domain reads can still perform per-resource work. No cross-request context cache or vector database is installed.

## Tool Registry

registry.ts owns immutable server contracts: key/name/description/category, required named capability, scope, strict input/output schema, risk, approval and audit policy. SiaTool remains the persisted identity-specific enabled/disabled allowlist; stored metadata cannot override risk or implementation. Legacy foundational tools remain compatible with Phase 05.

Read tools: get_group_overview, get_company_overview, get_companies, get_projects, get_project_status, get_goals, get_goal_status, get_tasks, get_attention_items, get_pending_decisions, get_pending_approvals, get_recent_changes, get_risks, get_opportunities, get_people_summary, get_company_health and prepare_report. Project status requires a selected real project; company views require a selected real company. Goal tools summarize the authorized selected scope, not a guessed natural-language entity match. Reports are live read-only structured briefings, not stored fabricated documents.

Risk vocabulary is READ_ONLY / LOW_RISK_WRITE / HIGH_RISK_WRITE / CRITICAL. create_task is the only LOW_RISK_WRITE executor and **still requires independent human approval and explicit confirmation**. The model/provider cannot choose risk, change scope, invent permissions or turn natural-language content into a database query.

## Memory And Governance

SiaContext is extended, not replaced. Categories: FOUNDER, ORGANIZATION, COMPANY, PROJECT, OPERATIONAL, KNOWLEDGE and DECISION. Fields include source type/ID, actual organization/project, trusted human owner, nullable confidence, review/expiry dates, lifecycle, version and timestamps. Existing unreviewed context is LEGACY/DRAFT and is not automatically adopted. Unscoped legacy text cannot become authority through migration.

Memory creation requires scoped sia.access.manage, executive/source reads and an active human membership. Founder context requires an explicit group scope, company context an actual company, project context an actual project. A founder title never establishes these capabilities. Creation always produces DRAFT; a separately authorized, audited review promotes APPROVED context or archives it. Approved text is immutable; revisions create a new key/versioned record rather than erasing historical context. A memory review is an attestation, not proof that every statement is objectively true. Stored confidence is an attestation and can remain unknown.

Retrieval exposes only APPROVED, unexpired, not-due-for-review memories whose current source and scope remain authorized for both principals. Literal bounded substring retrieval provides a clean knowledge retrieval abstraction without an embeddings provider. Stored text, including reviewed text and configuration principles, remains DATA, not executable instruction, permission or tool policy. Human-attested context is explicitly distinguished from authoritative references.

DECISION memory must reference the existing ExecutiveRecord/ExecutiveHistory or operational approval. It cannot create a fake decision from a text note. Executive question, designated decision maker when readable, decision states, actual actor/date/reason history and original payload remain authoritative; a memory entry does not overwrite them. Approval memory retains the real approval reference and follows its current access boundary. Historical human decisions never silently execute business work.

## Actions And Human Approval

SiaAction stores the requesting identity and canonical human requester, immutable tool/scope/parameters/reason/risk, authorization, approval requirement/request binding, state/version, unique idempotency fingerprint, result/verification, timestamps and audit linkage. Parameter validation excludes arbitrary status/actor/risk/assignment metadata. create_task creates exactly one ordinary TODO task through executionService. New assignment, sensitive state changes, reminders and other write executors are intentionally not exposed.

Proposal preparation checks human and agent task.manage/task.read/executive.read plus human sia.propose. In one transaction it creates the ordinary SIA_PROPOSAL OperationalRequest bound to an existing independent ControlPoint and the SiaAction in APPROVAL_REQUIRED with authorization=AUTHORIZED. Audit records establish proposal/authorization provenance; PROPOSED/AUTHORIZED are conceptual gates, not client-settable state fields.

Linked Phase 08 proposal title/justification cannot be rewritten through the generic request editor. Prepare a new proposal if the action changes; execution also checks the approved justification against the immutable action reason. Ordinary and legacy unbound requests retain their existing draft-edit behavior.

Submission and APPROVED/REJECTED/CANCELLED/EXPIRED decisions remain in the Phase 05 request/approval service and UI. Sequential/parallel policy, independent Person identity, stage order, expiry and current reviewer authority are unchanged. Action queues project the authoritative request decision; no second approval engine or approval cache is introduced. The requester opens the real request to submit it; assigned humans approve/reject in the real approval queue.

Explicit execution is requester-only and requires confirmation, exact request identity/tool/scope/parameter binding, current independent human approvals, current agent tool activation and current human/agent capabilities. The existing siaBoundary remains executionEnabled=false for general proposals. A separate narrow Phase 08 gateway accepts only the fixed create_task contract, never an arbitrary approved tool.

CAS claims APPROVAL_REQUIRED -> EXECUTING. The normal task service, authoritative task verification, EXECUTED/VERIFIED audit events and final VERIFIED result commit together. A retry rechecks current authority and approval before returning the same verified result. Failed domain execution rolls all outputs back; a safe failure event/code is separately persisted without inventing success or destroying the prior retryable state. Rejection, cancellation and stale authorization never execute work.

## Conversation, Recommendations And Provider

The provider interface is separate from business logic. SIA_PROVIDER=deterministic uses explicitly labeled DETERMINISTIC_DEVELOPMENT intent routing. Unsupported provider configuration fails MODEL_UNAVAILABLE. No external AI API, real-model output, provider tokens or provider cost is fabricated. Actual external-provider validation is NOT RUN. Personality is structured configuration for future providers; deterministic outputs retain the fixed safe response contract.

Routing recognizes a limited set of business questions and selects only registered tools. Unknown/unsafe intents fail explicitly. Natural language does not construct SQL or execute writes. Requests naming a company must use its explicit authorized context selector; names in prose do not switch scope. create-task language only offers preparation; the structured proposal/confirmation forms control actual writes.

Responses distinguish FACTS, SIGNALS, RECOMMENDATIONS, ACTIONS and APPROVALS. Facts reference domain evidence; attention/health use Phase 07 deterministic rules; recommendations explicitly state RULE_BASED interpretation, observation/evidence, expected benefit, risk, affected entities and next action. Unknown data remains unavailable. Recommendations never dismiss attention, choose a human decision or change business status. Decisions link back to their real human queues. Briefing uses actual changes, attention, deadlines, blocked work, concerns and wins in UTC.

Only concise structured conclusions and evidence references are persisted as rationale, **never private chain-of-thought**. Business text, memory and model-selected intent are untrusted data. No retrieved content is concatenated into an executable policy. The current deterministic provider sees only the user's request for routing; it does not receive an entire database or private context.

## Audit, Usage And Failure

SiaRun stores unique creator/identity/idempotency, a request fingerprint rather than raw private prompts, actual scope, intent/tool, provider/model, processing outcome, latency, nullable usage/cost, safe failure code, concise rationale, timestamps and audit reference. There is one run per request key. Retries rebuild live context rather than returning a persisted snapshot after revocation. Selected tool/context/recommendation/completion/failure events preserve trusted human actor and siaId. Task proposal/approval/execution/verification link to the existing canonical audit/events.

Normal UI history exposes only the current user's request tool/status/time, not internal latency, rationale, grant provenance, prompts or usage telemetry. A separate scoped sia.access.manage usage query provides actual counts and nullable aggregate usage/cost for the exact organization/project. Passive read-only briefing previews do not generate duplicate request counts; explicit conversation requests are audited. Audit failure never silently succeeds.

Failures distinguish unsupported intent, unavailable model, unavailable tool/access and unavailable data. End users receive bounded safe messages, not stack traces. High-impact/unregistered tools always fail closed. No endless worker, startup execution loop, external outbox consumer, email/WhatsApp automation, billing or Phase 09 system is added.

## UI And Validation

/app/sia uses the existing protected shell and session-backed actions. Views: conversation, briefing, attention, decisions, actions, memory, tools, context/configuration and recent activity. Organization/project selectors are validated against real service scope. Before task execution the UI displays what/why/target/scope/risk/approval/status/next step; an explicit checkbox confirms approved creation. Existing operational queues provide actual human submission/approval/rejection controls.

See PHASE_08_VALIDATION.md for measured tests, schema/migration checks, build, HTTP smoke evidence and manual browser/provider/production gaps. No browser/device/provider/production validation is inferred from SSR or a build.
