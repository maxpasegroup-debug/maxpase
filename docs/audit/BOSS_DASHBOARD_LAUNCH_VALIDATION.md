# Boss Dashboard Phase 5: Validation And Launch

Verification window: 2026-10-06 UTC, crossing into 2026-10-07 IST. Overall launch gate: **BLOCKED** until the external and human gates below are closed. This is dashboard-development Phase 5, not a new operating-system domain phase. No payroll, finance, CRM, messaging provider or autonomous SIA capability is added.

## Agreed Acceptance Criteria

The owner accepted these initial criteria during this run:

- Managers identify the most important next action within 30 seconds and complete approval/follow-up without losing company context.
- Keyboard workflows pass, with no critical accessibility issues remaining after the full accessibility review.
- Representative staging request p95 <= 2 seconds and p99 <= 5 seconds.
- Zero authorization, company-isolation, session-realm, replay or mandatory-audit rollback failures.

Peak concurrency, sustained test duration, production availability window, backup RPO/RTO and alert owners are not yet agreed. Local serial percentiles do not establish those targets. Human acceptance and physical-device/screen-reader participation have been requested; no participant result is invented.

## Automated Evidence

| Gate | Status | Evidence / Boundary |
| --- | --- | --- |
| Domain/security regressions | PASS | 291 tests / 24 files; current authorization, project-only grants, forged scope, approval chains/replay, audit rollback, SIA human boundary. New five-realm matrix validates all 25 source/target pairs and wrong-realm logout cannot revoke the source session. |
| Code/schema quality | PASS | Final production build, lint, explicit TypeScript, Prisma schema validation and whitespace checks. |
| Migration/restore regression | PASS | Fresh migration chain, repeat deploy, drift, integrity and isolated fixture snapshot/restore. No live migration was performed. |
| Runtime dependency audit | PASS | Fresh `npm audit --omit=dev` reports zero advisories; this is not proof that all possible vulnerabilities are absent. |
| Development dependency acceptance | BLOCKED | Fresh full audit reports five high findings through eslint-config-next / fast-glob / micromatch / braces. Dependency changes or risk acceptance need reviewed build-tool treatment; no forced major downgrade was performed. |
| Populated isolated workflows | PASS | Real service mutations in disposable SQLite, long requester/task names, overdue high-priority work, draft/submitted/approved/rejected/cancelled request states, independent reviewer, reminders, escalation resolution, notifications and activity. No production demonstration records. |
| Chrome and Edge | PASS | Installed Chrome 154.0.8037.98 and Edge 154.0.4258.53; 24 screenshots each at 320/390/768/1440px, no page overflow or JavaScript errors. Browser viewport changes are not physical-device testing. |
| Keyboard subset | PASS | Skip link, Enter-driven approval/cancel confirmation and focusable horizontal work tables. Existing navigation smoke covers drawer focus, Escape and company/filter return. This is not a full accessibility conformance verdict. |
| Local service cost | PASS | BOSS_LAUNCH_BEFORE.json and BOSS_LAUNCH_AFTER.json; 100/1,000 authorized tasks plus 6,000 other-company tasks, ten samples/operation after one warm-up, explicit refusal at 5,001 visible tasks, fresh permission revocation denies the next read. |
| Local production-build HTTP | PASS | BOSS_LAUNCH_HTTP.json; 1,000 overdue tasks, 20 serial samples/route after two warm-ups. Overview observed p95/p99 625/632ms; Projects 1,325/1,434ms; Tasks 246/387ms. Loopback response-body completion, not remote TLS, browser rendering or peak concurrency. |
| Production DB integrity | PASS | Read-only production inspection: integrity `ok`, zero FK violations, 13 completed migrations. No schema/credential/data mutation. |
| Existing snapshot recovery | PASS | Existing 0600 snapshot restored into a private ephemeral directory; copied DB migrated from 12 to 13 migrations; checksums/ledger, integrity, FK and timezone schema verified. Temporary copy removed. 925ms is this isolated drill's DB elapsed time, not full recovery RTO. |
| Production deployment | BLOCKED | Last verified live release remains 9f17100d-6381-46d3-93e0-58e7e00a74cb. Final Phase 4 safeguards and Phase 5 optimization are local; explicit deployment approval was requested, not granted. |
| Five-domain launch | BLOCKED | See BOSS_LAUNCH_DOMAINS.json and the domain findings below. |
| Monitoring and backup policy | BLOCKED | No deployment healthcheck path, no monitoring-variable bindings observed, and no independently verified alert delivery, on-call owner, backup schedule/off-site retention or RPO/RTO evidence. Railway resource metrics alone are not application SLO alert acceptance. |
| Full application rollback | NOT RUN | No production rollback/disruption performed. Prior release IDs were inspected, but removed releases are not proof of replayable artifact availability. |
| Physical mobile / screen readers / managers | MANUAL VALIDATION | No actual phone/tablet, NVDA/VoiceOver/TalkBack session or representative manager session was conducted by this automation. |

