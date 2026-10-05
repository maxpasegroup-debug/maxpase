# MAXPASE OS Remediation Wave 02

Date: 2026-10-04. Scope: F04 automation starvation, F05 misleading command feedback, F06 unsafe collection reads and directly related query costs. Wave 01 remains accepted; its authorization boundaries were regression-tested, not redesigned. No new product phase, provider integration, autonomous SIA authority or production deployment was performed.

## 1. Automation starvation

### Proven root cause

The actual scheduled path is ScheduledJob -> AutomationRule -> processDue -> apply -> AutomationRun -> shared notification/reminder -> audit. There is no separate AutomationExecution model to replace or duplicate.

Before this repair, all three resource scans ordered by ID and selected only the first 25 candidates. There was no persisted continuation. The job incremented its recurrence count after that prefix, could schedule the same prefix again, and could finish SUCCEEDED while later eligible resources were untouched. Nonmatching/unreadable heads could also crowd out later work. Historical audit reproduction P4 used 26 eligible overdue tasks and two due runs: both processed 25; distinct notified resources remained 25 and the tail was never notified. This is retained evidence from the independent audit, not a new pre-fix execution claim.

### Correction

- Retain 25 candidates per page, with a 26th lookahead; persist the last **scanned** ID, not just the last successful ID.
- Persist scanStartedAt and scanRuleVersion alongside scanCursor. Creation/due cutoffs keep each occurrence finite. This is a scan boundary, not an immutable snapshot of all resource attributes; current state and authority are revalidated.
- Return PENDING until the occurrence is exhausted. Increment runs once per complete occurrence, not once per page; retain finite maxRuns and maxAttempts.
- Order due jobs by nextRunAt and ID. Continuation moves nextRunAt to the current clock so other older due jobs can be considered.
- Preflight current processor access, owner/source/action authority and recipient validity. Ineligible/unreadable candidates advance the cursor and return an explicit skipped count without creating an output.
- Preserve unique run references/fingerprints for job, occurrence, rule version and resource; continuation/retry uses the persisted occurrence timestamp.
- Claim with version CAS. A stale competing scan cannot rewind state or falsely record another processor's completion as its own failure.
- Commit page outputs, rate counters, run results, cursor and audit together. A failed page rolls back all of them; separately audited bounded retry state remains explicit. A failed job does not stop the loop over later jobs.
- If a rule changes during continuation, fail/retry finitely rather than silently apply a different policy to the unfinished occurrence. The owner must review/replace the job.

The three permitted automation actions remain in-app notification, shared reminder and attention flag. The existing organization rate limit remains 25 actions/minute. Continuations may therefore need a later processing call; there is no background daemon. SIA actions, external sends and arbitrary scripts were not added to the allowlist.

### Verification

Real-Prisma regressions cover 60 overdue tasks across 25/25/10 outputs, a service restart, persisted cursor/cutoff/version, one completed recurrence and no duplicate reprocessing. Additional cases cover nonmatching heads, completed sources, unreadable first-page sources followed by a project-authorized tail, failed-job isolation and bounded retries, page/audit rollback, concurrent scans, processor/company isolation, source revocation and rejected high-impact action keys.

Already-completed legacy jobs are not automatically reopened. Existing historical omissions require owner review and deliberate rescheduling; silently replaying old work would violate the existing execution boundary.

## 2. Misleading success feedback

### Proven root cause and affected flows

The communication server action discarded processDue job failure results and returned ok:true/Saved. Delivery commands likewise ignored their persisted result; confirmation could be described as saved without distinguishing queuing, and mixed delivery batches counted only authorization blocking as failure. The form renders the returned action state, so the semantic mismatch was at the command boundary, not a missing provider integration.

### Correction

The reusable feedback helper maps the actual backend result to an explicit outcome and safe message. Existing successful configuration mutations still say Saved. Result-producing commands now consume their service results instead of falling through to generic success.

