# MAXPASE OS INDEPENDENT AUDIT

Date: 2026-10-04. Scope: implemented Phases 01-10 in the supplied local workspace.

This is a fresh code-and-evidence audit, not third-party penetration-test certification. Previous phase reports were checked against implementation and fresh local validation, not accepted as proof. No application code, configuration, schema, migrations or tests were changed. This report is the only manually authored audit artifact. No remediation commits or Phase 11 work were performed. Verification generated ordinary build artifacts and used isolated temporary databases.

## A. Overall verdict

**NOT PRODUCTION READY**

Three reproducible authorization defects prevent release. The architecture remains coherent enough to retain; these findings do not justify replacing the domain model or permission engine. Local compilation, migrations and 188 passing tests do not establish production security or acceptance. Production infrastructure, current dependency inventory and browser/device/accessibility acceptance remain NOT VERIFIED.

## B. Architecture integrity

**FINDINGS**

MAXPASE GROUP is the modeled root; MAXPASE OS supplies shared services; SIA is a separate non-human executive consumer; AIRA resolves as a company beneath the group, not the root. Company profiles, organizations, brands, products, projects, Person, User, memberships, ownership, roles, permissions and responsibilities remain separate. Equity, designation, reporting and task ownership do not confer implicit permissions. The 60 canonical AIRA role names and ordering are intact; entry 60 remains AGENT, entries 1-59 HUMAN.

AIRA mostly reuses execution, workforce and operational engines. However, legacy Business Graph Person creation duplicates the newer workforce path and omits its capability gate (F01). Client components submit commands; domain services own the inspected business mutations. Customers, revenue accounting and a dedicated outcome engine are not implemented in this scope and are NOT APPLICABLE, not invented graph coverage.

## C. Security

**FINDINGS**

F01-F03 are verified access-control failures. The inspected authentication path otherwise verifies bounded bcrypt credentials, creates a fresh database-backed session, uses a minimal signed identity token, and rechecks account/Person/session lifecycle. Membership and capability changes are evaluated from current database state, not cookie role claims. Session issuance/revocation audit is transactional. Production configuration rejects insecure cookie/origin/database/bootstrap settings.

Server-side input validation, canonical origin checks, durable budgets and generic diagnostics are present. Baseline CSP protects framing/object/base/form behavior but is not a nonce-based script policy. No arbitrary SQL, dangerous HTML renderer, client credential storage or unrestricted external execution surface was found in the inspected paths. This is not proof against every XSS, denial-of-service or deployment-specific attack. Actual HTTPS cookies, proxy CSRF behavior and cache isolation are NOT VERIFIED.

## D. Authorization

**FINDINGS**

The central active-identity, dated-membership, scoped-capability and resource-resolution design is sound, but its consumers are inconsistent. F01 bypasses Person creation permission; F02 discloses task titles through dependency reads; F03 lets a division filter replace authorized program/batch scope. Role names, Founder/CEO/system administrator titles, ownership and SIA identity do not provide a general bypass.

Existing company/project isolation, revocation, delegation and executive source checks passed their tests. Those are bounded results, not a blanket authorization PASS. No cross-company exploit was reproduced; F03 is a within-company domain/division permission bypass. Direct HTTP exploit reproduction was not performed: the defects were exercised through actual services using real Prisma databases, and their page/action reachability was traced in source.

## E. Database

**PASS**

The Prisma schema and the 11 ordered migration SQL files were inspected. Fresh Prisma deployment, repeated deployment, migration status, schema drift, SQLite integrity/foreign-key checks and an isolated snapshot/restore passed fresh validation. Table rebuilds copy retained columns; important operational/executive/communication records generally use restrictive references. Identity/configuration cascades and nullable SET NULL references are present and must remain subject to the existing controlled lifecycle rather than unrestricted hard deletion.

Organization and resource references, deduplication keys, versions, timestamps, approval/history relationships and relevant lookup indexes exist. Polymorphic operational resource IDs and some scope fields rely on service validation rather than relational foreign keys; that is documented and is not a substitute for safe direct database administration. No exposed application hard-delete path producing an unsafe cascade was identified. Production migration/data-upgrade acceptance and recovery are NOT VERIFIED; fresh installation is not a representative populated production upgrade.

## F. SIA

**FINDINGS**

