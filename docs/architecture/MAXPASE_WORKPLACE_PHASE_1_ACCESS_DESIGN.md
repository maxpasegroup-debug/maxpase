# MAXPASE workplace: Phase 1 access design

Status: design baseline for owner review. No appointment, role template, permission, account, employment term, project assignment or live access is changed by this document. Source-level review only; persisted identities and deployment configuration were not inspected.

## Canonical entity and portal map

| Level | Existing source identity | Intended workplace boundary |
| --- | --- | --- |
| Group | MAXPASE GROUP | `maxpase.com`: Boss oversight and controlled delegation. |
| Company | AIRA SKILL CITY PRIVATE LIMITED (`aira-skill-city`) | `airaskillcity.com`: one internal employee workplace. |
| AIRA divisions | `aira-labs`, `aira-startup-school`, `aira-skill-studio`, `aira-career-hub` | Scope employees to active company/division memberships and resource assignments. |
| AIRA brands/products | AIRA Labs/BGOS, Startup Skool/PBA, Skill Studio/GenZ Builder, Career Hub/Nice Jobs | BGOS, PBA and GenZ Builder are controlled product drafts. Brand/product association does not grant access or authorize a sale. |
| Other companies | TEARN PRIVATE LIMITED (stable slug `pearn`); TOP RANK AI PRIVATE LIMITED | Remain distinct legal company scopes; this phase grants no AIRA employee access to them. |
| External portals | `airalabs.online`, `airastartupskool.com`, `nicejobs.online` | Labs customers, Startup students and Nice Jobs participants retain separate sessions and experiences. Existing Labs staff records require a reviewed migration map before moving traffic. |

MY SOLAR Solutions and Full Stack Branding Expert are business requirements in the brief, but no canonical organization/brand/product mapping was found in the reviewed source. Do not create a new company or silently attach either to a division. The owner must approve the actual relationship, responsible owner and any publication/commercial controls before operational use.

## Identity and authorization rules

`Person` is the human, `User` is the login, `Membership` is scoped affiliation, `Role` carries capability grants, `ReportingRelationship` identifies the manager, `Responsibility` and project/task records represent work. A displayed job title or active login is not an authorization grant. Each protected read and mutation must check current account/person status, active membership, scoped capability and resource relationship server-side. Project ownership alone must not grant confidential customer or repository access. A focus period changes priority, not permission.

The current Skill City templates include company Director (`aira-03`), Senior Academic Advisor (`aira-26`) and Labs developer roles. There is no prepared Business Development & Operations Manager or Flutter Developer template. Existing templates, especially division Director and Labs developer `task.manage`, are not approval to widen access. Any new template or narrower capability must be reviewed against the authorization registry and live resource gates before Phase 2 activation.

## Proposed role-permission matrix

`Candidate keys` below are existing registry keys to evaluate in the implementation phase, not grants made now. "Self" always means currently assigned records in an authorized organization and never all records in the division.

| Functional role | Scope and candidate keys | Explicit exclusion or separate approval |
| --- | --- | --- |
| Boss / Master Admin | Existing Boss authority at group root; existing scoped `organization.read`, `executive.read`, people, work and decision capabilities as currently granted. | Boss identity alone does not bypass company/resource checks or independent approval policies. |
| Business Development & Operations Manager **(proposed)** | AIRA company employee; named Labs, Startup and Studio scopes only. Evaluate `organization.read`, `product.read`, `labs.sales.self`, `labs.sales.perform`, `aira.crm.self`, `aira.crm.perform`, `task.read`, and task/report capabilities only for assigned work. Coordination/assignment requires separately approved `task.manage`, `responsibility.manage` or CRM manage authority with object-level checks. | No `permission.assign`, `membership.assign_role`, HR, payroll, finance, `labs.quote.issue`, production deployment, or own-request approval by default. No implicit all-brand read from a company title. |
| Flutter Developer 1 **(proposed)** | AIRA Labs active membership plus explicit project/task assignment. Evaluate `organization.read`, `labs.delivery.assignee`, `project.read`, `task.read` and narrowly controlled task progress mutation. | No other division sales/student records, all-Labs project browsing, quote issuance, customer acceptance, deployment, or self-approval. |
| Flutter Developer 2 **(proposed)** | Same *policy template* as Developer 1; separate account, assignment and audit history. | Developer 1's project membership, code review duty or permissions do not transfer automatically. |

The Manager designation is an HR proposal. Her existing Senior Academic Advisor title, probation and terms remain unchanged until a competent human approves a documented title/terms/effective-date decision. The two developers' actual titles and terms likewise require verified records. This design neither confirms those records nor provisions the three accounts.

## Individual access and work allocation

| Employee slot | Verified account | Intended initial assignment | Required evidence before activation |
| --- | --- | --- | --- |
| Employee A | PENDING | One Skill City workspace; primary dated focus in an approved AIRA business area, with separately assigned secondary tasks. Historic work remains after focus changes. | Identity, current employment terms/title, manager, permitted division/product scopes, data-access purpose and grant approver. |
| Developer 1 | PENDING | Own MY SOLAR/BGOS or other specifically assigned Labs project/task, if those records are approved. | Identity, Labs manager, project membership, task owner/reviewer and repository access decision. |
| Developer 2 | PENDING | Independently assigned Labs project/task, possibly the same project with distinct contribution and review ownership. | Same evidence independently recorded; no copied membership or credential. |

`Project.ownerPersonId` is not sufficient to represent both developers. Prefer existing project `Membership`, task `assigneePersonId` and `Responsibility`, with object-level checks, before proposing any new table. Never place source-control tokens or deployment secrets in task metadata.

## Human approval boundaries

| Decision | Accountable human authority to identify | Control |
| --- | --- | --- |
| Final job title, probation/terms, pay and effective date | Owner plus authorized HR/employer signatory | Documented employment decision; no change from this design. |
| Company/brand role and capability grant | Boss for Directors; Boss or delegated AIRA Director only within existing delegation policy for other staff | Current authorization/delegation checks, verified identity, audited grant. |
| Reporting manager and project/focus assignment | Authorized AIRA Director or explicit scoped work manager | Verify active manager and project/resource relationship; focus never grants data access. |
| Developer review and task acceptance | Specifically appointed project reviewer/manager | Developer may submit work, not approve their own acceptance where review is required. |
| Quote, product publication, employment, financial or deployment action | Existing independent policy approver | Existing control point and audit; Manager, developer, NEXA and SIA gain no implicit execution authority. |

NEXA remains Boss-private group planning; SIA may prepare scoped assistance. The real human and agent provenance, approval and controlled execution boundaries remain in force.

## Reuse and Phase 2 handoff

Reuse `group/structure.ts`, `group/boss-structure.ts`, `skillcity/staff-onboarding.ts`, `staff-invite.ts`, `role-templates.ts`, `employee-dashboard.ts`, the authorization engine, workforce/execution services, Labs service, AIRA CRM and operational audit. Do not duplicate HR, CRM, project, session or audit models. Retain the Labs customer portal; inventory existing Labs staff accounts, sessions, leads, quotes, projects, files, integrations and audit references before changing their access realm.

Phase 2 may implement only approved lifecycle changes after the owner supplies verified employee identities, final manager/title decisions, scope owners, reviewer/approval authority, and MY SOLAR mapping. Before any activation, test wrong-company, wrong-division, unassigned-project, forged role/assignee, self-approval, suspended membership and session-revocation cases in an isolated database. Keep unpublished products and commercial actions behind their existing gates.
