# Nice Jobs Programme Phase 7: Pilot and Launch Validation

Date: 2026-10-14 (Asia/Calcutta). Controlled real pilot and launch: **BLOCKED**.

This is the programme Phase 7 evidence, not the older Nice Jobs product Phase 7 report. Scope and operating gates are in [programme pilot architecture](../architecture/NICE_JOBS_PROGRAMME_PILOT_PHASE_7.md); business decisions remain in the [pilot approval register](NICE_JOBS_PILOT_APPROVAL_REGISTER.md). Only JOB-001, JOB-BAM and JOB-DCM are in scope. Internships/First Oppo remain excluded.

## Results and Exact Commands

| Check / command | Status | Recorded result and scope |
| --- | --- | --- |
| `npm.cmd test -- nicejobs communications portals sia remediation-wave-03 hardening` | PASS | Final corrected run: 429 tests, 28 suites, exit 0. Related regression selection, not the entire repository suite. |
| `npm.cmd test -- tests/nicejobs-onboarding.test.ts tests/remediation-wave-03.test.ts` | PASS | 56 tests, 2 suites, exit 0 after the readiness fix and addition of the three journey rehearsals. |
| `npm.cmd test -- tests/nicejobs-content-files.test.ts` | PASS | 9 tests, 1 suite, exit 0; includes actual isolated database/private-object recovery. |
| `npm.cmd test -- tests/sia-virtual-ceo.test.ts tests/remediation-wave-03.test.ts` | PASS | 35 tests, 2 suites, exit 0 after the SIA scope correction. |
| `npm.cmd test -- tests/nicejobs-onboarding.test.ts -t "rehearses all 100" --silent=false` | PASS | 3 parameterized rehearsals passed, 36 unrelated tests skipped. Not a claim that all 39 tests ran in this filtered command. |
| `npm.cmd run lint` | PASS | Exit 0. |
| `npm.cmd run typecheck` | PASS | Exit 0 after the runtime corrections. |
| `npm.cmd run build` | PASS | Exit 0; Next.js 15.5.27, 21 static pages. Child environment explicitly used the verified isolated local preview target. This is not deployment validation. |
| `npm.cmd run prisma:validate` | PASS | Existing Prisma schema valid; no schema edit or client regeneration required. |
| `npm.cmd run validate:migrations` | PASS | Fresh disposable database: all 27 existing migrations, repeat deployment, status/drift, integrity and isolated snapshot/restore. No existing or production database migration. |
| `git diff --check` | PASS | Exit 0; Git emitted LF/CRLF notices, not whitespace errors. |
| Scoped PowerShell documentation checks | PASS | `Get-Content` plus trailing-whitespace/tab checks and relative Markdown link resolution through `Test-Path`: 4 changed documents, 16 relative links, exit 0. |
| Local HTTP probes using `Invoke-WebRequest` | PASS | `http://127.0.0.1:3009/api/health`, `/api/ready`, `/staff/login`: HTTP 200; health/ready `no-store`, login `no-store, must-revalidate`. No production authentication route exercised. |
| Browser, physical mobile, keyboard-only and screen-reader testing | NOT RUN | Enabled-surface inventory returned no apps/browsers; opening the local preview in IAB failed with `Browser is not available: iab`. SSR assertions do not constitute browser or assistive-technology validation. |
| Real role/manager/participant pilot | BLOCKED | No approved managers, independent reviewers, consenting identified participant accounts, final engagement/payment terms or complete reviewed real-role curricula. |
| Production storage/monitoring/backups/restoration/rollback and costs | NOT RUN | No production data, secrets, provider or billing accounts accessed. Owners, budget, concurrency, retention and RPO/RTO remain unapproved/unverified. |
| External messages, real offers, worker activation and payments | NOT RUN | No such actions authorized or performed. |

Counts overlap and must not be summed. The final broad run includes the affected regressions. No failure remained in that completed selection; this does not establish that every production or manual launch gate passes.

## Defects Reproduced and Corrected

1. Readiness migration inventory was incomplete: the initial `npm.cmd test -- tests/remediation-wave-03.test.ts` run returned 1 failed / 15 passed because the 25-entry manifest omitted two existing migrations. Added the exact OTP and secure-content migration checksums and schema probes for email verification/challenges, private-file metadata and captions/transcripts. Missing-table/column regressions verify failure and HTTP 503, then restore their disposable fixtures. Migration files were not changed.
2. The first broad run returned 428 passed / 1 failed: the registered SIA training projection attempted canonical Nice Jobs lookup in an unrelated company fixture and raised Prisma P2025. The corrected branch performs existing authority checks first, then a selected-company/division-scoped active-product lookup. Missing scope returns explicit `UNAVAILABLE_IN_SCOPE`, empty facts/signals/actions and a limitation, without reading another company's training records or granting execution authority. Targeted and final broad reruns passed.

## Three Isolated Journey Rehearsals

