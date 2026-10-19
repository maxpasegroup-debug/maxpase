# Nice Jobs Phase 06 Validation

Date: 2026-10-08. Scope: Daily Work + Leads + Follow-ups only.

## Result

PASS - PHASE 06 COMPLETE for the implemented local application scope. This is not production readiness certification. Production: NOT DEPLOYED. No commit or push was requested or performed.

Accepted Phases 01-05 remain canonical. No live business leads, activity, workforce records, targets, workflows, capability grants or commercial policies were seeded. Populated validation records were confined to isolated temporary databases. The local development database received the additive migration after a private pre-upgrade snapshot.

## Validation Results

| Check | Result | Evidence |
| --- | --- | --- |
| Focused tests | PASS: 22 tests | `npx vitest run tests/nicejobs-leads.test.ts --no-file-parallelism --testTimeout=30000` |
| Full regression | PASS: 427 tests, 30 suites | `npm test`; final full run completed in 375.87 seconds |
| Lint | PASS, exit 0 | `npm run lint` |
| TypeScript | PASS, exit 0 | `npm run typecheck`; production build also checked types |
| Production build | PASS, exit 0 | `npm run build`; Next.js 15.5.27; all 21 static pages generated |
| Prisma schema | PASS | `npm run prisma:validate` |
| Prisma client | PASS | Prisma 6.16.2 client generated against the additive schema |
| Fresh migration, repeat, drift, restore | PASS | `npm run validate:migrations`; 19 migrations, integrity and foreign-key checks |
| Populated Phase 05 upgrade | PASS | `npx tsx scripts/validate-nicejobs-leads-upgrade.ts`; preserved original-column counts and SHA-256 signatures in 89 tables |
| Populated repeat and restore/re-upgrade | PASS | Same script; zero schema drift, integrity and foreign-key checks after upgrade and restoration |
| Local historical-data preservation | PASS | Actual development DB compared with private pre-Phase-06 snapshot: zero changed original tables; no live lead rows; integrity OK and no FK violations |
| Isolated browser workflows | PASS | `scripts/nicejobs-leads-browser-smoke.ts`; detailed machine-readable evidence in `NICE_JOBS_PHASE_06_BROWSER.json` |
| Production deployment/domains/TLS/backups | NOT RUN | No production configuration, deployment or provider access performed |

SQLite experimental warnings are toolchain notices, not suppressed application failures. No production capacity claim follows from these results.

## Focused Coverage

The 22 focused tests exercise strict command validation and forged identities/scopes; normalized contacts; policy/source/version eligibility; signed duplicate warnings and explicit separate-record decisions; expired/stale review rejection; cross-company/division/worker access; current-authority replay and revision conflicts; reassignment history and immediate former-owner revocation; policy/capability-gated claim; controlled workflow state/follow-up invariants and generic-workflow bypass denial; due/missed/completed/cancelled follow-ups and preserved notes; assistance blockers and notification preferences; derived reports and day data; private management-note exclusion; current human/agent SIA source intersection; audit/notification transactional rollback; zero-write import preview and communication boundaries; bounded pagination/query cost; missing configuration; independent human approval; and revoked independent-verifier authority.

The configured transition permission is tested against actual caller authority before the narrow canonical workflow delegation. Approval proofs and verification proofs cannot substitute another actor's privileges for the worker's permissions.

## Browser Evidence

Headless local Chrome 154.0.8037.98 used a temporary migrated database and generated temporary authentication secrets. The script activated a worker through canonical readiness, created a lead, reviewed a duplicate without losing name/priority inputs, explicitly created a separate contact record, assigned work, recorded human contact/outcome, scheduled and completed follow-up, submitted a server-derived report and queried the existing read-only worker SIA tool.

It also checked anonymous and corporate/jobs token isolation, and preserved company/division context while clearing incompatible workforce/lead status filters. No SIA action or provider delivery was created.

Seven populated views at 320, 390, 768 and 1440 pixels produced 28 screenshots with no page overflow and zero page JavaScript errors. Lead detail at 320 pixels and manager pool at 1440 pixels were visually inspected. A basic Tab-focus smoke passed; this is not a complete keyboard or WCAG audit. Screenshots are ignored local build artifacts under `.next-portal-smoke`.

Physical mobile devices, other browser engines, screen readers, full keyboard workflows and manager usability sessions: NOT RUN. Production browser/device/domain/session validation: NOT RUN.

Local preview: `http://127.0.0.1:3004/app/nicejobs`. Startup checks returned 200 for `/`, `/api/health` and `/api/ready`; anonymous `/app/nicejobs` and `/sites/jobs/gateway?view=my-leads` returned 307 as expected. This preview uses the unchanged historical local development records, not the browser fixture database.

## Scalability Evidence

Fixture: 2,001 leads and one real readiness-backed activated workforce assignment in an isolated database. The fixture adds bulk lead/workflow records only for validation, not fake live business metrics.

Two filtered 25-record pages plus a manager workforce summary used 91 queries in total. A filtered lead list used 26 queries at both 25- and 100-record page sizes. The final full regression measured 118 milliseconds for the combined fixture check; the final standalone focused run measured 77 milliseconds. Observed local runs ranged from 77 to 147 milliseconds. These are local observations, not request latency percentiles or production SLAs.

Company/owner/state/source/priority/date filters, stable cursor pagination and bulk page-level workforce aggregation are covered. Reads do not load complete lead, worker or history collections. 100,000-worker capacity: NOT VERIFIED. Production concurrency, p95/p99, resource usage and query-plan certification: NOT VERIFIED.