Build, lint, explicit TypeScript, schema validation and fresh/repeat migration/drift/isolated snapshot restoration are separate verification commands. Final results are recorded in the command run, not inferred from browser results.

Browser reports are retained separately in BOSS_LAUNCH_BROWSER_CHROME.json and BOSS_LAUNCH_BROWSER_MSEDGE.json. Screenshots were captured under `.next/phase5-launch/<channel>` during verification; the final production build cleared that temporary build-cache directory, so the PNGs are not retained. One overlapping Edge verification run timed out during screenshot capture; the sequential rerun passed all 24 captures, including keyboard horizontal scrolling. Capture animations are disabled and its 60-second tool timeout is distinct from the unchanged agreed HTTP response targets. The unsuccessful run is not counted as a passed run.

The current development advisory is [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), affecting braces through 3.0.3 with no patched version listed at inspection. The installed tree is eslint-config-next 15.5.27 -> fast-glob 3.3.1 -> micromatch 4.0.8 -> braces 3.0.3. The audit's proposed change crosses the maintained framework/tooling major and is not a safe automatic fix. Builds must not ingest untrusted glob patterns; runtime package audit remains separately clean. Development-tool risk is not silently converted to PASS.

## Performance Change And Limits

An executive read-only source batch previously checked the same project relationship once per task. It now invokes the existing `ctx.decide("executive.read", scope)` once per distinct organization/project pair **within that batch**. The key includes both IDs; forged cross-company or mismatched project scopes remain denied. Each request/service still creates fresh access contexts; mutation, approval consumption and source-resolution gates are unchanged. No shared authorization cache or cross-request result reuse exists. Empty reminder/escalation assignment projections no longer issue an empty user lookup.

At 1,000 tasks, maximum query count decreased from 1,449 to 448 (69% reduction) and observed local service p95 decreased from 1,298ms to 323ms. Timings are non-concurrent samples from this machine, not controlled production comparisons. The in-memory full service DTO serializes to about 9.8MB due to repeated source projections; this is **not** the network response. The measured Projects HTML is about 1.46MB because its existing detailed work section includes the project tasks. That size remains a bandwidth/rendering risk and needs representative network/concurrency acceptance; no silent truncation was introduced to improve counts. The 5,000-record read ceiling remains explicit.

## Domain Findings

- `maxpase.com`: PASS DNS, certificate chain/hostname/dates, correct root, email/PIN login and anonymous Boss redirect.
- `airastartupskool.com` and `airalabs.online`: PASS DNS/TLS/correct root, existing email/password portal login, anonymous gateway redirect and corporate-route 404. Portal passwords are the current source-of-truth flow; the Boss PIN is not silently copied into portals.
- `airaskillcity.com`: BLOCKED. TLS/root/login respond, but `/gateway` is 404 and the expected portal-password field is absent. Railway's selected app lists only the other four domains. Branding alone does not prove this host reaches the intended service. Operator must review its existing service/DNS ownership before any attachment/routing change.
- `nicejobs.online`: BLOCKED. Two strict TLS probes reported `ERR_TLS_CERT_ALTNAME_INVALID`. Certificate validation was not disabled; authenticated HTTP was not attempted through the failing certificate. Operator must resolve custom-domain/certificate provisioning and repeat the strict check.

Host-only distinct cookie names and signed audience separation are implemented and exercised in isolated tests. Live logged-in cross-host tests with authorized accounts on each portal are **NOT RUN**; public redirects are not proof of successful authenticated isolation. No production PIN, token or SQL/business payload is stored in validation reports.

