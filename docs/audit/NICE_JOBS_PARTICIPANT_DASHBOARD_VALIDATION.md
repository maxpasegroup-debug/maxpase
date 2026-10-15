# Nice Jobs Participant Dashboard Validation

Date: 2026-10-10. Overall: PARTIAL; implementation is local, visual/mobile and launch sign-off are outstanding.

Latest independent QA: 2026-10-11, Overall PARTIAL. The browser acceptance gate remains BLOCKED. The earlier implementation results below are historical; the Phase 2 section records the current verification and fixes.

## Results

| Check | Status | Evidence |
| --- | --- | --- |
| Participant dashboard and shared routing | PASS | Home, sidebar/header, action cards, My Day, application updates, verified catalogue, persisted learning progress and existing detailed destinations implemented. |
| Stage/authority boundaries | PASS | Existing readiness-backed employee service retained; isolated Home projection verifies own tasks, candidate-safe summaries, company denial and loss of worker access after suspension. |
| Own finance, knowledge and application regressions | PASS | Relevant existing authorization, scope, replay, evidence, earnings and transactional service tests pass. |
| Unit/static component and service tests | PASS | Final relevant run: 9 test files, 127 tests passed. |
| Lint | PASS | npm.cmd run lint completed with exit 0. |
| TypeScript | PASS | Final standalone npm.cmd run typecheck completed with exit 0 after correcting a nullable organization ID. |
| Production build | PASS | Final npm.cmd run build exited 0, including compilation, lint/types and generation of 21 static pages. An earlier attempt failed the nullable-ID type check and was not counted as a pass. |
| Git whitespace | PASS | git diff --check exited 0; only repository LF/CRLF normalization warnings. |
| Scoped documentation/new-file checks | PASS | PowerShell checked trailing whitespace in new files and relative Markdown links in the three task documents; no failures. |
| Local unauthenticated HTTP smoke | PASS | GET Jobs gateway contains Next's streamed redirect to /sites/jobs/login; direct login returns 200 with the email form; reused image returns 200. This does not validate an authenticated dashboard or browser navigation. |
| Browser inspection | BLOCKED | Computer-use inventory returned no browsers; opening Chrome returned 'Browser is not available: chrome'. playwright-core, playwright and @playwright/test cannot be resolved locally. No package was installed to bypass this. |
| Physical mobile/keyboard/screen reader/contrast/overflow checks | NOT RUN | Responsive CSS, landmarks, focus styling, native menus and touch sizes are implemented, but no visual or accessibility pass is claimed. |
| Malayalam | NOT CONFIGURED | English only. Malayalam is disabled rather than partially translating essential workflows. |
| Live authentication/email/provider/payout and production domains | NOT VERIFIED | No live provider or production session was tested. Existing Resend setup, consent and payment-provider requirements remain unchanged. |
| Pilot publication and activation | BLOCKED | Existing business approval register remains authoritative. No real participant or pilot listing was activated or published. |

Exact final regression command:

