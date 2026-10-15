# Nice Jobs Candidate Journey: Phase 4 Validation

Report date: 2026-10-13 (user timezone). Scope: Application, Orientation and Offer in the job/programme setup sequence. No Phase 5 work.

## Results

| Gate | Status | Evidence |
| --- | --- | --- |
| One candidate completes the controlled journey | PASS | Isolated public applicant: disclosure/application, human screening, interview/evaluation, management approval, orientation/comprehension, policies, reviewed issuance, acceptance/download, explicit training enrollment |
| No skipped checkpoints | PASS | Candidate screening/approval denied; management cannot bypass interview evidence; premature offer preparation/issuance and premature policy acknowledgement denied |
| Exact approved training version | PASS | Issued programme summary/fingerprint equals normalized pinned plan; mismatches rejected at acceptance and enrollment |
| No duplicate enrollment | PASS | Simultaneous enrollment retries create exactly one enrollment and one enrollment event; acceptance replay creates one acceptance history record |
| Relevant regressions | PASS | 226 tests / 15 suites; no full-repository-suite claim |
| Lint | PASS | npm.cmd run lint |
| TypeScript | PASS | npm.cmd run typecheck |
| Production build compilation | PASS | npm.cmd run build; 21 static pages plus dynamic routes |
| Schema validation | PASS | npm.cmd run prisma:validate |
| Migration / client regeneration | NOT RUN | No schema changes; existing offer snapshot and training plan/progress models reused |
| Scoped whitespace / documentation checks | PASS | git diff --check for tracked task paths; direct whitespace/newline and Markdown-link checks for new documents/files |
| Interactive browser, physical mobile, screen reader | NOT RUN | No browser automation surface available; SSR/service tests do not prove interactive/device usability |
| Live provider / production authentication testing | NOT RUN | Email-auth regressions use their isolated mocked providers; no production signup/login or external message runs |
| Real jobs and production pilot | BLOCKED | Actual role curriculum, orientation media, versioned legal policies, reviewer appointments and business/pilot approval decisions remain outstanding |

## Exact Commands

- npm.cmd test -- tests/nicejobs-curriculum.test.ts tests/nicejobs-programme.test.ts tests/nicejobs-onboarding.test.ts tests/nicejobs-applications.test.ts tests/nicejobs-recruitment.test.ts tests/nicejobs-employee.test.ts tests/nicejobs-participant-workspace.test.ts tests/nicejobs-dashboard.test.ts tests/nicejobs-knowledge.test.ts tests/nicejobs-content-files.test.ts tests/nicejobs-content-handler.test.ts tests/nicejobs-control-navigation.test.ts tests/portals.test.ts tests/nicejobs-email-auth.test.ts tests/nicejobs-participant-routing.test.ts: PASS, 226 tests / 15 suites.
- npm.cmd run lint: PASS.
- npm.cmd run typecheck: PASS.
- npm.cmd run build: PASS; final build includes the enrollment-aware next-step wording.
- npm.cmd run prisma:validate: PASS, Prisma schema valid.
- git diff --check -- src/server/nicejobs/applications.ts src/server/nicejobs/recruitment.ts src/server/nicejobs/onboarding.ts src/app/app/nicejobs/application-workspace.tsx src/app/app/nicejobs/recruitment-workspace.tsx src/app/globals.css tests/nicejobs-recruitment.test.ts: PASS.

The initial integration fixture used an ordinary candidate account without the canonical public-applicant role, so training enrollment correctly failed authorization. The final test uses the existing public-applicant registration factory and audited acceptance-triggered own-training access; no pre-granted onboarding permission or weakened production check was substituted. Another fixture assertion was corrected to use the existing scalar legal-employer disclosure. Intermediate fixture failures are not counted as passing runs.

## Integration Evidence

The complete journey uses a reviewed complete synthetic 100-day role and independent authorized interviewer/management approver. It verifies the public disclosure, duplicate application rejection, explicit manager-triggered screening, interview scheduling/evaluation, management request and approval, comprehension failure followed by a pass, exact policy acknowledgement, ready confirmation and scoped issuance.