| Backend result | User-facing meaning |
|---|---|
| APPROVAL_REQUIRED | Preview prepared; independent human approval and confirmation remain required; nothing sent. |
| QUEUED/PENDING | Processing is pending/incomplete, not delivered or a complete scan. |
| SIMULATED | Test result; no real provider delivery. |
| ACCEPTED/SENT | Provider acceptance/send does not prove recipient delivery; batches remain pending verification. |
| DELIVERED | Provider-confirmed delivery only when that is the actual backend status. |
| NOT_CONFIGURED | Configuration was saved, but real provider delivery is unavailable. |
| FAILED/REJECTED/BLOCKED | Failed/rejected/unauthorized operation, not successful delivery. |
| UNKNOWN | Delivery uncertainty; reconcile rather than blindly retry. |
| Mixed failures/results | PARTIAL with status counts, simulation and uncertainty qualifiers. |
| No due records | NO_WORK, not invented completed work. |

The existing ok flag controls status versus alert presentation; it does not assert recipient delivery. Catch paths explicitly return BLOCKED or FAILED and sanitized feedback, never Saved. Provider exceptions and database diagnostics are not shown to the user. Approval, consent, sender, confirmation and outbox/reconciliation boundaries are unchanged.

### Verification

Action-level tests mock only Next session/cache plumbing and delegate to real Prisma services. They verify saved and unconfigured integrations, preview/approval/queue, actual mock SIMULATED persistence, FAILED persistence, UNKNOWN persistence/non-retry, a mixed simulated/uncertain batch, forged actor rejection, permission rejection and a trigger-induced transaction rollback with no inserted integration. The automation action is also tested against a real failed/succeeded job batch. Backend rows and feedback outcomes are asserted together; tests are not tied to every word of UI copy.

## 3. Unbounded queries and pagination

### Proven root cause

Execution/AIRA lists, operations lists, communication workspace collections, executive records/events/history and SIA graph/context sources retrieved unrestricted collections. Communication DTO slicing happened only after retrieval. Activity resolved its event once per audit row; project progress repeatedly fetched task collections per parent. A narrow SIA tool still builds broad authorized executive/graph context.

### Query classification and protection

| Query class | Correction |
|---|---|
| Execution projects/tasks/goals/milestones/members/dependencies | SQL ID-range paging inside existing authorized predicates. Default 50, maximum 100, plus one lookahead. Dependency filters retain task.read on both endpoints. |
| AIRA programs/batches | SQL ID-range paging; authorized organization IDs remain combined with division filters using AND. Batch program labels retain independent program.read. |
| Operations, wrapped blockers/responsibilities and remaining AIRA lists | Bounded complete candidate read, existing source/recipient authorization, then ID-range result paging. No pre-authorization DTO slice can hide an accessible later record. |
| Communications lists | SQL capacity bounds on every reviewed collection; current thread/source/participant checks precede paging. Messages, threads, integrations, templates, policies, consent, rules, jobs and webhook events have view-specific cursors. Delivery pages first select outbound records. Overview totals are computed from the full bounded authorized dataset, not the page. |
| Executive complete datasets | Bounded complete reads of sources, records, events, structural changes, memberships, selectors and progress history. Oversized input raises a capacity error, not a truncated total, NO_DATA or false healthy state. |
| Workflow/executive/recurring history | Separate bounded collection-wide history/run reads and parent grouping, avoiding a large per-parent history fanout. Single-record SIA decision history also has a sentinel bound. |
| Project/milestone/goal progress | Request-local batched SQL status aggregation and milestone reads. Preserve cancelled-task exclusion, completed milestone behavior, equal milestone weighting, manual progress and missing-data nulls. Achievement validation uses SQL counts/grouping rather than materializing nested task collections. |
| Activity event attribution | One audit-ID event batch and request-local map instead of one findUnique per audit row. Scope/source handling is unchanged. |
| SIA memory | At most 5,000 candidate authorizations; 100-candidate pages plus one lookahead; at most 100 authorized results. Exact budget exhaustion with no further candidate returns normally. More candidates fail explicitly rather than silently hiding later authorized memory. |
| Other SIA context/graph/workforce/business source lists | Shared complete-read guards, not authorization truncation. Existing small run/action/memory UI limits remain bounded. |
| Reference/selector data | Complete reads remain complete within the same guard. Controlled workflow/policy definitions and permission dictionaries are not converted into partial configuration pages. Nested membership/role/permission collection reads also have sentinel bounds where used by the reviewed sources. |

READ_BUDGET is 5,000 **per complete collection**, with a SQL 5,001-row sentinel. Any overflow aborts the result. The dedicated QueryBudgetError is not an AccessError, so existing source-denial filtering cannot swallow capacity failures. History reads use a collection-wide limit, not 5,000 histories for every parent. SQL counts are aggregation-only; grouped status outputs are checked for completeness as well.

