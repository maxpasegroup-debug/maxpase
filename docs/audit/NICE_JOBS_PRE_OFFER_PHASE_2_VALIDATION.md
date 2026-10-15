# Phase 2: orientation and offer validation

## Scope and results

- PASS: targeted application/recruitment/portal run: 70 tests.
- PASS: recruitment/onboarding/employee/portal regression run: 88 tests. Confirms existing post-offer training and activation remain controlled.
- PASS: final recruitment/portal run: 42 tests, including attached email drafts and required-content publication blocking.
- PASS: TypeScript, lint and Prisma schema validation. No new schema migration or dependency change is needed.
- PASS: production build of the updated routes and client components.
- PASS: git diff --check. Existing unrelated worktree changes were preserved.
- PASS: fresh local HTTP checks on port 3009: Jobs catalogue 200, anonymous Nice Jobs offer download 401, Labs offer route 404. These are HTTP checks, not browser validation. Local preview: http://127.0.0.1:3009/sites/jobs/opportunities (owned root PID 77108).
- NOT RUN: full suite in this phase. The preceding phase's full run had an unresolved fixed-clock leads lifecycle fixture failure; no clean full-suite sign-off is claimed here.
- NOT RUN: connected browser, physical device, real email-client/native-share and screen-reader checks. The environment has no connected browser or local Playwright runner.
- NOT RUN: production deployment, real domain/TLS validation, real orientation playback, provider delivery or legal validation.

Tests use isolated SQLite databases, synthetic HTTPS media references and explicitly synthetic policy texts. They do not contact a media provider or create real offers.

## Verified controls

Tests cover failed/passed comprehension, bounded attempts, current policy acknowledgement before issuance, explicit candidate acceptance, immutable offer policy snapshots, wrong-candidate/cross-company access, forged actors/fingerprints, stale revisions, replay mismatch, transactional audit rollback, candidate-only HTML/.eml downloads, escaping of policy markup, and brand-domain download routing. Quiz completion does not create an offer or approve hiring.

## Files changed in this phase

- src/server/nicejobs/pre-offer-input.ts, pre-offer.ts, offer-document.ts, offer-download-handler.ts (new).
- src/server/nicejobs/input.ts, service.ts, recruitment.ts.
- src/app/app/nicejobs/pre-offer-form.tsx, pre-offer-editor.tsx, offer-share.tsx (new).
- src/app/app/nicejobs/application-actions.ts, application-workspace.tsx, recruitment-workspace.tsx, workspace.tsx.
- src/app/app/nicejobs/offers/[reference]/route.ts and src/app/sites/[site]/offers/[reference]/route.ts (new).
- src/middleware.ts; tests/nicejobs-recruitment.test.ts; tests/portals.test.ts.
- docs/architecture/NICE_JOBS_PRE_OFFER_PHASE_2.md, NICE_JOBS_WORKFORCE_ARCHITECTURE.md; this report.

Some existing files already contain uncommitted changes from earlier work. This inventory does not attribute their entire Git diff to Phase 2. No commit, push, production seed, migration or deployment was performed.

Only the two stale local preview process trees launched in the previous phase (roots 2868 and 69644, identity/creation times checked) were stopped. A graceful stop failed, then an approved explicit force-stop of those trees succeeded. No unrelated process was targeted.

## Remaining launch inputs

Real role videos/versions and accessible media assets, reviewed comprehension questions/answers, legally reviewed policy text/versions, confirmed compensation and legal employers, and authorized independent approvers/issuers are still required. No business terms were invented. Nidus's legal-employer/recruitment relationship remains unresolved.

Video completion is candidate attestation plus comprehension, not tamper-proof viewing telemetry. Email export is an UNSENT .eml draft with the full offer attachment; email-client support and actual delivery require manual validation. Email composition/native file sharing are candidate controlled, not automatic provider delivery. WhatsApp API delivery remains unavailable pending provider configuration and recorded channel/recipient consent. Existing published job versions without pre-offer configuration are intentionally preserved; adopting this gate requires a newly reviewed job version.
