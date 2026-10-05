# AIRA Company OS

## Phase 10 Readiness

Company facade/branch isolation and shared workflow/execution/access/audit remain unchanged. Security/deployment/backup procedures apply to AIRA through the shared OS, not a second engine or a root transfer. Canonical roles remain unassigned without seeded capabilities; no real staff/legal/financial data is inferred. HTTP/SSR and regression checks are local evidence; browser/device, live communications and production acceptance remain explicit launch gates. See PHASE_10_VALIDATION.md and BROWSER_DEVICE_CHECKLIST.md.

Phase 06 implements AIRA Skill City Private Limited inside MAXPASE OS. MAXPASE GROUP remains the parent ecosystem, MAXPASE OS the shared operating infrastructure, and SIA the shared Virtual CEO identity. AIRA is not a second operating system or the root architecture.

## Company and Structure

The existing Organization/CompanyProfile at `aira-skill-city` is reused. Its group profile and parent must agree with the existing `maxpase-group` organization. Names are known structural facts; the development seed's legalInformationVerified=false remains. No registration, directors, shareholders, equity, headcounts, addresses or financial performance are invented.

Four canonical Organization DIVISION records are added beneath AIRA:

1. AIRA Startup School (`aira-startup-school`)
2. AIRA Labs (`aira-labs`)
3. AIRA Skill Studio (`aira-skill-studio`)
4. AIRA Career Hub (`aira-career-hub`)

Canonical names/references are protected through both shared organization mutation paths. Other divisions/business units, departments and teams remain configurable through the existing hierarchy validator. No layer is mandatory. Reparenting still requires a controlled future migration. Existing explicitly labelled development administration/workspace examples remain unchanged and unstaffed.

Nice Jobs is one existing-model Product, type PLATFORM, owned by the AIRA company and linked through Product.divisionId to AIRA Career Hub. It is not a legal Company. CONCEPT is a registry foundation, not a claim that the platform is live; metadata records operationalStatusVerified=false. Canonical Nice Jobs identity/division cannot be changed through the shared product service. No TeachX Guru, LearnX Guru, HappiNotes, BGOS, Talkin Labs, Sales Booster, ABSECO or other speculative Labs products are seeded.

Product remains company/group-scoped. Optional divisionId expresses its operating home, not a separate tenant, owner, capability or equity relationship. Division links require the same actual company, appropriate division/business-unit type and organization.read. Referenced programs prevent conflicting product division/brand edits.

## Reusable Programs and Services

Program is a reusable business record, not an AIRA-specific task or admissions entity. It has companyOrganizationId, division organizationId, name/reference, description, PROGRAM/SERVICE kind, status, optional durationDays/capacity, optional priceMinor/currency, optional company brand/product, metadata and timestamps. Lifecycle is DRAFT, ACTIVE, PAUSED, RETIRED, ARCHIVED. Creates default DRAFT. Unknown data remains null, including price and capacity. Price is an integer in explicitly named minor units with a three-letter currency; the pair is either both present or both unknown. This is offering configuration, not accounting, invoices or revenue.

Programs require a division/business unit. Company scope is derived, not accepted from the client. Division/company identity cannot be transferred on update. Brand/product links require actual AIRA company ownership, read capability, compatible division and consistent brand. No programs/services are seeded. Startup School, Skill Studio and Career Hub share this offering model; no separate per-division program registries exist.

## Batches and Delivery

Batch is the intake/delivery unit of exactly one Program. Fields: name, status, nullable UTC start/end instants, capacity, location, metadata and timestamps. Statuses: PLANNED, OPEN, ACTIVE, COMPLETED, CANCELLED, ARCHIVED. Creates default PLANNED; unknown dates remain null. Start cannot follow end. OPEN/ACTIVE require an ACTIVE Program. ACTIVE requires a supplied actual start not in the future; COMPLETED requires an actual end not in the future. Closed batches cannot be reopened through this foundation. Program changes are rejected. Configured batch capacity cannot exceed program capacity or be reduced below participating people. Retiring a program or deactivating a location is blocked while OPEN/ACTIVE batches still depend on it.

Program -> Batch -> BatchParticipant links existing Person identities. Participation status is PLANNED, ACTIVE, COMPLETED or WITHDRAWN. The batch/person pair is unique; updates reuse that pair. Participants must have active date-valid organizational membership covering the actual division, including explicit ancestor DESCENDANTS membership. Participation creates neither a User nor a role/capability. Active participation requires an active batch; closed batches reject participation changes. Capacity checks and participation writes are transactional. These are deliberately not admissions/enrolment/payment records.

TRAINER and MENTOR are explicit kinds in the existing Responsibility model, attached to a program or batch. Batch schedule, location, participants and these responsibilities form the delivery foundation. No separate LMS, delivery engine, exams, content, attendance, assignments, grades, physical training or academic analytics are introduced.

## Locations

Location is reusable and belongs to a company and an actual organization in that company's branch. Fields: name, CAMPUS/DISTRICT_HUB/COMMUNITY_CENTRE/ONLINE/OTHER type, PLANNED/ACTIVE/INACTIVE/ARCHIVED status, optional address/city/region/country/postalCode, metadata and timestamps. Creates default PLANNED. Location scope cannot move. Batches may use a company-wide location or a location on their own division's ancestor branch, not a sibling division or another company. Open delivery requires an active location. No locations or addresses are seeded.

