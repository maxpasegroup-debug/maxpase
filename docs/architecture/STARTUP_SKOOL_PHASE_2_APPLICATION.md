# Startup Skool Phase 2 — public application and human review

## Implemented boundary

The existing `airastartupskool.com` portal now presents a minimal public PBA introduction, a separate sign-in and account-creation path, contextual SIA-labelled guidance, an application form, applicant status, and a scoped human review queue. The SIA guidance is **deterministic interface copy**, not a configured generative model or an admissions decision. Its floating control can be closed, respects reduced-motion preferences, and never submits or approves on a person's behalf.

Account creation uses a unique Person/User in the `startup` authentication realm and a division-scoped `startup-applicant` role with **only** `organization.read`. It does not confer `program.read`, `program.manage`, batch participation, student status, finance or group access. The email must be verified with a purpose-bound, single-use, ten-minute code before sign-in or application. Codes are HMAC-hashed, attempts and sends are limited, and the challenge is bound to the account email and password hash. Resend requires the account password and gives a non-enumerating response. Startup sessions retain the existing startup-only cookie and audience, with verified-email binding for new startup-realm accounts. Existing invited student accounts and their gateway remain unchanged.

The application reuses the scoped, versioned `ExecutiveRecord` / `ExecutiveHistory` / `OperationalEvent` foundation with kind `STARTUP_APPLICATION` and one stable source key per applicant. No Prisma schema or migration was added. The applicant supplies a preferred PBA path, idea, goal, experience, location, weekly time and explicit acknowledgement. Duplicate submissions return the existing application. Applicants read only their own status. The server derives actor identity from the session, never from form fields.

`program.manage` within the actual Startup Skool division is required to read the 50-record review queue and record `SUBMITTED → IN_REVIEW → APPROVED/REJECTED` (or direct submitted decision). The reviewer cannot decide their own application. Decisions require a reason, compare the current version, and write record, history and event in one transaction. Stale or repeated decisions fail. **APPROVED means application decision only**: no programme enrollment, learner role, offer, price, tax, payment or community access is issued.

## Programme publication and admission boundary

The Boss Startup Skool programme desk saves proposals as drafts and records a version-bound publication request with the referenced written terms. A different authorized reviewer can approve or reject that request with a reason and evidence reference. Approval changes only the programme lifecycle to `ACTIVE`; it does **not** approve the proposed price, tax treatment, written commercial terms, intake, enrolment or payment. A revised draft needs a new review. The shared programme editor cannot activate a Startup Skool programme directly.

Application review remains a separate decision. A confirmed admission requires an `APPROVED` application associated with the exact PBA programme, an active matching intake, an independently approved intake register with effective versioned terms, verified role authority and participant consent, and an admission decision by a different authorized person from the application reviewer. The admission is recorded as a separate scoped `STARTUP_ADMISSION` ExecutiveRecord with history and event in one transaction. It creates no BatchParticipant, payment or learner access. New Startup Skool participant activation now also requires this matching confirmed admission. Historical participant reads keep their existing readiness rules; existing approved applications without a programme association remain readable and are not rewritten.

This work has no new Prisma models or migration. The referenced publication evidence is recorded, but documentary review and real business approval remain human responsibilities. The approved intake register remains the commercial/consent gate; a publication evidence reference alone cannot satisfy it.

## Routes and configuration

| Domain path | Purpose |
| --- | --- |
| `/` | Public Startup Skool introduction and PBA path preferences, with no unapproved price or guaranteed outcome. |
| `/login` | Existing Startup portal email/password sign-in, with new journey entry. |
| `/signup` | Account creation, email code verification and resend. |
| `/gateway` | Applicant's own guided form/status or existing learner/staff gateway. |
| `/gateway?view=applications` | `program.manage` review queue and audited decision form. |

Email delivery is **fail closed** unless `STARTUP_EMAIL_AUTH_ENABLED=true`, `STARTUP_AUTH_FROM` (verified sender address), `STARTUP_OTP_SECRET` (independent random value, at least 32 characters), and `RESEND_API_KEY` are configured. Never put their values in source, documentation or logs. The Resend sender/domain and real delivery have not been verified here. Startup settings are distinct from the Nice Jobs OTP gate. `AUTH_SECRET` and the existing portal cookie security settings remain required by the shared authentication stack.

## Deliberate limits and release gates

- The current recorded operator remains AIRA Skill City Private Limited. The proposed standalone legal entity, group relationship, issuer and tax basis remain **NOT VERIFIED** in [the Phase 1 register](STARTUP_SKOOL_BUSINESS_FOUNDATION.md). No ownership transfer or legal-identity change occurred.
- The owner-stated PBA prices are **not published** or collected by this application. Tier selection expresses preference, not an approved offer. Exact inclusion, dates, policies and final commercial terms still require review.
- No automated SIA model, mentor matching, learner enrollment, payment or outbound marketing is activated. Admission confirmation is a separate human decision gated by an approved intake; without the required evidence it remains unavailable.
- Before real launch: verify the sender and actual code delivery; approve the privacy/admissions notice and retention policy; identify authorized reviewers; run signup, review, replay, rollback, and cross-account/company tests against an isolated PostgreSQL target; inspect desktop/mobile and keyboard/screen-reader behavior; verify existing-student continuity and production backup/release procedure.
