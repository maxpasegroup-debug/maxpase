# Nice Jobs Phase 08 Validation

Scope: performance, reports and human-governed PIP only. Implementation and local checks: 2026-10-08/09, Asia/Kolkata. Architecture: [Performance, Reports And PIP](../architecture/NICE_JOBS_PERFORMANCE_REPORTS_PIP_ARCHITECTURE.md).

## Validation Evidence

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Focused regressions | PASS | 32 tests in `tests/nicejobs-performance.test.ts`; final focused run used repository-standard `--testTimeout=30000`, 70.98 seconds |
| Complete regression | PASS | Final frozen-source run: 481 tests across 32 files, 485.66 seconds; includes accepted Phase 01-07 regressions. Earlier run also passed 481/32 in 533.39 seconds |
| Lint | PASS | `npm.cmd run lint`, exit 0; final harness included |
| TypeScript | PASS | `npm.cmd run typecheck`, exit 0; final check after restoring generated preview metadata also passed |
| Production build | PASS | `npm.cmd run build`, Next 15.5.27; local production compilation, not deployment |
| Prisma schema | PASS | `npx.cmd prisma validate`, Prisma 6.16.2 |
| Prisma generation | PASS | Prisma 6.16.2 generation succeeded before migration and again after all owned test clients stopped. An intermediate Windows engine DLL lock was resolved; no remaining generation blocker |
| Local migrations | PASS | 21 migrations deployed; migrate status reports up to date; final database-to-schema diff reports no difference |
| Fresh/repeat/drift/restore | PASS | `npm.cmd run validate:migrations`; clean migration chain, repeat, zero drift, integrity and isolated snapshot restore |
| Populated Phase 07 upgrade | PASS | `npx.cmd tsx scripts/validate-nicejobs-performance-upgrade.ts`; preserved original columns in 100 tables, including workforce, work, reports, SOP versions, receipts, links, resources, communication templates/publications and history |
| Existing development data | PASS | Original-column row signatures for all 100 pre-Phase-08 tables unchanged; SQLite integrity `ok`, zero FK violations; all seven new model tables empty |
| Browser workflows | PASS | Final Chrome 154.0.8037.98 run, isolated database; 44 captures, widths 320/390/768/1440, zero page errors/overflow; scoped filters, context-preserving drilldown, explicit-period executive summary, plan status and worker-framework search passed |
| Visual inspection | MANUAL VALIDATION | Worker metrics/attention at 320px, released PIP at 390px and open manager PIP editor at 1440px inspected; long names, metrics and controls wrap without clipping |
| Local HTTP / preview | PASS | Root, `/api/health`, `/api/ready`: 200; anonymous corporate performance: 307 to corporate login; Jobs worker performance: 307 to `/sites/jobs/login` |
| Bounded query fixture | PASS | 1,001 snapshots, one activated worker; 44 database queries for both 25-row and 100-row first-page requests. Single fixture execution 2,373ms including canonical hire/activation/configuration/data insertion; not endpoint latency |
| Production | NOT DEPLOYED | No deployment, domain/TLS, monitoring, production backup/restore or production authentication claim |

Machine-readable browser evidence: [NICE_JOBS_PHASE_08_BROWSER.json](NICE_JOBS_PHASE_08_BROWSER.json). Screenshots are ignored local artifacts under `.next-portal-smoke/`, not production data.

## Security And Integrity Coverage

The 32 focused tests cover strict actor/scope/configuration input; explicit targets, zero/range/percentage calculations and absent denominator/target; immutable publication/versioning; unauthorized metric/target changes; real canonical task/lead/contact/follow-up/outcome/report/training/SOP measurements; no invented report completeness; closed/calendar/custom periods; generation duplicates and actor-bound replay; explicit immutable historical corrections; three-snapshot trends; worker hidden metrics/status count isolation; private notes and separately released feedback/acknowledgement; explicit evidence-backed attention without automatic PIP; private draft/unreleased plans; released objectives/support; PIP amendment withdrawal/re-acknowledgement/fresh-review requirements; human review before completion; cancellation/stale revisions; own worker evidence versus forged PIP/snapshot/support; cross-worker/company/division isolation; source capability revocation and replay reauthorization; human/agent SIA source intersection and prohibited employment actions; audit/correction/PIP rollback; notification preferences and notification-failure release rollback; newest-period keyset pagination, executive scope and bounded large queues/export privacy.

