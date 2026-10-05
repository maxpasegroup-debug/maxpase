# Phase 07 Validation

Local validation on 2026-10-04. Phase 07 implementation is complete; the remaining security-tooling and visual/deployment validation boundaries below are not represented as passes. Phase 08 is not started.

## Automated Evidence

| Check | Status | Evidence |
| --- | --- | --- |
| Full test suite | PASS | `npm.cmd test -- --no-file-parallelism`: 137 tests, 10 files |
| Final executive tests | PASS | 17 integration tests after source-date, mixed-grant and wrapped-failure hardening |
| Authorization/security integration | PASS | Isolation, forged filters/actors/owners, project-only grants, source revocation, mixed grants, confidential source projection, assigned human decision maker, replay/version, real processor failure and transactional rollback |
| Lint | PASS | `npm.cmd run lint`; final production build also includes lint |
| TypeScript | PASS | `npm.cmd run typecheck`; final production build type validation |
| Production build | PASS | `npm.cmd run build`, Next 15.5.27, all routes compiled |
| Prisma schema | PASS | `npx.cmd prisma validate`, pinned Prisma 6.16.2 |
| Existing database migration | PASS | Eight migrations applied; `prisma migrate status` up to date |
| Clean database migration | PASS | All eight migrations deployed into separate `prisma/phase07-clean.db` |
| Drift | PASS | Both existing and clean DB `prisma migrate diff ... --exit-code`: no difference |
| Integrity | PASS | Both SQLite integrity checks `ok`, no foreign-key violations |
| Development bootstrap | PASS | Existing seed registers added capabilities; no fictional executive records, canonical roles remain unassigned |
| HTTP smoke | PASS | 79 authenticated views including all 13 executive routes, unauthenticated redirect, existing routes and unknown-route state |
| Actual record rendering | PASS | Temporary real company/execution/workflow/request/approval/notification plus executive decision/KPI/risk/opportunity records rendered through services |
| Fixture cleanup | PASS | Exact created IDs removed; executive records/history, projects, tasks, requests, notifications and events return to zero |
| Production dependency audit | PASS | `npm.cmd audit --omit=dev --registry=https://registry.npmjs.org`: zero vulnerabilities |
| Full dependency audit | BLOCKED | Seven development-only advisory findings: two moderate, five high |
| Load/large portfolio benchmark | NOT RUN | No enterprise-scale performance claim |
| Deployment/production environment | NOT RUN | Build is local, not a deployment or production security assessment |
| Browser visual validation | MANUAL VALIDATION | Connected browser/app inventory is empty; no visual/browser-interaction pass claimed |
| Physical mobile/device validation | MANUAL VALIDATION | Responsive layout implemented, no physical device validation performed |

HTTP smoke creates temporary server-side sessions locally, never prints session tokens, and deletes those sessions and exact test records in finally. No workflow, financial performance, risk, opportunity, KPI actual, attention or decision is seeded to populate the UI. The development server is localhost-only at `http://127.0.0.1:3000/app/executive` and intentionally remains available for review.

## Dependency Blocker

Production audit is clean. The full audit still reports development-only [Vitest/@vitest/mocker arbitrary-file-read](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) and [braces stack-exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) findings through the lint/glob tree. npm proposes force-installing Vitest 5 and downgrading eslint-config-next to Next 14. No breaking upgrade/downgrade or force-fix is performed in this architectural phase. Resolve through a separately tested compatible tooling upgrade; do not expose development services or run untrusted patterns/mock configurations as privileged jobs. These findings do not become a production dependency pass by being development-only: full-tree audit remains BLOCKED.

## Manual Checklist

1. Review desktop widths and 360/390/430px phone layouts: attention, decisions, changes and deadlines must precede company/project/goal information without overlap.
2. Exercise create/edit/transition forms, pending feedback, error feedback, reference retry and stale-version refresh in an authenticated browser.
3. Confirm group/department/team/project/product filtering with representative real scoped accounts; verify revoked source rows disappear from all derived views.
4. Review human-entered KPI source evidence and risk/opportunity context; these are explicit attestations, not independently verified external data.
5. Perform measured large-portfolio query/load review, accessibility review and production deployment validation before making those claims.

## Changed Source Inventory

- `prisma/schema.prisma`
- `prisma/migrations/20261004130000_phase_07_executive/migration.sql`
- `src/server/authorization/registry.ts`
- `src/server/domain/executive-input.ts`
- `src/server/domain/executive-service.ts`
- `src/server/domain/operations-service.ts` (reserve executive lifecycle namespaces)
- `src/app/app/page.tsx` (command-center entry)
- `src/app/app/layout.tsx` (navigation)
- `src/app/app/executive/actions.ts`
- `src/app/app/executive/forms.tsx`
- `src/app/app/executive/layout.tsx`
- `src/app/app/executive/page.tsx`
- `src/app/app/executive/[view]/page.tsx`
- `src/app/app/executive/view.tsx`
- `src/app/globals.css`
- `tests/executive.test.ts`
- `scripts/http-smoke.ts`
- `docs/architecture/EXECUTIVE_INTELLIGENCE.md`
- `docs/architecture/PHASE_07_VALIDATION.md`
- Updated architecture documents: ARCHITECTURE, DOMAIN_MODEL, BUSINESS_GRAPH, OPERATIONS_MODEL, EXECUTION_MODEL, AUTHORIZATION_MODEL, SECURITY_MODEL, SIA_ARCHITECTURE, DATABASE_MODEL.

Generated local ignored artifacts: Prisma client, dev.db, separate phase07-clean.db, .next, TypeScript cache and local server logs. Earlier migrations were not edited. No Git repository is present, so no commit or Git diff is claimed.

## Architectural Decisions

1. Read-time deterministic intelligence reuses existing domain truth, authorization and progress rather than persisting duplicate metrics or synthetic historic snapshots.
2. A small discriminated record/history envelope stores only new human-owned executive concepts, with immutable scope and explicit domain-specific contracts/lifecycles.
3. A new executive.read capability intersects every source permission; designation, group affiliation and system.admin grant no bypass. NO_DATA and authorized-only coverage distinguish inaccessible and empty sources.
4. Strategic decisions are assigned human records; operational approvals stay in the Phase 05 engine. Neither approval path executes business work or grants SIA authority.
5. KPI definitions are immutable reporting contracts, actuals are explicit in-period human attestations, and trends require three real observations. No historic aggregate snapshot can leak a broader viewer's data to a narrower viewer.
6. Attention severity and health have named factual rules and source links, with append-only human handling and transactional audit. Resolved handling does not mutate the underlying source.
7. UTC date semantics and calculation/source/last-update freshness are explicit. No streaming, warehouse, distributed cache, autonomous worker, AI integration or Phase 08 work is introduced.
