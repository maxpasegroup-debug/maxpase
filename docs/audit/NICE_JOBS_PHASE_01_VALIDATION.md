# Nice Jobs Phase 01 Validation

Date: 7 October 2026 (IST). Scope: workforce and job-template foundation only. No production migration, deployment, account provisioning, credential rotation, DNS or provider configuration was performed.

## Evidence

| Check | Status | Evidence / limitation |
| --- | --- | --- |
| Architecture reuse | PASS | Existing Nice Jobs Product/Brand, Career Hub and business divisions; Person/User/Membership, scoped authorization, operational audit and corporate/portal session realms reused. |
| Known catalogue | PASS | Local development database has only the two supplied draft templates, internal visibility and v1. No workforce records are seeded. Repeat catalogue setup refuses identity conflicts instead of overwriting. |
| Focused tests | PASS | 19 focused cases in `tests/nicejobs.test.ts`, including authorization, immutable snapshots, current publication, assignments, membership expiry, filters/paging, lifecycle/replay, configuration, revocation, availability and audit rollback. Final full-suite result below includes these cases. |
| Full regression | PASS | Final `npm run test`: 310 tests / 25 files passed, 126.85 seconds. Previous intermediate run passed 309 tests before the additional availability test. No existing regression test was removed or weakened. |
| Final return-context subset | PASS | After Boss return-context wiring, Nice Jobs and workspace-navigation suites passed 23 tests / 2 files (19 workforce foundation and 4 existing navigation cases); final build/lint also passed. |
| Lint | PASS | `npm run lint`, no errors. |
| TypeScript | PASS | `npm run typecheck`, no errors. Earlier harness environment typing was corrected and rerun. |
| Production build | PASS | Final `npm run build` completed; Nice Jobs corporate and existing gateway routes generated. No deployment. |
| Prisma schema/client | PASS | `npm run prisma:validate` and `npm run prisma:generate`. |
| Migration chain | PASS | 14 migrations; fresh/repeated deploy, status, Prisma drift, integrity/FKs and isolated snapshot/restore through `npm run validate:migrations`. |
| Populated legacy upgrade | PASS | Focused test preserves existing Person ID across the additive migration, restores a pre-phase snapshot and reapplies migration without schema reset. This is not a live full-application rollback rehearsal. |
| Local development database | PASS | Confirmed `file:./dev.db`; verified pre-phase snapshot `prisma/pre-nicejobs-20261007.db`, applied only the new migration and ran the existing development-only seed. Existing passwords are not overwritten; no Boss provisioning was run. Snapshot is ignored by Git, not a production backup policy. |
| Authorization/security | PASS | Cross-company/division/actor input rejection, expired membership, independent publication capability, replay/stale revision, cross-realm HTTP token rejection and mandatory audit rollback. Assignments create no User/Membership/permission grant. |
| Larger dataset boundary | PASS | Disposable 100,001-worker fixture, disjoint 25-row pages and composite-index query plan. This proves local bounded retrieval, not production concurrency, latency SLO or SQLite write throughput. |
| Local HTTP / browser smoke | PASS | Installed Chrome 154.0.8037.98; anonymous and authorized routes, copied corporate/portal token rejection, real draft edit/publication/prepared assignment/human attestation and actor/scope audit. See `NICE_JOBS_PHASE_01_BROWSER.json`. |
| Responsive automated subset | PASS | 16 screenshot captures across four views at 320/390/768/1440px; no document overflow or page JavaScript errors. Captures were private transient fixtures, removed on cleanup; durable JSON report retained. |
| Physical devices / screen readers / manager usability | MANUAL VALIDATION | Not performed. Browser viewports do not constitute physical-device testing or WCAG certification. |
| Live TLS / production deployment | NOT RUN | Previous Nice Jobs TLS finding is not repaired or reverified by this local implementation. No production-readiness claim. |
| Phase 02 / downstream engines | NOT RUN | Intentionally not implemented. |

