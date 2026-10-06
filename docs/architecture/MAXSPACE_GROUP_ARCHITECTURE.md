# MAXSPACE GROUP Architecture

## Boss Validation And Launch Phase 5

The owner accepted initial 30-second next-action usability, context-preserving workflows, keyboard/accessibility, staging p95 <= 2s/p99 <= 5s and zero authorization/isolation/replay/audit-rollback failures. Automated populated Chrome/Edge workflows, security regressions, strict public-domain probes, local service/production-build HTTP benchmarks and private recovery of the existing production snapshot are recorded in `docs/audit/BOSS_DASHBOARD_LAUNCH_VALIDATION.md` and its linked JSON reports.

Read-only executive projection now checks each distinct organization/project scope once per source batch through the existing decision boundary. Contexts remain fresh per service/request, and mutation/approval/resource gates are unchanged. At 1,000 tasks, service queries fell from 1,449 to 448; local HTTP observed p95 is 625ms Overview / 1,325ms Projects / 246ms Tasks. This is not a production concurrency or availability guarantee.

Launch is BLOCKED: Skill City is not attached to the selected app and its public gateway returns 404; Nice Jobs strict TLS probes fail hostname validation; monitoring/backup policy/rollback evidence, physical devices, screen readers, manager sessions and final publication approval remain outstanding. No DNS, TLS, secrets, production business work, monitoring provider or autonomous SIA authority is changed. The live release is still `9f17100d-6381-46d3-93e0-58e7e00a74cb`; final dashboard safeguards and launch optimization are local. No new migration is introduced.

## Boss Operational Workflows Phase 4

The command center now offers current-capability shortcuts to existing execution and request forms, an assigned-human approval inbox, task follow-up actions, reminder recipients/escalation owners, useful search/sorting/pagination, browser-local saved filters, an authorized unread notification indicator and real activity history. Exact source links retain their resource scope while keeping the selected Boss company and independent return filters. Supporting evidence is limited to existing authorized descriptions, requests, workflow bindings and communication previews; no fake attachments or metrics are introduced.

The shared domain services remain the sole mutation authority. Client confirmation and duplicate-click suppression improve interaction but do not replace transactional approval-chain/version/expiry/resource checks, replay rejection, recipient validation or audit. Successful filtered-out mutations retain a workspace-level result. SIA receives no additional capability or autonomous execution authority. See OPERATIONS_MODEL.md for storage, sorting capacity and failure boundaries.

Phase 4 local verification: PASS 289 tests across 24 files (including scope isolation, current authorization, replay/rollback and SIA-boundary regressions), lint, explicit TypeScript, production build, Prisma schema validation, migration chain/repeat deploy/drift/integrity/snapshot restoration and whitespace checks. The sandbox initially denied a build-worker spawn; the permitted rerun completed successfully without the initial CSS compatibility warnings.

PASS isolated browser acceptance: company-aware shortcuts; cancelled approval confirmation; approval/rejection with comments/history; request preparation, identical retry, submission and a separate authorized human reviewer; assigned task update; reminder creation; escalation resolution; browser-local saved-filter persistence; private unread notification/read update; and scoped activity. Twenty-four screenshots cover approval/request/reminder/escalation/My Tasks/notification workspaces at 320, 390, 768 and 1440 pixels, with no page overflow or JavaScript errors. Editors retain visible resource/policy selectors after saves and retries rather than allowing action-form reset to disagree with the submitted payload. Test sessions, records and the owned server exist only in a disposable database that is removed after the run.

PASS live read-only verification of release `9f17100d-6381-46d3-93e0-58e7e00a74cb`: 17 Boss views and seven operational views, 65 screenshots at 320/390/768/1440/1920px, no JavaScript errors or page overflow, company/filter return navigation, scoped task-editor prefill and IST checked without preference mutation. The public root remains at `/`; root, health and readiness return HTTP 200. An independent read-only database check confirmed both verification sessions absent, a normal logout audit present and account timezone still `Asia/Kolkata`.

The first live read-only smoke run timed out while many protected modules were being speculatively prefetched; its own uniquely timestamped session was revoked in an audited recovery transaction, with IST unchanged. Protected workspace/overview/source/pagination links now load only on navigation rather than eagerly loading numerous guarded workspaces in the background. This does not cache, skip or weaken authorization. Verification receipts retain only the exact issued session ID and revocation result, never a token or PIN, so cleanup is traceable if a browser/network operation fails.

BLOCKED final production publication: automatic approval review requires explicit user approval for another production deployment because it can interrupt service. The verified existing live release is unchanged. Final local safeguards preserve human evidence text verbatim, isolate saved-filter namespaces by company as well as user/workspace, prevent awkward wrapping of operational table headings inside horizontal scroll regions, and preserve Boss return context on supporting communication links. These final changes are not claimed deployed; deployment approval has been requested. No secrets, database settings, domain routes or approval policies are changed.

Production business mutations are NOT RUN: no demonstration work or approval is inserted to make the live dashboard look populated. Physical devices, full screen-reader review and human management acceptance are MANUAL VALIDATION. Browser presets are not cross-device storage. Existing dev-toolchain advisories are not remediated by Phase 4; no dependencies are added.

