# Business Graph

## Phase 10 Preservation

Hardening changes no company roots, ownership/equity semantics, canonical roles, people identity or resource scope. MAXPASE GROUP remains the ecosystem root and AIRA the first Company OS. Sessions, budgets, diagnostics and deployment procedures grant no business authority. Domain writes retain transactionally required audits and source filtering; no new business data is fabricated. See PHASE_10_VALIDATION.md.

## Phase 09 Communication Graph

Existing Organization/Project/resource + active Person -> explicit channel consent -> authorized integration/thread -> normalized inbound/outbound message -> existing human request/approval -> verified event/audit. Integration credentials are external deployment references, not business graph secrets. Rule owners and responsible recipients retain current capabilities; assignment, sender labels, consent and messages grant none. AIRA shares these primitives without a new CRM or admissions graph. See COMMUNICATIONS_INTEGRATIONS.md.

## Phase 08 SIA Context

SIA consumes authorized typed organization/product/project/goal/work/people/role/responsibility/ownership relationships through controlled domain tools. Both human and agent grants constrain sources before calculation; hidden endpoints remove graph edges. Existing ownership is evidence, never authority. Governed memory references canonical resources and append-only decisions rather than creating a parallel business graph. See SIA_VIRTUAL_CEO.md.

## Phase 07 Executive Graph

Existing Organization/Project + active Person -> scoped executive definition/decision/risk/opportunity/attention handling -> append-only human history -> canonical audit/event. Execution and operations remain authoritative source nodes. Aggregation uses the intersection of source-domain and executive visibility; company comparisons partition by nearest actual company and never imply ownership or universal group authority. See EXECUTIVE_INTELLIGENCE.md.

## Phase 06 Company Graph

MAXPASE GROUP -> existing AIRA Company -> four canonical Organization divisions -> Program -> Batch -> existing Person participation and Responsibility. Location belongs to the same company branch. Product remains company-owned with optional divisionId; Nice Jobs is a PLATFORM under AIRA Career Hub, not a legal company. Projects/goals optionally link same-scope programs; workflows/requests use shared typed resources. EMPLOYER is an explicit directional relationship to another known CompanyProfile, not a recruitment module. See AIRA_COMPANY_OS.md.

## Phase 05 Operational Extension

Real organizations/projects/tasks/goals bind workflow instances, approval requests, reminders, recurrence and escalations. Users retain separate Person identity and active membership-based capabilities; neither assignment nor approval transfers ownership or authority. Controls and workflow versions gate movement, approval rows reuse SiaApproval, and operational events link to existing audits. Notification recipients must read the actual resource. SIA proposals are request envelopes only. No CRM, finance, HR or external communication graph is introduced. See OPERATIONS_MODEL.md.

## Phase 04 Execution Extension

Project/Goal/Task are strengthened in place. Organization -> optional product/brand -> project -> milestone -> task remains relational and optional, with exact scope checks. Projects can now belong to typed descendant organization scopes as well as group/company; product/brand references still require the same organization. Person ownership, accountability, assignment, Responsibility and project Membership are independent facts. Goal parents follow an authorized ancestor branch and cannot form cycles. Legacy project/goal saves delegate to executionService. See EXECUTION_MODEL.md for the current execution rules, which supersede Phase02 project lifecycle/progress descriptions without changing equity or business identity semantics.

Phase 02 extends the Phase 01 constitution and relational models. MAXPASE GROUP is a business ecosystem, not automatically a legal company. Each company remains an independent authorization boundary.

## Relationships