```powershell
npm.cmd test -- tests/nicejobs-dashboard.test.ts tests/nicejobs-participant-routing.test.ts tests/nicejobs-participant-workspace.test.ts tests/nicejobs-employee.test.ts tests/nicejobs-finance.test.ts tests/nicejobs-applications.test.ts tests/nicejobs-knowledge.test.ts tests/nicejobs-control-navigation.test.ts tests/portals.test.ts
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Initial broad run: six service/routing files passed, but the new static-render suite could not parse JSX under Next's preserve setting. The test now compiles only the reviewed shell using the existing TypeScript compiler; app/compiler configuration was not changed. Focused rerun: 2 files, 33 tests passed. The final broader run above passed 127 tests. Full repository suite was NOT RUN.

The first HTTP assertion incorrectly expected Invoke-WebRequest to follow the streamed Next redirect as an HTTP redirect. Inspection confirmed the expected NEXT_REDIRECT to /sites/jobs/login in the streamed response; a corrected explicit assertion and direct login/asset requests passed. Browser execution of that redirect remains NOT VERIFIED. Local preview: http://127.0.0.1:3009/sites/jobs/gateway (authentication required).

## Task Files

- Added: src/lib/nicejobs-dashboard.ts; src/server/nicejobs/participant-dashboard.ts.
- Added Nice Jobs UI: dashboard-shell.tsx, dashboard-home.tsx, participant-dashboard.tsx, dashboard-actions.ts and dashboard-notification-button.tsx under src/app/app/nicejobs.
- Updated: src/app/app/nicejobs/page.tsx; src/app/sites/[site]/gateway/page.tsx; src/app/globals.css.
- Added gateway loading boundary: src/app/sites/[site]/gateway/loading.tsx. Existing Nice Jobs/gateway error boundaries are reused unchanged.
- Updated: src/server/nicejobs/employee.ts, adding current company notification scope information without granting new permissions.
- Tests: tests/nicejobs-dashboard.test.ts added; tests/nicejobs-employee.test.ts extended with one isolated projection/isolation regression.
- Documentation: this report and [dashboard architecture](../architecture/NICE_JOBS_PARTICIPANT_DASHBOARD.md) added; [existing workspace documentation](../architecture/NICE_JOBS_ONE_WORKSPACE_PHASE_3.md) annotated with the current entry behavior.

No database/schema/dependency changes were made for this dashboard task. Existing dirty worktree changes, including prior authentication and workforce work, were preserved. No staging, commit, push, deployment, seed, real database migration or production/provider access was performed. Tests create and clean their isolated temporary fixtures only. The previously agent-started development preview on port 3009 was identified by full command/PID 108708 and stopped solely to avoid build-output conflicts.

## Remaining Acceptance Work

Inspect desktop and 320/390/768px mobile layouts with both empty and populated synthetic records, long titles, all applicant/selected/active states and detailed task/offer/wallet flows. Validate keyboard menus, touch, contrast, no horizontal overflow and screen readers. Complete reviewed bilingual forms/preferences and any approved applicant support channel. Confirm Resend sender and launch authentication configuration through the existing launch process. Complete the pilot approval register before real publication, offers, activation or financial policy configuration.

## Phase 2 Independent QA - 2026-10-11

### Browser Evidence And Coverage

Browser execution: BLOCKED, not assumed unavailable solely because Playwright is absent.

- Installed executables were positively found at `C:\Program Files\Google\Chrome\Application\chrome.exe` and `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
- Local resolution of `playwright-core`, `playwright` and `@playwright/test` failed. No `PLAYWRIGHT_MODULE` override was configured. Existing browser smoke scripts depend on that module or override; no dependency was installed.
- Browser-tool inventory returned `apps: [], browsers: []`. Attempts to create Chrome and in-app browser tabs returned `Browser is not available: chrome` and `Browser is not available: iab`.
- Native helper initialization and inventory failed: `Computer Use native pipe is unavailable: failed to connect native pipe: The system cannot find the file specified. (os error 2)`.
- No browser was launched successfully, no authenticated browser session was used, and no screenshots or browser accessibility trees were captured. Installed browsers alone are not evidence of a functioning test connection.

| Browser/viewport target | Status | Result |
| --- | --- | --- |
| Desktop 1440 x 900 | NOT RUN | Automation connection blocked. |
| Desktop/tablet 1024 x 768 | NOT RUN | Automation connection blocked. |
| Mobile emulation 390 x 844 | NOT RUN | Automation connection blocked. |
| Mobile emulation 360 x 800 | NOT RUN | Automation connection blocked. |
| Physical mobile, keyboard and screen reader | NOT RUN | No targetable browser/device/helper. |

Visual comparison with the supplied reference: NOT VERIFIED. Source inspection confirms the sidebar/header, forest welcome banner, four colored actions, My Day, application summaries, catalogue and learning sections. The implementation reuses an existing workspace photograph, rather than the reference student photograph; catalogue items have no individual photos. Sections are unframed, and account initials replace the reference avatar. These are source-level differences, not a rendered fidelity assessment. Alignment, clipping, image crop, density, fixed-navigation overlap, zoom and content below the fold still require actual inspection in both Jobs and corporate shells.

### Verified Defects Fixed

| Defect | Status | Evidence and resolution |
| --- | --- | --- |
| Successful notification update permanently disabled the next read/unread toggle | PASS | `useActionState` success survives router refresh. Disable repeats while pending or waiting for the same saved read state; enable the opposite toggle after refreshed props arrive. Hook-state regression covers initial, saving, saved-before-refresh, refreshed and failure states. |
| Header search lost the current query | PASS | Shell input had no value from the URL. Pass the bounded query into a keyed input with `defaultValue`; static-render regression checks the escaped value. |
| Compact account summary had no accessible name | PASS | At widths <=1100px its only text is hidden; avatar/chevron are aria-hidden. Added an explicit account-menu name independent of CSS visibility. |
| Bottom navigation announced duplicate labels | PASS | Visible labels and repeated screen-reader-only labels were both exposed. Removed duplicate label text without changing routes. |
| My Day treated denied learning as an ordinary empty state | PASS | Home now renders the existing denied-state message for UNAUTHORIZED as well as the unavailable-state handling. |
| Unconfigured learning label referenced a nonexistent progress element | PASS | Use a text caption rather than a dangling form label; configured progress retains its accessible name. Regression verifies real zero progress separately from missing configuration. |
| Applicant My Day shortcut opened training despite no training track | PASS | View-all now opens own applications when no worker/training track is available; assigned training and workers retain My Day. |

