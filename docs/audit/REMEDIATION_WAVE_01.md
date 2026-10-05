# MAXPASE OS Remediation Wave 01

Date: 2026-10-04. Scope: the three HIGH authorization defects from the independent audit, plus two directly related source-label disclosures. Status: **PASS - scoped remediation and local validation complete**.

The original audit remains an unchanged historical record. This wave does not declare production readiness. No architecture redesign, new feature domain, schema change, permission broadening, provider enablement, SIA/communications architecture change or subsequent remediation wave was performed.

## 1. Finding 01 - Person creation

**PASS**

Root cause: the legacy Business Graph people mutation required membership.manage but omitted person.create, while the canonical workforce mutation required both. A membership manager could choose the older action to bypass the Person capability.

Boundary repaired: src/server/domain/business-service.ts now checks person.create on the actual organization, using its existing centralized-grant-backed access mechanism, before inserting Person or Membership. Existing membership.manage remains mandatory. The workforce boundary is unchanged. No role title or broad administrator exception was introduced. The checks and successful mutation/audit still occur inside the existing transaction.

Creation-path inventory:

| Path | Treatment |
|---|---|
| Business Graph service / saveBusinessAction / legacy form | Missing scoped person.create gate repaired at the service mutation boundary; trusted actor still comes from requireSession. |
| Workforce service / saveWorkforceAction / workforce form | Existing scoped person.create plus membership.manage gate retained. |
| AIRA people facade | Reuses workforce.list for reads; no separate Person creation mutation added. |
| Account, task, participant and communication services | Reference existing Person records; no additional Person creation path found in the targeted search. |
| API routes | No public Person creation API found; existing routes do not add a Person mutation path. |
| prisma/seed.ts | Explicit trusted development bootstrap, blocked when NODE_ENV=production; unchanged and not run in this wave. |
| Test fixtures / offline utilities | Trusted setup, not remotely callable authorization surfaces; runtime security tests invoke actual services. |

Tests added in tests/remediation-wave-01.test.ts:

- Both services create legitimate scoped people with person.create and membership.manage, with a membership and trusted success audit.
- Membership-only, unrelated company-read and Person-only grants are denied; Person, Membership and AuditEvent counts do not change.
- Cross-company, sibling-division and project-only creation attempts are denied.
- Direct invocation of the actual legacy server action ignores a crafted actorUserId as authority; a denied session actor cannot create, while a correctly authorized actor can.

The action test mocks only Next request/cache plumbing and redirects the exported service instance to the isolated real-Prisma service. It does not mock the permission engine or mutation checks. It proves action-to-service/trusted-actor wiring, not a deployed HTTP session or CSRF exchange.

Audit behavior: successful Person and membership audits remain atomic. The existing Person service authorization failure behavior throws before mutation; it does not require a separate persisted denial event. That behavior was retained rather than adding a parallel audit mechanism or false success audit.

Files changed: src/server/domain/business-service.ts; tests/remediation-wave-01.test.ts; tests/business.test.ts. The old Business Graph fixture now creates its intended Person through explicit fixture setup, instead of expanding its administrator grants just to satisfy setup.

Verification: the membership-only actor corresponding to audit proof P1 is denied at both lower-level services and at the real action wiring. No unauthorized Person or Membership is created.

## 2. Finding 02 - Dependency task disclosure

**PASS**

Root cause: the dependency query scoped relationships using dependency.read but included source task titles and prerequisite title/status without independently applying task.read.

Boundary repaired: src/server/domain/execution-service.ts intersects the existing dependency scope with current task.read organization/project grants for both endpoints in the Prisma query. Filtering by source title occurs within that authorized query. A relationship whose endpoint is not readable is omitted, matching the existing source-filtered executive semantics; no new placeholder object or privacy model was introduced.

Returned authorized dependencies still contain the relationship ID, endpoint IDs, source title/scope and prerequisite title/status. Unreadable relationships emit none of these task-content projections. Detail, overview/attention and operational consumers inherit the repaired list boundary. Executive projection retains its additional actual-source/executive checks; no SIA or executive architecture change was needed.

Tests added:

- An actor with dependency.read and task.read sees both permitted task titles and dependency-based attention.
- Removing task.read immediately removes the relationship content from direct lists, title search, project detail, execution overview and executive dashboard.
- task.read without dependency.read does not reveal relationships.
- Project-scoped readers cannot use sibling-project or foreign-company filters.
- Deliberately malformed fixture edges crossing projects/companies remain hidden; tests cover readable source/unreadable prerequisite and the reverse direction, including division-specific source reads.
- The legitimate dependency remains in the database after read revocation; existing dependency lifecycle/cycle tests still pass.

Files changed: src/server/domain/execution-service.ts; tests/remediation-wave-01.test.ts. The directly related responsibility task-label fix also changes src/server/domain/workforce-service.ts, described below.

Verification: audit proof P2's dependency-only actor no longer receives restricted task title/status through the dependency list or derived attention. Assertions inspect serialized returned data, not merely status codes.

## 3. Finding 03 - AIRA division filter

**PASS**

Root cause: the program/batch query first built organizationId IN authorized IDs, then object spreading replaced that predicate with a client-supplied division ID. organization.read on the filter did not establish program.read or batch.read.

Boundary repaired: src/server/domain/aira-service.ts keeps the domain-authorized organizationId predicate and applies divisionId as an additional AND condition. Company binding and existing division organization-read validation are preserved. program.read and batch.read remain independent; neither the filter nor a company/organization read grants the other capability.

Direct URL query parameters still reach the same repaired list service, rather than an alternate authorized path. Mutations retain existing actual-resource capability checks. AIRA workspace selectors and overview reuse source-authorized data; executive services retain their own source-aware boundary.

