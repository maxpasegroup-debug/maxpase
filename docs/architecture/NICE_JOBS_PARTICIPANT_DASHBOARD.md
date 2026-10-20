# Nice Jobs Participant Dashboard

## Scope And Entry

The participant experience is not a replacement for the Hybrid Boss panel. The authenticated Jobs gateway and corporate Nice Jobs workspace share one My Workspace shell and existing detailed workflows. Command-authorized default entry and explicit management views retain their existing Boss dispatch before participant routing. Other branded portals retain their current routes.

There is no participant sidebar. Desktop top navigation and the mobile bottom bar have three destinations: My Workspace, Marketplace and Wallet. Profile, goals, Help and sign-out are in the account menu; notifications retain their header control. My Workspace lists the most recently created owned applications as job spaces, including drafts. Each job space uses the existing application workflow, then exposes training only for a recorded enrollment and work/resources only for the matching readiness-backed active assignment. Reports, SOPs, follow-ups, performance, offers and financial details remain existing authorized workspaces rather than new systems.

## Authoritative Data And Boundaries

- Account identity and timezone come from the existing own-account preferences service. An initial is shown rather than a fabricated avatar.
- Employee navigation revalidates the active human, membership, permissions and unique readiness-backed assignment. Worker authority is never inferred from an offer, training percentage or displayed stage label.
- Application updates are owned, candidate-safe projections from applicationService. They are status summaries, not a new activity log or a claim that all applications were returned.
- Catalogue cards are published, current, public versions passing the existing employer, compensation and mandatory-publication checks. The pilot drafts are not published to populate the dashboard.
- Learning progress counts completed/approved required activities from onboardingService. Zero required activities or missing configuration produces no percentage; submitted evidence is not completion. Readiness remains a separate recorded status.
- Home shows up to three real pending task records from employeeService.day. Opening work retains the existing mutation forms and task engine, evidence requirements, revisions and confirmation controls.
- The financial destination is the existing FinanceWorkspace. Financial self access is checked separately; historical authorized earnings are not withheld merely because an active assignment is unavailable. A person without financial access sees an explicit unavailable state, never a fabricated zero balance. No balances are invented or converted into transfer confirmations.
- Notifications use operationsService, live recipient/resource authorization and the current Nice Jobs company notification scopes supplied by employee navigation. The unread indicator is unknown, not zero, when access or reads are unavailable. Read/unread changes pass session/origin checks, a scoped visibility check and the existing transactional markRead authorization/audit boundary.
- SIA remains in existing application and worker assistance destinations. No assistant execution authority, external sender, offer, activation, incentive or payment operation is added by Home.

No new database model, dependency, public API endpoint or migration is introduced. A dedicated notification server action is added; it never accepts actor identity from the client. Existing records and pilot approval restrictions remain authoritative.

## Read Bounds And States

My Workspace reads the five most recently created owned application summaries and five training tracks, with a link to the existing paginated application list when more exist. These are bounded previews, not totals. Worker access uses the existing unique readiness-backed day projection, and the job space matches it to an already authorized owned application before showing work tools.

Search accepts 1-120 trimmed characters server-side. It searches authorized published job titles, owned onboarding titles/application references and, for active workers only, resource titles/summaries. Each category returns at most ten results and a link to the existing filtered list when more are available. It is not full-text search, personalized recommendation or a search of training lesson bodies.

Notifications reuse the existing bounded operational read (maximum 5,000 records), company filtering and 25-record stable-ID pages. This is intentionally not a new database-query engine; exceeding the existing read budget yields an unavailable state. Unauthorized, available-but-empty, unavailable and training-not-configured states are distinct. Unexpected read failures produce a sanitized diagnostic, not a client stack trace. Existing error boundaries and the added gateway loading boundary provide retry and pending states.

## Design And Remaining Gates

The existing Nice Jobs bitmap is reused through Next Image optimization. Forest green, blue, lavender and amber actions adapt the supplied layout without copying demonstration names, jobs, balances, notification counts or learning percentages. Existing forms and disclosure controls remain intact.

English is the only implemented language. No existing translation infrastructure was found. Full reviewed Malayalam navigation, essential forms, errors, legal text and preference persistence remain outstanding. The three-menu shell does not display a language selector that could imply translation is available.

No support delivery channel is fabricated for applicants. Their help destination provides existing application next steps and management messages; workers retain the existing manager/blocker/help workflows. Applicant support-channel configuration remains outstanding. The profile provides existing own account information and the appropriate existing reset/preferences links; no new profile-edit permission is granted.

Browser/device, keyboard, screen-reader, contrast/overflow and populated-workflow usability checks must be performed before visual sign-off. Unit/static-render and isolated service tests are not substitutes for browser validation. The pilot remains BLOCKED under the [approval register](../audit/NICE_JOBS_PILOT_APPROVAL_REGISTER.md). Authentication/provider launch requirements remain in [Email Authentication](NICE_JOBS_EMAIL_AUTHENTICATION.md).

See [dashboard validation](../audit/NICE_JOBS_PARTICIPANT_DASHBOARD_VALIDATION.md) for actual checks and remaining gates.

## Candidate Space Update (2026-10-20)

The earlier candidate navigation introduced Home, Explore, My Space, My Goals, Learning and Profile. This was consolidated into the three-destination shell above on 2026-10-20. The same signed-in person's applications and training enrollments are reused. Starting an application adds an application record, not a worker assignment. Management approval, offer acceptance, explicit enrollment, readiness and worker activation remain separate guarded actions.

My Goals stores a small personal, non-financial vision and next step in the existing person's metadata. Inputs are bounded and validated server-side; account and Jobs portal scope are checked on every read and write. A conditional own-person update and audit event share one transaction. This record does not set compensation, create a business goal, publish a plan or confer work access. Active workers also see the existing 30-day goal panel with its independent manager approval workflow and configured assistance.

TARA is the Nice Jobs presentation name for the existing SIA assistance. Tool identities, authorization, provider availability, recorded human/agent actors and audit keys remain unchanged. Applicant guidance is available only for an owned application and configured read-only tool. The personal vision board does not claim AI-generated planning when that capability is unavailable. No provider credentials, real jobs, offers or workers are activated by this update.
