# Nice Jobs Phase 07 Validation

Date: 2026-10-08. Scope: SOP, resources and internal workforce communication only.
Architecture: [Phase 07 model](../architecture/NICE_JOBS_SOP_RESOURCES_COMMUNICATION_ARCHITECTURE.md).

## Validation Evidence

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Focused tests | PASS | 22 tests in `tests/nicejobs-knowledge.test.ts` |
| Full regression | PASS | Final frozen-source rerun: 449 tests across 31 files, 1,035.96 seconds; includes accepted Phase 01-06 regressions |
| Lint | PASS | `npm.cmd run lint` |
| TypeScript | PASS | `npm.cmd run typecheck`; generated preview metadata restored |
| Production build | PASS | `npm.cmd run build`, Next 15.5.27; local build, not deployment |
| Prisma | PASS | Schema validation and client generation, Prisma 6.16.2 |
| Local migrations | PASS | 20 migrations; `prisma migrate status` reports up to date; final local database-to-schema diff reports no difference |
| Fresh/repeat/drift/restore | PASS | `npm.cmd run validate:migrations` |
| Populated Phase 06 upgrade | PASS | `npx.cmd tsx scripts/validate-nicejobs-knowledge-upgrade.ts`; preservation fixtures, integrity/FK checks, repeat application, schema drift and snapshot restore/re-upgrade |
| Existing local data | PASS | All original-column row signatures for 95 pre-Phase-07 tables unchanged; SQLite integrity `ok`, no FK violations; zero live knowledge roots |
| Browser workflows | PASS | `scripts/nicejobs-knowledge-browser-smoke.ts`, isolated database; Chrome 154.0.8037.98, 44 captures at widths 320/390/768/1440, zero page errors or page overflow |
| Visual inspection | MANUAL VALIDATION | SOP detail at 320px, resource detail at 390px and manager messages at 1440px inspected; long titles, related exact-version links and controls readable |
| Local HTTP | PASS | Preview root, `/api/health`, `/api/ready`: 200; anonymous corporate content and Jobs worker routes: 307 to their respective login routes |
| Large content fixture | PASS | 1,001 resources, one activated worker; 35 queries for 25-row and 100-row requests; measured combined local list/next-page execution 55ms |
| Production | NOT DEPLOYED | No domain, TLS, monitoring, backup or production session claim |

Browser machine-readable evidence: [NICE_JOBS_PHASE_07_BROWSER.json](NICE_JOBS_PHASE_07_BROWSER.json).
Browser fixtures activate workers through canonical recruitment/orientation/OJT/readiness, then exercise resource create/edit/review/publish/version history, structured SOP publication, SOP-change communication, worker navigation/read/acknowledgement, grounded read-only SIA and corporate/Jobs session isolation. Temporary content is not official operating policy. Test databases and random session secrets are isolated and cleaned. Windows SQLite cleanup initially encountered a transient file lock after successful browser assertions; the harness now uses bounded cleanup retries, and the final run exited successfully.

## Security And Integrity Coverage

The 22 focused tests cover forged actor/scope/target input; company/division and individual/pinned-job-version isolation; scoped company and manager-group audiences; source capability revocation; expired/scheduled/archived content; publication/review separation including same-Person aliases; review-authority revocation; stale revisions; duplicate/replay authorization; unauthorized private references and unsafe URLs; exact version acknowledgement; private read/archive receipts and GET-no-write; canonical internal templates without provider messages; task/lead/follow-up source ownership; explicit recipient and notification preference checks; invalid-recipient batch rollback; publication/audit rollback; human/agent source intersection; denied assistant writes and bounded resource queries.

No role-name permission shortcut, automatic worker grant, activation bypass, inferred SOP acknowledgement or autonomous SIA mutation was introduced. Every content mutation reuses authenticated actors, canonical authorization, audit and operational events. Publication, template creation, receipts and explicit notification batches are transactional. Scheduled content requires an explicit authorized publication action; expiry is a read-time availability projection, not a worker loop.

## Files And Modules

34 files added or changed relative to the accepted pre-Phase-07 working-tree snapshot. Local preview: `http://127.0.0.1:3004/app/nicejobs?view=content-management&kind=SOP`. Worker SOP: `http://127.0.0.1:3004/sites/jobs/gateway?view=worker-sops`. Existing sign-in and authorized configuration are required; no live worker was created for the preview.

