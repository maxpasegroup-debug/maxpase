# F06 SIA Context Scalability Remediation

Date: 2026-10-05. Scope: one surgical remediation of the confirmed upstream SIA hierarchy/authorization materialization blocker. Local remediation: **PASS**. Production status: **NOT PRODUCTION READY**.

## 1. Original Finding

The final independent re-audit correctly distinguished bounded returned context from unbounded upstream input. A one-task context succeeded, then failed after adding 5,001 unrelated organizations. Final JSON/1MiB guards cannot prevent earlier global hierarchy traversal, nested authorization includes or interactive-transaction expiry.

Historical audit reports remain unchanged. This report documents code remediation, not a new audit, product phase or production acceptance.

## 2. Reproduction

Created tests/f06-context-scalability.test.ts against a NEW temporary SQLite database with all 12 real migrations. Business resources are deliberately small: one relevant company/project/task, one unrelated company, active human membership/role, active scoped agent assignment, and enabled get_tasks. The permission recipe uses the same broad non-global scoped capability set as the historical reproduction; it is a minimum-resource fixture, not a claim of minimum permission count. No development/production business database or provider is used. Fixtures disconnect and remove only their generated temporary directory.

Before implementation, executed:

`npx --no-install vitest run tests/f06-context-scalability.test.ts -t "5001 unrelated" --testTimeout=120000`

The small context completed; adding 5,001 unrelated COMPANY organizations then reproduced **P2028** at execution-service.ts's project findMany. The whole failing build call took **44,753.31 ms**, with **66 query events before abort**. Prisma reported the existing **5,000 ms** interactive transaction had elapsed **15,361 ms**. The large fixture then contained 5,003 organizations; the relevant task/project/grants were unchanged. The original code loaded all organization hierarchy nodes, although only one company was authorized. The test timeout permits observing the original failure; it is NOT a runtime transaction timeout change.

The pre-change small call's query/duration metrics were measured internally but not retained in its failure output; they are not invented here. Earlier audit's standalone-task numbers are historical, not substituted for an identical project-fixture baseline.

## 3. Root Cause

createAccessContext read the entire Organization table before resolving effective scope. Human grant loading included User -> Person -> Memberships -> Roles -> Permissions with full credential/profile/organization/project fields and no combined relation budget. Agent loading likewise expanded assignments/roles/permissions.

The agent intersection loop repeatedly evaluated each capability against every global node using ancestry's linear array searches and grant scans. This synchronous JavaScript work exhausted the execution-list transaction before its next project query. The query named in P2028 was where the expired transaction was detected, not proof that the project SELECT itself was the slow root cause. Business Graph then independently loaded the global hierarchy again and applied a 5,000-row guard to unrelated reference growth.

Narrow get_tasks also assembled a full executive portfolio and Business Graph before limiting facts. Parent role/member/request/instance includes multiplied nested rows before output limits.

## 4. Affected Path

SIA preview/converse -> toolAuthority -> human/agent createAccessContext -> executive/execution/operations reads -> business/workforce graph -> governed memory -> final authority check -> result/output guard. Generic approval inspection and recipient validation also reach authorization/hierarchy helpers and must not restore a global-scan back door.

## 5. Remediation

- Added authorization/reads.ts with bounded selected authority reads and grant-anchor/ancestor/descendant traversal. Hierarchy SQL uses explicit id/parentId predicates and 250-ID parameter batches, not an unrestricted Organization dump. Descendants are traversed only for explicit descendant/global authority inside the requested SIA scope; project selections do not expand organization descendants.
- Replaced human nested collections with active membership, membership-role and role-permission batches filtered by the actual principal and candidate IDs. Only required identity/status/scope/provenance fields are selected; password hashes and contact/profile payloads are not grant-computation inputs.
- Agent assignment/permission loading is active-identity/AGENT-role/org-compatible and restricted to candidate hierarchy IDs. GLOBAL agent permissions remain excluded. The generic tool inspector now reads only the target ancestry and scoped agent batches, not all organizations or nested identity includes.
- Added a combined authority-row budget using existing READ_BUDGET=5,000 and sentinel reads. Derived grant multiplication/intersection is capped incrementally before building an oversized cross-product. Overflow fails explicitly; grants are never truncated and reported as complete authority.
- Added request-local indexed structural ancestry and capability-ID reuse. No database authority is cached across requests. Every new service context and initial/final toolAuthority reloads current lifecycle/grants.
- Business Graph reuses the access context's hierarchy instead of a second global hierarchy read.
- get_tasks now reads the existing source-authorized task list, checks executive visibility once per identical actual org/project scope, retrieves only those tasks' independently readable organization/project endpoints, and retains governed memory. It no longer loads unrelated goals, operational portfolios, roles or the complete Business Graph just to report tasks.
- Other read tools retain the executive/graph contract. Role permissions, membership roles, request approval chains and instance transitions are retrieved in collection-wide bounded batches and grouped onto the existing DTOs; no per-parent 5,000-child expansion. Executive people eligibility restricts membership discovery to current hierarchy anchors rather than unrelated memberships of visible people.
- AIRA actual target-company validation now resolves the actual company independently of the reduced metadata snapshot, followed by its unchanged required capability check. This preserves the existing distinction between an unauthorized internal target and a foreign-company target. Division/domain-ID intersections and label redaction are untouched.