F06 affects context cost, not a reproduced SIA authority bypass. All 20 registered tools were traced through registry and service gateways. Human/agent scope intersection, enabled-tool contracts, named capabilities and current source authorization are server-side. Memory has distinct Founder, Organization, Company, Project, Operational, Knowledge and Decision categories; review, expiry and source checks precede disclosure. Legacy unreviewed memory is excluded. Memory never creates permission.

The only task execution gateway creates one approved, explicitly human-confirmed task with current dual-principal checks, immutable proposal binding, verification and audit. Communication tools prepare previews, not immediate sends. General/high-impact autonomous execution is disabled server-side. No SQL/shell/file/general HTTP tool or recursive tool executor was found. The provider is deterministic development logic; real model resistance to prompt injection is NOT VERIFIED because no live model provider is configured. Current inbound and memory text remain data, not executable commands.

## G. Executive Intelligence

**FINDINGS**

F06 affects scaling. Inspected aggregation intersects executive access with source-domain access before counts, health, briefing and attention. Executive dependency projection explicitly rechecks both task sources, unlike F02's ordinary execution view. NO_DATA/UNKNOWN and authorized-record coverage are explicit; observations and histories are real records, not seeded metrics. Human strategic decisions do not grant operational execution authority. Existing deterministic and isolation tests passed. Production-size freshness/latency and load behavior are NOT VERIFIED.

## H. Operations

**FINDINGS**

Definitions and instances are separate; transitions validate source state, required capability, current version and control result. Approval chains use assigned active human identities, ordered stages and unanimous parallel reviewers. Self-approval rules use Person identity, not merely account IDs. Approval expiry, replay and authority revocation are rechecked at consumption. Mutations, history, audit and in-app events share transactions. Notifications are recipient-private and source-checked; preferences are separate; reminders, UTC recurrence and explicit escalations are bounded.

No approval bypass or uncontrolled high-impact executor was reproduced. Scheduled communication automation has verified scan starvation (F04), and its action feedback can claim success after processing failures (F05). The pending-approval overview counter was separately reproduced and returned the correct value; it is not a finding.

## I. Communications

**FINDINGS**

F04-F06 apply. The provider abstraction, private credential-reference resolver, immutable preview/approval binding, consent checks, confirmation, outbox claim, retry limits and result persistence were inspected. Non-live successful sends are normalized to SIMULATED. UNKNOWN and stranded SENDING are not blindly retried. Dispatch checks current processor, creator and applicable agent authority. A provider call occurs outside the database transaction after an audited claim; uncertain outcome requires reconciliation, not automatic re-dispatch.

The public webhook is intentionally signature-authenticated rather than session-authenticated. Body bounds, fixed provider adapter, HMAC/time validation, event normalization, replay/fingerprint protection and persisted deduplication exist. Mock signature/replay tests passed. Live email, WhatsApp and TalkinLabs are NOT CONFIGURED; no live connectivity is asserted. The private attachment resolver fails closed, and no configured private download/delivery route exists. These provider gaps are not code defects.

## J. UI

**FINDINGS**

F05 produces misleading success feedback. Protected operational, company, executive, SIA and communication pages/actions were inspected, including filters, form submission, pending/error states and plain-text message rendering. F03 is reachable through a direct division query parameter; UI hiding cannot repair it.

Browser inventory returned no apps or browsers. No screenshots, browser clicks, real device tests, screen-reader tests, contrast measurements or accessibility acceptance were performed. These results remain NOT VERIFIED (F10); source labels and CSS alone cannot certify usability or accessibility.

## K. Deployment

**FINDINGS**

F08-F10 are unresolved release gates. Runbooks correctly require one Node application with persistent SQLite storage, deliberate migrations, least-privileged provisioning, canonical TLS origin, edge quotas, monitoring and tested recovery. Health is liveness; readiness checks secure runtime configuration and latest migration/database availability, not all checksums, provider health, backups or business invariants. Remote CI/release provenance and actual production controls are NOT VERIFIED. No production environment was accessed.

## L. Test quality

**FINDINGS**

Fresh suite: 188 tests across 13 files PASS. Tests use real Prisma/SQLite fixtures and actual domain authorization rather than replacing the security engine with permissive mocks. Negative company/project access, revocation, approval independence, SIA boundaries, replay, uncertain communication outcomes and audit-trigger rollback are meaningfully covered. The dedicated migration validator separately exercises Prisma deployment and restore behavior.