- New services: `src/server/nicejobs/knowledge-input.ts`, `knowledge-access.ts`, `knowledge.ts`.
- New UI: `src/app/app/nicejobs/knowledge-form.tsx`, `knowledge-workspace.tsx`.
- Additive schema and migration: `prisma/schema.prisma`, `prisma/migrations/20261008160000_nicejobs_knowledge_communication/migration.sql`.
- Existing integration points: employee service/forms/workspace, lead forms/workspace, Nice Jobs page/actions, Jobs gateway, scoped global styles, worker SIA context, capability registry, operational resource input/scope and release readiness registry.
- Tests/tools: `tests/nicejobs-knowledge.test.ts`, `scripts/validate-nicejobs-knowledge-upgrade.ts`, `scripts/nicejobs-knowledge-browser-smoke.ts`.
- Documentation: the new Phase 07 architecture, this report and browser JSON; cross-references appended to Architecture, Domain Model, Database Model, Authorization Model, Security Model, SIA Architecture and Business Graph.

Accepted prior-phase working-tree changes were retained. No commit, push, deployment or Phase 08 implementation was performed. Preview-generated Next.js type metadata was restored rather than treated as a product change.

## Architectural Decisions

Five additive models provide stable content identity, version metadata, ordered SOP steps, exact-version receipts and explicit work links. Existing company/division/job/assignment/work models remain canonical. Published internal communication body/subject reuse immutable `CommunicationTemplate`; optional delivery reuses `Notification` and its preferences/recipient resolver. External `CommunicationMessage`/Thread/provider contracts are unchanged. Private resources reuse the existing fail-closed attachment-resolver boundary rather than introducing storage. Worker SIA extends the existing bounded read tool with separately gated sources, not new execution authority.

## Known Limitations And Required Configuration

1. No real SOP, policy, resource, announcement, worker or capability grant was seeded. Operators must author content and provision the registered capabilities using existing authorized administration. Older seeded databases do not gain new permission rows or grants automatically. Management review/publication and worker source/acknowledgement access must be configured explicitly.
2. Private storage/upload/download/media delivery is NOT CONFIGURED by default. Opaque references require a working authorized `PrivateAttachmentResolver`; plain text and approved HTTPS links are usable. No PDF/image/video renderer, file import or provider was added.
3. Internal messages only. Email, WhatsApp, SMS, Meta and other external providers, automatic broadcasts and scheduled background publication are absent. A reviewed scheduled item waits for explicit authorized publication after its time; expiry is enforced on reads.
4. Published SOP/resource content is immutable. New versions do not migrate old acknowledgements or explicit work references. Communication correction requires a new communication. Review is mandatory and independently authorized; no invented company approval policy beyond that integrity boundary was seeded.
5. Acknowledgement is an explicit human attestation, not competence, certification, legal agreement, job activation or automatic completion. GET never marks read/acknowledged. Required acknowledgement must be configured; private inbox archive cannot bypass it.
6. All date entry is UTC; display uses the existing account timezone. Review date is advisory, not an invented compliance/expiry rule. Historical references still require current source/audience access and valid dates.
7. Literal title/summary substring search only; no full-text, semantic search, document parsing or complete historical change-diff engine. Stable-ID cursor pagination is used. Library pages default to 25 and cap at 100; SOP steps cap at 30; receipt pages and work/reverse SOP references cap at 25; configuration pickers cap at 50; explicit notification batches cap at 25 assignments with bounded canonical account resolution. Larger catalogues require narrower scope; no universal picker pagination was introduced.
8. SIA uses five current versions per source kind and five steps per SOP. Its bounded deterministic answers are not a complete policy catalogue. Current human AND agent source permissions are required. Management content, private handles and unrelated workforce data are excluded. No model provider, embeddings, publishing, acknowledgement or autonomous manager is enabled.
9. The scale fixture measures one local SQLite worker with 1,001 resources. The 35-query/55ms observation is not a production latency percentile, concurrent load result, database cost guarantee or 100,000-worker capacity certification. Production performance is NOT VERIFIED.
10. Browser evidence is local Chrome with simulated viewport widths, not physical mobile devices or cross-browser certification. A basic focus check ran; complete keyboard workflows, screen readers, WCAG conformance and representative manager usability sessions are NOT RUN. Creation/edit/publication workflows were exercised on desktop; every mobile editing combination was not tested.
11. Local SQLite backup/restore, fresh and populated migrations were verified. Production backup restoration, rollback, monitoring, domain routing, TLS, authentication across all five deployed domains and release verification are NOT RUN. Local readiness is not production readiness.
12. Navigation is permission-enforced server-side; visible links never grant authority. Management content and receipt identities require independently scoped permissions. Company-wide content requires company source grants; title or manager relationship alone is not a grant.
13. Phase 08+ remains untouched: performance/PIP, incentive/wallet/salary/settlement/payout/payroll/finance, termination automation, external messaging and autonomous management are deferred. Existing report/task/lead systems were reused, not replaced.

## Recommended Next Phase

PHASE 08 - PERFORMANCE + REPORTS + PIP. Not implemented in this run.
