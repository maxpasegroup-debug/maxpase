# AIRA Startup Skool Build 04 — Director Admissions and Intake

## Implemented screens and routes

- Boss admissions landing: `/app/boss/brands/[id]/admissions` now links into the mixed leadership workspace and intake configuration.
- Leadership dashboard and decision queue: `/app/boss/brands/[id]/admissions/leadership`.
- Existing AO assignment workspace remains available at `/app/boss/brands/[id]/admissions/ao-assignments`.
- Program and intake control: `/app/boss/brands/[id]/admissions/configuration`.
- AO workspace remains at `/sites/skillcity/admissions` and the domain-aware `/admissions` route.
- Public application remains `/apply` on the Startup Skool domain.

## Working behavior

- Boss overview counts are calculated from the authorized public SIA and legacy application records. Program, status, district, referral category, date, search, sort, and pagination filters apply to the queue.
- The leadership queue shows application source, assigned AO, AO recommendation or latest follow-up, referral category, status, and submission date. Applicant details retain their event and follow-up histories.
- Leadership can begin review for submitted cases, approve or reject cases under review, request clarification, or return a case to the AO. Decision reasons are required. Server transitions compare the expected application version and current status; conflicting/replayed decisions fail. Every transition records actor, time, reason, previous/new state and an operational audit event.
- The AO handoff accepts submitted, clarification-required, and returned-to-AO cases. Public SIA forwarding requires verified mobile, current consent, a review note, and the three review checks. An assigned AO must own the active assignment before forwarding or following up.
- Intake configuration reuses existing PBA `Program`, `Batch`, and active `Location` records. Changes require both program and batch management permissions, validate scope and dates, use `updatedAt` concurrency checks, and create operational audit events. No new data model or migration was introduced for Build 04.
- Public application choices come from currently active PBA programs and active batches with in-range dates, an active selected centre, and available recorded capacity. Capacity checks conservatively include current participants plus submitted and approved public/legacy applications since the intake opened. The server repeats this check at submission. Closed, unpublished, expired, full, or centre-less intakes are not offered.
- Application approval remains separate from admission confirmation, enrollment, student credentials, and payment. No payment or student activation work was added.

## Permission boundaries

- Boss routes validate the Startup Skool brand, AIRA Skill City company, and active Startup division, then require explicit application/program permissions. Intake mutation additionally requires `batch.manage`.
- Portal Director actions require the existing Skill City portal session and the existing Startup permissions. Titles alone do not authorize access.
- AO assignment choices require an active AIRA Skill City employment, active verified account, and Administrative Officer membership. AO case access and actions continue to require existing application read/triage permissions and an active assignment.
- Legacy authenticated applications and public SIA applications use separate existing records; the queue combines their views without copying or merging records.

## Validation performed

- `npm run typecheck`: passed.
- Focused Startup regression tests: 11 tests passed across `startup-phase2`, `startup-admissions-desk`, and `startup-admission-intakes`.
- Focused ESLint over the Build 04 source files: passed after one unused local was removed.
- `npm run build`: passed with `DATABASE_URL` and `DIRECT_URL` overridden to `127.0.0.1:1` for the entire process, so the build could not reach a configured remote database. Next reported existing CSS Autoprefixer `start`/`end` compatibility warnings; compilation, lint/type validation, all 29 static pages, and build traces completed.
- No database-backed integration test or browser sign-in/role acceptance was run. A safe isolated PostgreSQL instance and authorized Boss/AO test accounts were not available in this work session.
- No Prisma schema or migration change was made for Build 04; do not deploy the pending Build 02/03 migration as part of this change without the normal isolated review/release process.

## Local preview

Use an isolated local PostgreSQL database with the existing development migrations and local-only test accounts. Do not point local preview at Railway production.

```powershell
npm run dev
```

Open `http://localhost:3000/app/boss/brands/<startup-school-brand-id>/admissions/leadership?view=overview` or `http://localhost:3000/app/boss/brands/<startup-school-brand-id>/admissions/configuration`, using the existing Startup Skool brand ID, and sign in with an authorized development Boss account. The AO route is `http://localhost:3000/sites/skillcity/admissions` (the domain-aware `/admissions` route is available when the Skill City portal host is configured locally).

The application view requires a database with the existing Build 02/03 schema and relevant records. Without that isolated database, the routes can be compiled but cannot show a data-backed dashboard.

## Remaining acceptance blockers

1. Apply existing schema migrations to an isolated test database and verify public submit → AO assignment/follow-up → forward → leadership decision, including stale-version conflict behavior.
2. Verify intake create/update/open/close with real PBA programs, centres, capacity, and an applicant submission against the open/closed states.
3. Browser-check Boss, Director, AO, mobile layout, and cross-brand denials using separately authorized test accounts.
4. Review and address the existing CSS Autoprefixer warnings separately if the team requires a warning-free build.

**Status:** local implementation, typecheck, focused regression tests, focused lint, and isolated production build are complete. Release acceptance remains blocked on isolated database and browser verification. No production changes, deployment, commit, or push were performed.