F07: coverage misses the reproduced sparse-capability/filter combinations and automation populations above 25. Broadly privileged fixtures make positive scenarios useful but cannot prove capability independence. Service tests are not browser/Next action/proxy integration tests. A passing test count must not be promoted to complete security or production validation.

## Findings table

Evidence paths are relative to the repository root. VERIFIED means source inspection and, where stated, real-database reproduction. NOT VERIFIED means the required operational evidence is missing, not that an exploit was demonstrated. Severity on an evidence gap describes release risk, not a proven vulnerable package or deployment.

| ID | Severity | Area | Finding | Evidence | Risk | Recommended remediation |
|----|----------|------|---------|----------|------|-------------------------|
| F01 | HIGH | Architecture / authorization | VERIFIED: legacy people creation requires membership.manage but not person.create. | src/server/domain/business-service.ts:15,166-170; workforce-service.ts:98-110; src/app/app/business/actions.ts; reproduction P1. | An authenticated membership manager creates canonical people through the older action despite being denied by the workforce service. | Delegate to the canonical workforce boundary or enforce the same person.create and membership gates; add both-path sparse-capability regression tests. |
| F02 | HIGH | Execution authorization | VERIFIED: dependency reads expose both task titles and prerequisite status without task.read. | src/server/domain/execution-service.ts:306-308,375; src/app/app/execution/[kind]/page.tsx; reproduction P2. | Restricted work labels leak through dependency listing and execution attention despite an empty task view. | Require current task.read on both actual endpoints before emitting DTOs/attention; test organization, department and project variants. |
| F03 | HIGH | AIRA authorization | VERIFIED: divisionId replaces the authorized organizationId filter for programs and batches. | src/server/domain/aira-service.ts:147-158; src/app/app/aira/[kind]/page.tsx:12; reproduction P3. | company.read plus organization.read discloses program/batch records without program.read or batch.read. | Intersect the division condition with domain-authorized scope rather than overwrite it; validate the operation capability on the actual division and test direct filtered URLs. |
| F04 | MEDIUM | Automation completeness | VERIFIED: repeated scans select the same first 25 resources, without a continuation cursor, then can finish the finite job successfully. | src/server/communications/automation.ts:107-109 and subsequent job advancement; reproduction P4. | Later eligible resources are never processed while the job reports success; early ineligible resources can also crowd out later ones. | Persist bounded scan continuation/fairness and distinguish partial scans from completion; test more than 25 resources, multiple runs and ineligible heads. |
| F05 | MEDIUM | Operational UI feedback | VERIFIED by source: processJobs discards per-job FAILED results and falls through to ok:true, Saved. | src/app/app/communications/actions.ts:35,41; automation.ts processDue catch/result handling; forms.tsx success status rendering. | A manager receives success feedback despite failed processing; failure remains in job records but is not reflected in the command result. | Return succeeded/failed/blocked counts and an explicit partial/failure result; similarly review other result-producing commands. Add action-level feedback tests. |
| F06 | MEDIUM | Performance | VERIFIED query pattern; production impact NOT VERIFIED: unbounded domain/message/history reads and repeated per-source lookups; narrow SIA reads build broad authorized context. | src/server/domain/operations-service.ts:561-574; execution-service.ts list/visibleProgress; communications/service.ts:299-320; sia/context.ts:78 onward. | Large portfolios can increase memory, query count and latency; slicing DTOs after loading is not database pagination. | Add source-authorized bounded queries/cursors and request-local batching; preserve authorized counts and revocation behavior; establish representative load/SLO evidence. |
| F07 | MEDIUM | Tests / validation claims | VERIFIED: the passing suite omits regressions for P1-P4 and does not exercise browser/proxy acceptance. | tests/business.test.ts, workforce.test.ts, execution.test.ts, aira.test.ts, communications.test.ts; fresh 188-test run versus P1-P4. | A green suite permits demonstrated access regressions and incomplete scans; broad authorization PASS claims are not supported. | Add independent-capability, filtered read, legacy-path and >25-resource cases plus focused endpoint/E2E checks; amend future validation claims to their actual scope. |
| F08 | HIGH | Deployment acceptance | NOT VERIFIED: no evidence of production persistent volume, least-privileged bootstrap, TLS/edge controls, applied migrations, monitoring or production restore acceptance. | docs/architecture/PRODUCTION_DEPLOYMENT.md:5,32-51; PHASE_10_VALIDATION.md:30-32,50,87,94-99; api/ready scope. | Exposure or launch without these controls risks unauthorized provisioning, availability failure or unrecoverable loss. This is not a reproduced production exploit. | Provision the documented deployment; capture operator-reviewed migration, HTTPS/security, alert and backup/restore results before release. |
| F09 | MEDIUM | Dependency release evidence | NOT VERIFIED: current complete vulnerability inventory and release-owner exception acceptance are absent. Local braces 3.0.3 is dev-only; Vitest is pinned 4.1.11. | package.json; structured package-lock.json inspection; docs/architecture/DEPENDENCY_SECURITY.md; .github/workflows/ci.yml. | New runtime/build advisories may be missed; historical findings cannot establish today's package safety. | Obtain an approved current advisory inventory without violating metadata restrictions; review reachability and document explicit owner decisions. Do not infer zero findings. |
| F10 | MEDIUM | Manual acceptance | NOT VERIFIED: browser/device/accessibility and deployed multi-identity/origin/cache acceptance remain pending. | docs/architecture/BROWSER_DEVICE_CHECKLIST.md; PHASE_10_VALIDATION.md browser/production acceptance rows; fresh browser inventory empty. | Manager workflows, secure cookie/proxy behavior or cross-user cache isolation may fail without detection. No visual defect or browser exploit is asserted. | Execute the documented desktop/mobile/keyboard/screen-reader and deployed security checklist with approved test identities and retained evidence. |