Phase 4 modules: `boss-service.ts`, `boss/page.tsx`, `boss/overview.tsx`, operations list/manager, execution list/manager/workspace context, shared navigation/header/status styling, `work-list.ts`, `saved-filters.tsx`, bounded sorted pagination and `pagination.tsx`, `executive/view.tsx`, operation projection, focused regression tests, `scripts/boss-browser-smoke.mjs` and `scripts/operations-browser-smoke.ts`. Existing schema and migrations remain unchanged in Phase 4.

## Boss Executive Overview Phase 3

The first screen leads with the highest-priority accessible record and its next human action, visible accountable owner and deadline. Six linked queues cover decisions, assigned approvals, overdue work, unresolved blockers, escalations and failed events. Existing goal/performance concerns remain in the priority queue even without overdue work; the next upcoming deadline provides a next-action fallback when there is no urgent item. Inventory follows briefing, company priorities, recent changes and SIA availability. No demonstration work, new authority, autonomous execution or external provider is introduced.

`boss-overview.ts` derives queues exclusively from the existing authorized executive snapshot, independently of saved work-list filters. Ranking uses recorded priority/attention severity, actionable human decisions within a severity tier, then deadlines, with deterministic ties. Overlapping urgent records are deduplicated; individual queues retain their exact matching records. Pending approval does not imply authority or readiness: policy/chain readiness, expiry and designated human decisions remain distinct. Mutations always reauthorize in existing domain services. Missing/hidden owners are explicit rather than inferred from membership titles.

Queue, inventory and item selectors are allowlisted. Counts link to the same authorized snapshot rows; record selection happens before pagination and cannot widen organization/resource access. Saved work-list filters survive queue/back navigation without suppressing snapshot urgency. Daily change grouping uses the authenticated account's timezone, initially IST for the Boss. Recent changes are existing source-backed operational/audit events or explicitly derived overdue deadlines, not manufactured activity. Exact change links select the corresponding accessible change.

Company summaries surface the next urgent record, owner and deadline, followed by coverage/freshness evidence. Counts are linked to current scope records. Standalone open work blockers contribute real company risk and their recorded expected-resolution deadlines are preserved. Zero accessible pending work is not a health verdict; no recorded work, limited access and missing ownership stay explicit. Empty-state commands are emitted only for current scoped manage permissions.

Recorded Brand.website domains show the company association separately from registrar ownership. Routing configuration comes from the existing hostname/portal registry and does not prove deployment, DNS or TLS. Optional Brand.metadata.domainEvidence stores host-bound human attestations: hostname, responsiblePersonId, ownership/routing {source, checkedAt}, certificate {source, checkedAt, validUntil, issuer}. The existing authorized, audited brand save boundary owns writes; no new table or migration is needed. Malformed/host-mismatched evidence is omitted; future checks, seven-day stale evidence and expired certificates are flagged. All accepted entries remain RECORDED CHECK / NOT INDEPENDENTLY VERIFIED. No untrusted URL fetching, automatic certificate assertion, registrar ownership inference or DNS changes occur. Missing evidence remains NOT RECORDED and must be supplied by an authorized operator after actual verification.

Core validation: PASS, 283 tests / 23 files, lint, TypeScript, production build, schema validation, fresh/repeat migration deployment, drift/integrity and isolated snapshot/restore. Local authenticated browser checks: PASS, all 17 Boss views, 37 screenshots at 320/390/768/1440/1920px, zero page errors/page overflow, urgent-before-inventory ordering, expanded domain evidence, navigation/filter regression and timezone restoration. Verification session revoked. Final release/browser evidence is recorded below after execution; a build is not production acceptance. The 30-second manager usability exercise, physical devices and screen readers remain MANUAL VALIDATION. Missing actual domain ownership/DNS/certificate checks remain external evidence prerequisites. Phase 4 is not started.

Final release: PASS, Railway `6bb8e67a-ed24-462d-89ba-4d10e6af4f30` on 2026-10-06. The earlier Phase 3 upload `9a3f38b2-917e-4fb2-8132-080d35094455` is superseded. Final full regression: 283 tests / 23 files; lint, explicit TypeScript and production build passed. Local and live HTTPS browser acceptance passed all 17 views and 37 screenshots each at 320/390/768/1440/1920px. Exact queue and inventory counts matched their drill-down rows, saved filters survived back navigation, no page errors/page overflow occurred, expanded domain evidence stayed readable, drawer/keyboard navigation passed and UTC save/reload/IST restoration passed. Live health/readiness returned HTTP 200. Stored IST and absence of the latest verification session were independently confirmed with a matching logout audit.

An initial live acceptance attempt timed out during the timezone checks after saving UTC, and its automatic cleanup did not complete. The exact failed verification session was identified by user and creation timestamp; IST restoration and that session's revocation were performed transactionally with audit. A complete retry passed, including normal logout. The failure is retained here rather than reported as an uninterrupted first-run success. No business demonstration records, credentials, signing secrets, permissions, provider activation or database schema were changed. CLI-deployed source still needs committing/pushing; physical devices, screen readers, the timed 30-second Boss exercise and actual external domain ownership/TLS evidence remain MANUAL VALIDATION.

