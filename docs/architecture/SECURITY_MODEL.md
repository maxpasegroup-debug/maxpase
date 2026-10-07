Phase 03 recruitment extension: [Nice Jobs interview, human approval and offer architecture](NICE_JOBS_INTERVIEW_APPROVAL_OFFER_ARCHITECTURE.md). Existing Phase01/02 identity, scope, audit and human authority boundaries remain in force. Offer acceptance does not activate workforce assignments.

# Security Model

Nice Jobs applications use existing realm/session/origin controls, source-scoped ownership predicates, strict form/rule validation, database uniqueness and transactional revision/audit checks. Candidate responses exclude hidden rules, scores, management notes and evaluator/audit details. `nicejobs.*` reported events are reserved. Application notifications validate real ownership and recipient scope. See [Phase 02](NICE_JOBS_APPLICATION_SCREENING_ARCHITECTURE.md).

## Nice Jobs Workforce Phase 01

Nice Jobs management reuses current session/audience/origin checks and the scoped authorization engine. Actual company, product, business areas, person membership and publication are resolved server-side; client actor identity and arbitrary lifecycle changes are not accepted. Revision CAS and database uniqueness reject stale/replayed/duplicate mutations. Canonical audit/event insertion is transactionally required. Worker query visibility is enforced before paging and DTOs expose no credentials or extra contact/profile data. No autonomous disciplinary or termination endpoint exists. See NICE_JOBS_WORKFORCE_ARCHITECTURE.md.

## Phase 10 Runtime And Privacy

Production requires explicit non-example signing configuration, secure cookies, absolute persistent SQLite path and canonical HTTPS APP_ORIGIN. Sessions bind only server session ID/subject in HS256 tokens and recheck database expiry/account/person lifecycle; no email/person data is embedded in new tokens. Login success/session creation/logout and required audit are transactional. Password verification rejects bcrypt UTF-8 truncation. Development bootstrap has no fixed embedded password; production seeding remains prohibited.

Database-backed fixed-window budgets cover login, authenticated guards, public webhooks and SIA UI actions in addition to existing scoped communication/automation limits. SameSite/HttpOnly cookies, exact origin checks and Next server-action protections are complementary; deployment edge protection/TLS remain required. Safe diagnostics never serialize exception/payload/secret values, and raw ORM error logging is disabled. Baseline security headers and authenticated no-store behavior are implemented, not a complete nonce CSP or distributed DDoS guarantee. Technical scoped privacy controls do not imply legal compliance certification. See DEPENDENCY_SECURITY.md, INCIDENT_RUNBOOK.md and PHASE_10_VALIDATION.md.

## Phase 09 External Boundaries

Scoped deployment credential bindings prevent editable environment references from reading unrelated secrets. Strict provider configuration and normalized webhook schemas, HMAC constant-time checks in the explicit mock protocol, timestamp/body/rate bounds and persistent event fingerprints reject spoofing/replay. Current consent, source reads, canonical identities, immutable previews, independent approval and human confirmation gate dispatch. Unknown delivery never blindly retries. No live provider, document exposure or autonomous SIA authority is enabled; production/edge hardening remains Phase 10. See COMMUNICATIONS_INTEGRATIONS.md.

## Phase 08 SIA Safety

Stored business text, reviewed memory and model intent are DATA, never executable policy. Strict inputs, immutable registered risks, actual scope, dual-principal source filtering, current authorization/approval checks and creator-bound fingerprints prevent injection, scope forgery and replay. A task and verification audit commit together; failure rolls outputs back. General/high-impact autonomous execution remains DISABLED. No arbitrary SQL/shell/filesystem/API tool exists. Provider/browser/production validation remains separate from tests and HTTP rendering. See SIA_VIRTUAL_CEO.md and PHASE_08_VALIDATION.md.

## Phase 07 Executive Isolation

No unauthorized company work contributes to visible executive counts, health, history, trends or selectors. Trusted session actors, strict inputs, actual scope resolution, source reauthorization, unique references and expected-version CAS protect mutations. Executive record/history/audit/event writes are transactional; passive reads emit no audit. Reserved lifecycle namespaces prevent event forgery. SIA remains disabled. Validation evidence and development dependency risks are reported in PHASE_07_VALIDATION.md, not inferred from UI rendering.

## Phase 06 Company Isolation

AIRA entry and every domain mutation revalidate current identity, explicit capability and server-resolved company branch. Other-company access, titles and forged company/actor IDs confer no AIRA authority. Shared references and immutable resource scope are checked before writes; audit/event writes are transactional. Company DTOs never include credentials. See AIRA_COMPANY_OS.md and PHASE_06_VALIDATION.md for actual security checks, dependency findings and unperformed browser/production validation.

## Phase 05 Operational Controls

All operational actors come from session identity. Resource resolution rejects forged company/project scope and recursively checks wrapped-resource reads. Approval assignment/policy/capabilities and active human membership are rechecked before decisions and approval consumption. Compare-and-set versions, unique keys and request fingerprints prevent replay/duplicate output. Audit/event persistence is atomic with mutations; user-facing errors omit internals, and activity/event projections exclude sensitive metadata. SIA execution remains disabled even after approval. Integration tests cover scoped forgery, invalid recipients, private notifications, capability revocation, stage/replay attacks, competing transitions and audit rollback. Browser/device validation and deployment checks are separately reported, never inferred from builds.

## Phase 04 Verification

Execution mutations authorize actual organization/project resources and enforce assignment membership, cycles, closed transitions and atomic audit. Derived progress cannot expose underlying work without read capabilities. Legacy project/goal mutation paths delegate to the same boundary. Targeted dependency overrides preserve pinned Prisma and the existing Next major while clearing the production dependency audit. The development-only Vitest tree has moderate residual advisories; browser/device and production security validation remain separate. See PHASE_04_VALIDATION.md for evidence and limitations.

## Defaults

- Passwords are hashed with bcrypt.
- Sessions are stored server-side and represented with HTTP-only cookies.
- Protected routes require session validation.
- Authorization is based on scoped permissions.
- Important actions create audit events.
- Secrets are documented in `.env.example` and excluded from git.
- Production migrations are explicit.

## Tenant Isolation

Data access should always carry organization context when the entity belongs to an organization. Future APIs must prevent insecure direct object references by checking membership and permission scope before returning or mutating resources.

## Sensitive Data

Audit metadata must not store secrets, raw passwords, session tokens, or unnecessary personal data.

## Phase 03 Access Boundaries

Person/account suspension blocks authentication and all permission resolution. Account password changes and deactivation revoke sessions transactionally. Read DTOs exclude credential hashes and tokens. Shared profile/account changes require authority over every membership and existing capability, including dormant memberships.

Scope IDs, query parameters, project references and assignment form payloads are untrusted. Services resolve actual resources, check parent context and capability, reject cross-company/department/project access and prohibit broader delegation. Archived ancestors revoke even GLOBAL grants sourced beneath them. Invalid/cyclic ancestry fails closed.

Canonical agent roles cannot be assigned to human memberships. SIA cannot receive GLOBAL capabilities and has no execution path in Phase 03. Role titles, reporting, responsibility and equity grant no implicit access. Every sensitive mutation and its audit event share a transaction. See PEOPLE_ACCESS.md and PHASE_03_VALIDATION.md for the implementation and tests.
