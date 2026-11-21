# MAXPASE Workforce Foundation — Phase 1 Audit

**Status:** Repository/code audit complete; runtime database inventory not verified.
**Date:** 2026-11-21
**Scope:** Static inventory and employee-role provisioning audit for the frozen six-phase workforce foundation.
**Database safety:** `.env` is configured for host `postgres.railway.internal` (database `railway`). A read-only Prisma connection attempt failed during client initialization. No database rows were read or changed. This report does not claim that the live database matches the repository definitions.

## Phase 1 result

The code-side Group/company/brand inventory, employee-role registry, appointment flow, and portal/authentication boundaries have been traced. The screenshot error has a source-level repair: employee role preparation used `workforcePermissions`, while core organization capabilities were defined separately in `prisma/seed.ts` and `group/provision.ts`. Consequently, a role could be available in the database and Boss role yet appear missing to the HR appointment service.

Core capability definitions are now in the shared workforce registry, explicit Boss provisioning no longer duplicates those definitions with potentially different scopes, and appointment preparation now checks the full capability set before touching role records. Missing capabilities and stored scope conflicts identify the affected role and permission. A static inventory of all 24 current templates finds no missing or GLOBAL-scoped capability definitions after the repair.

This completes the repository-side Phase 1 implementation. The planned *current database* reconciliation remains unverified because this workspace points at a Railway-internal database and Prisma could not initialize a read-only connection. No migration, seed, invitation, or employee/company mutation was run. Do not treat this as a claim that real onboarding is ready.

## Canonical domain contract for later phases

Preserve these domain boundaries while implementing the frozen requirements:

| Concept | Canonical relationship / use |
| --- | --- |
| Group | `MAXPASE GROUP` (`maxpase-group`) is the single parent of registered companies and root of Boss authority. |
| Registered company | `Organization(type=COMPANY)` beneath the Group; owns legal company profile and employment records. |
| Brand | `Brand.organizationId` identifies exactly one owning company. `Brand.parentBrandId` is a legacy/sub-brand relationship; the Boss experience must still be able to select each brand under its owning company. |
| Employment | Person's employment under a company. It does not itself grant workspace access. |
| Brand assignment | `HrAssignment.brandId` records a person's work assignment to a brand. |
| Account / authentication | `Person` and `User` remain central identity/account records. Existing authentication realms and portal hosts remain isolated until a canonical workspace binding maps the brand to its allowed realm, invite origin, and dashboard. |
| Workspace access | An explicit membership and role grant scoped to the brand's authorized workspace. Never infer a grant from a job title, brand relationship, or another brand's membership. |
| Role template | Stable role key and display name, with a reviewed capability set and one dashboard destination. Every brand gets Director and Administrative Officer defaults; specialist roles are additive. |
| Audit | Record the actual Boss actor and change. Audit is history, not a separate approval gate for routine Boss appointments. |

For existing portals, keep the current Organization/division scope as the workspace binding until a data-backed mapping is approved. Do not create duplicate brands, companies, people, or accounts to make a route fit.

## Repository-defined organization inventory

The initialization definitions in `src/server/group/structure.ts` declare one Group, three registered companies, and 15 Brand rows. They are source definitions, not a live database inventory.

### Group

| Name | Slug | Source |
| --- | --- | --- |
| MAXPASE GROUP | `maxpase-group` | `src/server/group/identity.ts` |

### Registered companies and brands

| Company (source name / slug) | Brand (source name / slug) | Existing parent-brand relationship |
| --- | --- | --- |
| AIRA SKILL CITY PRIVATE LIMITED / `aira-skill-city` | AIRA STARTUP SKOOL / `startup-school` | None |
| Same | AIRA SKILL STUDIO / `aira-skill-studio` | None |
| Same | AIRA LABS / `aira-labs` | None |
| Same | AIRA CAREER HUB / `aira-career-hub` | None |
| Same | AIRA MEDIA COMPANY / `aira-media-company` | None |
| Same | MY SOLAR SOLUTIONS / `my-solar-solutions` | AIRA LABS |
| Same | NTE NAADU / `nte-naadu` | AIRA LABS |
| Same | HAPPINOTES / `happinotes` | AIRA LABS |
| Same | TALKIN LABS / `talkin-labs` | AIRA LABS |
| Same | ONSPEAK MENTOR HUB / `onspeak-mentor-hub` | AIRA LABS |
| Same | BGOS / `bgos` | AIRA LABS |
| Same | NICEJOBS / `nice-jobs` | AIRA CAREER HUB |
| TEARN PRIVATE LIMITED / `pearn` | TEACHX GURU / `teachx-guru` | None |
| Same | LEARNX GURU / `learnx-guru` | None |
| TOP RANK AI PRIVATE LIMITED / `top-rank-ai` | TOP TANK AI / `top-rank-ai` | None |