The first browser attempts exposed harness synchronization/selection issues: navigation was checked before its destination rendered, exact wrapped-select label matching timed out, and assignment count was asserted before its action committed. The harness now waits for the destination heading, uses explicit named select controls and waits for database-confirmed mutations. The subsequent smoke passed; unsuccessful attempts are not counted as successful evidence. Chrome screenshots from an earlier failed fixture were inspected to refine table and button reuse; this is not an independent full manual visual acceptance.

## Scope And Decisions

- Template identity and lifecycle are separate from immutable job-version content and assignment identity. Business-area links belong to each version, not a mutable job-wide list.
- Multi-area read/mutation permissions and actual current publication are checked before source pagination. Historical published versions are not active opportunities. No public recruitment catalogue/signup/application flow exists in this phase.
- Worker Profile contains only existing Person/company references and timestamps. Assignment company, template and engagement are projected from canonical linked records rather than duplicated mutable columns. Employment dates remain null.
- Worker lifecycle transitions are explicit human attestations with reasons, confirmation and revision checks. They do not generate offers, validate training, infer real-world completion or modify Person/User/Membership lifecycle. EXITED/termination and assignment end remain deferred.
- Initial multiple-assignment policy is fail-closed: one open assignment per company/person until explicit policy is implemented. No silent reassignment or version migration.
- Existing explicit development-administrator bootstrap registers/adopts new capabilities; ordinary canonical roles receive none. Production operator capability adoption and catalogue initialization need review after migration, not a migration-time privilege grant or credential reseed.
- No SIA workforce tools, autonomous suspension/termination, unrestricted context dump, external providers, finance, wallet or payout are added. Future tools must preserve human/agent intersection and existing approval/risk/audit controls.

## Reproduction

```powershell
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run validate:migrations
npx.cmd vitest run tests/nicejobs.test.ts --no-file-parallelism --testTimeout=30000
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
# With an installed Playwright module and Chrome; uses private disposable DB and port 3006:
$env:PLAYWRIGHT_MODULE = '<absolute path to installed playwright-core>'
npx.cmd tsx scripts/nicejobs-browser-smoke.ts
```

Do not run a dev/browser fixture concurrently with `next build` against the same `.next` cache. The owned fixture process is stopped and its database/screenshots removed. No production login credential is used. Management preview is `/app/nicejobs`; Nice Jobs local portal preview is `/sites/jobs/gateway?view=templates`. Existing reviewed membership/capabilities remain required; a valid login alone grants no Nice Jobs authority.

## Files Changed

30 repository files, excluding ignored local database snapshots, generated client/build files and temporary screenshots:

```text
.gitattributes
docs/architecture/ARCHITECTURE.md
docs/architecture/AUTHORIZATION_MODEL.md
docs/architecture/BUSINESS_GRAPH.md
docs/architecture/DATABASE_MODEL.md
docs/architecture/DOMAIN_MODEL.md
docs/architecture/SECURITY_MODEL.md
docs/architecture/SIA_ARCHITECTURE.md
docs/architecture/NICE_JOBS_WORKFORCE_ARCHITECTURE.md
docs/audit/NICE_JOBS_PHASE_01_VALIDATION.md
docs/audit/NICE_JOBS_PHASE_01_BROWSER.json
prisma/schema.prisma
prisma/seed.ts
prisma/migrations/20261007100000_nicejobs_workforce/migration.sql
scripts/nicejobs-browser-smoke.ts
src/app/app/nicejobs/actions.ts
src/app/app/nicejobs/error.tsx
src/app/app/nicejobs/job-form.tsx
src/app/app/nicejobs/loading.tsx
src/app/app/nicejobs/page.tsx
src/app/app/nicejobs/workspace.tsx
src/app/globals.css
src/app/sites/[site]/gateway/page.tsx
src/lib/workspace-navigation.ts
src/server/authorization/registry.ts
src/server/portals/sites.ts
src/server/security/readiness.ts
src/server/nicejobs/input.ts
src/server/nicejobs/service.ts
tests/nicejobs.test.ts
```

Detailed recruitment, screening, interviews, offers, orientation/OJT content, SOP, daily-work/task automation, lead routing/entry/follow-up, chat/audio/video/resources, targets, performance/PIP, incentives, wallet, settlement/payout and automated suspension/termination are untouched. Stop after Phase 01.