## Database and Restoration

Migration: `20261008140000_nicejobs_daily_work_leads`. Six normalized lead models, canonical relations, indexes and two nullable additions to daily reports/blockers. Existing blocker rows are preserved by nullable `ALTER TABLE`, not a destructive rebuild. Readiness includes the migration hash and additive column probes.

Fresh database application and repeated deployment are idempotent. The populated-upgrade validator preserves original values across onboarding, workforce, tasks, blockers, reports, evidence and all other original tables, restores the pre-upgrade snapshot into a separate database and re-applies the migration successfully. This proves the tested SQLite restore path, not a production backup service or rollback SLA.

Private development snapshots remain ignored and must never be committed or distributed. Production migration approval, backups, restoration rehearsal and rollout remain separate work.

## Files and Modules

New implementation: `src/server/nicejobs/lead-input.ts`, `lead-sources.ts`, `leads.ts`; `src/app/app/nicejobs/lead-form.tsx`, `lead-workspace.tsx`; Prisma migration; `tests/nicejobs-leads.test.ts`; browser and populated-upgrade scripts; architecture and validation documents; browser evidence JSON.

Existing integration points: Prisma schema; authorization registry; canonical operations input/scope/service; readiness; Nice Jobs employee service, action/forms/workspaces/page; jobs gateway; SIA worker context. Architecture, domain, database, authorization, security, SIA, business graph and employee-workspace documents cross-reference the new foundation. Prior accepted dirty work is preserved; no unrelated refactor or role-policy seeding was performed.

## Architectural Decisions

- Lead lifecycle is the canonical configured workflow instance, not a second sales-status engine. No universal pipeline is installed.
- Ownership uses exact published pinned job versions and canonical readiness-backed assignments in the actual business division. Product distribution does not grant cross-division access.
- Events, audit, notifications/preferences, Tasks, reports, blockers, authorization and read-only SIA are reused.
- Mutation, audit, relevant notification and workflow writes share the database transaction. Revision CAS, actor-bound idempotency and current-authority replay checks protect execution.
- Contact duplicates require an expiring signed review and explicit separate-record reason; no automatic merge. External references remain uniquely guarded.
- Claim and unassignment require explicit policy opt-in and capabilities; both default to disabled. No agent receives operational write authority.
- Workflow delegation is narrow and source-validated. Exact configured transition permissions and independent current human control authority are checked separately.
- Import is an internal zero-write preview boundary only. Communication intent is NOT CONFIGURED/providerExecution=false until later approved provider implementation.

## Configuration and Known Limitations

All known limits below are intentional or explicitly unverified; they are not concealed as zero counts or enabled features.

1. Real deployment needs explicit registered capability provisioning, published operational workflows, lead policies, published job-version area eligibility and authorized workforce assignments. No ordinary worker or agent grants were added automatically. A previously seeded database may need the existing authorized permission-provisioning process before the new capabilities can be assigned.
2. Academic Advisor/BDM business rules, targets, SOPs and new area eligibility are not invented. Missing/unpublished policy/version configuration returns NOT CONFIGURED; missing source authority returns NOT AUTHORIZED.
3. Policies are immutable after creation. Configuration changes require another policy; there is no policy-edit or automatic migration UI. Existing instances remain bound to their published definitions.
4. Source names identify origins only; website/Meta/Instagram/Google/referral/import integrations are not connected. Import preview accepts at most 100 internal rows and 1,000 duplicate matches, with zero writes; no file uploader, CSV/Excel processing or external ingestion runs.
5. Phone validation is structural E.164 with explicit country code, not carrier/provider verification. Human contact logs are attestations, not delivery evidence. Communication providers and external notifications are not configured.
6. Forms currently enter follow-up times explicitly in UTC. Displays and day/report boundaries use account IANA timezones. Due-today includes later today and overlaps overdue counts; these categories must not be added together.
7. Default list size is 25, maximum 100. Activity, assignment history and detail follow-ups have independent 25-row cursor pages. Worker SIA/context windows are 25, not complete-history exports.
8. Configuration choices are capped at 50. Narrow division scope and use the paginated eligible-worker picker for larger assignment choices. Duplicate review is capped at 25 matches; larger duplicate sets require reconciliation. Cancellation batches are capped at 100 schedules; distinct daily report work is capped at 1,000 leads. These limits fail explicitly rather than silently producing partial totals.
9. Reminders are explicit authorized in-app operations, not background scheduling. No always-running development worker or automatic ownership/escalation process was installed.
10. Report snapshots are immutable server-derived observations at submission time, not employment scores, incentives or externally verified outcomes. Previously submitted reports keep their historical nullable snapshot behavior.
11. Worker SIA remains deterministic, bounded and read-only through the current human AND agent source intersection. It excludes contact phone/email, private notes and unrelated workers. There is no LLM/provider integration, autonomous mutation, assignment, message sending or employment decision.
12. SQLite migration/restore and local dataset checks do not certify production infrastructure, backups, performance or capacity. 100,000-worker operation is NOT VERIFIED. Production domains, TLS, monitoring, backups, restore/rollback and deployment are NOT RUN / NOT DEPLOYED.
13. Browser evidence covers one local Chrome engine and simulated viewports. Physical devices, other browsers, screen readers, complete accessibility certification and manager usability sessions are NOT RUN.
14. No Phase 07+, payroll, finance, incentives, wallet/payments, employee scoring, automated employment decisions or external messaging system is implemented.

## Next Phase

PHASE 07 - SOP + RESOURCES + COMMUNICATION. Deferred; not implemented in this run.