The issued offer records canonical employer identity, policy versions/evidence/timestamps and training version/fingerprint/calendar. Candidate acceptance and owned HTML download are exercised. The offer document includes training details; another candidate cannot download it. Tampered training fingerprints leave the offer unaccepted; tampered version evidence cannot create enrollment. Once restored in the isolated fixture, explicit simultaneous retries yield one NOT_STARTED enrollment, the exact plan/version fingerprint and one audited enrollment event. No workforce assignment is created.

Candidate-current offer/interview observations remain correct when history pagination returns no offers. The owned enrollment-status projection denies other candidates. SSR verifies distinct unknown/pending/expired/cancelled/accepted/enrolled labels and that offer acceptance does not imply enrollment or employment activation.

Existing suites additionally cover approval authorization, scope isolation, replay, audit rollback, rejected/expired offers, participant routing, private-file access and email-auth/session boundaries. The registration factory is an isolated identity fixture, not a live Resend signup verification. No external email, WhatsApp, payout or autonomous SIA execution occurs.

## Preview and Manual Limits

The local preview uses only the previously approved generated database under .private/content-preview/isolated-FAkkgN. Its exact target/purpose are checked before starting. The verified preview process was paused for build and restarted afterward; unrelated processes were not stopped.

Local staff preview: http://127.0.0.1:3009/staff/login. Generated synthetic staff credentials remain in .private/content-preview/isolated-FAkkgN/preview-accounts.json. The preview contains an unpublished synthetic curriculum editor, not a real approved candidate/offer. The full candidate journey above runs in disposable test databases, not production or the user's existing development database.

Pre-offer video remains the existing configured approved HTTPS URL. Private library files are delivered through the accepted-offer frozen training references; applicants are not granted general library access. This phase does not implement pre-offer private-file delivery. Video completion is attestation plus graded comprehension, not verified watch time. Downloads are print-ready HTML, not a signed PDF. Real playback, captions/transcripts, browser acceptance/download clicks and device/email-client handling require manual validation.

## Files Changed in This Phase

- src/server/nicejobs/training-programme.ts: shared normalization and offer/programme binding.
- src/server/nicejobs/recruitment.ts: issued/accepted programme evidence; current offer/interview projection independent of history cursors.
- src/server/nicejobs/onboarding.ts: offer-plan validation, shared normalization and owned enrollment-status read.
- src/server/nicejobs/offer-document.ts: recorded offered training in the authenticated download.
- src/server/nicejobs/applications.ts: retain internal templateId for scoped curriculum reference validation.
- src/app/app/nicejobs/candidate-journey.tsx; application-workspace.tsx; recruitment-workspace.tsx; src/app/globals.css: recorded candidate checkpoints, existing-enrollment display, context-aware next step and shared recruitment read.
- tests/nicejobs-recruitment.test.ts; tests/nicejobs-dashboard.test.ts: public-applicant end-to-end and candidate checkpoint regressions.
- docs/architecture/NICE_JOBS_CANDIDATE_JOURNEY_PHASE_4.md; docs/architecture/NICE_JOBS_100_DAY_CURRICULUM_PHASE_3.md; docs/architecture/NICE_JOBS_PRE_OFFER_PHASE_2.md; this report.

No package, dependency or schema change in this phase. Existing unrelated modified/untracked work is preserved; repository-wide diffs include earlier phases and must not be attributed wholesale to this task. Nothing is staged, committed, pushed or deployed.

## Remaining Decisions

The local controlled-journey completion gate is PASS. Real pilot authorization remains BLOCKED: supply approved role content/orientation URLs and accessible media, current legally reviewed policies, actual manager/reviewer accounts, verified employer/recruitment identity and approved engagement/compensation/payment terms. The three real jobs remain unpublished. No real offers, participants, workers, financial policies or payments were authorized or created. Phase 5 is not started.