### Naming and type conflicts to carry forward safely

- `docs/architecture/MAXSPACE_GROUP_ARCHITECTURE.md` describes PEARN PRIVATE LIMITED, while current initialization uses **TEARN PRIVATE LIMITED** and explicitly accepts PEARN as a legacy name. The stable company slug is `pearn`. Treat the legal/display name as owner-confirmed only after checking the current database and authoritative records; do not rename it based only on the older document.
- The Top Rank brand row uses display name **TOP TANK AI**, while the company and earlier alias use Top Rank AI. `previousBrandNames` explicitly lists Top Rank AI as an accepted previous brand name. Preserve the stable slug and resolve the displayed name from owner-confirmed/current records before any update.
- The former `aira-skill-city` Brand is intentionally treated as a legacy company-level duplicate and archived by initialization if it has no linked records. AIRA Skill City itself is the registered company, not an extra brand.
- NICEJOBS exists as a `Brand` and its slug also has a related `Product`; BGOS also has a related `Product`. Nice Jobs operational code maps to the AIRA Career Hub division/product workspace. Keep these records distinct and preserve IDs; do not convert the Brand into a company or delete the Product.
- Six AIRA Labs child Brand rows and NICEJOBS are nested under parent brands in current data definitions. The Boss-facing model can present them under the company, but any data migration that flattens `parentBrandId` needs an explicit mapping and a compatibility review.
- The initializer sets `aira-career-hub` inactive and creates child brands inactive. As a result, a repository definition does not prove a usable active brand or dashboard.

### Other organization and product records

- `src/server/domain/company-structure.ts` declares five AIRA division slugs: Startup Skool, Labs, Skill Studio, Career Hub, and Media Company. These are workspace scopes, not additional registered companies. They must remain compatible with existing AIRA portals while their brand bindings are reconciled.
- `src/server/group/structure.ts` also declares products/program drafts such as NICEJOBS, BGOS, GenZ Builder, VIVE CODING, and Full Stack Branding Expert. These are not automatically employee brands.
- The source inventory above is not enough to certify live lifecycle, current row IDs, existing memberships, or whether any live brand has already-appointed employees. Those fields require a successful read of the target database.

## Current Director, AO, specialist, and authentication coverage

The current role template table has 24 entries in `src/server/skillcity/role-templates.ts`; `staff-roles.ts` maps many to AIRA division slugs. This is not equivalent to default coverage for every Brand.

| Repository brand/workspace | Current source-level role/dashboard path | Phase 1 finding |
| --- | --- | --- |
| AIRA Startup Skool (`startup-school`) | `startup-division-director`; `startup-admissions-officer` (AO label); startup advisor/operations roles; Skill City realm | Closest to the requested path. `hr-actions.ts` currently requires an active, verified Startup Skool Director before an AO can be appointed, an unnecessary sequencing dependency for the frozen Boss-led flow. |
| AIRA Labs (`aira-labs`) | `labs-division-director`; developer and Business Development Manager roles; Labs realm | Director/specialist templates exist; no Administrative Officer template. |
| AIRA Skill Studio (`aira-skill-studio`) | `studio-division-director`; junior academic advisor; Skill City realm | Director template exists; no AO template. |
| AIRA Career Hub (`aira-career-hub`) | `career-division-director`; separate `nicejobs-director` role/workspace exists; Skill City or Jobs realm by path | Director concepts overlap; HR explicitly rejects NICEJOBS Director appointments. The related Brand/Products are currently inactive by initialization, so route availability cannot be inferred from role definitions. No general AO template. |
| AIRA Media Company (`aira-media-company`) | Media marketing manager, designer, editor, AI video expert; Skill City realm | Specialist templates exist; no Director or AO template. `resolveStaffRoleTemplate` does not map a Director designation to this scope. |
| Six AIRA Labs child brands | `marketingDivisionSlug()` maps only selected root slugs. `hr-actions.ts` passes the selected child slug without its parent slug. | No child-brand role/dashboard binding; the Boss form/server rejects these brands as unconfigured. |
| TeachX Guru (`teachx-guru`) | No template/realm/dashboard mapping in the HR role resolver | No Director, AO, or employee onboarding path. |
| LearnX Guru (`learnx-guru`) | No template/realm/dashboard mapping in the HR role resolver | No Director, AO, or employee onboarding path. |
| Top Rank AI (`top-rank-ai`) | No template/realm/dashboard mapping in the HR role resolver | No Director, AO, or employee onboarding path. |