Six dashboard regressions and one real isolated service regression were added. Static rendering and mocked hook states are not browser interaction or hydration validation.

### Functional And Security Results

| Area | Status | Actual evidence |
| --- | --- | --- |
| Sidebar, mobile routes, account/profile and management dispatch | PARTIAL | Static markup and routing regressions pass; no click, browser back/forward or menu interaction test. |
| Search bounds, candidate-safe results and resource separation | PASS | Service tests verify trimmed 1-120-character input, owned training/published catalogue reads and no employee-resource query for applicants. Search persistence has static-render coverage. Browser submission remains NOT RUN. |
| Notifications: scope, recipient, read/unread and duplicate submit state | PASS | Projection filters current company scopes and fails closed without them. Action regression rejects foreign identifiers/revoked visibility, uses session identity despite forged input and rejects no-session calls. Existing operations tests enforce actual recipient/resource reads, preferences, duplicates and atomic audit. Browser toggle/refresh remains NOT RUN. |
| My Day, applications, learning and task mutations | PASS | Isolated service fixtures verify own tasks, actual progress, application isolation, worker suspension, task evidence/revision/replay and readiness-backed activation. Home denied/not-configured/zero states have rendering tests. |
| Applicants and selected candidates cannot use employee work or earnings | PASS | New real-service regression checks both states, denies employee day and financial reads, and confirms no assignment/wallet is created by offer acceptance. |
| Financial truth and own historical records | PASS | Finance suite verifies unposted amounts, approved credits, distinct reservations, append-only evidence, reconciliation, forged payment rejection and independent approvals. Authorized historical earnings remain readable after assignment ends; ordinary applicants have no financial self permission. |
| IDOR, company isolation and human/SIA authority | PASS | Application/knowledge/employee/finance/operations/portal service regressions reject cross-user/company reads and unauthorized or replayed mutations. Existing SIA authority intersection, disabled autonomous execution and human approval gates remain unchanged. |
| Logout and realm/session isolation | PARTIAL | Portal and email-auth suites verify scoped revocation, cross-realm denial and replay/expiry/current-identity checks. UI logout and subsequent browser navigation remain NOT RUN. |
| Unauthenticated HTTP access | PASS | Local Jobs gateway returned Next streamed login redirect; login and image returned 200. No private dashboard rendering was observed. Browser execution of the redirect remains NOT VERIFIED. |
| Loading, empty, error and retry | PARTIAL | Error boundaries remain unchanged; source review and injected projection failures cover sanitized failures, denial and empty states. Network throttling, rendered loading and retry clicks remain NOT RUN. |
| Live Resend, domain TLS, production authentication and payments | NOT VERIFIED | No provider/production account or database accessed. Email tests use isolated accounts and mocked delivery. |

### Accessibility Review

Overall PARTIAL, not a WCAG or screen-reader sign-off. Static markup checks cover landmarks, skip link, heading structure, current-page indicators, named search/account/bell controls and progress semantics. CSS specifies visible focus, wrapping, 44px primary controls and 54px bottom-navigation links; actual target dimensions, tab order, focus visibility/occlusion and menu behavior were NOT RUN.

Ten sampled opaque CSS color pairs were calculated using sRGB relative luminance: body 13.46:1; muted 5.91:1; button 7.31:1; selected navigation 6.92:1; green/blue/purple/amber action-copy pairs 7.54/7.40/7.27/7.81:1; badge 6.06:1; focus on white 4.92:1. PASS for these sampled pairs only. Image/gradient backgrounds, placeholders, inherited detailed-workspace styles, all focus backgrounds and disabled controls were not exhaustively assessed.

