# Phase 05 Validation

Local validation performed 2026-10-02 (Asia/Calcutta). Phase 06 has not started. SIA execution is disabled.

## PASS

- Operational events, safe audit-derived activity, versioned workflow definitions, instances/history and server-validated state transitions.
- Generic requests, explicit human approval policies, sequential stages and unanimous parallel stages, rejection/cancellation/expiry and current-authority revalidation.
- Existing SiaApproval extended rather than replaced; unbound historical approvals preserved and excluded from the new decision service.
- Recipient-private real notifications, preference/channel storage, expiry of obsolete approval-required alerts, reminders, finite UTC task/workflow recurrence, explicit escalations and version-bound control checks.
- SIA proposals and independent human approval inspection; executionEnabled remains false even with a scoped agent grant, enabled tool and valid human approval. Verification is NOT_RUN, not fabricated.
- Persistent duplicate protection, competing-transition checks, atomic mutation/audit/event/notification writes and explicit processing failures.
- All 104 tests in 8 files pass using `npm.cmd test -- --no-file-parallelism`. Phase 05 adds 25 meaningful integration/security tests; all 79 earlier tests remain passing. The first parallel run timed out in setup during an unusually slow session; serial reruns complete successfully without relaxing test timeouts.
- `npm.cmd run lint` and `npm.cmd run typecheck` pass without warnings/errors.
- `npm.cmd run build` produces the optimized Next.js production build with operations routes. No production deployment is implied.
- `npx.cmd prisma validate`, Prisma Client generation and `npx.cmd prisma migrate status` pass. Schema drift check (`prisma migrate diff --from-url file:./prisma/dev.db --to-schema-datamodel prisma/schema.prisma --exit-code`) reports no differences.
- New migration `20261002170000_phase_05_operations` applied to the existing local database and a fresh SQLite database using native `prisma migrate deploy`; all six migrations succeed. Earlier migration files are preserved. Both databases pass native integrity/foreign-key checks.
- Development seed remains idempotent and explicitly provisions new registry capabilities only through the existing development bootstrap. Existing user/person identities and 60 canonical AIRA roles are preserved. No operational records are seeded.
- Authenticated local HTTP smoke checks pass for 47 application views: 11 business, 12 workforce, 9 execution and 15 operations. Unauthenticated redirect and unknown-route handling pass. Temporary project/task and real control/workflow/run/request/approval/notification/activity/event fixture rendering pass; exact fixture IDs, their audits/events/notifications and the temporary session are removed in finally cleanup.
- Post-smoke local database has one existing User and Person, 60 canonical roles, and zero fixture requests, workflows, notifications or operational events; native integrity remains ok and foreign_key_check returns no rows.
- `npm.cmd audit --omit=dev --registry=https://registry.npmjs.org` reports zero production vulnerabilities.

## Security Coverage

PASS: forged actor/scope/recipient, cross-company/project/department isolation, role-name non-authority, unauthorized/replayed approvals, altered command replay, same-version competing transitions, approval revocation, self-approval policy, previous-stage/parallel barriers, notification privacy/preferences, wrapped-resource confidentiality, failed reminder recipient, bounded processing, UTC date/recurrence behavior, closed-project recurring failures, explicit escalation truth, audit rollback and SIA execution prohibition.

PASS: audit failure rolls back workflow state/history, approval decisions/notification changes and recurring task/occurrence output. If even failure audit cannot persist, processing raises rather than reporting successful completion.

## BLOCKED

- In-app browser selection reports `Browser is not available: iab`; supported discovery returns an empty list. No browser backend was substituted. Screenshots, desktop/mobile visual QA and interactive browser form tests are not claimed.
- Full dependency audit retains two moderate development-only findings in Vitest/@vitest/mocker (GHSA-82fw-gwwq-j7x9). npm proposes a breaking major upgrade to Vitest 5.0.3. No force upgrade or unrelated toolchain change was made. Production dependencies have zero findings. Test runners should remain local and not exposed as services.

## MANUAL VALIDATION

Pending: manager walkthrough of workflow graph/stage editors, native UTC date inputs, approval actions, read/unread/preferences, pause/resume/cancel, verification retry and explicit due-work processing. Verify keyboard/screen-reader ergonomics and layout at mobile/desktop widths. Automated service/HTTP checks are not a substitute for these browser interactions.

## NOT RUN

Production deployment/database migration, production load/race testing, physical devices, external email/WhatsApp/SMS/push delivery, an external scheduler/outbox consumer and SIA tool execution/verification. External providers, intelligence/autonomy and Phase 06 domains are intentionally absent.

## Files and Modules Changed

- `prisma/schema.prisma`; `prisma/migrations/20261002170000_phase_05_operations/migration.sql`.
- `src/server/authorization/registry.ts`: scoped operational capability registry, reused by existing explicit seed provisioning.
- New `src/server/domain/operations-input.ts`, `operations-scope.ts`, `operational-events.ts`, `operations-service.ts`.
- `src/server/domain/execution-input.ts`: exposes the existing strict UTC date parser rather than duplicating it.
- `src/server/domain/execution-service.ts`: audited event/assignment notification integration and internal transaction reuse for recurring tasks.
- `src/server/domain/workforce-service.ts`: scoped workforce event integration through its existing audit path.
- New `src/app/app/operations/actions.ts`, `operations-manager.tsx`, `page.tsx`, `[kind]/page.tsx`, `error.tsx`.
- `src/app/app/layout.tsx`, `src/app/globals.css`: operational navigation and restrained responsive queue/editor styling.
- `src/app/app/execution/[kind]/page.tsx`: overdue-only task filter, aligned with the operations overview count and existing task authorization.
- New `tests/operations.test.ts`; `tests/execution.test.ts` fixes the historical Phase 04 migration fixture to select its actual migration, not the newest unrelated migration.
- `scripts/http-smoke.ts`: operations routes, populated operational fixtures and exact-ID cleanup.
- New `docs/architecture/OPERATIONS_MODEL.md`, `PHASE_05_VALIDATION.md`.
- Updated `ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `DATABASE_MODEL.md`, `AUTHORIZATION_MODEL.md`, `SECURITY_MODEL.md`, `SIA_ARCHITECTURE.md`, `BUSINESS_GRAPH.md` in `docs/architecture`.

## Important Decisions

Preserve existing architecture and identity/permission/audit models. Generalize existing SiaApproval. Keep published workflows and approval policies immutable. Resolve real resource scope server-side; polymorphic IDs/project context are service-bound while core relations use database foreign keys. Keep independent human decisions separate from business execution. Use compare-and-set, uniqueness and fingerprints inside local transactions, not a distributed workflow platform. Recurrence is finite and UTC-anchored; processing is explicitly bounded with current owner/processor authority. Channel preferences do not imply provider delivery. Every SIA boundary reports execution disabled; a future executor/outbox must add its own authorization, idempotency and verification without bypassing these gates.

## Reproduction

```powershell
npm.cmd run prisma:generate
npm.cmd run prisma:validate
npx.cmd prisma migrate deploy
npm.cmd test -- --no-file-parallelism
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --omit=dev --registry=https://registry.npmjs.org
# Run against the local dev server; temporary fixtures are opt-in and cleaned.
$env:MAXPASE_SMOKE_FIXTURE='true'
npx.cmd tsx scripts/http-smoke.ts
```

Stop the owned development server before Prisma generation on Windows to avoid its native engine DLL lock. Do not reset the existing database. Use `DATABASE_URL=file:./phase05-clean.db` for the separately initialized fresh validation database.