No CRITICAL issue was demonstrated. No LOW or INFORMATIONAL code defect was added merely to fill severity categories. F08-F10 are explicit evidence gaps, not invented implementation exploits.

## Reproduction evidence

All proofs used isolated temporary databases with the actual 11 migrations, real Prisma and the existing service factories. Application code and the development business database were not changed by these proofs. Test principals and labels were synthetic. These are service-level proofs; browser/HTTP reproduction remains separate.

| Proof | Setup | Observed result |
|---|---|---|
| P1 / F01 | Active actor with only membership.read and membership.manage; attempt equivalent Person creation through workforce and legacy business services. | workforceDenied=true; businessCreated=true. |
| P2 / F02 | Active actor with only dependency.read; two tasks linked by a dependency. | visibleTasks=0; dependencyTitles contained CONFIDENTIAL dependent and CONFIDENTIAL prerequisite. |
| P3 / F03 | Real MAXPASE root/AIRA company/division; active actor with company.read and organization.read descendants, no program.read or batch.read. | Unfiltered programs/batches returned zero; division-filtered results returned CONFIDENTIAL offering and CONFIDENTIAL batch. |
| P4 / F04 | 26 overdue tasks with eligible owner/recipient; enabled finite automation job with two due runs. | Both runs processed 25 and returned SUCCEEDED; distinctNotified=25; tailNotified=false; final job=SUCCEEDED. |

A separate pending-approval counter hypothesis was falsified: the actual projection retains its nested request, and a pending approval contributed correctly to the overview count. It is deliberately excluded from findings. An initial combined automation fixture setup failed; P4 was subsequently rerun successfully in a separate correctly configured fixture.

## SIA tool trace

Registry evidence: src/server/sia/registry.ts. Enforcement: src/server/sia/access.ts, service.ts and context.ts; communication gateway: src/server/communications/service.ts.

For every tool below, actual scope is the requested resource intersected with current human and agent grants, active identity/ancestry and source-domain permissions. The declared GROUP contract is not unrestricted group access. Each read invocation also requires SIA invocation authority and an enabled registered tool. No listed tool can recursively invoke another tool. Read tools write only controlled request/usage/audit provenance, not business state; their structured context can include additional authorized graph/memory/executive evidence, so the table names primary output rather than promising a minimal response payload.