Phase 3 implementation files: src/server/group/boss-overview.ts; src/server/group/boss-service.ts; src/server/domain/executive-service.ts, execution-service.ts and operations-service.ts; src/app/app/boss/page.tsx, overview.tsx and domain-evidence.tsx; src/app/app/executive/view.tsx; src/app/globals.css; tests/boss-overview.test.ts, boss.test.ts and operations.test.ts; scripts/boss-browser-smoke.mjs; this architecture record. Earlier Phase 1/2 work is preserved. The local preview is http://127.0.0.1:3004/app/boss. Phase 4 is not started.

## Boss Navigation And Design Phase 2

The 17 Boss views are grouped under Overview, Companies, Work, Decisions, People and System. Desktop and mobile navigation share one model; detailed modules live within the active group. Page titles identify the current view. Breadcrumbs, company context, fixed internal return destinations and account information replace the old shell wording and equal-weight 17-tab navigation. Company authorization and Phase 1 filters remain server-controlled.

The mobile drawer is modal, named, keyboard-cyclic, Escape-dismissible and returns focus to its trigger. Navigation and command controls use 44px minimum targets, with visible focus and text status labels. Tables retain contained horizontal scrolling. This follows the W3C target-size guidance (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), but does not claim a complete accessibility audit.

Account preferences persist the selected IANA display timezone. The Boss account initially uses Asia/Kolkata / IST. Saving preferences affects only the authenticated account and is audited transactionally; stored instants, UTC date-filter semantics and domain scheduling remain unchanged. Validation evidence is recorded after executing the release checks, not inferred from screenshots or a successful build.

Local release checks: PASS, 275 tests / 22 files; lint, TypeScript, production build, Prisma validation, fresh/repeated migration deploy, drift/integrity and isolated snapshot/restore. Local authenticated browser checks: PASS, 17 views / 32 screenshots at 390, 768, 1440 and 1920px; zero page errors or page-width overflow, retained filters, drawer focus cycling/Escape/return, keyboard skip link and timezone save/reload/restore. A private pre-migration production snapshot passed integrity and foreign-key checks; the additive migration applied successfully. This one snapshot does not certify a recurring backup/recovery policy. Screen-reader and physical-device acceptance remain MANUAL VALIDATION.

Final corrected release: PASS, Railway deployment `5b9b89e2-eac4-44c9-b2e2-80f6652728a5` on 2026-10-06. Live Boss sign-in and authenticated browser acceptance passed for all 17 views with 37 screenshots at 320, 390, 768, 1440 and 1920px, zero page errors and no page-width overflow. Individual status words remain unbroken in compact metric labels. My Tasks, Approvals and Performance indicators opened from grouped navigation and returned to the original company/view/filters; applying a task-specific TODO filter did not overwrite the Boss ACTIVE filter. Drawer focus cycling, Escape/focus return, keyboard skip link and UTC preference save/reload passed; IST was restored and the verification session revoked. Live health/readiness both returned HTTP 200. The local corrected drill-down suite also passed with 37 screenshots. Earlier cross-module status leakage and 320px word wrapping were caught during acceptance and corrected before this final PASS. Physical-device/screen-reader validation remains MANUAL VALIDATION. Changes were CLI-deployed, not committed/pushed to Git.

## Boss Reliability Phase 1

The existing group, authorization and executive services remain the source of truth. `boss-reliability.ts` validates allowlisted filters and projects authorized rows only after intelligence calculation. Company selection remains server-validated; project/product selection passes the executive service's resource and company-scope checks. GET forms and Boss navigation preserve company, view, project, product, dates, severity and status. Invalid dates, ranges, duplicate filter values and unknown statuses are rejected rather than silently ignored.

Work-list date filters use record update time in UTC, including the complete selected end day. Changes use event occurrence time; a changes status filter matches the authorized source entity's current status and excludes changes whose source status cannot be established. Severity applies to severity-bearing attention/risk records, not unrelated project lifecycle states. Project/product filters constrain the selected work view. Current snapshot metrics are explicitly labeled and do not become historical totals when dates change. Company health and card counts remain the current selected-company snapshot, unaffected by work-list filters; removing a blocked project from a displayed list cannot remove its health evidence.

Accessible empty sources display zero counts and empty lists. Inaccessible sources display Not authorized, missing configuration displays Not configured, unverifiable sources display Unavailable, and absent optional timestamps display Not recorded. Membership records are not represented as employment headcount. Company cards disclose readable metric coverage, record count, calculation time, latest record update and a seven-day recency indicator (not a completeness/SLA guarantee). Companies without recorded work are not declared healthy; limited coverage remains explicit even when no concerns are visible.

