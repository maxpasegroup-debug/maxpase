# Nice Jobs Job And Programme Setup Validation

Date: 2026-10-11 (Asia/Calcutta). Local implementation only. Scope: the current three roles; no internships. Architecture: [Job and Programme Setup](../architecture/NICE_JOBS_JOB_PROGRAMME_SETUP_PHASE_1.md).

## Results

| Check | Status | Evidence |
| --- | --- | --- |
| Checklist, nominations, evidence and outcomes | PASS | Six sections expose every missing requirement; complete inputs do not claim publication approval. |
| Draft -> review -> approval -> publication | PASS | Server rejects skipped stages; exact nominated reviewer, current permission, revision and canonical relationships are checked. |
| Incomplete catalogue/application protection | PASS | Public/participant reads, direct application creation and save/submission fail closed; setup evidence/account identifiers remain private. |
| Replay, scope and transaction regressions | PASS | Isolated tests cover forged actors, foreign scopes, missing permissions, expired membership, suspended accounts, area coverage, stale transitions, immutable versions and audit rollback. |
| Final focused regressions | PASS | `npm.cmd test -- tests/nicejobs-programme.test.ts tests/nicejobs-applications.test.ts tests/nicejobs.test.ts tests/nicejobs-dashboard.test.ts`: 4 files / 72 tests passed. |
| Final downstream regressions | PASS | `npm.cmd test -- tests/nicejobs-automation-command.test.ts tests/nicejobs-recruitment.test.ts tests/nicejobs-onboarding.test.ts tests/nicejobs-control-navigation.test.ts tests/nicejobs-employee.test.ts tests/nicejobs-participant-routing.test.ts tests/nicejobs-participant-workspace.test.ts`: 7 files / 105 tests passed. Combined with the fresh focused run: 177 passing tests across 11 files. |
| Lint | PASS | `npm.cmd run lint` completed without errors. |
| TypeScript | PASS | `npm.cmd run typecheck` completed without errors. |
| Final production build | PASS | `npm.cmd run build`: optimized production compilation, lint/types and all 21 static pages completed successfully. This is not deployment or production validation. |
| Prisma schema | PASS | `npm.cmd run prisma:validate` reported a valid schema. No generation or migration was needed for this JSON configuration extension. |
| Whitespace / documentation links | PASS | Scoped `git diff --check` succeeded; PowerShell checked trailing whitespace in all 18 changed files (including untracked files) and resolved 5 relative documentation links. |
| Local HTTP smoke | PASS | Restarted the verified project-only hidden preview on `127.0.0.1:3009`; `Invoke-WebRequest -Uri 'http://127.0.0.1:3009/sites/jobs/login' -UseBasicParsing -TimeoutSec 60` returned HTTP 200. This does not verify sign-in, an authenticated dashboard or provider delivery. |
| Authenticated browser, mobile, keyboard and screen reader | NOT RUN | No available automation browser/Playwright module in this session; static component rendering is not browser or device validation. |
| Real business publication / pilot | BLOCKED | Manager/reviewer appointments, legally reviewed engagement/payment terms, orientation/policies/outcomes and Nidus legal/recruitment verification remain outstanding. |

Intermediate runs started while edits were still underway were not used for sign-off: they included the employer-change assertion and later setup-removal guard assertions before fresh reruns. The final focused run after the code edits passes those checks. A legacy automation-upgrade fixture also failed because it incorrectly treated the newest migration as Phase 10 and selected modern User columns against its old schema. Its test-only correction pins the actual Phase 10 boundary, selects the legacy `id`, and applies every subsequent migration; no migration or application dependency was changed. The final downstream run passes the corrected upgrade test.

## Regression Coverage

Eleven new programme tests cover complete-but-unapproved inputs; three incomplete owner drafts; clearing setup, audience changes and orientation downgrade; exact manager identity; unauthorized/foreign/missing reviewer accounts; revocation, suspended accounts and expiry at publication/resume; multi-area authority; unauthorized setup edits; canonical employer changes; return-to-draft and new-version approval invalidation; audit rollback; strict non-executable configuration; assigned publication review; public evidence privacy and direct application protection. Dashboard static-render assertions cover named sections, actual stages, missing labels, permission-aware links and no automatic approval claims.

The old workforce-filter fixture now uses a separate synthetic role rather than bypassing the launch role's new gate. The existing application catalogue test supplies explicitly synthetic programme evidence and follows review/approval/publication. Fixtures are disposable SQLite databases, not real people, terms, approvals or vacancies.

## Manual Validation

1. With an authorized local/staging manager, open Opportunities / Job Templates and each of the three roles. Confirm their actual Draft status and outstanding requirements.
2. Nominate only reviewed test accounts; verify unavailable/unauthorized nominations remain incomplete. Check small screens, large text, keyboard focus and disclosure expansion.
3. In an isolated synthetic role, complete reviewed disclosures, programme references/outcomes and pre-offer video/check/policies; submit for review. Only the nominated publication reviewer can approve; publishing requires the approved version.
4. Return to Draft, change terms or required inputs, and confirm review/approval must repeat. Suspend a test reviewer or expire membership and verify publication/resume and new applications are blocked.
5. Verify the existing offer, independent activation and financial boundaries still apply. Do not perform these steps on real listings until business approvals are supplied.

## Changes And Boundaries

- Backend: `input.ts`, `service.ts`, `applications.ts`, new `programme-configuration.ts` and `programme-checklist.ts` in `src/server/nicejobs`.
- UI: existing `workspace.tsx`, new `programme-editor.tsx` and `programme-checklist.tsx` in `src/app/app/nicejobs`, scoped additions in `src/app/globals.css`.
- Tests: new `tests/nicejobs-programme.test.ts` and `tests/fixtures/nicejobs-programme.ts`; updates to `nicejobs-applications`, `nicejobs`, `nicejobs-dashboard` and the legacy fixture in `nicejobs-automation-command` tests.
- Documentation: this report, the setup architecture, and a link/update in the public-opportunities architecture.

No real database, production account, provider, offer, worker, compensation policy or payment was configured. No schema migration, seed, permission grant, deployment, stage, commit or push was performed. Existing worktree changes were retained. No content upload system or 100-day curriculum was added; those belong to later phases. Legacy non-programme definitions retain their existing lifecycle explicitly, rather than being silently migrated.
