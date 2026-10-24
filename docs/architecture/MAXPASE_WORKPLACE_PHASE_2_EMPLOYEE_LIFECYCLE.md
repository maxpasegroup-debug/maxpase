# MAXPASE workplace: Phase 2 employee lifecycle

Status: implemented for isolated validation. No real employee was appointed, invited or activated by this work.

## Existing records and scope

The Boss and authorized Skill City directors use the existing `Person` -> `User` -> `Membership`/`Role` staff-draft flow. A draft records a scope decision reference and, when a manager is selected, a manager decision reference. The Boss can review a pending draft and record or replace its manager decision. New users and memberships remain inactive/invited; reporting links remain inactive until the recipient completes the single-use activation challenge. Replacing a pending manager archives the prior pending link. Mutations and decision references are written to the operational audit in the same transaction as the draft/review/activation state.

The Boss may reuse an active, unclaimed AIRA Person only when that record has no User, authentication realm, role-bearing membership, foreign-company membership or membership in the target scope. An existing User or ambiguous identity is never silently merged. These checks do not prove legal identity; the authorized reviewer must compare the record with approved employment evidence before invitation.

Prepared role templates and scoped authorization remain authoritative. This phase creates no new role, permission, title, salary or payroll policy. A displayed title, manager selection or textual decision reference does not independently constitute approval. Directors cannot appoint other directors. The existing Boss and delegated director authorization gates still apply to drafts and invitations; activation requires the prepared role, recorded scope, verified manager for non-directors and the recipient's email challenge.

## Release boundary

`20261024120000_staff_invite_challenge` extends the existing SQLite email-challenge purpose constraint to permit `STAFF_INVITE`. It preserves existing rows, statuses and indexes. Apply it only during an authorized release with a verified target and backup; local tests use disposable databases. The readiness manifest includes its checksum.

Before inviting a real person, the owner must confirm identity, current employment terms, legal employer, manager account, division/product scope and competent grant authority, then retain the source approval in the referenced record. Email sender/Resend configuration and an authorized migration are also required. Neither a draft nor a reference alone authorizes live access. Other MAXPASE companies and customer/student/part-time portals are unchanged. Labs staff migration and historical record reconciliation remain separate decisions.