## Shared Responsibility and Roles

The existing Phase 03 Responsibility receives programId, batchId, locationId, optional responsible teamId and an explicit kind: RESPONSIBLE, OWNER, ACCOUNTABLE, ACADEMIC, OPERATIONS, MANAGER, TRAINER or MENTOR. Old rows default RESPONSIBLE. Exactly one optional resource target is allowed; no target means organization responsibility. A Person remains required as the explicit human contact; an optional team must be an active TEAM below that target organization. This retains the original human-responsibility contract rather than installing another assignment engine. Responsibilities do not grant permissions, infer job titles or represent company equity. Active people and membership coverage are revalidated by the workforce service. Ownership/academic/operational assignments are explicit responsibility records, not speculative employees.

All 60 canonical AIRA Role definitions remain the existing registry, unassigned and without seeded capabilities. SIA remains AGENT entry 60, SIA - Virtual CEO, backed by SiaIdentity, not a Person/User/employee. The existing development administrator is the only bootstrap identity. Ordinary role names never confer authority.

## Company Context and Permissions

aira-service.ts is the company facade, not an authorization engine. It resolves the existing AIRA company by its server-known reference, verifies the group relationship, requires current company.read and computes the active branch excluding nested/sibling companies. Actual resource IDs and organization ancestry are checked again at each mutation. Query/body company IDs cannot select a tenant or override actor identity. Actors come from requireSession. The navigation entry performs an audited authorized context-entry action; direct company-page reads are authorized but do not persist a session-wide tenant or infer a grant. Context is re-established on every request, so old browser state cannot bypass revocation.

Six generic named capabilities are added to the existing registry: program.read/manage, batch.read/manage, location.read/manage. They use the existing scope/delegation engine; these concepts are reusable, so speculative aira.* duplicates are not registered. The AIRA facade additionally fixes the company boundary. Group users need explicit matching capabilities and descendant coverage. Exact company grants do not automatically cover divisions; project grants stay project-bound and confer no program-wide access. Ownership, participation, assignment and titles confer no access. Mutation controls are ergonomic only; services enforce all permissions.

## Shared Graph, Execution and Operations

Organization -> division -> Program -> Batch -> participant Person/Responsibility and Location extends the relational MAXPASE graph. Company -> Product -> optional division is retained. Department/team/person relationships reuse existing Organization, Membership and Role. No graph database, second people registry or AIRA-specific task system is introduced.

Project.programId and Goal.programId are optional references to a Program in the exact existing execution organization. Links require program.read and an open program. If a goal links both project and program they must agree; project edits cannot invalidate program-linked goals. Projects/tasks/milestones/goals/dependencies/blockers/progress/attention and closed-state guards remain the Phase 04 service. The company UI delegates writes there and links to its detailed execution controls; unexposed execution relationships are preserved when editing in company context.

Shared operational resource resolution now supports PROGRAM, BATCH and LOCATION. Batch scope derives from Program, never from a client company field. These target types are available in shared workflow/request/reminder/notification editors. The AIRA workflow launch normalizes the actual resource scope then invokes the Phase 05 workflow instance service, retaining its immutable definitions, exact policy scope, idempotency, controlled transitions and human approvals. Approval only records a decision; it never activates a program or executes work implicitly.

Career Hub's employer foundation reuses directional CompanyRelationship with EMPLOYER: AIRA has an employer relationship to an existing known company. Both endpoint visibility and the existing mutation permissions are required. The shared company-relationship editor creates/manages it. No employer/customer/company records, job listings, applicants, placements or recruitment engine are fabricated. Career programs and operational projects/responsibilities reuse the same offerings and execution services. Nice Jobs stays under Career Hub.

## Audit, UI and Boundary

Program/batch/location/participation mutations and company entry use existing AuditEvent plus its linked OperationalEvent in the same transaction. Shared division/product/responsibility/execution mutations retain their shared audit paths. Audit persistence failure rolls back the mutation. Metadata records safe status/context rather than copied payloads. New lifecycle namespaces are reserved from manual event fabrication. Errors exposed by server actions are controlled and omit Prisma/stack details.

/app/aira is an authenticated company operating overview with accessible real divisions, active programs/projects, dated upcoming batches, registered locations, actionable personal approvals, blocked projects, at-risk/missed goals and explicit responsibility. Empty queues remain empty; zero means zero accessible records, not fabricated business performance. The company navigation exposes implemented, authorized registries only. Tables scroll within mobile containers, editors collapse to one column, and loading/empty/error/pending states use native accessible controls. Browser/device validation is separately reported.

Shared authentication, identities, roles, permission decisions, company profiles, hierarchy, products, responsibilities, projects, tasks, goals, workflows, approvals, audit and notifications are reused. No Phase 07, CRM/admissions, HR/payroll, finance, complete LMS, exams, advanced analytics or external communication providers are added. SIA intelligence/execution remains disabled. See PHASE_06_VALIDATION.md for measured checks and remaining gaps.