## Remaining Launch Actions

1. Resolve the Skill City routing and Nice Jobs certificate findings under reviewed domain ownership; rerun the public validator and then authorized cross-host login/logout tests.
2. Confirm a named on-call/data owner, monitoring probes/histograms, redaction policy and tested alert route. Configure approved liveness/readiness deployment checks without equating them to historical uptime.
3. Agree RPO/RTO; configure and prove scheduled backups, protected off-site retention, access restrictions and an age alert. The existing same-volume manual snapshot is not a complete disaster-recovery policy.
4. In an approved private staging deployment, test a retained prior app artifact against a restored/migrated snapshot, run the same smoke tests, record rollback/recovery time and document forward migration compatibility. Do not downgrade the live DB or blindly select a removed Railway release.
5. Run agreed peak concurrency/sustained workloads over a representative network/TLS edge, including failed requests, rate-limit/query-capacity refusals, SQLite locks, disk and audit/transaction failures. Record p95/p99/error rates and body/render cost. Never reset security budgets to make a load test pass.
6. Conduct the actual device, screen-reader and manager sessions below, fix observed defects, rerun affected automated tests and obtain owner sign-off.
7. Approve and deploy the final tested artifact; run read-only live acceptance, verify session cleanup and retain rollback evidence. Git commit/push was not requested or performed; a future Git deployment must not overwrite the local verified changes.

## Human Acceptance Session

Use isolated staging accounts and synthetic data only. Record participant role (not private identifying data), device/browser/assistive technology version, release, task time, incorrect decisions, prompts needed, severity and outcome. Do not collect PINs or screen recordings of private production work.

| Scenario | Success Criterion | Current Result |
| --- | --- | --- |
| Open Overview and identify the next action | Correct record/owner/next step within 30 seconds, without coaching | MANUAL VALIDATION |
| Switch company, open an overdue task and return | Same company and original filters; no foreign work visible | MANUAL VALIDATION |
| Review pending evidence, cancel once, then decide with a reason | Correct authorized approval; explicit result/history; no double decision | MANUAL VALIDATION |
| Prepare a request, assign follow-up, add a reminder and resolve an escalation | Correct recipient/owner/scope and clear saved or failed state | MANUAL VALIDATION |
| Reopen a named filter and read a notification | Company-specific preset, correct private unread state | MANUAL VALIDATION |
| Keyboard-only navigation and horizontal tables | Visible focus, usable skip/drawer/forms, no trap, no clipped required action | MANUAL VALIDATION |
| Actual Android/iOS touch, text enlargement and orientation | Long labels, inputs, evidence, confirmation and table access remain usable | MANUAL VALIDATION |
| NVDA/VoiceOver/TalkBack | Names/roles/state, labels, table headers, errors/success, drawer and native confirmation announced meaningfully | MANUAL VALIDATION |

Accessibility review references: [W3C keyboard guidance](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), [visible focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Automated keyboard checks do not replace testing with real assistive technology.

## Reproduction

Run from the repository, with no overlapping owned Next preview when rebuilding or running fixture servers:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run prisma:validate
npm.cmd run validate:migrations
npm.cmd run build
npx.cmd tsx scripts/benchmark-boss-launch.ts BOSS_LAUNCH_AFTER
npx.cmd tsx scripts/benchmark-boss-http.ts
node.exe scripts/validate-launch-domains.mjs
```

For `operations-browser-smoke.ts`, point `PLAYWRIGHT_MODULE` at an installed Playwright module and select `BOSS_BROWSER_CHANNEL=chrome` or `msedge`; execute the runs sequentially. The harness owns a disposable DB/server and removes both. Reports contain timing/count/state evidence, never secrets. Domain checks intentionally exit nonzero when a required host fails. Service and HTTP benchmarks do not certify human usability or production SLOs.

Phase 5 changed modules: `executive-service.ts` read-only scope batching; typed existing `ExecutionQuery.sort`; focusable operations/execution tables; populated multi-browser harness; five-realm and scope/revocation regressions; three validation scripts and their generated public/synthetic measurement reports; this launch dossier and architecture references. Existing migrations and all out-of-scope domain functionality remain unchanged.