| Tool | Required tool capability | Primary output / business write | Approval / confirmation | High-impact execution |
|---|---|---|---|---|
| get_group_overview | executive.read | Authorized group evidence | No / no | None |
| get_company_overview | company.read | Authorized company evidence | No / no | None |
| get_companies | company.read | Authorized companies | No / no | None |
| get_projects | project.read | Authorized projects | No / no | None |
| get_project_status | project.read | Authorized project status | No / no | None |
| get_goals | goal.read | Authorized goals | No / no | None |
| get_goal_status | goal.read | Authorized goal status | No / no | None |
| get_tasks | task.read | Authorized tasks | No / no | None |
| get_attention_items | executive.read | Source-authorized attention | No / no | None |
| get_pending_decisions | executive.read | Source-authorized decision queue | No / no | None |
| get_pending_approvals | approval.read | Authorized assigned approvals | No / no | None |
| get_recent_changes | executive.read | Source-authorized changes | No / no | None |
| get_risks | risk.read | Authorized risk records | No / no | None |
| get_opportunities | opportunity.read | Authorized opportunities | No / no | None |
| get_people_summary | person.read | Authorized people summary | No / no | None |
| get_company_health | company.read | Authorized-record health | No / no | None |
| prepare_report | executive.read | Evidence report, no automatic business action | No / no | None |
| create_task | task.manage | One controlled task after proposal consumption | Independent approval / explicit human confirmation | Narrow task gateway only; no autonomous high-impact executor |
| send_email | communication.send | Immutable email preview and approval request | Independent approval / human queue confirmation before separate dispatch | Tool does not send; approved outbox processor uses fixed configured adapter |
| send_whatsapp | communication.send | Immutable WhatsApp preview and approval request | Independent approval / human queue confirmation before separate dispatch | Tool does not send; live provider unconfigured |

Historical foundational tool contracts remain compatibility/inspection data, not an alternative generic executor. Legacy unbound approval/context rows are not adopted as current execution authority. No destructive, arbitrary database, credential, file or unrestricted API tool was found.

## Endpoint and mutation trace

| Surface | Authentication / authorization | Validation / integrity / audit | Remaining boundary |
|---|---|---|---|
| Login/logout and organization switching | Credential/session identity; current active membership/capability for selected scope | Bounded password/input, canonical origin checks, durable budgets; session/revocation audit transactions | Actual production browser/proxy acceptance NOT VERIFIED |
| Business actions | requireSession actor; business scoped capabilities | Domain parsers, transaction and audit | F01 legacy Person gate |
| Workforce actions | requireSession actor; resource/delegation permissions | Strict domain contracts, lifecycle/session handling, transactional audit | Existing tests pass; endpoint browser acceptance NOT VERIFIED |
| Execution actions/pages | requireSession actor; domain/project scope | Lifecycle/reference/cycle validation, audit and notifications | F02 dependency DTO source reads |
| AIRA actions/pages | requireSession actor; canonical company context plus domain services | Shared models, strict mutations and transactional events | F03 division-filter reads |
| Operations actions | requireSession actor; scoped control/request/workflow permissions | Version CAS, identity-pinned approvals, idempotency and atomic audit | No approval bypass reproduced; F06 scaling |
| Executive actions/pages | requireSession actor; executive plus source/kind capabilities | Discriminated lifecycle, assigned decision maker, version CAS and history/audit | F06 scaling |
| SIA actions | requireSession actor and durable SIA budget; current dual-principal/tool access | Strict tool contracts, immutable binding, independent approvals, verification/audit | Deterministic provider only; F06 context cost |
| Communication actions | requireSession actor; resource, creator/agent, policy and consent checks | Immutable previews, idempotency, audited outbox claim and bounded retry | F04-F05; live provider acceptance NOT VERIFIED |
| Integration webhook API | Public by design; registered provider/signature/event validation | Bounded body, durable budgets, replay/fingerprint checks, event/audit transaction | Live provider-specific signatures NOT VERIFIED |
| Health/readiness APIs | Public safe operational probes, not privileged commands | Generic failure/correlation output; readiness DB/latest migration checks | Not backup/provider/full integrity acceptance |
| Private file delivery | No configured delivery endpoint; resolver fails closed | No successful storage/delivery claim | Live object authorization/expiry/download NOT APPLICABLE to disabled implementation |

Idempotency is applied to meaningful commands/events, not asserted for every ordinary configuration edit. Per-action rate limits differ by surface; edge protection is a required deployment boundary, not supplied by every form action. No inspected privileged action relies exclusively on frontend visibility.

## Dependency classification

Local structured lockfile inspection confirmed Next 15.5.27, React 19.3.0 and Prisma client 6.16.2 as runtime packages, and Vitest 4.1.11 plus braces 3.0.3/micromatch 4.0.8/fast-glob 3.3.1/Next ESLint 15.5.27 as development nodes. This verifies installed classification, not current advisories.

