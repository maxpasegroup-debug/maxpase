# MAXPASE Workforce Phase 4 — Boss HR onboarding and access lifecycle

**Status:** Phase 4 code implementation completed. Database-backed and email-backed real-user acceptance remains for the designated test environment in Phase 6.

## Implemented

- Replaced the Add Employee form's AIRA-only hard-coded positions with a company → brand → role catalogue. Each brand offers Director, Administrative Officer, a brand-specific specialist title, and Employee. Company-wide hire is not offered because the frozen requirement assigns employees under brands.
- The Boss HR appointment now commits Person, active Employment, active brand `HrAssignment`, inactive User, invited Membership, and the exact brand role in one transaction. The brand workspace and default roles are prepared in that same transaction. The Boss is the initial reporting contact for every role; an AO does not wait for a Director.
- Appointment retries with the same email/company/brand/role/date return the same pending appointment rather than creating duplicate HR records. A mismatched existing identity is rejected for review.
- Added secure email setup for the generic MAXPASE brand realm: a single-use six-digit code, 24-hour expiry, bounded attempts, secure origin validation, and employee-created password. Email delivery happens after the HR transaction. If delivery is unavailable, employment and dashboard assignment remain saved and the Boss sees the pending state with an invitation retry action when configuration permits.
- Successful activation verifies the exact active brand employment, workspace binding, membership, and role; activates the user and membership; revokes stale sessions; creates a session; and redirects the employee to their assigned brand dashboard. Brand accounts cannot use Startup, Labs, Nice Jobs, or Skill City portal sign-in realms. Those existing portal routes remain intact.
- Added per-brand access state to the employee directory, plus Boss actions to suspend, resume, or revoke brand membership. Session and pending-invitation revocation is recorded. Assignment transfers move an existing brand workspace role to the destination in the same transaction and require a verified active employee. Ending employment and employee removal revoke memberships, invitations, and sessions.
- Removed the legacy technical dependency that required a Startup Skool Director appointment before an AO could be created.

## Verification boundary

- `npx.cmd tsc --noEmit` and `git diff --check` are the code checks for this phase; no automated test suite, live login, provider delivery, migration, or database mutation was run.
- Phase 1 could not initialize the configured Railway-internal database connection. No real employee, test account, or invitation was created. The mail provider and canonical `APP_ORIGIN` must be configured in the intended test environment before the invite path can send.
- The app session is rechecked against the exact active brand membership on every brand route. A separate cryptographic token audience per brand is not introduced; the generic brand realm is blocked from the existing specialized portal audiences, and server-side brand membership gates route access.
- Existing specialist-specific operational dashboards continue to be served by their old routes. The Phase 4 Boss appointment assigns the new generic role-based brand workspace. Moving specialist workflows into the new shell belongs to Phase 5.