## 6. Authorization Implications

**PASS:** all existing tests retained, including Wave01/02/03 and SIA/communications security regressions. User identity, active dated memberships, active/correct human and agent roles, explicit capabilities, real resource organization/project relationships, inactive/cyclic ancestor refusal, project-only grants, delegation and company isolation remain server-side.

The optional requested-scope window is an additional restriction, not an authorization grant. A broader human role cannot widen agent/requested scope. Ownership/title/graph edges remain non-authoritative. No model or stored memory can supply permissions.

Task parent labels require their own project/organization read; nested inaccessible tasks/goals are omitted/denied even when a project is readable. Memory source headers/authority are still checked per reference; recent-history reuse does not cache source authority. Final grant-signature/tool checks remain. Independent approval, explicit human confirmation, immutable tool risk, requester/version/fingerprint binding, transactional execution verification/audit and high-impact autonomous prohibition are unchanged.

No providers or tools were enabled in the real application database. Test-only registrations live solely in disposable fixtures.

## 7. Transactions

No timeout/maxWait/transactionOptions padding was added. The default transaction timeout remains unchanged.

Complete SIA assembly already runs outside a single encompassing transaction and still does. Existing execution/operations/workforce read transactions retain authorization-plus-source consistency within each list operation. They no longer contain a global unrelated hierarchy intersection. Mutation/approval/output/audit transactions were not removed or weakened.

The narrow task read is one bounded list operation; endpoint/memory reads and final reauthorization occur outside it. There is no claim of an atomic whole-dashboard snapshot. Structural/same-scope reuse is limited to the current read/context; current authority is reloaded at consumption/final checks.

## 8. Query And Context Boundaries

These are documented low-volume operational safety budgets, not invented business limits or enterprise guarantees. READ_BUDGET existed before this repair. Sentinel overflow is an explicit capacity failure, never a successful partial metric, partial grant or falsely empty result. The 250-ID batching value controls SQL parameter grouping only: all authorized batches are traversed within the complete-read budget.

| Context type | Authorized scope | Primary query | Nested queries | Maximum intended expansion | Enforcement point / fallback |
| --- | --- | --- | --- | --- | --- |
| Human authority | Actual active principal and requested SIA window | Selected User/Person lifecycle, principal-filtered Membership | MembershipRole and RolePermission by candidate IDs; anchor ancestry | Combined5,000 authority rows and <=5,000 derived grants; sentinel | Before nested collection expansion; current dates/role/type/scope/active ancestry; overflow QueryBudgetError, no truncated grants |
| Agent authority | Active SIA plus human candidate anchors/requested scope | Selected SiaIdentity, org-filtered SiaRoleAssignment | RolePermission by valid active compatible AGENT role IDs | Same combined authority budget; <=5,000 intersection grants | Human/agent intersection before sources; GLOBAL excluded; overflow explicit |
| Organization | Grant anchors, ancestors and explicitly permitted requested descendants | Organization WHERE id IN or parentId IN | Iterative ancestor/descendant frontiers, indexed paths | Within combined authority row budget; visited sets prevent cycles | Active ancestry and capability before domain projections; missing/cyclic/inactive denied, overflow explicit |
| Company | Actual nearest company and scoped company-read | Scoped organization/company IDs | Actual ancestry/typed company relationships | Bounded5,000 primary rows; no unrelated global reference dump | Existing company/executive/source intersection; unknown remains unknown |
| Narrow task | Current user/agent task.read + executive.read, selected project if any | Existing execution task list, SQL scoped | Related Project/Organization selected endpoints; executive check per distinct scope | <=5,000 complete task candidates; <=5,000 endpoint rows/query | Source predicates before materialization; independently readable labels only; overflow error, final facts<=200 |
| Project | Authorized actual project IDs/scopes | Existing scoped project list | Batched task/milestone status progress and source checks | <=5,000 per complete source/group collection | Existing project/task/milestone/executive permissions; no hidden-source totals or partial metrics |
| Goal | Current goal/executive scope | Existing scoped goal list | Batched progress/supporting source/history reads | <=5,000 per complete source/history/group collection | Existing method/source/capability checks; unknown/null preserved, overflow explicit |
| Executive | Requested human/agent scope, source-specific reads | Scoped execution/operational/record/event collections | Source resolution and bounded histories/options | Existing5,000 per complete collection; fixed query families, not global DB-size expansion | Source authorization before metrics; totals are full bounded sources, not display-page counts |
| Operational | Actual wrapped resource and workflow/request/recipient capabilities | Scoped requests/approvals/instances/reminders/escalations/notifications | Request approvals and distinct-definition transitions now collection-wide batches; histories already grouped | <=5,000 parents and <=5,000 combined children per relation query, not5,000 children per parent | Existing resource/stage/recipient policy; no silent failure or false success |
| Business Graph | Current requested capability intersection | Scoped organization/brand/product/role/member/responsibility/ownership lists | Role permissions/member roles now collection-wide batches | <=5,000 per primary/combined child collection; final500 nodes/1,000 edges | Existing source/readable endpoint checks; narrow tasks do not materialize this full portfolio |
| Memory | APPROVED non-legacy/current review/expiry plus user/agent source scope | SiaContext take101/process100 pages | Canonical source checks; request-local history reuse only | Scan<=5,000, result<=100; combined memory1MiB | Source scope/capability per reference; access denials omitted, capacity failures not swallowed |
| Decision | Current decision/executive scope | Selected canonical ExecutiveRecord header/payload | Latest51 history sentinel, return50 chronologically; repeated headers revalidated |100 visible memory refs,50 history rows/source; byte guard retained | Identity redaction/source authorization; truncation explicitly disclosed, full authorized audit remains elsewhere |