The browser fixture uses canonical recruitment, offer, orientation/OJT/readiness and explicit activation, never a readiness bypass. It records actual canonical work before configuring a synthetic metric. Manager create/publish/generate/review/private-note/attention/PIP create/activate/release/review/complete flows, worker evidence/acknowledgement/comments and grounded read-only SIA are exercised. Private canaries remain absent from worker/SIA responses. PIP completion leaves the canonical assignment ACTIVE. No SiaAction or external CommunicationMessage is created. Corporate and Jobs sessions cannot be interchanged.

No actor identity is trusted from forms. Every mutation resolves the current authenticated User/Person, actual division and registered capability. Role names, job titles, manager relationship and visible navigation are not authorization. Audit/events, mutation, review/history and notifications commit together or roll back. Private payload content is not embedded in generic event/notification metadata.

## Validation Corrections

An initial custom-period test used an injected clock earlier than the real canonical Task completion timestamp. The fixture now ends after the actual completion timestamp; the accepted task engine was not changed. A direct focused run under Vitest's default five-second timeout hit one timeout while other validation runners competed for resources; the final focused run uses the same 30-second timeout as the accepted `npm test` command and passes all 32 tests.

Browser validation corrected harness-only normalized `datetime-local` values and an incorrect SIA heading assumption. It also found a real responsible-manager picker omission for group/company ancestor memberships. The picker now includes current active ancestor-descendant memberships only when the requester has actual-division person-read authority; PIP manager membership validation remains unchanged and independently enforced. A regression assertion protects the ancestor manager choice.

## Files And Modules

Phase 08-only inventory is relative to the accepted pre-Phase-08 working-tree snapshot, not the repository HEAD, which already contains accepted uncommitted Phase 04-07 changes. Those accepted changes are retained. 34 files added or changed, excluding restored preview metadata. Local management preview: `http://127.0.0.1:3004/app/nicejobs?view=performance`; worker preview: `http://127.0.0.1:3004/sites/jobs/gateway?view=worker-performance`. Existing authentication and explicitly provisioned capabilities/configuration are required; no real workforce/performance content was created.

- New services: `performance-input.ts`, `performance-evidence.ts`, `performance.ts` under `src/server/nicejobs/`.
- New UI: `performance-form.tsx`, `performance-snapshot-form.tsx`, `performance-workspace.tsx` under `src/app/app/nicejobs/`.
- Additive database: `prisma/schema.prisma`, `20261008180000_nicejobs_performance_pip/migration.sql`.
- Existing integration points: employee forms/workspace, knowledge navigation, lead command form, authenticated Nice Jobs actions/corporate page/Jobs gateway, scoped CSS, worker SIA context, capability registry, operational resource scope/input and release readiness.
- Tests/tools: `tests/nicejobs-performance.test.ts`, `scripts/validate-nicejobs-performance-upgrade.ts`, `scripts/nicejobs-performance-browser-smoke.ts`.
- Documentation: Phase 08 architecture, this report, browser JSON, seven canonical architecture cross-references.

No package/lockfile change, commit, push or deployment. Preview-generated Next.js type metadata is restored to the accepted baseline rather than claimed as a product change.

## Architectural Decisions

Seven additive models support stable framework identity, immutable version material, snapshots with correction heads, released/private feedback, explicit attention, human-managed PIP and append-only plan/review history. Goals, executive KPIs, daily reports, tasks, learning, content, events, notification preferences and authorization are reused. Typed bounded JSON follows accepted SQLite conventions; no script/formula engine or distributed infrastructure is introduced. Summary evidence is resolved on exact detail, not through N+1 list reads. SIA extends the existing read-only worker tool and keeps human/agent source intersection; there is no employment/PIP executor.

Migration SHA-256: `200db4aca0219d6d0a3a5a3adf55c746ecf6ac461bb2fc7fc184b7f5f8858ff6`. Release readiness includes the additive migration and runtime snapshot/PIP probes. A private ignored local pre-Phase-08 SQLite snapshot was used for preservation/restore checks; no production backup was accessed.

## Known Limitations And Required Configuration

