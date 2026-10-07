# Nice Jobs Phase 02 Validation

Date: 2026-10-07. Scope: candidate application and initial screening foundation only. Production is NOT DEPLOYED; local completion is not production readiness.

## Final Results

| Gate | Result | Evidence |
| --- | --- | --- |
| Architecture / application engine | PASS | Existing identity, graph, publication, authorization, audit and notification services reused; version-bound application separated from assignment |
| Application ID / duplicate protection | PASS | Database sequence and unique submitted IDs/active keys; concurrent submit accepts one transition and consumes one number |
| Job/version integrity | PASS | Current public published availability; exact version/area FK; historical submitted version retained; audited never-published audience setting |
| Candidate identity / lifecycle | PASS | Active existing Person/User; own access; draft/save/review/submit; controlled withdrawal; stops at shortlist |
| Eligibility / screening engine | PASS | Typed strict rules, weighted score, configured pass mark, recorded human-review resolution; known non-reviewable failures cannot be bypassed by another review flag |
| Current JOB-001 / JOB-002 criteria | NOT CONFIGURED | Accepted jobs remain internal drafts with null criteria; tests demonstrate intentional public publication/submission without invented rules |
| Shortlist / reject / withdraw | PASS | Separate capabilities, state and version checks, private reason/visible message separation, replay denial |
| Candidate / management UI | PASS | Own cards/detail, review before submit, scoped bounded pipeline, configuration editor, permission-aware application navigation and management evidence/history |
| Authorization / security | PASS | Cross-candidate/company/division denial, forged fields/results/scope/recipient denial, reserved lifecycle events, realm replay checks and audit rollback |
| Audit / notifications | PASS | Transactional existing audit/events; revisioned private evidence; canonical owned-application notification adapter and in-app preferences |
| SIA boundary | PASS | No new recruitment SIA tool, autonomous shortlist/rejection or employment authority |
| Scalability | PASS / NOT VERIFIED | Indexed bounded keysets; 5,000-record local fixture; production capacity/SLOs and large write contention NOT VERIFIED |
| Focused Phase 02 tests | PASS | 22/22, `npm test -- tests/nicejobs-applications.test.ts` |
| Complete regression | PASS | 332/332 tests, 26/26 files, `npm test`; final frozen-source run 124.71 seconds |
| Phase 01 preservation | PASS | Existing 19 tests retained; the upgrade test names the Phase 01 migration boundary instead of assuming it is the last migration; no assertions removed |
| Lint | PASS | `npm run lint`, exit 0; final production build also performs lint |
| TypeScript | PASS | `npm run typecheck`, exit 0; production build checks types |
| Production build | PASS | `npm run build`, exit 0; 21 static pages generated; dynamic application/gateway routes preserved |
| Prisma validation / generation | PASS | `npm run prisma:validate` and `npx prisma generate`; Windows engine lock released by stopping the owned preview before generation |
| Fresh / repeat migrations | PASS | `npm run validate:migrations`; all 15 migrations; repeated deploy succeeds |
| Migration drift / integrity / restore | PASS | Schema diff exit 0; integrity/FKs; isolated snapshot/restore; local populated pre-Phase02 snapshot restored/upgraded twice with no drift |
| Populated local upgrade | PASS | Users=2, Persons=2, Memberships=2, Roles=62, Permissions=116, Organizations=10, Products=4, Templates=2, Versions=2, VersionAreas=3, Profiles=0, Assignments=0 preserved |
| Browser / HTTP workflow | RUN / PASS | Chrome 154.0.8037.98; isolated development database/session fixtures; anonymous/realm replay denial, real candidate review/submission, human management decisions, draft configuration editor |
| Responsive captures | RUN / PASS | 16 captures at 320/390/768/1440px; no page overflow or page errors; mobile candidate/management screenshots visually inspected |
| Physical devices / screen reader | NOT RUN | No physical-device, screen-reader or broad browser acceptance claimed |
| Production / live domains / TLS | NOT DEPLOYED / NOT RUN | No production service, migration, provider, certificate or domain state changed or accepted |
| External providers | NOT CONFIGURED | Existing internal in-app notifications only; no live email/WhatsApp/SMS integration |
| Phase 03+ | PASS | Interviews, offers, employment activation and all downstream engines remain untouched |

Browser details are recorded in `NICE_JOBS_PHASE_02_BROWSER.json`. Browser fixtures use sessions created by the existing authentication service; this is not a live credential/domain login acceptance test. Screenshots contain only isolated fixture data and remain ignored development artifacts. A local preview on port 3004 uses the existing development database and accounts, not the browser fixture.

## Database And Commands

Additive migration: `prisma/migrations/20261007120000_nicejobs_applications/migration.sql`.

SHA256: `b77d3456665a6e36f0e4e015312f6d05a125dc5cf98a7418fbaad12758f55cd6`.

