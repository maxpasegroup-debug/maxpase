# Dependency Security Review

Review date: 2026-10-04. This is build-phase dependency review, not an independent security audit or certification.

## Audit Boundary

Current `npm audit --json` in the sandbox failed to reach the npm security endpoint. Escalation was rejected by auto-review because it would transmit private project dependency metadata to registry.npmjs.org. Explicit approval was requested; none was received during this run. That rejection was not bypassed. A fresh production/full registry audit is BLOCKED, and a zero-current-runtime-vulnerabilities claim cannot be made. Phase 08's zero production and seven development findings are historical evidence only.

Public maintainer/advisory documentation was read for the two previously identified advisories, without uploading a dependency tree. Package download/install is inbound public registry content; install used --no-audit and --ignore-scripts and did not submit the rejected audit report. The lockfile and direct dependency graph were reviewed locally.

## Known Finding Classification

| Finding / affected chain | Classification | Application exposure and action |
| --- | --- | --- |
| GHSA-82fw-gwwq-j7x9: vitest and @vitest/mocker (two historical moderate package findings) | resolved | Installed 3.2.7 lay in the affected range. Upgraded the development test runner to pinned 4.1.11, a maintainer-documented patched version. No browser/mock dev server is exposed; test API is explicitly disabled. Clean lockfile install, regression/type/lint/build verification performed. This resolves the specific known advisory, not every unknown advisory. |
| GHSA-vfj7-8cjw-p6xm: braces -> micromatch -> fast-glob -> @next/eslint-plugin-next -> eslint-config-next (five historical high package findings) | accepted development-only risk | Lockfile retains development-only braces 3.0.3 and its lint chain. No published patched version in the reviewed advisory. The application does not accept runtime user glob expressions or run this linter as a web service. Trusted committed lint patterns and isolated CI are the exposure controls. Untrusted source/configuration still requires restricted runners and no production secrets. This is documented, not suppressed; release-owner acceptance remains required. |
| Fresh complete production/full inventory and newly disclosed advisories | blocked | Registry metadata approval/audit results unavailable. No inferred clean report, fabricated current count or audit-level downgrade. Production launch is blocked until a fresh audit proves no unresolved high/critical runtime finding or records explicit evidence-backed exceptions. |
| Public Vitest mock server exploit route in the current Node-only test command | not applicable | The application does not start a public mocker/WebSocket/browser testing server; this does not dismiss the package vulnerability or authorize vulnerable tooling exposure. |

Evidence: [Vitest maintainer advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9), [patched release](https://github.com/vitest-dev/vitest/releases/tag/v4.1.11), [Vitest 4 migration prerequisites](https://v4.vitest.dev/guide/migration), [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Risk/exposure assessments above are inferences from the local dependency graph, Node-only test command and runtime code, not a provider or penetration-test result.

## Compatibility And Reproducibility

Preserved Next 15.5.27 and Prisma 6.16.2; no framework/database redesign. The initial npm 10.9.2 install crashed in optional-peer resolution. Retrying the Vitest update with --legacy-peer-deps completed, then a normal `npm ci --ignore-scripts --no-audit` without the legacy option succeeded. Prisma client generation is an explicit reviewed post-install step. vitest.config moved to .mts to declare its existing ESM syntax without changing the entire application package's module mode or suppressing the Vite warning. The resulting runner is tested, not assumed compatible from a version range.

## Release Gates

Wave 03 performed offline local-only package/lock/installed-tree review without npm audit or metadata submission. See `docs/audit/DEPENDENCY_ACCEPTANCE_WAVE_03.md` for exact installed direct versions, known historical advisory classification and two extraneous optional/transitive installed-tree findings. Existing documented development exceptions still require actual release-owner acceptance. Current external dependency inventory: **NOT VERIFIED**. No dependency versions/lockfile changed in this wave; no zero-vulnerabilities or clean-artifact claim is made.

After explicit metadata approval, run `npm audit --omit=dev --audit-level=high` and `npm audit --json`, retain the actual reports and evaluate every finding against current runtime reachability. Do not use npm audit fix --force or downgrade Next lint compatibility merely to remove a reported count. CI retains the full report and classifies only the exact documented development chain; unknown findings, failed reports or runtime nodes fail closed. Security exceptions are reviewable evidence, not an audit suppression flag. Remote workflow execution is NOT RUN in this workspace.
