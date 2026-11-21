# MAXPASE Workforce Phase 3 — Default brand workspaces

**Status:** Phase 3 code implementation completed. Runtime reconciliation and real-user authentication readiness remain for later controlled phases.

## Implemented

- Added a reusable default Director and Administrative Officer role catalog and a canonical dashboard route for each of the 15 repository brand slugs in `src/server/group/brand-workspaces.ts`.
- Each prepared brand receives a dedicated `BUSINESS_UNIT` organization under its owning registered company, bound to the exact brand ID and slug. Each role is created as an active human role with no inherited approval, company-management, membership-management, or cross-brand permissions.
- New brands created or edited through Boss company/brand management receive their workspace and both role records in the same database transaction. If preparation conflicts with a pre-existing workspace or role, the transaction fails with a review message instead of changing role permissions.
- Added a Boss-only, idempotent “Prepare Director + AO workspaces” action in the brand hierarchy manager. It can reconcile existing brands when the authorized runtime database is available.
- Added `/app/brand/[brandSlug]`, which requires an ordinary authenticated app session, an active brand/company/workspace, and an active membership with the exact Director or AO role in that brand's dedicated workspace. A changed URL or membership in a sibling brand does not satisfy the check.
- Existing Startup, Labs, Nice Jobs, and Skill City portal realms and routes remain unchanged.

## Scope and outstanding gates

- Phase 1 could not read the configured Railway-internal database. This phase did not run a migration, prepare existing production/test rows, or create employee records. Existing brands need the Boss preparation action in the intended test database before the runtime inventory can be marked reconciled.
- The new route uses the shared MAXPASE app session and rechecks the exact brand membership on each request. Per-brand invite issuance, credential setup, brand-bound session claims/cookies, role selection from the selected brand, and invitation delivery are Phase 4/6 work; no real-user invitation or authentication readiness is claimed here.
- The dashboard is a safe starting shell. Workforce controls and operational queues remain Phase 4/5 work.
- New default roles intentionally have no permission grants yet. Their safe entry into the starter dashboard is guarded by direct active brand membership and the exact default role key. Functional operational capabilities should be added only with reviewed brand-scoped permission definitions and matching server checks.

## Verification boundary

No database operations, migration, test suite, or live sign-in was run. Static code changes and the repository inventory were reviewed; `git diff --check` is run as final patch hygiene.