System status separates request observations (application response, authenticated session and migration-manifest readiness) from operational assurance. Backup, monitoring and deployment acceptance remain NOT VERIFIED until independently evidenced; neither a served production request nor NODE_ENV verifies those assurances. SIA controls require an active identity, an enabled registered read tool, intersected human/agent authority and an available configured provider. Listed tools describe the selected identity's actual permitted read capabilities. No autonomous execution, provider integration, new permissions, schema change or migration is introduced.

Brands & Domains uses an explicitly sized four-column table with a 190px status column and contained keyboard-accessible horizontal scrolling on narrow screens. Existing navigation and visual identity are unchanged. Regression coverage extends `tests/boss.test.ts`; `scripts/boss-browser-smoke.mjs` checks actual authenticated rendering, filter submission/navigation, invalid-filter handling, table sizing, overflow and session cleanup across desktop/tablet/mobile-sized viewports. Playwright is supplied through PLAYWRIGHT_MODULE or an existing installation, not installed into the application runtime.

Core validation: PASS, 269 tests across 20 files; lint, TypeScript, production build, Prisma schema validation and migration validation. Migration validation includes fresh/repeat deploy, drift, integrity and isolated snapshot/restore.

Live validation on 2026-10-06: PASS. Final Railway deployment `860cf6d5-9a9a-468f-a33b-f0ba9f282be5` succeeded without database, variable or credential changes; application health and schema readiness both returned HTTP 200. Actual HTTPS Boss login, all 17 views, combined company/view/status/date filter submission and navigation, invalid-date handling and logout/session revocation passed. Chromium checks captured 31 screenshots at widths 390, 768, 1440 and 1920; no page JavaScript errors or page-level horizontal overflow. Narrow-screen table scrolling was exercised and the status column was verified fully visible and readable. Desktop overview/Brands, Briefing's qualified company-health table and scrolled mobile Brands screenshots were visually inspected. Briefing uses the same company-snapshot health, coverage and counts as the company cards, not a filtered-project assessment disguised as company health. Physical-device, production backup restore and full monitoring acceptance: NOT RUN / MANUAL VALIDATION; request observations do not certify those assurances. An initial final-browser attempt encountered a transient HTTPS error; a connection check and complete retry passed.

Residual dependency risk outside Phase 1: npm audit reports five high-severity development-toolchain entries, through eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces. This phase does not silently change dependencies or assert a clean dependency-security audit. Dependency remediation requires a separately tested upgrade; no database migration is required for this dashboard work.

## Current Identity And Activation Update

### Separate AIRA Domain Gateways

#### Five-Domain Routing Update

#### Railway Sign-In Recovery

Production repair performed on 2026-10-06: PASS. The authenticated Railway CLI confirmed the MAXPASE application service had no application authentication/database variables, no app volume and no existing SQLite database file. A new app-only volume was mounted at /data; the separate PostgreSQL service and its data were untouched. A generated stable signing secret was sent via private stdin, the persistent SQLite URL/canonical HTTPS origin/secure-cookie settings were configured, and deployment c1285f3a-cbb1-4549-99a1-0dc2da90e65a succeeded. All 12 existing SQLite migrations were applied. The canonical Boss account was provisioned through private SSH stdin in the persistent database; only its bcrypt hash persists and no BOSS_PIN service variable was created.

Production HTTPS verification: PASS, readiness 200, real Boss PIN form submission, secure HttpOnly host-only cookie, all 17 command-center views, logout and session replay rejection after logout. The smoke used scripts/production-boss-smoke.ts and revoked its test session. Local verification also passed 38 focused authentication/security tests, lint, TypeScript, production build and the actual local Boss form. No interactive browser, mobile or physical-device acceptance was performed. The repair is a CLI upload of validated local source; the code changes still need committing/pushing so a later GitHub deployment retains them.

Separate domain findings: Railway attaches airastartupskool.online, not the requested airastartupskool.com. Nice Jobs is attached but its certificate is VALIDATING_OWNERSHIP and public HTTPS fails validation. airaskillcity.com returned a matching public identity but is not attached to this selected application service, so it is not accepted as deployment evidence. No unrelated domains were removed/reassigned, no DNS provider changes were made, and certificate checks were never bypassed. These are separate domain-routing prerequisites, not a failed MAXPASE Boss login.

The public production checks found a PIN form on maxpase.com but unavailable readiness and a branded gateway returning Gateway configuration unavailable. The latter is specifically emitted when the runtime AUTH_SECRET is absent or shorter than 32 characters. A Railway PostgreSQL service is not compatible with this repository's SQLite Prisma provider and 12 SQLite migrations; its presence alone does not prove which DATABASE_URL the application uses. Do not change the provider or replace an existing production database as an incident workaround.

On the MAXPASE application service (not the PostgreSQL service), confirm a persistent volume is mounted at /data, preserve/back up any existing business database before changing paths, and configure DATABASE_URL=file:/data/maxpase.db, a private stable generated AUTH_SECRET of at least 32 characters, APP_ORIGIN=https://maxpase.com, AUTH_COOKIE_SECURE=true and BOSS_EMAIL=boss@maxpase.com. Reuse the actual existing persistent SQLite path when one exists. Never point DATABASE_URL to the PostgreSQL connection string. An example, blank or development signing secret is rejected. All five domains must use this same configured application service.