Reference criteria: [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [W3C target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Calculated colors and CSS minimum sizes are not a substitute for rendered inspection.

Malayalam: NOT CONFIGURED. Applicant support delivery channel: NOT CONFIGURED. Both remain outstanding; no localization or external messaging feature was added.

### Commands And Validation

```powershell
npm.cmd test -- tests/nicejobs-dashboard.test.ts tests/nicejobs-participant-routing.test.ts tests/nicejobs-participant-workspace.test.ts
npm.cmd test -- tests/nicejobs-dashboard.test.ts
npm.cmd test -- tests/nicejobs-dashboard.test.ts tests/nicejobs-participant-routing.test.ts tests/nicejobs-participant-workspace.test.ts tests/nicejobs-employee.test.ts tests/nicejobs-finance.test.ts tests/nicejobs-applications.test.ts tests/nicejobs-onboarding.test.ts tests/nicejobs-knowledge.test.ts tests/nicejobs-control-navigation.test.ts tests/portals.test.ts tests/nicejobs-email-auth.test.ts tests/operations.test.ts
npm.cmd test -- tests/nicejobs-dashboard.test.ts tests/nicejobs-employee.test.ts
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

- PASS: baseline 3 files / 11 tests; intermediate focused dashboard 10 tests; broader 12 files / 200 tests in 254.40 seconds. Final dashboard/employee rerun after adding explicit applicant/selected financial denial assertions: 2 files / 40 tests in 70.59 seconds. SQLite experimental warnings were emitted, not failures.
- PASS: lint, TypeScript and production build (21 generated static pages). No migration, seed, dependency installation or Prisma regeneration was needed. Full repository suite: NOT RUN.
- PASS: anonymous `Invoke-WebRequest -UseBasicParsing -TimeoutSec 60` against `http://127.0.0.1:3009/sites/jobs/gateway`, `/sites/jobs/login` and `/images/nice-jobs.jpg`; explicitly assert NEXT_REDIRECT/login path, email input and image HTTP 200 respectively. Gateway uses a streamed HTTP 200 redirect, not an HTTP 302 assertion.
- PASS: PowerShell sRGB calculations for the ten listed foreground/background pairs. Initial inline Node versions of HTTP/contrast commands failed PowerShell argument quoting before executing their assertions; corrected PowerShell commands passed. These failed command attempts were not counted as checks passing.
- PASS: repository `git diff --check`; final scoped trailing-whitespace and relative-report-link checks cover untracked task files as well. LF/CRLF warnings and a global Git ignore-file permission warning do not indicate overwritten work.

The prior agent-owned preview was inspected by exact CIM PID and command: PID 115756, `cmd.exe /d /s /c "npm.cmd run dev -- --hostname 127.0.0.1 --port 3009"`. Default CIM access was denied; approved read-only inspection succeeded. A guarded `taskkill.exe /PID 115756 /T /F` stopped only that identified preview tree before building. No unrelated process was stopped.

### Changed Files And Remaining Gates

This QA task edits only:

- `src/app/app/nicejobs/dashboard-shell.tsx`
- `src/app/app/nicejobs/dashboard-home.tsx`
- `src/app/app/nicejobs/dashboard-notification-button.tsx`
- `src/app/app/nicejobs/participant-dashboard.tsx`
- `src/app/globals.css` (learning caption selector only)
- `tests/nicejobs-dashboard.test.ts`
- `tests/nicejobs-employee.test.ts`
- This validation report.

Git status remains dirty with 56 modified and 156 untracked files (212 total; 0 staged), predominantly pre-existing work. The dashboard files were already untracked at baseline; they are not new unrelated additions in this QA. `git diff` for `next-env.d.ts`, `tsconfig.json` and the existing Nice Jobs error boundary is empty. No staging, commit, push, reset, deployment, production data access, real publication, offers, workers or financial changes occurred.

Remaining acceptance gates:

- BLOCKED: connect an existing supported browser tool or provide an existing Playwright module path; then use an isolated disposable fixture to exercise the four requested viewports and all navigation/form/notification/logout states. Older browser smoke scripts also need their Jobs authentication fixture reviewed for the current email-OTP protocol before reuse; do not bypass it.
- NOT VERIFIED: rendered reference fidelity, long-name overflow, corporate-shell fixed-navigation overlap, keyboard menu closing/focus, screen-reader announcements, touch/zoom and image-background contrast.
- PARTIAL: task Open currently filters the existing My Work list by a bounded title, not a unique task identifier; duplicate/prefix titles can show multiple matching tasks. The mutation forms still bind the actual task ID and revision. No new task-detail route was introduced during QA.
- NOT CONFIGURED: reviewed Malayalam workflows and an authorized applicant support delivery channel.
- BLOCKED: controlled pilot remains subject to the [pilot approval register](NICE_JOBS_PILOT_APPROVAL_REGISTER.md); no business approval was inferred from passing isolated tests.

Final scoped checks: PASS for trailing whitespace across all eight edited files and all three relative links in this report. Final lint and TypeScript reruns after the last test assertion: PASS. Final `git diff --check`: PASS.

The local hidden preview was restored on port 3009, task-owned root PID 125876, at `http://127.0.0.1:3009/sites/jobs/gateway` (authentication required). No real account was used for this QA.

Available code/service/build checks are complete. Overall PARTIAL; browser and launch completion are explicitly not claimed.
