# AIRA Startup Skool — Phase 1B Admissions Launch Handover

**Release recommendation: NO-GO.** This read-only recovery found that the current application requires a verified Startup account before an application can be submitted. The Phase 1B requirement is a public, no-student-login application with contact verification. The repository contains no Startup applicant phone-verification sender/provider contract, and the available SMS implementation is NICEJOBS-specific Twilio configuration. I did not bypass verification or turn on an unapproved pending-verification path.

## 1. Current production evidence

- The owner reports that promotions have started and prospective applicants are applying or attempting to apply.
- The public `airastartupskool.com` page could not be fetched using the available read-only web access. Railway and production PostgreSQL were not accessed. Therefore deployed version, real submissions, errors, referral records, and review-queue visibility are **NOT VERIFIED**. Do not interpret local passing tests as evidence that incoming applications are safe.

## 2. Recovered Phase 1 work

The existing worktree remains on `main` and contains five modified Startup source files plus the Phase 1 handover. These edits were preserved. The current conversation UI uses authenticated applicant accounts and saves drafts as scoped `ExecutiveRecord` records. No changes were made during this 01B inspection.

## 3. Existing flow and key gap

The current `startupSubmitAction` obtains a Startup portal session and returns “Sign in again” when none exists. The server application service also calls the verified-account applicant guard before storing an application. Thus **Apply → SIA → final submission is not currently a public no-login flow**. Existing email/password + six-digit email OTP authentication is retained for other portal journeys; it was not modified.

The applicant application service, referral validation, scoped review queue, and status/version decision logic exist in source. Review queue access requires Startup `program.manage` authority; this is permission-based, not title-based. There is no verified separate AO assignment/follow-up workflow evidenced for Startup admissions. Current review is not proof of a functioning production AO dashboard.

## 4. Applicant data and compatibility

Existing submitted payload covers the PBA preference, idea, goal, experience, location, weekly time, consent, and optional NICEJOBS referral snapshot. PBA 30/180 choices are present, while server validation also accepts historical `STARTER`, `PRO`, and `EXTRAORDINARY` values. Historical records must remain intact.

The existing contract does not include a distinct mobile number, state, district, preferred configured centre, entrepreneurial situation, or an explicit policy-version field. Full name/email currently come from the authenticated profile. No centre availability was inferred. These fields require a versioned payload strategy, validation and review-summary updates; adding them must not reinterpret old records.

## 5. Contact verification and provider readiness

- The repo includes `src/server/auth/nicejobs-sms.ts`, which validates NICEJOBS-specific Twilio settings. This does not establish that Startup Skool can use that sender or that it is configured/authorized for Startup admissions.
- No Startup public applicant SMS verification flow or Startup-specific SMS configuration was found.
- Startup email OTP settings exist for account registration, but that is not a no-login contact-verification flow and does not prove the production Resend sender works.
- No live message was sent and no provider secret was accessed or disclosed.
- Without an approved Startup mobile-verification provider, final application submission must remain blocked until the owner authorizes a pending-verification policy or provides/approves a provider. No such policy was assumed.

## 6. Draft and submission safety

Existing drafts are bound to a verified Startup user and stored under an account-derived key in `ExecutiveRecord`. They expire from reads after 30 days but are not physically removed. They cannot support the requested anonymous applicant flow as-is. Anonymous drafts need an unguessable possession credential, verified contact binding, rate limits, expiry enforcement, cleanup/retention, and integration tests. Do not expose a draft ID or contact data in a URL.

The current final submit path stores a unique application source key, checks existing records, and preserves qualified referral attribution. It does not create an enrollment or student account. Database-backed tests for newly added draft behavior were not run in Phase 1 and no tests against production were run.

## 7. Administrative queue and follow-up

Source supports an authorized Startup review queue and reasoned, version-checked decisions with audit history. This does not establish a separate Administrative Officer role, assigned-application queue, contact-attempt log, follow-up notes, clarification request, or escalation workflow. These must use explicit capabilities/assignments and never grant access from a matching title alone. No AO permissions were added.

## 8. Notifications and WhatsApp

The shared communications service has channel/provider abstractions; no verified Startup transactional WhatsApp template/sender or durable application-received notification was established in this inspection. WhatsApp must remain disabled until provider credentials, approved templates, idempotency/delivery-status handling, and authorization are verified. Application submission must remain independent of outbound messaging.

## 9. Tests and validation

Phase 1 local checks previously recorded: typecheck PASS; focused lint PASS; production build PASS with an existing Autoprefixer warning; 12 tests across three focused files PASS. Those tests do not verify the 01B anonymous flow, contact verification, database draft persistence, AO follow-up, production delivery, or the live application queue. No 01B code was changed or tested in this inspection. Browser, PostgreSQL integration, and production smoke tests are **NOT RUN**.

## 10. Remaining P0 blockers

1. Establish read-only production evidence through an authorized method: deployed version, safe aggregate submission/error counts, endpoint health, and authorized queue visibility. Do not export applicant PII.
2. Approve/verify a Startup contact-verification provider and policy. Do not reuse NICEJOBS credentials or bypass mobile ownership verification without explicit approval.
3. Decide whether full name/email/mobile must be verified before submission and approve a policy for provider outages.
4. Implement an anonymous draft/challenge contract with retention and rate limiting; add an additive migration only if necessary and test on isolated PostgreSQL.
5. Extend the application payload compatibly, define program availability and configured centre lookup, and preserve legacy values.
6. Define and implement AO assignment, contact history, clarification, and escalation permissions/workflow.
7. Verify sender, WhatsApp templates, production backup/rollback, admin role scope, and end-to-end application-to-queue acceptance.

## 11. Safe next steps requiring authorization

1. Provide an authorized read-only production evidence path (no applicant-level PII in the report) and identify the current release commit.
2. Approve the Startup OTP provider, sender, retry policy, and fallback rule; keep the actual credentials in the production secret manager.
3. Approve which contact fields are required and the centre/program source of truth.
4. Authorize an isolated PostgreSQL acceptance database for new public draft/challenge migrations and integration tests.
5. Approve specific AO capabilities and assignment rules.
6. After NO-GO items pass, conduct controlled test-inbox and test-phone application acceptance, review-queue verification, and signed release approval. Do not deploy automatically.

No production records, credentials, messages, payments, migrations, or permissions were changed. Phase 2 was not started.