After deploying the code, run these commands inside the actual application container with its volume and runtime variables available, not on a laptop and not in a pre-deploy container lacking the mounted volume:

```sh
npx --no-install prisma migrate deploy
npx --no-install tsx scripts/provision-boss.ts
```

Provisioning is an explicit reviewed operator action. Supply BOSS_PIN through a private one-off environment, never command arguments, source, logs or a fixed seed; remove it afterward. Provisioning may rotate an existing Boss credential and revokes existing sessions. No general development seed is required. The two operator scripts now tolerate an absent .env file and validate runtime settings rather than requiring a development file on Railway. The runtime must include the Prisma CLI and tsx for these operator commands; a production install omitting those tools requires an approved maintenance artifact containing them. Account activation is not performed automatically on application startup.

Redeploy/restart the configured service, require /api/ready to return 200, then verify Boss login and all five public hosts. Server startup Ready is not database readiness. Auth/readiness logs now add only controlled stage/reason categories (origin_or_host_rejected, auth_secret_invalid, persistent_sqlite_url_required, secure_cookie_required, https_app_origin_required, database_schema_missing or database_configuration_or_connection_failed); no exception message, stack, credentials or environment values are logged or exposed in endpoint responses. Live Railway configuration and production provisioning remain operator prerequisites, not claims made by local validation.

The five requested experiences now route independently on the same application:

| Domain | Landing | Login | Protected destination |
| --- | --- | --- | --- |
| maxpase.com | Existing MAXPASE Group | /login: Boss email and six-digit PIN; /staff/login: staff password | /app/boss or existing staff workspace |
| airaskillcity.com | AIRA Skill City, including links to the three specialist sites | /login: email/password | /gateway: company-bounded AIRA workspace |
| airastartupskool.com | AIRA Startup School | /login: email/password | /gateway: Startup School division |
| airalabs.online | AIRA Labs | /login: email/password | /gateway: Labs division |
| nicejobs.online | Nice Jobs | /login: email/password | /gateway: Career Hub division |

Skill City has its own host-only aira_skillcity_session cookie and distinct JWT audience. It requires active AIRA company lifecycle and organization.read at the company; division membership alone is not company authority. Company-level entry never grants blanket resource access: program/project/task/goal permissions still filter source queries. No new company, division, account, credential or schema was introduced. The existing scoped-resource adapter's divisionId field denotes the entry organization for Skill City; its value is the existing company id, not a newly fabricated division. Local preview: /sites/skillcity. Its photograph is illustrative and reused from the existing group asset, not evidence of facilities.

Railway must attach all five domains to the updated service and deploy this build. Keep APP_ORIGIN=https://maxpase.com for the primary corporate login, stable AUTH_SECRET, production secure cookies and persistent database storage. Each AIRA portal validates its own exact HTTPS origin. Next's origin allowlist includes the five exact root/www pairs; application origin validation remains authoritative and does not allow cross-site login actions. The corporate www hostname should be canonicalized to maxpase.com at the edge. No DNS, TLS, live account activation or production deployment is claimed by local changes.

Five-domain update validation: PASS, 263 tests across 19 files, lint, TypeScript and production build. The focused company-entry test rejects division-only authority, verifies Skill City JWT isolation against the group and all three sibling realms, checks permission-filtered empty programs and denies suspended company membership. The isolated four-AIRA-domain HTTP smoke verifies real form submissions, five authorized gateway views and cross-brand replay denial; the MAXPASE Host check verifies its own landing, PIN form and protected command-center redirect without creating a Boss fixture credential. No database/schema changes. Live Railway and browser/device acceptance: NOT RUN.

The latest confirmed brand domains are airastartupskool.com (Startup School), airalabs.online (AIRA Labs) and nicejobs.online (Nice Jobs). They supersede the earlier proposed domains in this historical document. All remain part of AIRA SKILL CITY PRIVATE LIMITED; Startup School uses the existing aira-startup-school division, Labs uses aira-labs, and Nice Jobs remains a Product under aira-career-hub. No new companies, users, role assignments, employment or jobs data are invented.

Each exact root/www hostname serves its own landing page at /, email/password login at /login and protected workspace at /gateway. Unknown hostnames retain the main MAXPASE experience. Corporate /app, /boss, /staff and internal /sites routes are not exposed on branded hosts. Local non-production previews are /sites/startup, /sites/labs and /sites/jobs. Production previews through unrelated hostnames are denied.

These are separate authentication realms over the existing central User/Person/Membership authorization system, not duplicate identity databases. Each uses a different HttpOnly, SameSite=Lax, host-only cookie; production cookies are Secure. JWT audiences are brand-bound, with eight-hour expiry, database revocation, current active lifecycle and division permission checks. Brand tokens cannot authenticate to the group or another brand even when copied into a sibling cookie. Existing Boss PIN and staff-password flows remain separate and unchanged. No shared fixed brand credential or public signup is created. Account provisioning remains the existing reviewed workforce process; organization.read at the respective division enables entry, while program/project/task/goal reads retain their own permissions.