This is an enforced low-volume safety boundary, not enterprise-scale capacity acceptance. Supplemental selectors, aggregate sources or histories can refuse an oversized workspace even though a primary list API can page a larger collection. Some aggregate filters are applied after authorized source retrieval; the guard therefore applies to the candidate source collection, not only the final filtered total. A refused result must not be interpreted as an empty dataset. Larger-volume support requires measured capacity work, not removal of the guard.

Paged views use deterministic immutable-ID order. Legacy complete-read sort orders remain intact. A cursor is only a range filter inside the freshly authorized dataset, not authority and not a cross-request snapshot. Revocation is re-evaluated on every page. Concurrent new records below a cursor require returning to the first page; no frozen-dataset traversal is claimed.

The shared First/Next navigation preserves filters, resets cursors when filter forms are submitted, and never exposes an unrestricted cursor lookup. Communication revision links retain their current filter/cursor position so an older selected preview is not lost during revision navigation. These are source/build validations, not browser-click evidence.

### Verification

Regressions traverse 205 tied tasks without duplication, 61 dependencies, 62 independent AIRA programs/batches, 65 recipient-filtered notifications and 65 authorized communication threads. They recheck company/division isolation, source revocation and independent batch/program reads on later pages. Executive overdue totals remain 205 rather than the 50-row page size; foreign data is excluded. A 5,001-task fixture verifies SQL page bounds, traversal past the complete-read budget and explicit aggregate refusal. SQL query events verify the activity batch and bounded task retrieval. Twenty project progress results require at most two task SELECTs and preserve weighted milestone progress and read revocation. SIA tests cover unreadable prefixes, accessible later memory, 5,001-candidate refusal and exactly 5,000-candidate completion. An AST regression requires every top-level findMany in the ten reviewed modules to declare take.

## 4. Directly related changes and safety preservation

- Additional result-producing communication commands use the same accurate feedback model; unrelated successful saves were not blindly relabeled.
- Related graph/workforce/business source lists and cycle-validation collection reads use complete-read guards; overflow cannot silently make a graph/cycle/assignment validation incomplete.
- History fanout, per-project progress reads and per-audit event lookups were corrected in the affected paths. Current source/approver checks remain intentional; no global authorization cache or performance rewrite was introduced.
- No permission registry, authorization engine, locked AIRA roles, business hierarchy, SIA tool registry, live provider adapter or approval/executor architecture was changed.
- Wave 01 person.create, both dependency source reads, responsibility task-label protection, division filter intersection and independent batch/program-label guards remain intact.
- The existing suite continues to test SIA approval/confirmation, human/agent permission intersection, immutable previews, consent, cross-company isolation and denied replay. Passing service/action tests are not complete deployed security acceptance.

## 5. Database and validation

Three nullable ScheduledJob fields are necessary because the existing model has no durable scan-progress state. AutomationRun records only executed outputs; deriving a cursor from successful runs cannot advance over ineligible heads or preserve occurrence cutoff/rule identity. The additive migration `20261004230000_wave_02_scan_progress` adds only scanCursor, scanStartedAt and scanRuleVersion. No destructive SQL, reseed or reset was used. Readiness now requires the new latest migration.

Before development deployment, a consistent integrity-checked snapshot was created at `%TEMP%/maxpase-wave02-before-migration-20261004.db`. This contains local business data and requires secure operator retention. After deployment, every pre-migration business column was compared exactly against that snapshot across 70 tables; all matched. Development foreign keys/integrity and schema drift also passed. No production database was accessed.