Tests added:

- A company/organization reader without program.read or batch.read gets empty unfiltered and division-filtered program/batch results, including crafted search/status combinations.
- Independent program-only and batch-only readers see permitted records without obtaining the other domain's content.
- The same reader with both capabilities still receives a legitimate program name in a batch label.
- An actor with company-wide organization visibility but program/batch reads on only one division cannot widen results through the sibling division filter.
- Contradictory organization/division filters safely return empty; foreign-company and forged division IDs are denied.
- AIRA workspace/overview and the executive denial/source-read boundary do not reveal hidden fixture names.
- Revoking domain reads immediately empties the corresponding filtered results.

Files changed: src/server/domain/aira-service.ts; tests/remediation-wave-01.test.ts.

Verification: audit proof P3's company.read plus organization.read actor still receives zero records after supplying divisionId. Authorized positive paths remain functional.

## 4. Directly related same-pattern repairs

The targeted search covered Person creation/upsert, task/dependency reads, program/batch relationship labels, division filter overrides and the actual page/action/service consumers. It was not another full-system audit.

| Related disclosure | Narrow repair | Regression evidence |
|---|---|---|
| Responsibility DTO included its task title on responsibility.read alone. | Workforce responsibility projection now sets the nested task to null unless current task.read authorizes its actual organization/project. The responsibility record and structural scope remain available under their existing permission. | Real responsibility-only actor receives task:null and no secret task title; granting the independent task read restores the label. |
| Batch DTO included program.name and an embedded program object on batch.read alone. | AIRA batch projection removes the embedded program object and exposes programName only when program.read covers the program's division; otherwise null. Batch.read still authorizes batch information, not program content. | Batch-only actor sees batch name but no program name in the list/overview; actor holding both reads sees the program label. |

No unrestricted dependency query helper or alternate public Person creation API was added. Existing executive source guards were preserved. Historical compatibility contracts, unrelated business models and other audit findings were not rewritten.

## 5. Validation

All verification databases were temporary, applied the existing migration chain and used real Prisma and current authorization services. No development business data or production database was migrated, reseeded or reset.

| Check | Status | Evidence |
|---|---|---|
| Complete test suite | PASS | npm test: 198 tests across 14 files; all 188 existing tests remain, plus 10 new scenario tests. |
| Focused regression/domain run | PASS | npm test -- tests/remediation-wave-01.test.ts tests/business.test.ts tests/execution.test.ts tests/aira.test.ts: 74 tests across 4 files. |
| Post-generation focused negative/positive run | PASS | npm test -- tests/remediation-wave-01.test.ts: 10 tests, including the original sparse-grant reproduction shapes. |
| Lint | PASS | npm run lint. |
| TypeScript | PASS | npm run typecheck. |
| Production build | PASS | npm run build, Next 15.5.27, exit 0. This is compilation, not production deployment. |
| Prisma schema validation | PASS | npm run prisma:validate. |
| Prisma client generation | PASS | npm run prisma:generate, Prisma 6.16.2. Initial EPERM DLL rename failure resolved by briefly stopping the verified existing local Next dev process/worker, regenerating, and restoring the server. |
| Dedicated migration validator | NOT RUN | No schema or migration changes; no migration required for these query/service corrections. Tests independently applied all existing migration SQL to fresh isolated databases. |
| Production migrations/deployment | NOT RUN | No production database/infrastructure accessed. |
| Local dev server restoration | PASS | Restored localhost-only dev server; GET http://127.0.0.1:3000/api/health returned HTTP 200. |
| Real browser/device/accessibility and deployed HTTP/CSRF acceptance | NOT RUN | No browser/device acceptance claimed. Action wiring test is not a real browser/HTTPS test. |
| Current external dependency advisory inventory | NOT RUN | No npm audit or private dependency metadata submission. |

The first targeted run passed 8/10 and exposed two test expectation errors: calling the executive dashboard without executive.read and assuming a tie order for equal-date batches. The test now verifies executive denial separately, uses a deliberately executive-authorized/source-unprivileged actor for source confidentiality, and compares record sets without relying on tie ordering. No application permission was weakened to resolve those failures. Subsequent focused and complete runs passed.

## 6. Remaining known audit findings

| Audit ID | Remaining state |
|---|---|
| F04 | OPEN: finite automation scan starvation. Not changed in this wave. |
| F05 | OPEN: job-processing action can return misleading success feedback. Not changed. |
| F06 | OPEN: unbounded reads, repeated source lookups and broad SIA context costs; production capacity not verified. |
| F07 | PARTIALLY ADDRESSED: regressions for the three repaired authorization defects and related labels added. Automation >25 coverage and deployed endpoint/browser/proxy acceptance remain open. |
| F08 | OPEN: production infrastructure, migration, edge security, monitoring and recovery acceptance not verified. |
| F09 | OPEN: current complete dependency advisory inventory and release-owner security exception decisions not verified. |
| F10 | OPEN: browser/device/accessibility and deployed multi-identity/origin/cache acceptance not verified. |

Live email, WhatsApp, TalkinLabs, private document delivery and autonomous high-impact SIA execution remain disabled/unconfigured as before. Provider gaps were not recast as repaired code defects. Production readiness remains **NOT PRODUCTION READY** pending the remaining release gates and their verification.

## Changed files

- src/server/domain/business-service.ts
- src/server/domain/execution-service.ts
- src/server/domain/aira-service.ts
- src/server/domain/workforce-service.ts
- tests/business.test.ts
- tests/remediation-wave-01.test.ts
- docs/audit/REMEDIATION_WAVE_01.md

No schema, migration, runtime permission registry, role assignment, SIA architecture or communications implementation change. No remediation commit was created. Stop after Remediation Wave 01.