Host routing is selected only from an exact hostname allowlist, never a client query, actor identity or arbitrary forwarding header. Middleware overwrites incoming forwarding/portal headers and signs a short-lived routing envelope using a domain-separated HMAC with the existing stable AUTH_SECRET. Only a verified envelope on the internal worker hostname preserves the original brand when Next forwards actions between workers. Both middleware and server-side portal handling verify the signature, registry host/id pairing and two-minute lifetime. This envelope supplies routing context, not user identity or permission. Same-origin HTTPS mutation checks still require the original selected brand; no wildcard CORS/origin bypass is introduced. The reverse proxy must preserve the actual original Host. Portal redirects use canonical HTTPS hosts, not an internal Railway/localhost address. Explicit AUTH_SECRET configuration is required for branded-domain routing even in a local Host-header simulation; local /sites previews retain their non-production-only boundary.

The gateway exposes authorized, paginated programs, projects, tasks and goals from existing services with division-bounded source reads and safe fields. Absent or unreadable content renders NO DATA. This is not a fabricated job board, CRM, admissions or LMS implementation. Brand registration/domain records are not proof that Railway has deployed this build. Deploy the updated artifact to the existing service, verify all custom-domain DNS/TXT/TLS records in Railway, retain stable production AUTH_SECRET and Secure cookies, and retain persistent absolute SQLite DATABASE_URL plus the existing primary APP_ORIGIN. Portal origin validation is hostname-specific rather than incorrectly reusing the primary origin. No production deployment or provider activation was performed here.

The portal HTTP test uses a separate migrated disposable database and server on local port 3029 with .next-portal-smoke output, never the real operating database. Its MAXPASE_PORTAL_SMOKE flag selects that directory only outside production. Runtime-generated test credentials are not printed. Browser/mobile visual acceptance and deployed Railway E2E are separate manual prerequisites.

Current gateway validation: PASS, 262 tests across 19 files, lint, TypeScript, production build, Prisma schema validation and migration validation (fresh chain, repeat deploy, drift, integrity and isolated local snapshot/restore). No schema or migration changes were required. Real local HTTP checks on all three Host names passed distinct landing/login rendering, actual password form submission, five protected gateway views, canonical missing-session redirects, corporate-route isolation and cross-brand cookie replay denial. The existing local health/readiness, security-header, missing/forged-session and oversized-webhook smoke checks also passed. These are local code/runtime checks, not evidence of Railway deployment. Production deployment and browser/device visual acceptance: NOT RUN.

Primary-login regression after gateway routing: PASS. The actual local Boss PIN form authenticated successfully, all 17 command-center views and authorized company context loaded, forged company scope was denied and the smoke session was revoked. The existing Boss credential was verified privately, not reset or copied into a brand account.

Latest local activation: PASS. The requested Boss account was explicitly provisioned in the existing persistent local database via masked terminal input; only its bcrypt hash is stored. No fixed PIN was added to source, .env, seed output or frontend. Actual local /login form submission succeeded, all 17 protected command-center views loaded, company selection worked, forged company scope was denied and the test session was revoked through the existing authentication service. Full regression: 252 tests across 18 files PASS. Lint, TypeScript and production build PASS; Prisma schema validation PASS with no schema/migration changes. Browser/mobile screenshots and physical-device acceptance NOT RUN because no connected browser surface was available. This is local activation, not production deployment. The credential was supplied in chat and should be rotated privately before production use.

The latest user direction restores MAXPASE GROUP / MAXPASE OS and the canonical Boss email boss@maxpase.com. The MAXSPACE names and prior blocked activation below are historical implementation evidence, superseded by this update. The company/brand structure, existing authorization, protected command center and technical identifiers remain unchanged. The public root now presents the group landing page; /login and /boss/login accept email plus six numeric digits. Staff password authentication remains at /staff/login. Boss provisioning is an explicit, transactional database seed using private process configuration; only the bcrypt hash persists. Never embed a fixed credential in a development seed or frontend. Normal server restarts do not reset the Boss hash. The landing image is an illustrative workspace photograph, not evidence of actual MAXPASE premises. No deployment or DNS configuration is implied.

MAXSPACE GROUP is the canonical group-facing identity. MAXSPACE OS is the existing shared operating system, and maxspace.com is the intended group domain. No production domain, DNS, certificate, deployment or provider has been configured by this implementation.

## Structure

| Company | Brand | Confirmed domain |
| --- | --- | --- |
| AIRA SKILL CITY PRIVATE LIMITED | Aira Skill City | airaskillcity.com |
| AIRA SKILL CITY PRIVATE LIMITED | Startup School | startupschool.com |
| AIRA SKILL CITY PRIVATE LIMITED | AIRA Labs | airalabs.com |
| AIRA SKILL CITY PRIVATE LIMITED | Nice Jobs | nicejobs.com |
| PEARN PRIVATE LIMITED | TeachX Guru | teachx.guru |
| PEARN PRIVATE LIMITED | LearnX Guru | learnx.guru |
| TOP RANK AI PRIVATE LIMITED | Top Rank AI | NO DATA unless already recorded |

