# Production Deployment

## Supported Target And Launch Gate

Current Prisma datasource is SQLite. Deploy one Node.js application against an absolute persistent local-volume database path, not ephemeral/serverless storage or multiple independent filesystem replicas. Node 22 is the validated local toolchain. PostgreSQL conversion, distributed workers and hosting-specific integration were not implemented. No Railway, Vercel, Hostinger or production infrastructure validation is claimed.

Release owner and deployment operator must review PHASE_10_VALIDATION.md and clear its launch blockers. A successful local build is not a launch approval. An independent full-system audit is a separate later activity, not part of this build phase.

## Environment Contract

Supply configuration through deployment-owned secret management, not committed files, browser variables or command-line literals that reach logs. Never paste secret values into tickets or reports.

| Variable | Requirement |
| --- | --- |
| NODE_ENV | `production` at runtime. |
| DATABASE_URL | Explicit absolute persistent SQLite path, e.g. `file:/persistent/maxpase.db`; reviewed volume ownership and permissions. Do not deploy dev.db. |
| AUTH_SECRET | Cryptographically generated secret with at least 32 characters. Production rejects missing/development/example values; operator must ensure entropy. Rotation invalidates signed cookies; deliberately revoke existing database sessions when responding to compromise. |
| AUTH_COOKIE_SECURE | Must be `true` in production; defaults true there and explicit false is rejected. TLS is required. |
| AUTH_COOKIE_NAME | Safe cookie token; default maxpase_session. Cookie is HttpOnly, SameSite=Lax, host-only, Path=/, seven-day expiry. |
| APP_ORIGIN | Exact canonical HTTPS origin, without path/query/credentials/trailing slash. Required in production. Origin validation never trusts client-forwarded host as authority. |
| SIA_PROVIDER | Existing `deterministic` only. No external model integration claim. |
| DEV_BOOTSTRAP_PASSWORD | Development-only optional new-account input; forbidden in production configuration. Production seed is prohibited. |
| NEXT_TELEMETRY_DISABLED | Set `1` for build/runtime when organizational policy disables framework telemetry. |
| MAXPASE_CREDENTIAL_BINDING_<integration-id> | Reviewed deployment-owned `<organization-id>:<environment-key>` binding; integration's env reference must match. Actual secret is stored under that key outside business records. |

Missing production configuration fails runtime authentication/readiness closed, not by exposing values. Build artifacts do not need runtime secrets. In development only, missing signing configuration receives an ephemeral random process key; cookies cannot survive restart without an explicit privately supplied key. .env.example is development configuration, not a production template to copy unchanged.

Live email, WhatsApp/TalkinLabs and private storage are NOT CONFIGURED. Do not populate fake endpoints/secrets or mark integration configuration as a measured health check. See COMMUNICATIONS_INTEGRATIONS.md.

## Deliberate Release Procedure

1. Record the reviewed release source/lockfile, operator and change approval. This local workspace has no Git remote; remote CI execution has not been validated.
2. On an approved build runner: `npm ci --ignore-scripts --no-audit`, then `npm run prisma:generate`, `npm run prisma:validate`, `npm run validate:migrations`, lint, typecheck, tests and build. Reviewed Prisma generation is explicit after disabled dependency lifecycle scripts.
3. Run approved production and full registry audits, classify all findings and retain reports. CI requires the NPM_AUDIT_APPROVED repository variable before metadata submission and rejects unknown findings. Documented development-only exceptions require release-owner acceptance. No high/critical runtime finding may pass unreviewed.
4. Provision the persistent volume, least-privileged service identity, canonical TLS proxy, exact APP_ORIGIN, secure cookie setting and privately supplied secrets. Do not expose Next development or Vitest servers publicly. Preserve Origin/Host correctly; discard forged forwarding headers at the trusted edge. No wildcard server-action allowedOrigins are configured.
5. Quiesce business mutations and bounded job/communication processors. Take and verify a consistent pre-migration snapshot following BACKUP_RESTORE.md. Preserve the prior release artifact and reviewed secret/configuration manifest separately.
6. Execute the explicit migration procedure in MIGRATION_RUNBOOK.md. Application startup never migrates an unknown database.
7. Start `npm run start` under the deployment service manager. Configure resource/process limits, private database permissions, TLS/redirect/HSTS at the proxy and external request limits. Next sets nosniff, frame denial, no-referrer, restricted browser permissions and baseline CSP form/base/object/frame directives. This is not a nonce-based script CSP or complete XSS/DDoS solution.
8. Check `/api/health` (liveness only) and `/api/ready` (secure runtime config, complete release migration ledger/checksums and Session/ScheduledJob schema probes). Readiness503 contains only status and a correlation ID, no secrets/SQL/stack; both endpoints are no-store. It does not validate providers, backups, disk capacity, full schema drift or all domain invariants. Limit health polling at the edge and configure body/read timeouts; missing email/WhatsApp/TalkinLabs is not a false health failure.
9. Perform scoped login/logout, stale-session, multi-company, executive, SIA, approval, communication and browser/device acceptance checks with approved real identities. Never seed the development bootstrap into production. Remove development identities/data through a separately reviewed migration/provisioning process; do not blindly delete business records.
10. Enable traffic only after the release owner clears the checklist. Keep provider/tool activation explicit, human-approved and scope-limited. Schedule only finite authorized service calls, not unrestricted service-user impersonation.

