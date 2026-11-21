# MAXPASE Workforce Foundation — Phase 2 Implementation

**Status:** Phase 2 code implementation complete. Runtime database reconciliation and acceptance against the configured database remain unverified; see [Phase 1 audit](./MAXPASE_WORKFORCE_PHASE_1_AUDIT.md).
**Scope:** Boss management of MAXPASE Group companies and company-owned brands.
**Data operations:** No seed, migration, company/brand mutation, or production deployment was performed.

## Implemented

- Completed the existing Boss **Companies & Brands** manager for the frozen hierarchy **MAXPASE GROUP → registered company → brand**.
- Company creation is constrained in the business service to the active canonical MAXPASE Group root and its active GroupProfile. Companies cannot be created as standalone records or under a different group through a forged request.
- Brand writes require a registered Company directly under MAXPASE Group with a matching CompanyProfile group link. Brands are created directly under the company. Existing `parentBrandId` relationships remain intact and are shown as legacy grouping detail in a flat company brand list.
- New company and brand records start inactive. A brand can be activated only after its owning company is active. Boss lifecycle management supports activation, inactivation, and safe archive; archived records remain archived during edits.
- Company and brand slugs are stable after creation. The editor marks existing slugs read-only, and the service rejects slug changes. Company ownership and existing brand-parent relationships cannot be changed through ordinary edits.
- The Boss hierarchy now shows all company-owned brands, including existing nested/legacy brands, directly under their owning company. The company page lists every non-archived brand and labels legacy grouping without hiding child records.
- Fixed company editing in the Boss hierarchy: the form now submits the owning Organization ID expected by the server action. The general company list now exposes `groupOrganizationId` from the existing company parent so its edit form also retains the Group relationship.
- Brand archive and permanent deletion now account for HR assignment history. Permanent deletion is denied if any employment assignment refers to the brand; archive is denied while active/draft assignments or linked products, projects, programmes, or child-brand relationships remain.
- Boss registry reads, dashboard selectors, and lifecycle actions verify that the company and its profile belong to the MAXPASE Group parent record.
- Existing company/brand create/edit/archive actions continue to write audit events through the business service or Boss registry. No legal registration, domain ownership, or company identity is asserted as independently verified.

## Phase 2 acceptance disposition

| Acceptance item | Disposition |
| --- | --- |
| Boss can add multiple companies under MAXPASE GROUP | **Implemented in the Boss hierarchy manager and enforced server-side.** |
| Boss can add multiple brands under each registered company | **Implemented; new brands are direct company children and inactive until explicitly activated.** |
| Company selector and brand ownership remain correctly scoped | **Implemented using authorized company records, root/group linkage checks, and company-scoped brand records.** |
| Duplicate identities, foreign company/brand pairs, invalid parent, and unauthorized changes are rejected | **Implemented through unique database constraints, Boss authority, Group/company checks, stable identity checks, and server validation.** |
| Existing AIRA, TEARN/PEARN, Top Rank AI, portal, and product identities are preserved | **No records were changed. Source definitions and legacy parent-brand relationships remain in place. Live IDs and statuses are not verified.** |
| Live current structure reconciled against the authorized database | **NOT VERIFIED — Prisma could not initialize a read-only connection to the Railway-internal database; no data was queried.** |

## Not claimed by Phase 2

- This phase does not make every brand onboardable. Director/AO defaults and authentication for every brand are Phase 3/4 work.
- The repository's TEARN/PEARN and TOP TANK/TOP RANK naming differences remain owner/database reconciliation items. Stable slugs and existing IDs are preserved; no automatic rename was made.
- No external company registration evidence, legal status, domain ownership, email delivery, or production deployment was verified.
- No automated test suite, database migration, seed, or live UI acceptance run is claimed in this implementation report.