These user-provided domains replace earlier proposed startup/job domain names. Domain records are NOT VERIFIED, not proof of registration, ownership, connectivity or live service. Existing TeachX Guru name/identity is never silently renamed; conflicting records cause initialization rollback. No pre-existing TeachX logo or brand asset was found in this repository, and none was replaced.

AIRA retains AIRA Startup School, AIRA Labs, AIRA Skill Studio and AIRA Career Hub. Nice Jobs remains the same company-owned Product under Career Hub, not a company. TeachX Guru, LearnX Guru and Top Rank AI reuse company-owned Brand and Product records; new platforms are registered CONCEPT, not asserted live. Existing unrelated companies and operational records remain untouched. Supplied legal names do not verify registration, directors, shareholders, addresses or financial details.

## Distinct Concepts

Group is the ecosystem; Company is a separate business entity; Brand is a market identity; Product is an offering/platform; Project is work; Person is a human identity; User is an account; Membership relates a person to organization/project; Role is a designation; Permission is an explicit capability; Ownership is separately recorded evidence. Responsibility, reporting, employment, membership, roles and permissions never imply equity. Missing ownership is NO DATA. No employment/HR ledger has been invented from membership.

## Preserved Identifiers

The root Organization id, maxpase-group slug, AIRA ids/division slugs, Nice Jobs id, database/migration history, package name, maxpase_session cookie default, JWT issuer/audience, existing permission keys and MAXPASE_CREDENTIAL_BINDING environment contract are intentionally retained. Historical phase/audit reports retain their original naming and findings. The current name supersedes their product-facing identity, not their historical evidence. No global text replacement or root transfer occurred.

## Boss Panel

/boss routes to the existing protected /app/boss when authenticated, otherwise /boss/login. The Boss Panel uses the same App Router application and session shell. /app remains the existing staff convention and routes the Boss to the panel; other users retain the executive workspace.

The Boss identity alone grants nothing: the service requires the exact configured canonical email, active current account/person, explicit boss.access and executive.read at the actual root. Company options require company.read, organization.read and executive.read. Selected companies must belong to the root and be present in the authorized selector. Scoped resolvers restrict source reads before executive calculations. Every detail link invokes the original domain authorization. No authorization engine, Business Graph engine, SIA identity or workflow engine is duplicated.

The home prioritizes attention, decisions/personal approvals, company health, deadlines and blockers. Progressive sections expose brands/domains, safe membership labels, projects/goals/operations, briefing/risks/opportunities/changes, communications, graph relationships, recent audit and system status. Executive detail rendering reuses existing components and a server-only already-authorized DTO. Company cards and displayed counts describe authorized database records, never revenue, valuation or fabricated headcount. Missing rows render NO DATA; existing executive metrics retain their zero-versus-unknown contracts. Audit displays at most 50 safe entries, no metadata, secrets or cross-scope global authentication history. Own authentication events are visible only with root audit authority. Employee data remains NO DATA.

## Credential Provisioning

The required sign-in is boss@maxspace.com plus exactly six numeric digits. No final PIN was supplied and none was guessed. BOSS_EMAIL, if supplied, must match the canonical address. A configured BOSS_PIN of any other shape is rejected with a generic error that contains no value.

An authorized database/deployment operator explicitly runs `npx --no-install tsx scripts/provision-boss.ts` with BOSS_PIN supplied privately through the process environment or an approved secret mechanism. Do not place the value in a command argument, checked-in file, terminal output, documentation or screenshot. Do not run this command with a development/example credential in production. Remove BOSS_PIN from the runtime environment after provisioning; normal web login reads only the stored bcrypt hash. No runtime startup seed/provision step exists.

Provisioning uses existing Person/User.passwordHash/Membership/Role/RolePermission, creates a reviewed non-GLOBAL capability set at the root with descendant coverage, records audit and revokes prior sessions atomically. It neither grants SIA roles/tools nor creates ownership. Existing non-provisioned accounts or incompatible roles/memberships require reviewed conversion, not silent takeover/reactivation. PIN rotation uses the same explicit command and revokes old sessions. The Boss credential marker lives in existing Person metadata; authorization still depends on permissions, never that marker.

Boss login reuses authenticationService, bcrypt cost 12, JWT issuer/audience, database sessions, secure cookie/origin protections and required login/logout audits. Staff password validation stays unchanged. PIN attempts share the global authentication limiter and fixed account bucket, with at most five attempts per 15-minute UTC window and 20 per UTC day, including malformed PINs. Boss sessions expire after eight hours and recheck current lifecycle. PINs have lower entropy than long passwords: reviewed TLS edge controls, monitoring and secure initial delivery remain required; no MFA or production penetration-test certification is claimed.

## Initialization

`npx --no-install tsx scripts/initialize-group.ts` explicitly initializes only supplied structure in one transaction. Existing development seed also invokes that helper. Nothing runs on page access/startup. Structural conflict rolls back rather than reparenting resources. Repetition retains business ids and creates no duplicate companies, ownership, employees, tasks or metrics. This is an operator data change, not a schema migration. The actual Boss account is not provisioned by the development seed.

