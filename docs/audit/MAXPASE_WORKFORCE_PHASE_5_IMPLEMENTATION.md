# MAXPASE Workforce Phase 5 Implementation

**Status:** Implemented in the application. Phase 6 production onboarding validation remains separate.

## Delivered

- Added a dedicated royal-black MAXPASE Group brand workspace shell with left navigation, active company/brand context, role badge, responsive layout, keyboard skip link, visible focus states, and reduced-motion support.
- Removed the generic Group workspace shell from `/app/brand/*` routes so the brand experience owns its navigation and visual system.
- Added Director views for Overview, Workforce, Brand work, and Brand profile. The workforce view lists active employees assigned to the exact brand, their role/designation, and pending invites. The brand work view lists tasks in that brand's dedicated workspace.
- Added Administrative Officer views for Overview, Admin desk, and My work. Other brand roles receive Overview and My work only.
- Added scoped summary cards, the current user's open task queue, blocked work count, and active project count.
- Added navigation to other active brand workspaces for which the signed-in person has an active membership and one of the default brand roles. Each destination repeats the server-side access check.

## Access and data boundaries

Every request resolves the active brand, its parent company, and the dedicated business-unit workspace. The workspace metadata must bind the workspace to the exact brand ID, slug, and `BRAND_DEFAULT` kind. An active human membership with an active default brand role is then required. Role-inappropriate views return not found.

Work and project reads are constrained to that workspace organization. Workforce and invitation counts are Director-only and constrained to the exact brand, its parent company, and active assignments/employment. Administrative Officers and other roles see only their own task rows. Boss management controls remain in the Boss dashboard.

## Verification and outstanding validation

- `npx.cmd tsc --noEmit` passed after implementation.
- `git diff --check` passed (Git reported only existing LF/CRLF normalization warnings).
- No automated tests were run.
- Phase 1 could not establish a live database connection in the deployment environment. Therefore live database queries, email delivery, real Director/AO invitations, responsive browser review, and account-to-brand routing still require Phase 6 environment validation before describing the system as production-ready for real onboarding.