DEPENDENCY_SECURITY.md records the previous Vitest advisory remediation and a known unresolved transitive braces lint-chain exception. Current advisory status and the complete production/development inventory were not independently refreshed here. No npm audit command or dependency metadata submission was performed. No current vulnerability count, clean runtime declaration or new directly exploitable package finding is claimed. Runtime reachability of the known lint-chain issue was not found in inspected app paths; hostile CI inputs remain a separate build-risk review. Release-owner exception acceptance is NOT VERIFIED.

## Top 10 risks

1. F03: division-filter permission bypass exposes AIRA program and batch data.
2. F01: an older mutation surface bypasses canonical Person creation authority.
3. F02: restricted task titles/status leak through dependency DTOs and attention.
4. F08: production provisioning, TLS/edge protection, recovery and monitoring have no executed acceptance evidence.
5. F09: current dependency inventory and security exception decisions remain unverified.
6. F04: finite automation can finish while eligible resources are never processed.
7. F06: unbounded reads and repeated lookups can exceed practical SQLite/server capacity at scale; actual load impact is not measured.
8. F07: broad PASS reports conceal missing independent-capability and filtered-path regression coverage.
9. F05: failed job processing produces success feedback that can mislead operators.
10. F10: browser/device/accessibility and deployed identity/origin/cache behavior lack acceptance evidence.

## Production blockers

| Blocker | Why it blocks | Type | Exact remediation needed | Required verification |
|---|---|---|---|---|
| F01 legacy Person gate | Required capability can be bypassed through a reachable authenticated action. | Code | Align both Person creation paths with canonical person.create plus membership authority. | P1 must fail for membership-only actor and succeed only with the correct independent grants; action-level regression and full suite. |
| F02 dependency source disclosure | Restricted work is returned without its source read permission. | Code | Reauthorize both actual task sources before listing or deriving attention. | P2 must expose neither restricted title/status; project/department/company negative cases and authorized positive cases. |
| F03 division-filter override | Untrusted filtering can replace the service's authorization predicate. | Code | Preserve the authorized scope intersection and require program/batch capability on actual requested division. | P3 must remain empty/denied with and without the filter; direct URL/selector tests and sibling scope cases. |
| F08 unaccepted production environment | A local workspace/build cannot establish a durable and securely operated release. | Infrastructure | Provision reviewed single-node persistent SQLite deployment, least-privileged bootstrap/secrets, canonical TLS proxy and edge limits; intentionally apply migrations; configure monitoring and recoverable backups. | Operator evidence for migration status/drift/integrity, HTTPS cookies/origin, alert delivery, backup freshness and restore-to-new-path with stated RPO/RTO. |
| F09 missing dependency release decision | The project's declared launch gate requires a current review and owner decision, which are absent. | Documentation/process | Obtain an approved current inventory or equivalent approved advisory review; assess runtime/build exposure and record owner-approved exceptions. Do not submit prohibited metadata. | Retained current report, explicit scope/date, no unresolved unacceptable runtime issue and signed exception decisions; actual CI gate evidence. |
| F10 pending acceptance | The required manager/device/accessibility and deployed security behavior has not been exercised. | Manual-validation | Execute BROWSER_DEVICE_CHECKLIST.md against the intended release with approved identities. | Retained device/browser/viewport, keyboard/screen-reader/contrast and HTTPS/origin/cache/isolation outcomes; unresolved acceptance failures closed. |

F04/F05 must be remediated and verified before scheduled automation is offered as a complete reliable processing capability. They are not unconditional launch blockers for an explicitly limited internal deployment with scheduled automation disabled and a documented manual process. F06 requires measured capacity acceptance or enforced low-volume limits, not a speculative infrastructure redesign.

Provider blockers are conditional, not core code defects: live email, WhatsApp/TalkinLabs and private document delivery cannot be advertised or enabled as production capabilities until adapters, accounts, scoped credentials, approved provider contracts and sandbox/production acceptance exist. Verification must include exact-recipient approval/consent, provider-specific signed callbacks, duplicate/uncertain-send reconciliation and private-object isolation/expiry. An internal launch that explicitly excludes these capabilities does not require pretending they are implemented.

## Audit coverage

PASS here is bounded to inspected implementation/local evidence and does not override findings elsewhere.

