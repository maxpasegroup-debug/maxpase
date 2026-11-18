# AIRA Startup Skool — Phase 1 SIA Application Handover

**Status: PARTIAL — not ready to release.** This recovery preserved the four in-progress files and completed a deterministic conversational interface with account-owned server drafts using the existing `ExecutiveRecord` service. It did not add generative AI, new database tables, or a migration. Several fields and required acceptance checks remain incomplete; see blockers below.

## 1. Recovery findings

- Starting branch: `main`; starting commit: `e724f3c`. Four tracked modified files were present, with no untracked files.
- The edits were confined to the Startup application: conversation component, applicant workspace, server action, and application service.
- Corrected defects included an unselected `kind` field in a draft query, non-versioned draft updates, and draft retention after final submission.
- No unrelated edits were found or discarded.

## 2. Implementation summary

- Replaced the conventional application form with a one-question-at-a-time guided UI, PBA Starter/Pro choice, free-text prompts, progress bar, prior-answer editing, answer review, and explicit consent.
- SIA is deterministic interface guidance. It does not call an AI provider or claim to be generative.
- Name is sourced from the authenticated Person profile; email remains the authenticated account email. Current application contract fields are retained: PBA preference, idea, goal, experience, location, weekly time, consent, and optional NICEJOBS referral.
- Answers are saved to the existing shared `ExecutiveRecord` table as kind `STARTUP_APPLICATION_DRAFT`, scoped to the Startup division and owner person. Draft key is derived server-side from the authenticated user; no client-supplied draft ID or URL identifier is accepted. Reads require the authenticated Startup realm. Drafts expire from the UI after 30 days. Final submission removes the matching draft in the same transaction as creating the application.
- Submission continues to use `startupApplications.submit`; review remains in the existing scoped Startup review queue. Application approval does not activate enrollment or payment.

## 3. Files changed

- `src/app/sites/startup-ui/application.tsx` — conversational UI and review step.
- `src/app/sites/startup-ui/startup.css` — responsive conversation styling and reduced-motion handling.
- `src/app/sites/startup-ui/actions.ts` — authenticated draft-save action.
- `src/app/sites/startup-ui/applicant-workspace.tsx` — loads the account’s existing draft and supplies it to the conversation.
- `src/server/portals/startup-applications.ts` — scoped draft persistence, expiry-on-read, version-checked update, and cleanup on submission.
- `docs/AIRA_STARTUP_SKOOL_PHASE_01_SIA_APPLICATION_HANDOVER.md` — this handover.

## 4. Database and migration

No schema migration was added. Drafts reuse `ExecutiveRecord` with a unique, server-derived source key. No production database was accessed or changed. Expired draft rows are hidden but are **not physically deleted**; a retention/deletion mechanism and approved retention period remain required before production release.

## 5. AI integration

No authorized Startup-specific generative AI provider was verified. The application uses deterministic SIA prompts, fixed quick replies for the two PBA choices, server-side Zod validation, and ordinary free-text answers. This fallback makes no AI availability claim and cannot make admissions decisions.

## 6. Application and review workflow

Authenticated Startup account → SIA conversation → secure server draft saves → review summary and consent → existing application submission service → applicant status page → authorized human review queue. Referral attribution continues through the existing server-validated NICEJOBS token flow. No payment, WhatsApp message, admission, enrollment, or student activation is performed here.

## 7. Security notes

- Draft ownership and Startup access are checked server-side through the existing portal policy; the caller cannot choose another person or draft key.
- Draft writes validate a strict partial version of the existing application contract and use the record version for concurrent update protection.
- Final submission remains authenticated and validated by the existing service; existing referral validation and review scope were not replaced.
- No new rate limit was added to draft autosave. Existing general session/authentication controls apply, but draft-specific abuse throttling and a retention cleanup job are outstanding.
- The brief’s new mobile number, state, district, optional centre, and entrepreneurial-situation fields were **not implemented**. Adding them needs a reviewed application payload/version strategy and clarity on which fields are mandatory. Centre availability must come from configured records; none was assumed.
- The review summary currently shows the profile name and answers, but does not include a separate mobile field because the present contract has none.

## 8. Validation results

- Focused tests: **PASS**, 3 files / 12 tests (`tests/startup-phase2.test.ts`, `tests/startup-admissions-service.test.ts`, `tests/startup-admissions.test.ts`). These do not exercise database-backed draft save/resume/expiry/concurrency.
- ESLint on the four modified TypeScript files: **PASS**.
- TypeScript: **PASS** (`npm.cmd run typecheck`).
- Production build: **PASS** (`npm.cmd run build`); existing Autoprefixer warning in `startup.css` remains: mixed support for the `start` value. No build error.
- PostgreSQL draft integration tests, browser/mobile/accessibility checks: **NOT RUN**.
- No tests used production data; no migrations were run.

## 9. Production blockers

1. Finish and review the missing applicant fields (mobile, state, district, optional configured centre, entrepreneurial situation) and decide whether mobile is verified or just applicant-provided.
2. Implement database-backed draft acceptance tests for owner isolation, expiry, concurrent saves, submission cleanup, replay, and duplicate submission.
3. Complete typecheck and production build; perform desktop/mobile and keyboard/screen-reader review.
4. Decide approved retention and implement cleanup for expired drafts.
5. Verify actual production Resend sender/configuration and controlled OTP delivery; no production values were read or exposed in this work.
6. Verify reviewer assignments, approved PBA terms/intake, deployment target, backups, and rollback before release.

## 10. Phase 2 dependencies

Phase 2 administrative review should consume the existing submitted application record and preserve review history. It must not reinterpret an application decision as payment, admission, enrollment, or access. Any later Director/Boss decision, verified payment, reconciliation, seat reservation, enrollment, temporary credential delivery, or first-login PIN change requires separate reviewed authorization and acceptance.
