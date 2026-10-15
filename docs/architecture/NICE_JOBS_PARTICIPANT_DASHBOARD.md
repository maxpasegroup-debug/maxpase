# Nice Jobs Participant Dashboard

## Scope And Entry

The reference design is implemented as a participant experience, not a replacement for the Hybrid Boss panel. The authenticated Jobs gateway and corporate Nice Jobs workspace share the new Home, shell and existing detailed workflows. Command-authorized default entry and explicit management views retain their existing Boss dispatch before participant routing. Other branded portals retain their current routes.

The sidebar contains Home, My Work, Find Opportunities, My Learning, My Earnings, My Profile and Help & Support. Mobile navigation keeps Home, Work, Learn, Earnings and Profile visible, with opportunities and resources reachable from Home and the navigation menu. Reports, resources, SOPs, follow-ups, performance, offers and financial details remain existing workspaces rather than new systems.

## Authoritative Data And Boundaries

- Account identity and timezone come from the existing own-account preferences service. An initial is shown rather than a fabricated avatar.
- Employee navigation revalidates the active human, membership, permissions and unique readiness-backed assignment. Worker authority is never inferred from an offer, training percentage or displayed stage label.
- Application updates are owned, candidate-safe projections from applicationService. They are status summaries, not a new activity log or a claim that all applications were returned.
- Catalogue cards are published, current, public versions passing the existing employer, compensation and mandatory-publication checks. The pilot drafts are not published to populate the dashboard.
- Learning progress counts completed/approved required activities from onboardingService. Zero required activities or missing configuration produces no percentage; submitted evidence is not completion. Readiness remains a separate recorded status.
- Home shows up to three real pending task records from employeeService.day. Opening work retains the existing mutation forms and task engine, evidence requirements, revisions and confirmation controls.
- The financial destination is the existing FinanceWorkspace. Financial self access is checked separately; historical authorized earnings are not withheld merely because an active assignment is unavailable. No balances are invented or converted into transfer confirmations.
- Notifications use operationsService, live recipient/resource authorization and the current Nice Jobs company notification scopes supplied by employee navigation. The unread indicator is unknown, not zero, when access or reads are unavailable. Read/unread changes pass session/origin checks, a scoped visibility check and the existing transactional markRead authorization/audit boundary.
- SIA remains in existing application and worker assistance destinations. No assistant execution authority, external sender, offer, activation, incentive or payment operation is added by Home.

No new database model, dependency, public API endpoint or migration is introduced. A dedicated notification server action is added; it never accepts actor identity from the client. Existing records and pilot approval restrictions remain authoritative.

## Read Bounds And States

Home reads at most five application summaries, five training tracks and three catalogue versions, with existing next-page links. These are bounded samples, not executive totals. The stage copy summarizes those loaded records and does not grant authority. Work uses the existing bounded day projection.

Search accepts 1-120 trimmed characters server-side. It searches authorized published job titles, owned onboarding titles/application references and, for active workers only, resource titles/summaries. Each category returns at most ten results and a link to the existing filtered list when more are available. It is not full-text search, personalized recommendation or a search of training lesson bodies.

Notifications reuse the existing bounded operational read (maximum 5,000 records), company filtering and 25-record stable-ID pages. This is intentionally not a new database-query engine; exceeding the existing read budget yields an unavailable state. Unauthorized, available-but-empty, unavailable and training-not-configured states are distinct. Unexpected read failures produce a sanitized diagnostic, not a client stack trace. Existing error boundaries and the added gateway loading boundary provide retry and pending states.

## Design And Remaining Gates

The existing Nice Jobs bitmap is reused through Next Image optimization. Forest green, blue, lavender and amber actions adapt the supplied layout without copying demonstration names, jobs, balances, notification counts or learning percentages. Existing forms and disclosure controls remain intact.

English is the only implemented language. No existing translation infrastructure was found. Malayalam is visibly unavailable in the desktop selector rather than a misleading Home-only translation. Full reviewed Malayalam navigation, essential forms, errors, legal text and preference persistence remain outstanding; the mobile menu/profile also need that preference control when implemented.

No support delivery channel is fabricated for applicants. Their help destination provides existing application next steps and management messages; workers retain the existing manager/blocker/help workflows. Applicant support-channel configuration remains outstanding. The profile provides existing own account information and the appropriate existing reset/preferences links; no new profile-edit permission is granted.

Browser/device, keyboard, screen-reader, contrast/overflow and populated-workflow usability checks must be performed before visual sign-off. Unit/static-render and isolated service tests are not substitutes for browser validation. The pilot remains BLOCKED under the [approval register](../audit/NICE_JOBS_PILOT_APPROVAL_REGISTER.md). Authentication/provider launch requirements remain in [Email Authentication](NICE_JOBS_EMAIL_AUTHENTICATION.md).

See [dashboard validation](../audit/NICE_JOBS_PARTICIPANT_DASHBOARD_VALIDATION.md) for actual checks and remaining gates.