## SIA And Operations

SIA remains the existing shared Virtual CEO with controlled registry/tool activation and user/agent/requested-scope intersection. Ask SIA opens the existing interface; no agent grant or enabled tool is created. Independent human approvals, explicit confirmation, request fingerprints, idempotency, transactionally verified create_task and disabled autonomous high-impact execution remain unchanged. Graph ownership and reviewed memory never confer authority. Wave 01/02/F06 repaired paths are not replaced.

Communications and automation are linked to existing scoped views. Registered integrations/jobs show actual statuses; absent integrations are NOT CONFIGURED, mock results are SIMULATED and live delivery stays NOT VERIFIED. System status distinguishes local request/schema/session evidence from production, backup and monitoring acceptance, which remain NOT VERIFIED.

## Production Boundary

PRODUCTION READY - EXTERNAL/MANUAL PREREQUISITES REMAIN is a conditional code-readiness verdict, not deployment approval. Real Boss activation is BLOCKED pending private confirmed PIN provisioning. Production persistence, TLS/edge, canonical APP_ORIGIN, secrets, monitoring/paging, capacity/concurrency/SLO, backup/recovery/rollback, fresh approved dependency inventory and clean artifact acceptance, deployed E2E and browser/mobile/accessibility acceptance remain separate prerequisites. External providers remain deliberately unconfigured. No launch/provider/autonomous activation is performed here.

## Final Validation

| Check | Status | Evidence |
| --- | --- | --- |
| Full regression | PASS | 252 tests across 18 files: previous 242 plus 10 focused Boss tests; existing tests unchanged |
| Boss tests | PASS | Hash verification, invalid configuration, throttling, expiry/revocation/rotation, permission gate, company isolation, source permission revocation, transactional audit rollback, inactive/global-authority provisioning rejection |
| Wave 01, Wave 02, F06 | PASS | Existing remediation and context scalability suites pass within full regression; repaired engines unchanged |
| Lint | PASS | npm run lint |
| TypeScript | PASS | npm run typecheck |
| Production build | PASS | npm run build; new Boss CSS compatibility warnings resolved |
| Prisma | PASS | Schema validation and Prisma Client generation; no schema change |
| Migration history | PASS | Existing 12 migrations; fresh deploy, repeat deploy, status, zero schema drift, integrity, local snapshot/restore |
| Local HTTP | PASS | Health/readiness, security headers, staff login, webhook size rejection, missing/forged sessions; Boss redirect and numeric PIN form with no preset value |
| Explicit local initialization | PASS | Three supplied companies, seven brands, six supplied domains, four products, canonical AIRA roles preserved, zero ownership records, zero Boss accounts |
| Actual Boss activation | BLOCKED | Confirmed private PIN not supplied; no credential guessed or persisted |
| Browser/device/accessibility acceptance | NOT RUN | No actual interactive browser or physical-device acceptance claimed |
| Production deployment/providers | NOT RUN | Explicitly outside this task |

Temporary migrated test databases use runtime-generated disposable credentials, not fixed PIN literals. Those databases are removed after testing. Local HTTP checks are not authenticated production E2E or browser acceptance. The local development URL is http://127.0.0.1:3000/boss.

## Exact File Inventory

34 source/configuration/documentation files: 13 new and 21 modified. Generated Prisma/build/typecheck artifacts and local SQLite data are not counted as manually edited source. No migration, lockfile, dependency declaration or existing test file changed. This workspace has no Git metadata; this is the explicit implementation inventory, not a Git diff assertion.

### New Files (13)

- src/server/group/identity.ts
- src/server/group/structure.ts
- src/server/group/provision.ts
- src/server/group/boss-service.ts
- scripts/initialize-group.ts
- scripts/provision-boss.ts
- src/app/boss/page.tsx
- src/app/boss/login/page.tsx
- src/app/app/boss/page.tsx
- src/app/app/boss/loading.tsx
- src/app/app/boss/error.tsx
- tests/boss.test.ts
- docs/architecture/MAXSPACE_GROUP_ARCHITECTURE.md

### Modified Files (21)

- src/server/config.ts
- src/server/auth/service.ts
- src/server/auth/actions.ts
- prisma/seed.ts
- src/app/layout.tsx
- src/app/app/executive/layout.tsx
- src/app/login/page.tsx
- src/app/app/layout.tsx
- src/app/app/page.tsx
- src/app/app/executive/view.tsx
- src/app/globals.css
- .env.example
- src/app/app/business/business-manager.tsx
- src/app/app/foundation/page.tsx
- src/app/app/architecture/page.tsx
- src/app/app/aira/layout.tsx
- src/app/app/sia/page.tsx
- docs/architecture/ARCHITECTURE.md
- docs/architecture/SIA_ARCHITECTURE.md
- docs/architecture/SYSTEM_CONSTITUTION.md
- docs/architecture/BUSINESS_GRAPH.md