| Validation | Status | Evidence |
|---|---|---|
| Complete tests | PASS | npm test: 220 tests across 15 files. All 198 existing tests remain; 22 Wave 02 scenarios added. Final complete run: 94.49 seconds. |
| Wave 02 automation/feedback/query regressions | PASS | All 22 included in the final complete run. |
| Wave 01 authorization regressions | PASS | All 10 included in the final complete run. |
| Final focused Wave 01/02 run | PASS | npx vitest run tests/remediation-wave-02.test.ts tests/remediation-wave-01.test.ts --no-file-parallelism --testTimeout=30000: 32 tests across 2 files, 23.47 seconds. |
| Lint | PASS | npm run lint on final source. |
| TypeScript | PASS | npm run typecheck on final source. |
| Production build | PASS | npm run build, Next 15.5.27; compilation, types, static generation and traces complete. Not a deployment. |
| Prisma validation | PASS | npm run prisma:validate. |
| Prisma generation | PASS | npm run prisma:generate, Prisma 6.16.2. A repeated generation attempt hit a Windows DLL lock during concurrent validation; regeneration succeeded after those processes finished. |
| Fresh migrations | PASS | npm run validate:migrations: all 12 migrations, repeated deploy/status, zero drift, integrity/foreign keys and isolated snapshot/restore. |
| Development migrations | PASS | Snapshot, additive migrate deploy, migrate status up to date, zero schema drift, integrity/foreign keys and exact pre-existing business-data preservation. |
| Local dev restoration/HTTP smoke | PASS | Hidden dev server restored on 127.0.0.1:3000, parent PID 56456. GET /api/health, /api/ready and /login returned HTTP 200. Readiness is the existing local check, not production acceptance. |
| Browser/device/accessibility/deployed proxy acceptance | NOT RUN | No browser screenshots, device tests, screen-reader acceptance or deployed cross-user cache/origin checks claimed. |
| Production migrations/deployment/provider delivery | NOT RUN | No production access; live email/WhatsApp/TalkinLabs/private attachments and autonomous high-impact SIA remain disabled/unconfigured. |
| Production load/SLO and current external dependency inventory | NOT RUN | Fixture query bounds are not production load evidence. No npm audit/private metadata submission. |

Early regression failures exposed fixture omissions (required references, approval comments, the canonical AIRA parent link and a milestone enum) and an insufficient organization-visibility grant in a filter test. Fixtures were corrected; application authorization/validation and all pre-existing tests were not weakened. Final runs passed.

## 6. Remaining audit findings

| Finding | Remaining state |
|---|---|
| F04 | Repaired for active/new scheduled scans; owner review remains necessary for historical jobs already marked completed by the old scanner. |
| F05 | Repaired at the affected command boundary and directly related result-producing flows. Browser presentation acceptance remains part of F10. |
| F06 | Concrete unbounded-read patterns protected and two material N+1 patterns plus history fanout corrected. Production capacity/freshness/SLO acceptance and broad SIA context cost remain NOT VERIFIED; source authorization is still checked per record where required. |
| F07 | Original sparse-capability and >25-resource regression gaps addressed by Waves 01/02. Deployed endpoint/proxy/E2E coverage remains open. |
| F08 | OPEN: production persistent storage, least-privileged provisioning, TLS/edge quotas, monitoring and production restore acceptance. |
| F09 | OPEN: approved current vulnerability inventory and release-owner exception decisions. |
| F10 | OPEN: browser/device/accessibility and deployed identity/origin/cache acceptance. |

Production status: **NOT PRODUCTION READY**. No claim that the entire independent audit is resolved. Stop after Wave 02; do not start Wave 03 or enable production providers.

## 7. Changed files

23 retained source/documentation/migration files (6 added, 17 modified). Generated Prisma/Next/TypeScript outputs and the intentionally migrated local development database are excluded from this source inventory. The temporary mechanical-edit helper was removed. No Git diff/commit evidence is claimed for this workspace.

- prisma/schema.prisma
- prisma/migrations/20261004230000_wave_02_scan_progress/migration.sql
- src/app/api/ready/route.ts
- src/server/communications/automation.ts
- src/server/communications/feedback.ts
- src/server/communications/service.ts
- src/app/app/communications/actions.ts
- src/app/app/communications/page.tsx
- src/server/domain/query-bounds.ts
- src/server/domain/execution-service.ts
- src/server/domain/operations-service.ts
- src/server/domain/aira-service.ts
- src/server/domain/executive-service.ts
- src/server/domain/workforce-service.ts
- src/server/domain/business-service.ts
- src/server/sia/context.ts
- src/server/sia/service.ts
- src/app/app/pagination.tsx
- src/app/app/execution/[kind]/page.tsx
- src/app/app/operations/[kind]/page.tsx
- src/app/app/aira/[kind]/page.tsx
- tests/remediation-wave-02.test.ts
- docs/audit/REMEDIATION_WAVE_02.md
