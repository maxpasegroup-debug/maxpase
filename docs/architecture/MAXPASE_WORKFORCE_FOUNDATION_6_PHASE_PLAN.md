# MAXPASE Group Workforce Foundation — Frozen Six-Phase Plan

**Status:** Frozen requirements and implementation plan. Not implemented by this document.
**Product owner:** MAXPASE Group Boss.
**Release objective:** Make the Boss able to maintain the Group's company/brand register and onboard real Directors, Administrative Officers (AOs), and role-based employees into brand-scoped workspaces, ready for controlled real-user testing.

**Phase 1 execution:** Repository/code audit and capability-registry repair completed. The live database inventory is still unverified because the workspace's Railway-internal PostgreSQL connection could not initialize. See [Phase 1 audit](../audit/MAXPASE_WORKFORCE_PHASE_1_AUDIT.md). Do not treat later-phase implementation or controlled real-user readiness as complete.

**Phase 2 execution:** Boss company/brand management and Group/ownership/lifecycle enforcement implemented in code; no existing rows were mutated. Runtime database reconciliation remains open. See [Phase 2 implementation](../audit/MAXPASE_WORKFORCE_PHASE_2_IMPLEMENTATION.md).

## Frozen requirements

These requirements define the current release boundary. Later HR, payroll, recruitment, analytics, and company operations work is deferred unless it is required to make the requirements below function.

1. **MAXPASE Group is the parent company** in the product hierarchy and the root of Boss authority.
2. The Boss can add and manage multiple **registered companies** directly under MAXPASE Group.
3. The Boss can add and manage multiple **brands under each registered company**.
4. The Boss can add **role-based employees under each brand**, with employment and dashboard access connected in one straightforward workflow.
5. Every brand has a ready **Director dashboard and AO dashboard/role template** by default. The Boss can appoint a Director and AO without first configuring a role, division, or permission set.
6. Every brand already represented in this repository must have a working Director and AO dashboard/authentication path. The Boss must be able to onboard real Directors and AOs from the Boss HR dashboard and verify their access in real-user testing.

### Experience and operating rules

- Use a simple hierarchy in the product: **MAXPASE Group → Registered company → Brand → Team/role**. Departments are optional details and must not block hiring.
- The Boss is the appointing and management authority for this release. Routine employee creation, brand assignment, and dashboard assignment do not wait for a separate internal approval queue.
- Record who made an employment, assignment, access, or lifecycle change. Audit history is not an approval workflow.
- Employee identity, employment, brand assignment, account, membership, role, and permission remain distinct records internally, but the Boss should not have to assemble them across separate screens.
- A brand template provides a least-privilege starting role and a dedicated dashboard. It does not grant cross-company access or make employment equivalent to ownership.
- Never create a real employee, Director, AO, invitation, or company/brand record from seed data. Real-user tests use explicitly authorized test identities and a configured invitation provider.
- Existing products, portals, stable identifiers, and unrelated operations must continue to work. Migrate or adapt existing records; do not replace them with duplicate companies or brands.

## Repository baseline and known gaps

- The current data model supports a Group organization, company organizations, and `Brand` records linked to a company. Employment and brand assignment are also represented. This is a useful base, but the Boss experience and role provisioning do not yet provide one universal company/brand workflow.
- The current Add Employee dialog is already present. Its role choices are hard-coded for a few AIRA cases, and the server resolves dashboard roles through AIRA/Skill City-specific templates. This does not satisfy role coverage for every brand in the repository.
- A known onboarding failure is `A required employee capability is unavailable` in `src/server/skillcity/role-templates.ts`. It means at least one role-template capability is absent from the capability registry used to provision the role. Phase 1 must inventory every template against the registry and fix this class of failure before declaring onboarding ready.
- Current code treats Nice Jobs as a Product/workspace under AIRA Career Hub in parts of the domain, while the Group register also presents it as a brand. Phase 1 must reconcile this against existing stable IDs and access boundaries; do not silently convert or duplicate it.
- The architecture inventory in `docs/architecture/MAXSPACE_GROUP_ARCHITECTURE.md` lists these company/brand relationships: AIRA Skill City Private Limited / Aira Skill City, Startup Skool, AIRA Labs, Nice Jobs; PEARN Private Limited / TeachX Guru, LearnX Guru; TOP RANK AI Private Limited / Top Rank AI. It also records additional canonical AIRA divisions and AIRA Media Company. This list is an audit starting point, not proof that every row exists, is active, or has an equivalent Brand row in the current database.
- Therefore, a current database-backed inventory is a Phase 1 deliverable. Every repository brand reference must be reconciled to exactly one owning registered company and classified as a Brand, Product, Division, portal, or legacy alias before migration or appointment logic is finalized.
- Authentication readiness means verified email delivery/configuration, an invitation setup flow, secure credential creation, brand-scoped sessions, revocation, and tested access boundaries. A seeded role or a displayed dashboard link alone is not readiness.