The parameterized fixtures use source job codes/titles only, prefixed `PILOT-` and labelled `ISOLATED / ... / Not a real job`. All use the existing synthetic fixture employer/division and synthetic approved configuration. They do not verify actual role-specific employers, divisions, managers, legal terms or training content; in particular they do not establish a Nidus legal entity.

Each rehearsal covers disclosure/application, human screening/management offer review, orientation acknowledgement/comprehension and policy versions, candidate acceptance, own-offer document access with other-user denial, and duplicate enrollment returning a single instance. It assigns OJT/review ownership, starts the frozen 100-day plan, independently approves pause/resume and an explicit final-day extension, and advances an injected clock through all 100 days with practical evidence and human review. Daily reports are exercised on days 1, 10 and 100, not claimed on every day. All required activities and stage milestones finish, final assessment passes, readiness is denied before the extended duration, an unassigned manager is denied and the assigned human reviewer approves READY. No worker assignment/activation is created.

The dummy orientation video URL is not played or fetched. Acknowledgement, playback evidence and comprehension are different signals. Virtual-clock practice/evidence fixtures prove engine behavior, not actual human training, role-content quality or real media playback.

Related selected regressions cover secure media/offer ownership, revoked access, cross-user/company and portal isolation, offer/enrollment replay, audit rollback, report corrections, curriculum version/frozen-plan preservation, deadlines, manager interventions, reminder consent/authorization boundaries and financial controls. External providers remain mocked or disabled, not live-verified.

## Recovery, Performance and Operating Evidence

The new content recovery test calls the existing backup CLI as `node --import tsx scripts/backup-sqlite.ts <fixture-db> <new-snapshot>` through `process.execPath`. It snapshots a quiescent disposable SQLite fixture, restores to a NEW database/private-object path and checks integrity, foreign keys, manifest identity, exact downloaded bytes/digests, unauthorized access and restored-account revocation. It temporarily moves only a restored fixture blob to prove missing-file failure/recovery; the original database/storage remain unaffected. This is not production backup, concurrent-writer recovery, encryption/retention verification or measured RPO/RTO.

Instrumented twenty-read local service samples were observed for JOB-001 (p95 527 ms, p99 537 ms) and JOB-BAM (p95 528 ms, p99 544 ms), each with maximum 59 SQL queries, 5 ms accumulated SQLite query duration and response sizes 62,308 / 62,502 bytes respectively. The extra metrics run's final/third-role output was not retained, so it is not separately certified here; the final broad suite did pass all three journey tests. These are sequential domain-service reads after synthetic 100-day enrollment, not HTTP/device timings, production tail latency or representative concurrent/large-dataset capacity. The initial p95 <=2 s / p99 <=5 s staging criteria still need an agreed dataset and concurrency before sign-off.

Media downloads currently load and hash the entire object before producing full/range responses. Uploads are bounded to 64 MiB and two in-flight uploads per process. Large-video memory, bandwidth and concurrent delivery capacity are NOT VERIFIED. The architecture records the cost worksheet and required operator monitoring/recovery evidence without invented prices, billing access or resource provisioning.

## Remaining Launch Decisions

- Nominate each role's manager and independent decision makers; verify existing identities, active membership, exact scope and permission separately from appointment.
- Verify employer/recruitment authority and division mapping; resolve Nidus's registered employing entity.
- Approve versioned engagement, compensation/incentive/payment rules and performance expectations. Performance-only intent is not approved legal classification.
- Identify consenting existing participants and obtain authorized pilot access decisions; no real access granted by these tests.
- Upload/review real orientation, accessible alternatives, policy versions and complete role-specific Day 1-100 content, outcomes, reviewers and milestones.
- Perform desktop/mobile, keyboard and screen-reader sessions with recorded devices, versions and findings; demonstrate managers identify the next action within 30 seconds and retain context.
- Agree representative load/concurrency, media capacity, operating budget, backup RPO/RTO/retention and incident owners; record actual deployment monitoring, restore and rollback evidence in an approved target.

## Files and Worktree Boundary

Phase 7 edits: `src/server/security/readiness.ts`, `src/server/sia/context.ts`; `tests/remediation-wave-03.test.ts`, `tests/sia-virtual-ceo.test.ts`, `tests/nicejobs-onboarding.test.ts`, `tests/nicejobs-content-files.test.ts`; this report, programme pilot architecture, `BACKUP_RESTORE.md` and the existing pilot approval register note. Earlier worktree changes are preserved and are not claimed as Phase 7 edits.

No dependencies, schema or migration files changed for this phase. No staging, commit, push, deployment, production database/provider access, real publication, offer issuance, activation, financial policy or payment. The isolated local preview remains available at `http://127.0.0.1:3009/staff/login`. Controlled real pilot/launch remains **BLOCKED** until the outstanding evidence and approvals are recorded and reviewed.

Final `git status --porcelain` / `git diff --cached --name-only`: 265 worktree entries, 0 staged files, both commands exit 0. Git could not read the user's global ignore file; this warning was not bypassed or used to change configuration. The extensive pre-existing dirty worktree was neither reset nor cleaned.
