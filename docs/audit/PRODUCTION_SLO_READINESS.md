# Production SLO Readiness

Date: 2026-10-04. Status: **PROPOSED / TO BE ACCEPTED IN PRODUCTION**.
Production SLO acceptance: **NOT VERIFIED**. Production monitoring: **NOT CONFIGURED**.
These are initial proposals for release-owner approval, not measured service guarantees.

## Measurement Boundary

The supported deployment remains one Node application with one persistent SQLite database and a trusted canonical HTTPS proxy. No distributed worker, hosted monitoring or production environment was accessed. Three serial local fixture samples are not a load test, percentile distribution or production SLO. The local artifacts retain actual elapsed time, Prisma query counts, engine duration and serialized bytes without SQL parameters or business text.

## Proposed Targets

| Surface | Proposed target | Measurement |
| --- | --- | --- |
| Application availability | 99.9% over a rolling 30 days | Authorized synthetic read plus edge/application outcome counters; maintenance included. This allows about 43.2 minutes of failure in 30 days, not an approved downtime allowance. |
| Login, authenticated task/project reads, request/approval mutations | p95 <= 2 seconds; p99 <= 5 seconds | Full trusted-edge request duration through committed response; success must include mandatory audit. |
| Executive dashboard and company switching | p95 <= 2 seconds; p99 <= 5 seconds | Representative authorized portfolios and source intersections, not an empty database. |
| Deterministic SIA context/conversation | p95 <= 3 seconds; p99 <= 8 seconds | Include authorization, executive/graph/memory reads, context validation and run audit. No external model is configured; future model latency needs a separate target. |
| Communication preparation, approval and mock/unconfigured processing | p95 <= 2 seconds for an individual command | Separate SIMULATED, PROVIDER_NOT_CONFIGURED and unknown/failed outcomes. A missing provider is not delivery success. Live-delivery latency is NOT VERIFIED. |
| Verified webhook HTTP acknowledgement | p95 <= 1 second for valid bounded mock-protocol receipts | HMAC verification, replay/budget checks and durable ingestion included. Never count a rejected payload as accepted. |
| Finite automation processing | p95 <= 3 seconds per 25-source scan | Report elapsed time, processed/skipped/status/cursor and committed audits. One scan is not whole-occurrence completion. |
| Automation backlog | Complete eligible N-source occurrence within ceil(N/25) minutes + 2 minutes, subject to approved scheduler cadence and current authority | Proposed one scan/minute respects 25 actions/org/minute. Shared rules compete for that budget; capacity and fairness need acceptance, not a guaranteed deadline. |
| Liveness/readiness | p95 <= 500 ms, read-only polling every 30 seconds | Liveness only proves the process; readiness requires secure runtime configuration, release ledger/checksums and required schema probes. |

Availability denominator: legitimate supported authorized requests. Expected authorization denials and malformed requests are counted separately, not application success. Legitimate rate-limit exhaustion, unexpected 5xx, timeouts and query-capacity refusals count as failed service for capacity acceptance. Preserve failure classes rather than improving figures by excluding slow/failed requests.

## Required Instrumentation

Deployment operator must provision approved structured-log collection, error/request counters and duration histograms. Use fixed route/tool/action identifiers, release ID, status/outcome, generated correlation ID and durations. Never log cookies, credentials, SQL parameters, request bodies, communication content, personal details or SIA context. Scope IDs and authorized audit references belong in restricted incident evidence, not public metric labels. No cross-request authorization cache is proposed.

Database indicators: query count/duration by reviewed operation; request DB time; SQLite lock/busy events; connection failures; transaction rollback/audit failures; disk free space; database/WAL growth; migration mismatch; backup age; integrity/FK verification results; restore-drill age. Millisecond-resolution local Prisma engine duration excludes JavaScript work and cannot substitute for edge latency. Production query logging requires a reviewed redaction/sampling policy.

Monitor authentication and authorization failures, application/database errors, slow requests, SIA tool/run failures and capacity refusals, automation job/run failures and lack of cursor progress, webhook rejects/replays/failures, communication FAILED/UNKNOWN/SENDING age, intentionally unconfigured provider attempts, and queue/backlog age. Provider state must be separately visible to operators without making deliberately disabled adapters fail process health.

## Proposed Alerts And Ownership

| Signal | Proposed trigger | Owner/action |
| --- | --- | --- |
| Ready unavailable / process down | Two consecutive failed 30-second probes | Deployment operator removes instance from traffic; follow incident runbook. |
| Errors / latency | >1% unexpected failures for 5 minutes or p95 target exceeded for 10 minutes, with minimum sample count 100 | On-call operator correlates release and restricted diagnostic IDs. Low-volume deployments require synthetic probes. |
| Authentication/authorization abuse | Sustained deviation from accepted baseline or legitimate budget exhaustion | Security owner validates edge limits; do not loosen capabilities. Baseline NOT VERIFIED. |
| Database unavailable, migration mismatch, mandatory audit failure | Immediate | Stop writes/traffic; preserve evidence and approved snapshot. |
| Disk capacity | Warning <20%, critical <10% free | Operator verifies growth and safe retention; never delete business/audit history blindly. |
| Job failure/no progress | FAILED job or due cursor unchanged for 5 minutes | Business owner plus operator; inspect authority, rule version and budget before retry. |
| Communication uncertainty | UNKNOWN immediately; SENDING older than reviewed adapter timeout | Human/provider reconciliation; no blind retry. Providers remain disabled. |
| Backup/restore evidence stale | Backup older than approved RPO; restore drill overdue | Data owner plus operator; proposed daily snapshot/monthly drill pending approval. |

Alert routing, paging destinations, owners, retention, dashboards and runbook links must be configured and tested in the real deployment. No alert has been dispatched by this wave.

## Acceptance Procedure

1. Approve targets, representative company/project/people/message/memory volumes and concurrent-user mix. Include project-only grants, many unrelated companies, long histories, nested requests, budget boundaries and revocation.
2. Instrument the actual TLS edge and application. Verify redaction, counters, clock alignment, failure classification and alert delivery before measuring.
3. Run authorized representative workloads with recorded release/configuration/volume and warm-up period. Capture request percentiles, error rates, query/lock/disk indicators and finite-scan completion/backlog, including failure injection in an approved isolated environment.
4. Run at least a sustained agreed peak window and retain 30-day availability evidence before calling a monthly target achieved. Include current source authorization and mandatory audit failures.
5. Release owner signs evidence or records a blocking finding. Production measurements, deployment, monitoring connection and SLO sign-off are **NOT RUN / NOT VERIFIED** here.
