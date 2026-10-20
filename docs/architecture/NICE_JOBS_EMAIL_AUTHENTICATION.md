# Nice Jobs Email Authentication

Historical implementation record. Candidate-facing flows were superseded by [NICE_JOBS_PHONE_PIN_AUTHENTICATION.md](NICE_JOBS_PHONE_PIN_AUTHENTICATION.md) on 2026-10-20. Email/password plus OTP remains only for verified legacy account activation/recovery; the statements below describe the earlier release, not the current primary sign-in screen.

Implemented locally on 2026-10-10. This supersedes the original Phase 1 password-only web flow; historical validation reports remain historical. Live launch is not verified. The Phase 6 pilot remains BLOCKED independently of authentication.

## Account Flows

- Signup retains the existing canonical Person/User, Jobs-realm applicant membership and four applicant capabilities. It does not issue a session. The candidate sets a password, receives a Resend email code and must verify it before a Jobs session is created. A failed send after account creation can be recovered through sign in; it does not overwrite or merge an existing identity.
- Each Jobs login requires the existing email/password check followed by a six-digit email OTP. Password-only `loginPortal(..., "jobs")` cannot issue a session; the shared session issuer also requires a valid Jobs LOGIN challenge. Other portal and corporate login flows remain unchanged.
- Forgot password requests an OTP for an existing ACTIVE, currently portal-authorized Jobs-realm account. Reset is deliberately unavailable to corporate/shared accounts, including corporate administrators: they need separately authorized corporate recovery. A Nice Jobs reset cannot change MAXPASE credentials.
- Reset requires matching new passwords of at least 12 characters, at most 72 UTF-8 bytes, and a RESET OTP. It atomically consumes the proof, updates the bcrypt hash, records email verification, revokes all account sessions, cancels outstanding challenges and writes audit evidence. It does not automatically log in; the next login requires the new password and a new OTP.
- Unknown or ineligible accounts receive opaque challenge references and conditional wording. Reset delivery failures also retain this generic response; explicit FAILED state and failure audit are available internally. No raw code, credential or provider error is returned to clients or audit logs. No absolute timing-indistinguishability claim is made.

Email OTP proves control of the account email at that time, not legal identity, mobile ownership, employment, training readiness or pilot authorization. `User.emailVerifiedAt` is the email proof record; original Person contact/identity metadata is not rewritten as verified identity. No Boss account/PIN, worker role or pilot grant is provisioned.

## Data And Security Boundary

The additive migration adds nullable `User.emailVerifiedAt` and `EmailAuthChallenge`. Existing users are not silently backfilled as verified. Jobs JWTs bind the verified email and must match the current account email as well as a non-null verification timestamp; changing the address invalidates the prior Jobs token. Existing Jobs tokens without this binding fail validation; the next password plus OTP login establishes a new email proof and timestamp. Other realm sessions are unaffected by this Jobs verification check.

Each challenge has a UUID, existing user, email snapshot, LOGIN or RESET purpose, HMAC-SHA256 code digest, current credential-hash snapshot, status, attempts, expiry, consumption time and provider receipt reference. Raw OTPs exist transiently only for hashing and delivery. A separate server secret prevents offline enumeration of the six-digit code from a database digest alone.

Statuses: PENDING before sending, SENT only after a valid Resend acceptance receipt and transactional audit, CONSUMED once, FAILED when sending/receipt persistence fails, CANCELLED on replacement/reset. Provider acceptance is not guaranteed inbox delivery. Expiry is enforced by server UTC comparison (10 minutes); expired rows are not eligible even if their stored status is SENT. There is no background cleanup worker; reviewed retention/cleanup of expired records and rate buckets is an operational requirement, not implemented here.

Current safeguards:

- Crypto-random six-digit codes; constant-time digest comparison; binding to current user, email, credential hash, purpose, expiry and status.
- Five attempts per challenge across requests. Attempt increments persist even if proof validation or a later audited transaction fails. Consumption/session creation or reset is atomic; replay and concurrent confirmations cannot create a second effect.
- Email issuance shares existing durable fixed-window budgets: global 30/minute; account 1/minute, 3/hour, 10/day. For actual accounts, a transactional last-issuance check also prevents replacement within 60 elapsed seconds across fixed-window boundaries. Existing password login budgets still apply. OTP completion has a global 120/minute budget.
- Current account/person lifecycle, portal membership and resource authority are rechecked at completion. Client-supplied user, company and actor identities are not accepted.
- Server actions require the existing validated exact Jobs host/origin. Realm-specific cookie and JWT audience remain unchanged; reset routing is Jobs-only.
- Resend uses the fixed HTTPS endpoint, redirect refusal, eight-second abort signal, one recipient and a challenge-bound idempotency key. There are no automatic retries. Ambiguous responses/crashes cannot leave an executable PENDING code; a new request supersedes it after the cooldown.
- OTP request, provider acceptance/failure, denied verification, email proof, login and reset use existing audit storage. Unauthenticated requests are not represented as verified user actions.

Database-backed limits share the existing SQLite deployment boundary, not a distributed edge protection service. Trusted ingress/network abuse limits, monitoring, delivery budgets and availability protection remain required. Do not trust arbitrary forwarded IP headers. Email OTP is not phishing-resistant MFA.

## Resend Launch Configuration

Server-side variables only; never expose any key through `NEXT_PUBLIC_*`:

| Variable | Required value |
| --- | --- |
| `NICEJOBS_EMAIL_AUTH_ENABLED` | `true` only after sender/configuration review; default example is `false`. Missing/false fails closed. |
| `RESEND_API_KEY` | Private Resend sending key scoped to the approved sender domain where supported. |
| `NICEJOBS_AUTH_FROM` | Plain verified sender email address, not a display-name wrapper. No sender address is invented. |
| `NICEJOBS_OTP_SECRET` | Independently generated cryptographic secret of at least 32 characters, separate from `AUTH_SECRET`. Rotation invalidates outstanding codes. |

Existing `DATABASE_URL`, `AUTH_SECRET`, secure-cookie and canonical-origin deployment requirements still apply. The current repository runtime/migration chain targets SQLite; do not apply its migration blindly to a different database engine.

Operator launch sequence:

1. Verify the chosen sender domain and required DNS records in Resend. Supply the actual sender and private key through deployment secrets, not chat or committed files. See [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).
2. Generate and store a separate OTP secret privately; do not print it in logs or commit it. Leave email authentication disabled while configuration is incomplete.
3. Review/back up the intended existing database and apply `npx prisma migrate deploy` only to the explicitly verified authorized target as part of a reviewed release. This task did not migrate the application or production database. Client generation alone is not migration.
4. Validate in isolated staging with approved test recipients: signup, wrong/expired code, resend, password plus OTP login, reset, session revocation and cross-realm denial. The transport follows the [Resend send-email contract](https://resend.com/docs/api-reference/emails/send-email); mocked acceptance is not live delivery evidence.
5. Record live provider acceptance and actual inbox receipt, failure monitoring, rate/edge controls, accessibility and deployment/session-isolation evidence before enabling reviewed production configuration. Do not claim launch-ready solely from local tests.

No Resend account was provisioned or accessed, secrets configured, live email sent, deployment performed, real pilot participant authorized, job published, offer issued, worker activated or financial policy/payment initiated by this implementation.