## Six development phases

### Phase 1 — Audit, inventory, and hiring unblock

**Goal:** Establish the canonical inventory and remove the current employee-provisioning blocker before broad redesign.

**Work**

- Trace the current Group root, companies, brands, products, AIRA divisions, Nice Jobs workspace, employment records, Boss authority, and every employee role/dashboard mapping.
- Produce a reconciled inventory of every company and brand represented in code, seed data, migrations, architecture docs, and the current authorized database. Record stable ID, name, slug, owner company, type, lifecycle, dashboard destination, role template, and authentication realm.
- Identify aliases and overlapping concepts (including Nice Jobs and AIRA divisions); decide their canonical relationship without deleting or reparenting live data implicitly.
- Compare every Director, AO, and employee role template with the permission registry. Correct missing capability definitions and scope mismatches; fail with a useful diagnostic naming the role and missing capability.
- Trace the screenshot failure end to end: form, server action, role preparation, employment/assignment transaction, invite preparation, and final dashboard route.
- Freeze the canonical role and dashboard contract used in later phases.

**Acceptance gate**

- Every repository brand reference appears in the inventory and has one explicit owner/type decision; unresolved/conflicting rows are named and block migration, not silently guessed.
- The required capability set for every currently supported template is present, correctly scoped, and testable.
- The known `A required employee capability is unavailable` path is eliminated for supported roles or returns an actionable role-specific setup error before creating a partial employee.
- Existing records and access are mapped; no production mutation or identity migration is part of the audit.

### Phase 2 — Canonical Group → company → brand management

**Goal:** Make MAXPASE Group the unambiguous parent and let the Boss manage multiple registered companies and brands.

**Work**

- Establish the Group root as parent of each registered Company; each Brand belongs to exactly one Company. Keep divisions, products, and portals as separate concepts where they are needed by current products.
- Build Boss screens to create, edit, activate, and archive companies and brands with clear names, stable slugs, owning-company selection, and lifecycle state.
- Validate uniqueness and parent ownership server-side. Do not allow a brand to be attached to two companies or a Boss UI filter to broaden access.
- Provide a safe reconciliation/migration path for existing company/brand/product/division records using stable IDs and explicit mappings.
- Keep legal registration facts and external domains marked as unverified until evidence is supplied; the app structure does not assert legal ownership.

**Acceptance gate**

- Boss can create multiple companies under MAXPASE Group and multiple brands under each company.
- The Company selector always reflects Group-owned active companies; the Brand selector is filtered to the chosen company.
- Duplicate slugs, foreign company/brand pairings, invalid parents, and unauthorized changes are rejected server-side.
- Existing AIRA, PEARN, Top Rank AI, and other inventoried records retain their stable identity and working existing routes.

### Phase 3 — Default brand dashboard and role templates

**Goal:** Every brand is onboardable by default with Director and AO dashboards, plus configurable employee roles.

**Work**

- Define a reusable brand workspace contract: dashboard route, brand scope, base capabilities, role templates, navigation, and authentication realm/session behavior.
- Provide default Director and AO role templates for every active brand. The templates are available automatically when the brand is created; no manual role setup is required by the Boss.
- Define Director and AO dashboard content as safe, useful starting workspaces. Keep Director management scope within the assigned brand/company policy; give AO only its approved operating tasks and records.
- Add a role catalogue so the Boss can appoint employees by role under a brand. Brand-specific specialist roles can be configured from reviewed templates without custom page code per employee.
- Keep the permission registry and role catalogue consistent. Reject global capabilities and cross-company grants in brand roles.
- Adapt existing AIRA and Nice Jobs workspace routes rather than bypassing their host, realm, and authorization boundaries.

**Acceptance gate**

- A brand created through the Boss UI has active Director and AO templates and reachable dashboard destinations without a follow-up setup operation.
- The complete inventory from Phase 1 maps to a dashboard and role template, or has an explicitly documented and accepted exception before this release can pass.
- Director, AO, and specialist role capabilities are least-privilege, brand-scoped, and cannot enter sibling brands or unrelated portals.
- Creating or editing a template cannot silently widen an already-appointed role's permissions.

### Phase 4 — One-form Boss HR onboarding and access lifecycle

**Goal:** Let the Boss appoint real employees through one simple workflow.

**Work**