Output limits remain: facts200, signals100, recommendations10, approvals/decisions100, graph500 nodes/1,000 edges, briefing100/list, memory100 and recent decision history50/source, with final/memory1MiB refusal. Narrow task context explains that it is not the complete executive/Business Graph portfolio. No context limit is misrepresented as a token or exact heap bound.

## 9. Indexes And Migrations

**PASS - no schema/index/migration changes required.** Corrected patterns use existing Organization primary key/parentId index, Membership principal-leading unique/index access, membership-role/role-permission compound keys and SIA assignment uniqueness. The bottleneck was global materialization/traversal, not evidence of a missing index. No speculative indexes, database conversion or distributed infrastructure were added.

All12 existing migrations and readiness checksums remain unchanged; migration/restore validation passed.

## 10. Regression Tests

Nine grouped focused tests:

1. Small company/project/task context returns the actual task.
2. Same context after5,001 unrelated organizations succeeds, retains constant query count and one-node scoped hierarchy; Organization reads carry WHERE predicates.
3. Foreign company, missing nested task/goal reads and unreadable project labels are denied/excluded, including the broader project tool.
4. Project-only membership exposes ProjectA work and rejects ProjectB/sibling context.
5. Final byte budget and current role revocation remain enforced.
6. All17 registered read tools exercise organization/company/project/task/goal/executive/operational/graph/memory/decision query families after unrelated hierarchy growth, with no foreign output and bounded returned bytes.
7.5,001 added principal permissions produce explicit bounded-authority failure through a single limited RolePermission query; no passwordHash is queried for authority.
8. Inactive and cyclic ancestry cannot authorize context.
9.5,001 foreign agent roles/assignments do not expand the narrow context/hierarchy or materially increase query count.

Existing Wave03 tests retain300 scoped/6,000 foreign-task isolation, one task collection, selected project,100 memory references with100 source header checks/one recent-history read, disclosed truncation and oversized memory failure. Wave01/02 tests preserve original authorization fixes, cursor continuation, no duplicates, truthful feedback, complete aggregates and rollback. No existing test was weakened/deleted.

## 11. Performance Evidence

Final targeted run: nine tests PASS,10.01 seconds. One serial small/large sample in that run, not a production benchmark; local toolchain activity may affect timings. Query-event BEGIN-to-COMMIT intervals are observational application-side intervals, not independently instrumented engine transaction percentiles.

| Scenario | Query events | Whole context ms | Longest observed read-transaction interval ms | Result |
| --- | --- | --- | --- | --- |
| Before repair, small fixture | Not retained in failure output | Not retained | Not retained | Succeeded before growth |
| Before repair, +5,001 unrelated organizations |66 before abort, not a completed-request count |44,753.31 | Prisma error reported15,361 elapsed against5,000 timeout | P2028 failure reproduced |
| After repair, small fixture |87 |75.22 |11.35 | PASS;1,127 response bytes |
| After repair, +5,001 unrelated organizations |87 |61.13 |13.15 | PASS; same relevant task, no foreign graph materialization |

An earlier post-fix targeted run measured87/87 queries,76.72/54.71 ms and11.38/12.58 ms transaction intervals. Timing differences are normal local sample variation; no percentile, formal O(1), token count/cost or production latency claim is made. The key result is zero query-count growth and one materialized authorized hierarchy node when unrelated Organization cardinality grows by5,001. The pre-failure66 queries cannot be compared as a completed-query efficiency improvement against87 successful queries.

