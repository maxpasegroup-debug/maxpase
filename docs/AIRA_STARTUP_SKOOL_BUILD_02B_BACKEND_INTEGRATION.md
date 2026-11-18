# AIRA Startup Skool Build 02B — Public SIA Backend Integration

## Implementation

The public `/apply` experience now uses the anonymous Startup admissions records. It does not require a MAXPASE login and does not create a `User`, `Person`, student account, enrollment, or payment record.

The server implementation is in `src/server/portals/startup-public-admissions.ts`; the domain-scoped route is `src/app/api/startup/public-application/[action]/route.ts`. The conversational interface in `src/app/sites/startup-ui/public-application.tsx` uses these routes for draft resume/autosave, mobile verification, submission, and status refresh. The API is allowed by middleware only on the Startup Skool domain.

### Anonymous draft protection

- A new draft receives a cryptographically random possession token. The browser receives it only in an `HttpOnly`, `SameSite=Lax` cookie (secure on production HTTPS); PostgreSQL stores only an HMAC hash.
- Draft access checks possession, company scope, status, expiry, and optimistic version. Drafts expire after 30 days. A bounded cleanup run removes eligible expired drafts after a further 30-day retention period.
- Draft creation and updates have server-side rate limits. Autosaves are debounced and serialized in the browser to avoid out-of-order updates.
- Starting a new application creates a new draft and leaves an already submitted application intact. Draft deletion is allowed only while the record remains a draft.

### OTP verification

- The service generates a six-digit code, stores only an HMAC, and binds the challenge to the applicant and normalized E.164 mobile number.
- Challenges expire after 10 minutes, allow at most five attempts, are single use, and have a 60-second resend cooldown plus per-number, per-applicant, and per-address limits.
- A mobile-number change cancels pending challenges and clears the verified timestamp. A code is never returned to the browser or written to logs.
- Live delivery uses the Startup-specific Twilio SMS settings below. NICEJOBS credentials are not read or reused. A development-only simulator can be used for controlled local acceptance and cannot operate when `NODE_ENV=production`.
- Missing provider settings fail closed; the API does not report that a code was sent or a number verified.

### Submission and review

Submission requires complete validated answers, verified mobile possession for the same number, and explicit consent. A database transaction records the consent version/time, referral snapshot, unique reference, submitted status/time, and audit event. A repeated submit returns the same receipt; it never creates a second application. Status lookup requires the same possession cookie and matching reference.

The existing authorized Startup reviewer queue now projects public SIA records alongside legacy authenticated applications with a `PUBLIC_SIA` source label. Existing staff/Boss authorization checks remain in force; public applicants do not become MAXPASE identities. Reviewer decisions update the anonymous application and write both an application event and an operational audit event.

## Routes

All routes are restricted by middleware to `airastartupskool.com` (and the existing local Startup portal context):

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/startup/public-application/draft` | Read the cookie-owned draft |
| POST | `/api/startup/public-application/draft` | Create/resume a draft; `{ "newDraft": true }` starts a fresh draft |
| PATCH | `/api/startup/public-application/draft` | Validate and save draft answers |
| DELETE | `/api/startup/public-application/draft` | Delete only an owned, unsubmitted draft |
| POST | `/api/startup/public-application/otp-send` | Send a Startup OTP |
| POST | `/api/startup/public-application/otp-verify` | Verify a challenge |
| POST | `/api/startup/public-application/submit` | Submit with consent and verified mobile |
| POST | `/api/startup/public-application/status` | Refresh status using possession plus reference |

Mutations require the Startup portal's same-origin protection. API responses are private/no-store and body size is bounded.

## Database

The additive migration is `prisma/migrations/20261116120000_startup_public_admissions/migration.sql`. It adds anonymous applicant, OTP challenge, application event, assignment, and follow-up tables; it does not modify existing identity or authenticated-application rows. The migration has **not** been applied to production.

## Configuration

Required for production OTP delivery:

- Existing `AUTH_SECRET` (32 or more characters), used to sign portal context and derive the possession-token HMAC.
- `STARTUP_PUBLIC_OTP_SECRET` (32 or more characters), separate from NICEJOBS OTP material.
- `STARTUP_SMS_PROVIDER=twilio`.
- `STARTUP_TWILIO_ACCOUNT_SID`, `STARTUP_TWILIO_AUTH_TOKEN`, and `STARTUP_TWILIO_FROM` from an authorized Startup Skool messaging account.

The values must be set in the deployment secret manager by an authorized operator. No live credentials were added or verified in this implementation. The production application must remain unable to verify mobile numbers until those Startup-specific values are configured.

For local-only simulator acceptance, set `STARTUP_OTP_SIMULATOR_ENABLED=true` and a test `STARTUP_OTP_SIMULATOR_CODE` containing exactly six digits. Do not use simulator settings in production; the service explicitly rejects simulation when `NODE_ENV=production`. Keep the configured test code out of source control and logs.

## Verification status

This document records implementation, not production acceptance. Run Prisma validation, typecheck, focused tests, lint, and production build after the current edits. A genuine isolated PostgreSQL database is required for database-backed draft/OTP/submission/reviewer acceptance. Do not point tests at Railway production. Prisma client generation previously hit a Windows query-engine DLL rename lock (`EPERM`); do not terminate unrelated Node processes to clear it. This task does not apply migrations, deploy, commit, or push.

## Local acceptance outline

1. Configure `DATABASE_URL` to a disposable local PostgreSQL database that is not Railway production.
2. Run `npx prisma migrate deploy` against only that isolated database.
3. Set `AUTH_SECRET`, `STARTUP_PUBLIC_OTP_SECRET`, and the local-only simulator settings in an ignored local environment file.
4. Start the app on an available port and open the existing local Startup domain-routing path to `/apply`.
5. Apply through OTP using only the displayed local test fixture, verify resume and status with the same browser cookie, and inspect that the authorized reviewer queue shows `PUBLIC_SIA`.
6. Never claim live SMS or production readiness from simulator tests.