- Replace the hard-coded role selection with the selected company's brand role catalogue. Keep the form to company, brand, role, full name, work email, mobile number, and joining date; make only necessary fields required.
- On submission, create/link the Person, Employment, brand assignment, invited User, brand membership, and mapped role as a consistent, retry-safe operation. Surface any provider delivery failure without losing the HR record or implying that sign-in is ready.
- Assign reporting by the Boss/brand policy without requiring an intermediate Director to exist before an AO can be prepared. A Director may be appointed first operationally, but it must not be a hidden technical prerequisite for access setup.
- Send a time-bound, single-use invitation through the configured provider; the employee verifies control of their email and sets their own credential. Do not expose or create a fixed shared password/PIN.
- Give the Boss a single employee record view for profile, company/brand/role, invitation state, access state, suspend/resume/revoke, and transfer. Preserve audit history and revoke sessions when access is removed.
- Remove routine extra approval queues from Boss appointments. Retain explicit confirmations only where they protect irreversible or legally sensitive actions.

**Acceptance gate**

- Boss can create a Director, AO, and one specialist employee for each supported brand using the same form pattern.
- A successful submission clearly distinguishes **employment saved**, **dashboard assigned**, **invitation sent**, and **employee activated**.
- Duplicate identity, retry, expired invitation, failed email, revoked access, transfer, and suspended account cases behave safely and visibly.
- No intermediate approval is required for a Boss-authorized ordinary appointment.

### Phase 5 — New royal-black Group Director dashboard

**Goal:** Deliver the entirely new Director experience while preserving safe access to existing business workspaces.

**Work**

- Create a new MAXPASE Group Director dashboard shell and navigation using the requested royal-black visual theme, readable contrast, and distinct left-margin menu styles.
- Provide persistent Group/company/brand context and a clear switcher that only lists authorized scopes.
- Start with workforce roster, brand health/coverage, key work queues, assigned actions, and safe operational summaries required by the default Director role. Avoid adding payroll, recruitment, analytics, or broader workflows beyond the frozen onboarding scope unless needed for those summaries.
- Give Directors and AOs role-appropriate menu items from the role catalogue; hide unavailable destinations and enforce every page/action on the server as well.
- Route new appointees to their assigned brand dashboard after activation. Keep Boss-only company/brand management in the Boss area.
- Migrate existing Director entry points carefully; keep current specialized portals functional until their replacement routes pass acceptance.

**Acceptance gate**

- New Director shell and menu work for every inventoried brand role, across supported desktop and mobile widths, with accessible keyboard/focus/contrast behavior.
- Directors and AOs see only their assigned company/brand data and actions; forged route IDs and cross-brand session replay are rejected.
- Existing Boss dashboard and established product portals still work.

### Phase 6 — Real-user onboarding readiness and release verification

**Goal:** Prove the complete flow is ready for controlled real-user testing.

**Work**

- Run the Phase 1 inventory against the target test database and verify each company/brand has one canonical mapping, active default templates, a dashboard route, and authentication settings.
- Verify schema migrations against a backed-up disposable target first; preserve stable IDs and document recovery steps. Do not apply schema changes to production as part of local readiness work.
- Configure approved test email delivery, canonical test origins/hosts, stable secrets, and TLS in the designated test environment. Confirm provider delivery and invitation expiry/consumption behavior with explicitly authorized test identities.
- Exercise the actual Boss sign-in, company and brand setup, Director appointment, AO appointment, specialist appointment, invite delivery, employee credential setup, dashboard entry, scope isolation, suspend/revoke, and audit trail.
- Record evidence, unresolved limitations, rollback/recovery steps, and an explicit test-environment readiness status. Keep production rollout as a separately authorized release.

**Acceptance gate**

- For every inventoried brand, an authorized Boss can onboard a test Director and AO; each receives the correct invite and reaches the correct dashboard after activation.
- An employee from one brand cannot access another brand by changing a URL, replaying a token, or modifying submitted form data.
- Invitation and access revocation take effect; events are attributable and visible to the Boss.
- Database migration, backup/restore rehearsal, app readiness, and browser checks pass in the designated test environment.
- Readiness is recorded as **READY FOR CONTROLLED REAL-USER TESTING** only after all mandatory checks pass. This is not a claim of production deployment or legal/company verification.

## Release boundaries

### Included

- Group parent and company/brand hierarchy management.
- Brand-wide Director and AO role/dashboard defaults.
- Role-based employee appointment from Boss HR.
- Secure invitation, authentication, scoped dashboard entry, and access lifecycle needed for real-user testing.
- The new Group Director dashboard shell and its role-appropriate menu.

### Deferred

- Payroll processing/release, recruiting pipelines, advanced HR operations, analytics, automation, and extensive company-specific workflow redesign.
- Replacing every specialized product portal when a compatible brand-scoped destination already exists.
- Production migration, deployment, DNS/domain changes, email-provider provisioning, or real employee invitations until explicitly carried out in the approved environment.

## Change control for the frozen scope

Any change to the six requirements, the Group → Company → Brand hierarchy, the default Director/AO coverage rule, or the Phase 6 readiness gate must be recorded as a deliberate product-owner change before implementation. Technical details may be refined during development if they preserve these requirements and the existing data/access boundaries.