Source work still depends on relevant grant/ancestor depth, authorized descendant volume, actual requested entities, governed memory and canonical source checks. Broad portfolios can legitimately cost more than narrow tasks; removing required source checks was not the optimization.

## 12. Validation Gate

| Check | Status | Result |
| --- | --- | --- |
| Complete suite | PASS |242 tests across17 files;117.23 seconds; all233 existing tests plus9 focused cases |
| F06 targeted | PASS |9/9 final targeted run;10.01 seconds |
| AIRA + Wave01 + F06 targeted | PASS |35 tests across3 files,15.98 seconds; actual predicates and rollback preserved |
| Wave03 + F06 intermediate targeted | PASS |18 tests:13 Wave03 plus5 F06 cases at that development point; final count above supersedes this run |
| Lint | PASS |Final npm run lint exit0 |
| TypeScript | PASS |Final npm run typecheck exit0 |
| Production build | PASS |Next15.5.27 optimized build/routes/traces; application source unchanged afterward |
| Prisma validation | PASS |Existing schema valid |
| Prisma generation | PASS |Client6.16.2 generated successfully after test/build clients finished |
| Migration/restore | PASS |Fresh/repeat12-migration chain, schema drift, integrity/FKs and isolated local snapshot/restore |
| Local HTTP smoke | PASS |Health/readiness, safe headers, login, missing/forged-session redirects and oversized webhook rejection; not deployed E2E |
| Provider activation/autonomous execution | NOT RUN |Intentionally prohibited; no adapter, registry risk, approval/confirmation or runtime tool activation changes |
| Production deployment/load/SLO/token-cost | NOT VERIFIED |Not accessed or measured; no production-readiness claim |
| Browser/device acceptance | MANUAL VALIDATION |NOT RUN as requested; no browser/device acceptance or new audit performed |
| External advisory/clean production artifact acceptance | NOT VERIFIED |No package/lock change, npm audit or metadata submission |

Development checks initially exposed widened PermissionScope types, which were corrected with proper PermissionGrant/literal typing. The first complete run had one AIRA denial-message compatibility failure (240/241 pass at that point); actual-company resolution fixed it without granting access or modifying that test. An initial Prisma generation attempt collided with a concurrently held Windows test DLL and failed EPERM; retry after clients finished passed. These failures are not hidden or substituted for final PASS.

## 13. Remaining Limitations And Production Prerequisites

The tested5,001-unrelated-organization timeout is eliminated. Scope-first selected authority reads and combined child batches do not certify unlimited relevant portfolios or an exact process heap budget.5,000-row refusal boundaries remain intentional supported-capacity guards. Very large authorized/global discovery scopes, deep relevant ancestry, high principal cardinality, large stored legacy payloads and substantial per-source operational validation still need representative capacity acceptance. A deliberate unrestricted GLOBAL discovery can enumerate the authorized universe within its explicit budget; it is not used as the narrow SIA context entry path.

No whole-context distributed/atomic snapshot or stale cross-request permission cache was introduced. Broad context source validation remains real work, and some per-record canonical checks intentionally remain. Token/model costs are NOT VERIFIED; bytes are not tokens. The correction does not automatically prove production SLOs or every future module's scalability.

Production monitoring/paging, persistent-volume/TLS/edge/secret configuration, clean dependency artifact/fresh approved advisory acceptance, backup/restore/rollback/rotation evidence, actual deployed E2E, browser/device/accessibility acceptance and historical automation owner decisions remain separate prerequisites. Live providers/private delivery remain deliberately unconfigured; this remediation authorizes no activation. No production deployment or automatic follow-up audit was started.

## Files Changed

New: src/server/authorization/reads.ts; tests/f06-context-scalability.test.ts; this report.

Modified authority: src/server/authorization/business-scope.ts, engine.ts, service.ts.

Modified SIA: src/server/sia/access.ts, context.ts, service.ts.

Modified directly affected shared reads/consumers: src/server/domain/business-service.ts, workforce-service.ts, executive-service.ts, operations-service.ts, operations-scope.ts, aira-service.ts.

Updated current architecture: docs/architecture/ARCHITECTURE.md and SIA_ARCHITECTURE.md. Historical audit reports/measurements were not overwritten. No schema/migration/package/lock/provider adapter/tool-registry/UI/auth-session/automation/feedback/runtime-timeout changes.

The existing hidden localhost-only development server was restored at http://127.0.0.1:3000 after validation. This is local developer service restoration, not deployment.

## Explicit Stop Answer

**Does the F06 code remediation fully eliminate the previously reproduced 5,001-unrelated-organization timeout under the tested local fixture? YES.**

**Production status: NOT PRODUCTION READY. STOP: surgical F06 remediation and report only.**
