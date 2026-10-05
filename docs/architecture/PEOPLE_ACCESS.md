# People and Access

## Phase 10 Session Hardening

Account/person lifecycle and capability delegation are unchanged. Session validation always reads current account/person/expiry and current services recompute grants. Session issuance/login/logout now include required audit in the same transaction; failed logout audit is not swallowed. New tokens omit contact/person data. Bcrypt input is bounded by UTF-8 byte length, not only characters. A new development bootstrap takes a privately supplied DEV_BOOTSTRAP_PASSWORD or an undisclosed random value; existing passwords are not overwritten. Production configuration forbids the development bootstrap input and seeding remains disabled.

Phase 03 extends the Phase 01 constitution and Phase 02 business graph. No HR, payroll, attendance, recruitment or autonomous SIA execution is introduced.

## Identities and Lifecycle

Person stores a human's display/legal name, optional business contact email/phone, optional profile, status, metadata and timestamps. User stores sign-in email, password hash, account status and its existing Person relationship. Contact email and sign-in email have different purposes; human identity is not copied into account records. A person can have no account or multiple justified accounts.

ACTIVE accounts and people may authenticate and resolve permissions. SUSPENDED, INACTIVE and ARCHIVED preserve records but cannot authorize access. Account suspension/password changes revoke that account's sessions transactionally. Person suspension/archive revokes sessions for all related accounts. Login and session validation recheck account/person status. Reactivation preserves identity and credentials; an account cannot become active without a password.

Shared human and account changes require authority at every membership scope and the ability to delegate the target's existing role capabilities. This includes dormant memberships, preventing reactivation or credential replacement from becoming a cross-company escalation. Read DTOs never return password hashes or session tokens.

## Membership and Scope

The existing Membership is extended with nullable projectId and a server-derived scopeKey. Organization memberships use scopeKey=organization. Project memberships use scopeKey=project:<projectId>. Uniqueness is now personId + organizationId + scopeKey, so a human may have a company membership and memberships in multiple projects. Existing rows retain organization scope and IDs.

A project must belong to the membership's organization. Project memberships cannot use DESCENDANTS. They never confer company, sibling-project or group access. Organizational memberships grant exact scope by default; explicit DESCENDANTS coverage permits child organizations. ACTIVE status, start/end dates, active Person and active organization ancestry are required. Future/expired memberships grant nothing. Invalid ancestry and cycles fail closed.

Changing coverage needs membership.scope.manage. Activating a role-bearing membership or changing its coverage must satisfy the delegation checks for every assigned capability. Membership alone, including an active one, grants no permissions.

## Roles and Capabilities

Roles remain designations/functions. They are organization-bound reusable definitions; controlled copying supports reuse in another authorized scope. Copies of canonical roles preserve their designation and identity type. No role name is a security rule.

Role adds status, optional category, canonical and principalType. HUMAN roles may be assigned only through human memberships. AGENT roles are used through separate SiaRoleAssignment records. Canonical AIRA names, keys, identity types and ACTIVE status are locked. All 60 supplied entries are registered, including the distinct SIA designation. See AIRA_CANONICAL_ROLES.md.

Permissions remain explicit capability definitions with immutable reference and scope. Phase 03 uses the existing singular-domain convention: person.read/create/update/archive, user.read/create/update, role.read/create/update, permission.read/create/assign, reporting.read/manage, responsibility.read/manage and sia.access.read/manage. Existing Phase 01/02 organization, company, project, membership and other keys are preserved. membership.assign_role remains the authoritative role assignment capability.

Capability creation requires an explicit GLOBAL permission.create grant. Registry creation does not itself grant the new capability; initial adoption requires an explicitly reviewed bootstrap or a principal already authorized to delegate it. Capabilities are assigned to roles through audited operations. Direct exceptional membership/user grants are not implemented; future support must resolve into the same resource-bound PermissionGrant contract with expiry, provenance, delegation checks and audit.

## Centralized Decisions

createAccessContext returns internal decide, requireAccess, requireGlobal, requireDelegation and authorized organization IDs. Decisions include allowed/denied reason, requested capability/resource, and matching membership/role provenance. No automatic system.admin, Founder, CEO, ownership or reporting bypass exists.

A ResourceScope always includes organizationId and optionally projectId. Project IDs are resolved server-side and checked against their active parent organization. Project grants match only the actual project. Organizational grants may cover a project within their explicitly authorized organization. The Phase 02 business project's read/update operations now use project-bound grants; unrelated project and company IDs are denied.

Role/capability delegation cannot exceed the actor's current grant. Descendant recipients require descendant-capable authority. GLOBAL capabilities require a matching named GLOBAL grant and cannot be assigned to project memberships or SIA roles. Editing or reactivating a role verifies existing capabilities. Archived human/agent roles can be revoked without reactivating them.

Explainable decisions are internal. The administrator inspection operation requires access.explain on the requested resource and user.read visibility of the target. Provenance from role scopes the inspecting actor cannot read is removed. End-user failures remain generic and do not disclose grants from unrelated organizations.

## Reporting and Responsibility

ReportingRelationship explicitly connects person to manager in an organization with status and optional dates/metadata. Active relationships require both humans to have active membership coverage. Self-reporting and cycles across ACTIVE edges in that scope are rejected conservatively, including future-dated active edges. Reporting creates no permission or ownership.

Responsibility explicitly connects a human to a company/department/team organization or exactly one project, product or goal in that same organization. Active assignments require matching membership coverage. Target IDs are checked and read-authorized at the domain boundary. Responsibility is neither equity, permission nor a reporting edge.

## Organization Switching and UI

Workforce management lives at /app/workforce/[kind]. Views include people, user accounts, organizations, departments, teams, memberships, roles, capabilities, access/role assignments, reporting, responsibilities and SIA access. Existing business registry and foundation routes remain available.

Search, status and organization filters run against Prisma queries. Selected organization IDs are validated on every request through switchOrganization, then the operation's own permission is checked again. Active UI context grants no authority and is not trusted as a security decision. Forged query strings, resource IDs and form payloads must pass the same checks as legitimate requests.

Server actions obtain actor ID from requireSession, validate domain input and invoke services. Components never query the database directly. Mutation success refreshes the management views. Loading, empty, pending, retry and access/error states are present; mobile tables scroll within their own container.

## Audit and Development Seed

Sensitive saves, permission assignment/revocation, role assignment/revocation and SIA assignment/revocation write audit events in the same transaction as the change. Audit failure rolls back the mutation. Actor, resource, organization/project context and safe status/scope changes are recorded. Submitted passwords and arbitrary profile metadata are never copied into the audit log.

The development seed retains the known MAXPASE GROUP, AIRA company and existing development administrator. It registers all 60 AIRA definitions without capabilities or human assignments. It adds only an explicitly labelled, unstaffed Development administration department and Development workspace team. These are development examples, not assertions about AIRA's actual structure. SIA remains its existing non-human identity with no seeded role grants or enabled tools.

## SIA Boundary

SiaRoleAssignment connects the existing SiaIdentity to an active AGENT role and explicit organization. Human grant resolution ignores agent roles even if an invalid assignment is inserted directly. SIA inspection requires scoped capabilities and enabled registered tools. Global capabilities are excluded. Approval requirements remain part of tool contracts and executionEnabled is always false in Phase 03. No autonomous execution or database access is exposed to SIA.