Three new tables: NiceJobsApplication, NiceJobsApplicationSequence, NiceJobsApplicationHistory. Existing table records are not rewritten. The local `prisma/dev.db` was snapshotted using `npm run backup:sqlite` to ignored private `prisma/pre-nicejobs-phase02-20261007.db`, then upgraded with `prisma migrate deploy`. Migration status reports up to date. The snapshot is not committed; secure retention is an operator responsibility.

`scripts/validate-nicejobs-application-upgrade.ts` compares identity/job signatures, restores the local pre-Phase02 snapshot into a disposable directory, applies/repeats migration deployment and checks drift/FKs. It intentionally requires that local snapshot and an unchanged local dataset; it is a development verification artifact, not a production backup tool or a benchmark.

## Findings Fixed During Validation

- The Phase 01 restore test assumed its migration was last; it now keeps the same pre-Phase01 absence/identity/restore checks using the named boundary.
- A Review button becoming Submit in the same click could cause premature submission. Distinct keyed buttons and prevented default behavior fix this; browser asserts review leaves DRAFT.
- Internal accepted drafts had no audience control. A scoped, reasoned, revision-checked pre-publication setting now permits intentional public publication without replacing the publication engine.
- Private notifications now resolve the real owned application rather than a generic organization; forged recipients/scope and unauthorized mark-read are tested.
- A non-reviewable failed criterion takes precedence over an unrelated review flag, preventing human-review routes from erasing deterministic ineligibility.

## Operator Gates And Limitations

- New capabilities are registered in the existing permission registry, not automatically granted to existing employees, candidates, Boss or SIA. Use reviewed existing role/provisioning workflows to adopt them. No production or local Boss reprovisioning/PIN reset was performed.
- Candidates require reviewed Career Hub self/organization access; portal managers also require existing gateway entry access as well as business-division application capabilities. Optional in-app delivery requires current notification access. No fake candidate account or division employment membership was created in the real development database.
- Both known jobs require an intentional public audience/publication decision. Save genuine criteria on an unpublished version before screening is usable. Published missing criteria remain NOT CONFIGURED, not a pass; historical applications cannot silently inherit later rules.
- Document references are not verified uploads. Evidence-dependent rules require human review; no storage/provider is added.
- Default result visibility excludes scores, rule comparisons, private notes and evaluators. Candidate messages must be explicitly entered.
- Notification preferences and access can suppress delivery. Authorized enabled delivery failure rolls back the application mutation.
- Large-volume tests validate bounded behavior, not production capacity or performance percentiles. Scoped substring search remains a future measured optimization boundary.
- Live deploy/migration, production backup/restore/rollback, live domain/TLS/session validation, physical devices, screen readers and manager usability acceptance remain separate operator gates.

## Phase 02 Files Changed

Exact Phase 02 scope: **35 files**. Accepted, previously uncommitted Phase 01 changes remain in the worktree and are not included as new Phase 02 files unless touched here. No commit or push was requested for this phase.

1. `.gitattributes`
2. `docs/architecture/ARCHITECTURE.md`
3. `docs/architecture/AUTHORIZATION_MODEL.md`
4. `docs/architecture/BUSINESS_GRAPH.md`
5. `docs/architecture/DATABASE_MODEL.md`
6. `docs/architecture/DOMAIN_MODEL.md`
7. `docs/architecture/SECURITY_MODEL.md`
8. `docs/architecture/SIA_ARCHITECTURE.md`
9. `docs/architecture/NICE_JOBS_APPLICATION_SCREENING_ARCHITECTURE.md`
10. `docs/audit/NICE_JOBS_PHASE_02_VALIDATION.md`
11. `docs/audit/NICE_JOBS_PHASE_02_BROWSER.json`
12. `prisma/schema.prisma`
13. `prisma/migrations/20261007120000_nicejobs_applications/migration.sql`
14. `scripts/nicejobs-applications-browser-smoke.ts`
15. `scripts/validate-nicejobs-application-upgrade.ts`
16. `src/app/globals.css`
17. `src/app/app/nicejobs/actions.ts`
18. `src/app/app/nicejobs/page.tsx`
19. `src/app/app/nicejobs/workspace.tsx`
20. `src/app/app/nicejobs/application-actions.ts`
21. `src/app/app/nicejobs/application-form.tsx`
22. `src/app/app/nicejobs/application-workspace.tsx`
23. `src/app/app/nicejobs/configuration-editor.tsx`
24. `src/app/sites/[site]/gateway/page.tsx`
25. `src/server/authorization/registry.ts`
26. `src/server/security/readiness.ts`
27. `src/server/domain/operations-input.ts`
28. `src/server/domain/operations-scope.ts`
29. `src/server/domain/operations-service.ts`
30. `src/server/nicejobs/input.ts`
31. `src/server/nicejobs/service.ts`
32. `src/server/nicejobs/application-configuration.ts`
33. `src/server/nicejobs/applications.ts`
34. `tests/nicejobs.test.ts`
35. `tests/nicejobs-applications.test.ts`

Final phase status: PASS - PHASE 02 COMPLETE. Phase 03 has not started. Production readiness is not claimed.
