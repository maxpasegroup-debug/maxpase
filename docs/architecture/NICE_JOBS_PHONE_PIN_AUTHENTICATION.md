# Nice Jobs Phone/PIN Candidate Authentication

Implemented locally on 2026-10-20. This supersedes candidate-facing email/password signup and login. It does not change Boss, director, corporate or other portal authentication. Live delivery and production readiness are not verified.

## Candidate Journey

New candidates provide name, selected country, national phone number, mandatory recovery email, six-digit PIN and consent. `libphonenumber-js` validates and normalizes the phone to E.164; `User.jobsPhone` is database-unique. The country selector is not phone ownership proof. `User.jobsPhoneVerifiedAt` remains null until a real SMS verification integration is approved and implemented. No SMS credentials or test-code bypass are present.

The PIN is stored only as an Argon2id hash with a distinct server-side pepper. Registration creates the existing Person/User and least-privilege Career Hub applicant membership, then sends a ten-minute email OTP through the existing Resend transport. The account cannot sign in with PIN until email verification completes. A failed send leaves the unverified account intact; `/verify-email` can request a fresh code with the registered phone and PIN. On verification, the existing Jobs-realm session opens My Workspace.

Regular login is normalized phone plus PIN. It uses account/global database-backed budgets, generic denial, the existing scoped portal permission checks, eight-hour server-recorded session, realm-specific JWT audience and secure HTTP-only portal cookie. Candidate PIN alone does not authorize payout changes or financial actions.

Forgot PIN takes the registered phone, never a replacement email. The response is conditional and does not disclose whether an account exists. RESET_PIN codes go only to the verified email already on the user record. Challenge HMAC, purpose, user/email/PIN-hash snapshot, expiry, status and attempts are checked. A successful reset atomically consumes the challenge, changes the Argon2id hash, revokes sessions, cancels pending codes and records audit. A separate email notice is attempted after commit; notice delivery failure is audited, not falsely treated as a failed reset. The user signs in again.

Existing self-registered password accounts are not converted automatically. `/activate-pin` requires the existing password **and** email OTP via the previous login service, then allows phone/PIN setup only from that fresh, scoped session. An old candidate session can reach activation but is denied normal portal actions until setup is complete. `/legacy-recovery` provides the existing email-OTP password reset to candidates who forgot their old password before activation. Other accounts cannot use this candidate activation path. Historic IDs, applications, membership, training, wallet and audit rows are not rewritten.

## Database And Operations

`20261020090000_nicejobs_phone_pin` adds nullable `User.jobsPhone`, `jobsPinHash`, `jobsPhoneVerifiedAt`, a unique phone index, and broadens the existing challenge-purpose check to REGISTER and RESET_PIN through a row-copy table rebuild. The migration preserves existing challenges. Apply only after identifying/backing up the authorized SQLite target; no application or production database migration was run in this task. Prisma Client generation is not a database migration.

Required server variables:

| Variable | Purpose |
| --- | --- |
| `NICEJOBS_EMAIL_AUTH_ENABLED=true` | Explicit email-OTP activation gate. |
| `RESEND_API_KEY` | Private Resend key for a verified sender. |
| `NICEJOBS_AUTH_FROM` | Verified sender email address. |
| `NICEJOBS_OTP_SECRET` | Independent random secret, at least 32 characters, for OTP HMAC. |
| `NICEJOBS_PIN_PEPPER` | Independent random secret, at least 32 characters, for Argon2id PIN hashing. Rotation requires a planned reset process. |

The existing `DATABASE_URL`, `AUTH_SECRET`, `APP_ORIGIN`, secure-cookie settings and portal host routing are also required. Never use `NEXT_PUBLIC_*` for secrets. Provider receipts mean acceptance by Resend, not inbox delivery.

## Launch Gaps

- No configured SMS OTP provider or verified phone ownership. Treat phone as an unverified login identifier; do not assert otherwise in UI or downstream policy.
- Database-backed account/global throttles are implemented. Trusted-ingress IP throttling and distributed abuse protection remain operational prerequisites; arbitrary client forwarding headers are not trusted as an IP identity.
- Real Resend delivery, email change/recovery policy, staging migration, mobile and screen-reader review, monitoring, backup/restore and real-host session isolation require live validation.
- An account with an inaccessible registered email needs a separately authorized support recovery process. Do not accept an unauthenticated replacement email.
- The Nice Jobs pilot, job publication, offers, employment, payroll and financial actions remain under their existing approval gates.
