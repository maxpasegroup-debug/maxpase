# MAXPASE Workforce Phase 6 Readiness

**Status: NOT READY FOR CONTROLLED REAL-USER TESTING.** The implementation is committed as code, but the mandatory test environment and acceptance flow are not available in this workspace. No production database mutation, real invitation, or production release was performed.

## Environment gate

- `.env` points `DATABASE_URL` at a Railway-internal PostgreSQL hostname (`postgres.railway.internal`). This workspace cannot use that as a disposable, backed-up test target, and migration validation rejected the target configuration.
- `RESEND_API_KEY` and `APP_ORIGIN` are absent. Test invitation delivery, canonical-origin checks, and activation-link completion could not be exercised.
- No designated test identity or browser session for Boss/Director/AO was supplied. No person, employment, membership, invite, or test brand was created.
- No migrations were applied. Backup/restore and recovery rehearsal were not possible without a disposable target.

## Verification results

- `npm.cmd run lint`: passed.
- `npm.cmd run prisma:validate`: passed.
- `npx.cmd tsc --noEmit`: passed during Phase 5 verification.
- `git diff --check`: passed; Git emitted line-ending normalization and user ignore-file access warnings.
- `npm.cmd test`: 73 test files passed and 57 failed; 324 tests passed and 23 failed. Several integration suites could not initialize because the required dedicated PostgreSQL test URL is absent. Other failures include missing module references in existing tests, hierarchy/registry assertions, HR onboarding loader failures, and Nice Jobs/Labs UI expectations. See the console run for the full Vitest failure list.
- `npm.cmd run validate:migrations`: failed at `target_configuration`; no migration was attempted.
- `npm.cmd run build`: failed after the local Node process reached its 4 GB heap limit. This does not establish whether the deployment build succeeds.

## Acceptance checks still required in the designated test environment

1. Create or identify a backed-up disposable PostgreSQL database and verify its host is not production. Run migration validation, migration deployment only against that disposable target, inventory reconciliation, and a backup/restore rehearsal with written recovery steps.
2. Provide approved test email delivery and a canonical HTTPS test origin. Verify sent invitation, expiry, single-use behavior, setup, resend/retry handling, revocation, and audit events using explicitly authorized test identities.
3. Exercise Boss company/brand management and one Director, AO, and specialist appointment for every brand in the reconciled inventory. Verify each account reaches its intended brand dashboard.
4. Attempt sibling-brand access through forged URLs, form data, and replayed tokens; verify denied access. Verify suspension/revocation take effect and Boss audit visibility is present.
5. Resolve the 23 failing assertions and module-loader failures, configure the test PostgreSQL suite, rerun the complete suite, and obtain a successful production build in an environment with sufficient memory.
6. Review the dashboard in supported desktop/mobile browsers with Director and AO sessions. Only then record **READY FOR CONTROLLED REAL-USER TESTING**.

## Safety and release boundary

The app is not declared ready for real-user onboarding or production deployment. Existing code-level changes are preserved for review. The next execution needs a designated disposable database, approved mail configuration, authorized test identities, and a build/test runner with sufficient memory. Production rollout remains a separately authorized action.