- Organization.parentId expresses administrative hierarchy, not equity. GroupProfile and CompanyProfile retain their Phase 01 organization identities.
- CompanyProfile.groupId and its organization's parentId must identify the same group. Standalone companies may have neither. Moving companies requires a later controlled migration.
- Divisions, business units, departments and teams use the existing typed Organization tree. Layers may be skipped. Typed department/team profiles are created where applicable. Updating names is supported; arbitrary reparenting or changing organization types is deliberately rejected to prevent cycles and moving attached resources across boundaries.
- CompanyRelationship is directional: fromCompany has the recorded relationship to toCompany. SUBSIDIARY means fromCompany is a subsidiary of toCompany; PARENT is the inverse. AFFILIATE, JOINT_VENTURE, CONTROLLED_ENTITY and documented OTHER are explicit alternatives. These records neither grant access nor infer equity.
- OwnershipRelationship records exactly one person or eligible organization owner. GROUP, COMPANY and OTHER may be organization owners. An entity cannot own itself. Percentages are nullable and individually constrained to 0..100. Unknown percentages remain unknown. Ownership type, dates, status and notes are independent facts; overlapping records and distinct equity/voting/beneficial bases are not automatically aggregated.
- Brand belongs to a group/company organization. Product belongs to that same business scope and optionally a brand. Group brand relationships do not imply legal company registration.
- Project belongs to a group/company and optionally a brand/product. If both are set, the product must use that brand.
- Goal belongs to an organization, optionally a project/product in the same scope. If both references are set, the project must use that product. Progress is an explicit 0..100 value, not inferred KPI logic.
- Project and goal ownerPersonId refers to a human with an active, date-valid membership in that scope or an ancestor with DESCENDANTS membership.
- Person is a real human; User is an authenticated account. Multiple accounts can reference one person, but creating a person creates no login. A new profile is introduced within an authorized membership context.
- Membership connects person to organization, optionally with scoped roles. Roles grant explicit permissions. Ownership, job titles, employment and account identity never imply permission.

## Context Services

All reads and mutations use businessService with an authenticated actor user ID obtained server-side. Public consumers must never accept an actor ID from the request as an authorization decision.

companiesForGroup, brandsForCompany, projectsForCompany, peopleForOrganization, ownershipForCompany and list use **organization IDs**, not profile IDs, for their scope argument. productsForBrand uses a brand ID; personScope uses a person ID. accessibleCompanies answers the current actor's access, not another user's access. Unauthorized organization filters throw; unfiltered registries return only permitted rows. Person scope returns only visible active memberships and role names, never private accounts or password hashes.

## Permission Boundaries

Permissions are loaded through ACTIVE User -> active Person -> active/date-valid Membership -> organization-compatible active human Role -> Permission. The grant's organization ancestry and the target's ancestry must be active. GLOBAL grants require the named operation explicitly. Scoped grants match the membership organization; descendants require explicit DESCENDANTS membership scope. Sibling companies and ancestor data remain inaccessible from a company-only grant. Phase 03 supplies an explicit Membership.projectId/scopeKey anchor; project grants are resource-bound and never treated as organization-wide grants.

A group administrator needs the individual business read/manage permissions and explicit descendant membership scope. system.admin alone is not a bypass. Company relationships are visible only if both endpoints are authorized. Ownership views require the target company scope and, for organization owners, organization.read on the owner. Links are checked again at mutation time.

Changing membership scope requires membership.scope.manage. Assigning/removing roles requires membership.assign_role in the membership's organization. Roles must belong to that organization. Actors cannot delegate a permission they lack; GLOBAL permissions require a matching GLOBAL grant. Unscoped template roles must be instantiated within an organization before assignment through this service.

## Transactions and Audit

Every successful business save and membership-role change writes its audit event in the same Prisma transaction. Audit storage failure rolls back the business mutation. Creating a person also audits the new membership. Actor user/person, affected organization, action and resource are recorded; arbitrary submitted metadata and secrets are not copied to audit events. Rejected mutations do not create success events.

## Development Data

The only business seed addition is AIRA SKILL CITY PRIVATE LIMITED below MAXPASE GROUP. It is labelled development seed and legalInformationVerified=false. No registration numbers, websites, shareholders, ownership percentages, brands, products, projects, goals, financial information or directors are invented. Development admin remains the existing Phase 01 account. The seed refuses NODE_ENV=production.

## Phase Boundary

The graph is relational. It does not introduce a generic graph database, task workflows, KPI analytics, operational modules or SIA intelligence. SIA must consume these authorized services through controlled tools in a later phase.

## Phase 03 Human Relationships

Organization/project Membership -> compatible HUMAN Role -> explicit capability remains the access chain. Scoped ReportingRelationship edges and typed Responsibility assignments are independent business facts. AGENT Role -> SiaRoleAssignment -> SiaIdentity is a separate path. Neither responsibility nor reporting grants equity or permission. Shared-account authority and delegation checks apply to every access mutation. See PEOPLE_ACCESS.md.