1. No real job KPI, framework, target, score, PIP, worker, policy or capability grant is seeded. Operators must configure expectations and provision registered capabilities through existing authorized administration. Old seeded databases do not automatically gain new Permission rows or role grants. Implementation validation does not claim that a particular production Boss account has been provisioned.
2. Registered COUNT/PERCENTAGE adapters only. No canonical attendance source exists; attendance, duration/rate, manual actuals, freeform formulas and arbitrary universal scores are absent. REPORT_COMPLETE is NOT_CONFIGURED until a real canonical completeness policy exists. Lead measurement requires an existing applicable explicit lead policy/outcome.
3. Blocked/open/overdue/current-lead-state measures are generation-time observations, not historical event-state reconstruction. Human contacts are not provider-delivery evidence. Snapshots remain immutable; explicit corrections may observe later canonical evidence/ownership changes and must record a reason.
4. Missing targets, sources, permissions and denominator data do not become zero or fabricated success. Partial measurement cannot become overall ON_TRACK. Published versions stay pinned; no cross-version trend comparison or silent historical score edit is supported. Attention requires positive recorded evidence and never initiates discipline/PIP automatically.
5. Calendar entry follows the configured IANA timezone; custom datetime entry is UTC. Period end is exclusive, no future generation, maximum 366 days. Weekly is an explicit seven-day window, not an assumed company week/month policy. Review dates are manual/advisory; no scheduler automatically creates/extends/completes plans or reminders.
6. Current source permissions remain required independently: own work/lead/report/SOP/blocker and actual-division onboarding.self for training. Career Hub candidate permission does not automatically authorize Labs learning aggregates. Project-only work grants do not broaden upward. Restricted/reassigned evidence IDs are masked; stored historical totals remain generation observations rather than being silently recomputed.
7. Manager status-filter totals require all canonical source capabilities in selected scopes. Worker stored-status filtering is rejected to protect hidden metrics; visible metric statuses remain available. Executive aggregation requires explicit dates and complete source authority per included division; counts are snapshots, not unique people and not guaranteed whole-company coverage.
8. Default report pages 25/max100; configuration pickers 50; source references/pickers 25 per metric/type; metrics30; objectives/support20; review pages25; flags30; manager choices50; aggregate groups100. Narrow scope is required outside picker windows. Literal worker/framework/plan substring search only; no full-text/semantic search, unbounded evidence/history export or complete workforce scan. Export is a bounded reauthorized DTO, not a downloadable PDF generator.
9. Three corrected non-overlapping same-version snapshots are required for HIGHER/LOWER trends. RANGE, mixed movement, missing history or overlapping periods remain INSUFFICIENT_DATA. No AI trend/score is generated.
10. Private notes/change snapshots have separate capabilities. Worker visibility is explicitly released; amendment withdraws release/acknowledgement and requires fresh review. Acknowledgement is receipt, not agreement, competence, employment policy acceptance or disciplinary evidence. PIP review outcomes/completion/cancellation do not terminate, suspend or alter compensation. Objective states remain explicitly human configured, not inferred from review outcomes.
11. SIA is bounded deterministic read-only assistance: three reports/five metrics, five released feedback records and three plans/five objectives/support entries. Current human AND agent source permissions and response-size guards apply. No private notes, hidden metrics, unreleased PIP/change history or unrelated workforce data. No provider/model-generated decisions, PIP writes, employment/compensation authority or autonomous SiaAction.
12. Notifications are generic in-app only, using canonical preferences/recipient resolution. No email/SMS/WhatsApp/provider send or automatic workforce broadcast. Account delivery batches are bounded to25. Review dates do not create background workers.
13. Scale evidence is local SQLite with one worker and 1,001 snapshots, equal 44-query 25/100-row requests. Synthetic historical snapshots are scale-only; not official performance data. Endpoint percentiles, 100,000-worker capacity, concurrent load, production DB cost and sustained throughput are NOT VERIFIED.
14. Browser evidence is Chrome with simulated viewports and a basic focus check. Physical mobile devices, other browsers, screen readers, complete keyboard workflows, WCAG certification and representative-manager usability sessions are NOT RUN. Every mobile edit combination is not tested. Next dev-tools overlay is a development-only artifact.
15. Fresh/populated local SQLite migration, restore and data preservation were verified. Production deployment, domain routing/TLS, all-five-domain authentication, monitoring, backups/restoration/rollback and production credentials are NOT RUN. Local build/readiness is not production readiness. Windows client regeneration requires stopping owned processes that hold the engine DLL.
16. Phase 09+ incentives, bonus, wallet, settlement, salary, payout, payroll, accounting/finance, termination, workforce command center, large-scale automation, external Meta/Instagram/Google/WhatsApp and autonomous management remain untouched.

## Recommended Next Phase

PHASE 09 - INCENTIVE + WALLET + SETTLEMENT. Not implemented in this run.
