# AIRA Startup Skool Admissions MVP — implementation status

**Verdict: NO-GO. This local worktree does not implement the requested public admissions MVP.** The existing SIA conversation is still part of the authenticated applicant workspace. This document distinguishes the existing partial implementation from the newly requested public/administrative screens; it is not a claim that those screens are complete.

## Evidence and boundaries

- Worktree has the prior Phase 1 SIA changes in five Startup UI/service files and two Phase 1 handover documents. They have been preserved.
- The shared `ExecutiveRecord.ownerPersonId` and `organizationId` are required. Anonymous applicants cannot safely be stored as `ExecutiveRecord` owners without inventing MAXPASE Person identities. A dedicated public applicant/draft schema is needed.
- Existing public Apply Now points to the Startup signup path. Current `startupSubmitAction` requires a Startup session; `startupApplications.submit` requires a verified Startup-realm account.
- NICEJOBS has a Twilio SMS adapter, but it is explicitly NICEJOBS-scoped. Shared communications supports email and WhatsApp channels, but no Startup-authorized OTP sender/configuration was confirmed. No credentials were read or reused.
- PostgreSQL 16 exists in `.github/workflows/ci.yml`; local Docker is unavailable. CI is not an acceptance run. No isolated PostgreSQL migration/integration test was possible in this turn.
- Production site/service, records, health, queues, credentials, and backups were not accessed. No production applicant data, message, migration, configuration, or account was touched.

## Screen-by-screen status

| Screen | Status | Evidence/limitation |
|---|---|---|
| 01 Landing page / Apply Now | Existing; preserved | Landing CTA currently routes through signup; no change in this worktree. |
| 02 Public SIA welcome | Not implemented | No unauthenticated `/apply` route. |
| 03 Public personal details | Not implemented | Existing SIA application is authenticated; no public contact/location contract. |
| 04 Mobile verification | Blocked by authorized provider | No Startup OTP adapter/provider authorization confirmed; verification must fail closed. |
| 05 Program selection | Partial | Current conversational UI offers Starter 30 / Pro 180 preference; no published-intake availability verification. |
| 06 Entrepreneurial background | Partial | Existing idea, goal, experience fields, but no situation choice. |
| 07 Preferred location | Partial | A free-text location exists; no state/district taxonomy or published centre source. |
| 08 Referral information | Partial | Existing NICEJOBS referral-link validation/snapshot exists; no public draft journey or manual-code UX. |
| 09 Application review | Partial | Conversation has a review/consent screen, but no verified mobile or requested legal version summary. |
| 10 Application success | Partial | Existing service redirects after submit; not adapted to anonymous application references. |
| 11 Application status | Not implemented for anonymous applicants | Existing status is behind authenticated Startup gateway. |
| 12 AO admissions dashboard | Partial | Authorized Startup review queue exists; no AO assignment/follow-up dashboard proven. |
| 13 Application detail | Partial | Review queue records and decisions exist; no new public applicant detail/follow-up history. |
| 14 AO follow-up | Not implemented | No contact-attempt, note, clarification, follow-up-date workflow identified. |
| 15 Director/Boss approval | Partial | Existing Boss review/association/admission functions exist; they are not a verified complete 3-stage AO→Director workflow. |
| 16 Program/intake settings | Partial | Shared Program/Batch and Boss desks exist; no confirmed published pricing, seats, dates, centres or live intake. |

## Existing Phase 1 work

Prior local edits provide a deterministic conversational UI, account-owned draft persistence in `ExecutiveRecord`, and submission through the existing Startup application service. The existing authenticated review and referral paths remain unchanged. This work does not satisfy the public no-signup requirement.

## Source files from prior Phase 1 changes

- `src/app/sites/startup-ui/application.tsx`
- `src/app/sites/startup-ui/startup.css`
- `src/app/sites/startup-ui/actions.ts`
- `src/app/sites/startup-ui/applicant-workspace.tsx`
- `src/server/portals/startup-applications.ts`

No source changes were made for this admissions MVP request. No migration was created.

## Required next implementation before a safe release

1. Add a dedicated `StartupPublicApplicant` / application-draft model with non-guessable possession secret hash, unique public reference, normalized mobile, optional email, structured application fields, referral snapshot, consent version, status, expiry, and audit/event relation. Do not create global `User`/`Person` accounts for anonymous applicants.
2. Add a separate OTP challenge model keyed to the public applicant/draft, with hashed code, expiry, attempt count, cooldown, verified phone binding, and state transitions. Provide a Startup-specific adapter configured independently. Until an approved provider is configured, draft save works but verified submission remains unavailable.
3. Add idempotent final submission; then project submitted applications into the existing authorized review system without mutating legacy records. Define how a public applicant maps to the current reviewer detail model without creating a student identity.
4. Extend the existing review workflow with explicit AO assignment/capability, contact history, clarification, follow-up, and escalation. Keep Director/Boss final decision permissions separate.
5. Source program/intake/centre availability from approved records; do not display invented fees, seats, centres, or open states.
6. Add consent versioning, status possession verification, retention cleanup, audit trails, anti-abuse rate limits, and PII-safe diagnostics.
7. Run Prisma migration validation and all PostgreSQL tests on the isolated CI service; add database-backed tests for drafts, OTP, idempotency, review assignment, and cross-brand access. Complete browser/mobile/accessibility checks.

## Test evidence

The prior Phase 1 run reported TypeScript PASS, focused lint PASS, build PASS with an existing Autoprefixer warning, and 12 existing focused tests PASS. These do not test the anonymous applicant journey. For this MVP request, no new tests, migration tests, browser acceptance, or production checks were run. Do not use prior tests as evidence for this MVP.

## Production release checklist (not executed)

- Confirm deployed commit and domain route using authorized read-only production access.
- Confirm aggregate application submission/error health and reviewer queue visibility without exporting applicant PII.
- Verify database backup and rollback plan.
- Verify Startup-specific OTP sender and secret settings without displaying values; run only controlled test-number delivery after provider authorization.
- Apply only reviewed additive migrations after isolated PostgreSQL acceptance and explicit owner release approval.
- Smoke-test Apply → draft → verify → submit → queue → review using synthetic identities; verify applicant status possession proof.
- Confirm no student account, payment, enrollment, or learning access is created by application submission.
- Keep deployment blocked until every P0 check passes.

No screenshots or local preview are available for the new 16-screen MVP because it has not been implemented. Production remains **NO-GO / NOT VERIFIED**.