Additional source-level onboarding constraints:

- `hr-actions.ts` derives the workspace from a hard-coded brand slug map, then `ensureForAppointment()` requires the company slug to be `aira-skill-city`. PEARN and Top Rank employees cannot be onboarded through this flow.
- Company-wide AIRA AO uses scope slug `aira-skill-city`. Role preparation searches for a child `DIVISION` with that slug; it is absent from the canonical five-division list, and the role-preparation fallback has no name for it. This path can fail even though its role template exists.
- AIRA Career Hub role selection and NICEJOBS special appointment are not unified. The UI may offer the generic Director mapping while the action rejects “NICEJOBS Director.”
- `staffInvite` supports the Skill City and Labs authentication realms only. Separate startup/jobs authentication exists elsewhere, but the HR invitation action does not provide a general invitation path for all brands.
- Email invitation delivery requires `SKILLCITY_EMAIL_AUTH_ENABLED=true`, a valid sender, a dedicated OTP secret, and `RESEND_API_KEY`; `.env.example` leaves these delivery settings disabled/commented. No real invite has been sent.
- `accountPortalRealm()` recognizes jobs, labs, skillcity, and startup realms, while the brand register has no universal `brand → realm → invite origin → dashboard route` binding.

## Capability reconciliation and repair

### Root cause

`ensureForAppointment()` built its capability lookup only from `workforcePermissions`. Core permissions including organization read/manage, company read/manage, membership management/role assignment, and organization-scoped brand/product/project/goal permissions were instead defined in `prisma/seed.ts` and duplicated in `src/server/group/provision.ts`. An appointment template could therefore request a capability that existed in the database and Boss grant but was absent from the runtime workforce registry. The UI surfaced the generic “A required employee capability is unavailable.” error.

### Changes made

- Added the canonical core organization capability definitions to `src/server/authorization/registry.ts` using the established scope values (`company.*` remains `COMPANY`; other listed management/read scopes are `GROUP`).
- Removed the duplicated core capability list from explicit Boss provisioning, so it consumes the same registry definitions and cannot accidentally register the same company capability at a different scope.
- Added a complete template preflight before appointment role mutation. Missing/global capability errors now identify the employee role and exact capability.
- Added checks for stored capability scope mismatches when reusing an assigned role and when assigning a capability. Mismatches fail with an actionable role/key message; they are not silently rewritten.
- Statically evaluated all 24 current templates against the workforce registry. All current template capabilities are present and none is GLOBAL.

### Appointment flow trace

1. Boss HR form submits company, optional brand, designation, employee details, and date.
2. Server action verifies Boss authority, looks up a current brand, maps a few hard-coded brand slugs to AIRA workspace slugs, and resolves a fixed role template.
3. Role preparation checks company/Division scope and prepares role permissions.
4. HR service creates employment and initial brand assignment.
5. Staff onboarding prepares an inactive account, invited membership, and role; invitation delivery is attempted only when provider settings are ready.
6. Employee verifies email and creates a credential through the target portal; their workspace requires active account, membership, role, realm, and scope checks.

This trace confirms that the capability repair addresses the screenshot's named failure class, but does not make the hard-coded brand map, all-brand roles, or all-brand authentication ready. Those are the next implementation phases.

## Phase 1 gate disposition

| Gate | Disposition |
| --- | --- |
| Repository company/brand references inventoried | **PASS — source definitions inventoried; no live database assertion.** |
| Role-template capabilities registered and organizationally scoped | **PASS — 24 current templates statically reconciled after repair.** |
| Missing-capability failure provides actionable diagnostic | **PASS — source repaired.** |
| Existing live IDs, lifecycle, memberships, appointments, and data relationships mapped | **NOT VERIFIED — live read-only Prisma initialization failed; no database rows read.** |
| All-repository-brand Director/AO paths | **NOT READY — only some AIRA roles exist; explicit gaps above are Phase 3/4 implementation work.** |
| Real invitation delivery / authentication | **NOT READY — provider configuration is not enabled in the example config and no real invitation was sent.** |

The Phase 1 code repair is complete, but the release gate must remain **OPEN** until the target database is safely reachable and its IDs/statuses/relationships are reconciled with this source inventory. Phases 2–6 must not make blind live-data changes based only on the initialization arrays.