## CI And Privacy

.github/workflows/ci.yml provides install, generation, schema, fresh/repeat migration/restore, lint, types, regression, build and dependency gates. Workflow is not a remote CI PASS until actually executed. npm audit transmits dependency metadata to npm, not source/secrets; obtain the required organizational approval. Full findings are retained rather than hidden. No automatic deployment or production migration job exists. Review/pin external action revisions according to the receiving organization's supply-chain policy before enabling remote CI.

Use no-store/private authenticated responses; exclude /app, session cookies, webhook bodies, personal details and secrets from proxy caches, request-body logs and telemetry. No service worker/PWA cache exists: authenticated offline caching is NOT APPLICABLE.

## Capacity And Protection Limits

Login uses database-backed account budgets (8 attempts/15-minute fixed window) and global 120/minute. Authenticated guards use 300/minute per user; a page may consume more than one guard budget. SIA UI actions additionally use 20/minute per user. Public webhook bodies have a 600/minute shared budget plus integration-specific controls. Sending and automation retain Phase 09 durable scoped rate buckets. These share only the same SQLite file; they are not distributed protection across replicas. Fixed-window boundaries permit adjacent-window bursts; attackers can consume a global budget and deny availability. Trusted edge IP/network quotas, body/time limits and monitoring remain mandatory deployment controls. No OTP, public file download or password-reset endpoint exists.

Operational data can still grow beyond display limits, especially executive aggregation and communication source authorization. Static query review and local regression/benchmarks do not establish enterprise capacity. Measure representative portfolios and source-filtered query plans before scale; do not add cross-request authorization caches that retain revoked visibility.

## Wave 03 Release Evidence Gate

Launch remains **NOT PRODUCTION READY**. Follow `docs/audit/PRODUCTION_SLO_READINESS.md` for proposed metrics/alerts and production acceptance, and `docs/audit/BROWSER_E2E_ACCEPTANCE_CHECKLIST.md` for the actual proxy/browser/security matrix. All deployed checklist items are NOT RUN until signed with evidence. Production monitoring is **NOT CONFIGURED**. Local fixtures do not certify the TLS edge, cookies behind that edge, missing-Origin/crafted action protocol behavior, real load, disk persistence or paging/alerts.

Wave03 offline installed-tree review found two extraneous optional/transitive package candidates (@img/sharp-wasm32 and @emnapi/runtime). Do not package this local node_modules directory as a production artifact. Build from approved clean lockfile installation and retain its inventory; current external advisory inventory and release-owner exception acceptance are NOT VERIFIED. No npm metadata was submitted by Wave03. See `docs/audit/DEPENDENCY_ACCEPTANCE_WAVE_03.md`.

Secret configuration/rotation: deployment/security owners generate high-entropy secrets outside commands/logs, validate exact canonical HTTPS APP_ORIGIN and persistent path, and record secret-manager version identifiers privately. Rotate AUTH_SECRET deliberately and revoke existing sessions after compromise; verify old cookies fail and new approved login succeeds. Provider credentials, if ever separately approved, require org-bound credential reference, disabled-first configuration, independent policy/consent/control review and a reviewed real adapter. This wave authorizes none: live email/WhatsApp/TalkinLabs and private delivery remain disabled/unconfigured.

Rollback: stop traffic/writers/processors, preserve incident DB and reviewed artifacts, restore verified pre-migration snapshot to a new private path, switch to matching prior artifact/configuration, check migration manifest/drift/integrity plus current login/scope/approval/audit, reconcile post-snapshot effects before processors or traffic. Do not edit ledger checksums, run destructive reset/down-DDL or replay uncertain communication queues. Production rollback and recovery timings remain NOT RUN.