| Area | Status | Evidence / limit |
|---|---|---|
| Root/company/domain separation | FINDING | Coherent canonical model; F01 duplicate authorization boundary |
| Business Graph / ownership separation | FINDING | Explicit records/relationships; legacy Person mutation F01 |
| Customers/revenue/dedicated outcome engine | NOT APPLICABLE | Not implemented in audited scope |
| Canonical 60 roles / distinct agent | PASS | Canonical code/list and existing tests |
| Schema and all 11 migrations | PASS | SQL/schema review and fresh local Prisma chain/drift/integrity validation |
| Local backup/restore | PASS | Isolated validation database snapshot and restore |
| Populated production upgrade / production recovery | NOT VERIFIED | No production database or executed production restore |
| Authentication/session lifecycle | PASS | Source trace and real local security tests; deployment excluded |
| Scoped authorization / filtering / direct action reachability | FINDING | F01-F03 reproduced; route/action source traced |
| Existing company/project negative cases | PASS | Local tests; not exhaustive proof of every route |
| SIA tool authority / approval / confirmation | PASS | All registry tools and server gateways inspected; local tests |
| SIA memory governance and source isolation | PASS | Seven categories, current scope/review/expiry checks and local tests |
| Live AI injection resistance | NOT VERIFIED | Deterministic provider; no live model configured |
| Executive calculations / source access | PASS | Source-aware deterministic projections and regression tests |
| Business execution / dependency confidentiality | FINDING | F02 ordinary DTO/attention disclosure |
| Workflow and approval integrity | PASS | Current identity/policy/version validation and rollback/replay tests |
| Notifications / reminders / UTC recurring work / escalations | PASS | Scoped service implementation and local tests |
| Scheduled communication automation | FINDING | F04 finite scan starvation |
| Communications/outbox/mock safety | FINDING | Core consent/approval/uncertainty safety present; F04-F06 apply |
| Mock webhook verification/replay | PASS | Implementation and local tests; no live provider assertion |
| Live email/WhatsApp/TalkinLabs callbacks and delivery | NOT VERIFIED | Safely unconfigured providers |
| Private storage/download/delivery paths | NOT APPLICABLE | Resolver disabled; no live route configured |
| Server actions/API/frontend/logging source review | FINDING | F01/F03/F05; no arbitrary executor or exposed credential renderer found |
| Test suite | PASS | Fresh 188 tests / 13 files |
| Test completeness / action and filter regressions | FINDING | F07; P1-P4 absent from existing coverage |
| Lint / TypeScript | PASS | Fresh npm run lint and npm run typecheck |
| Production compilation | PASS | Fresh npm run build, Next 15.5.27, exit 0 |
| Prisma schema validation | PASS | Fresh npm run prisma:validate |
| Migration validation | PASS | Fresh npm run validate:migrations |
| Performance query design | FINDING | F06 unbounded reads/repeated checks |
| Production load/concurrency/capacity | NOT VERIFIED | Prior small local fixture is not production evidence |
| Lockfile runtime/dev classification | PASS | Local structured JSON inspection |
| Current complete dependency advisory inventory | NOT VERIFIED | No prohibited npm metadata submission |
| Documentation against code | FINDING | F01-F03 contradict broad source-authority guarantees; historical PASS must be bounded |
| Browser/device/accessibility | NOT VERIFIED | Fresh inventory apps=[], browsers=[]; no visual or assistive-technology acceptance |
| Production TLS/proxy/monitoring/CI/release provenance | NOT VERIFIED | Runbooks inspected; no deployment/remote runner available |

## Validation record and audit boundary

Fresh local commands completed: npm test -- --run (188/13 PASS), npm run lint (PASS), npm run typecheck (PASS), npm run build (PASS), npm run prisma:validate (PASS), npm run validate:migrations (PASS). Reproductions P1-P4 demonstrated defects despite the green suite. No claim of fresh approved npm advisory results, current production security, real provider delivery, browser screenshots or device acceptance is made.

The workspace has no available Git repository/remote audit history; source-history secret scanning and remote CI execution are NOT VERIFIED. An attempt to stop the existing development process before compilation was denied by the environment; no process was killed. The build nevertheless completed successfully. This does not validate the running development server after rebuilding or a production deployment.

Recommended remediation is recorded only. No findings were fixed. No application phase was started. Audit ends here.
