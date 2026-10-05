# Wave 03 Dependency Acceptance

Date: 2026-10-04. Current external dependency inventory: **NOT VERIFIED**. Dependency acceptance: **FINDING**. No `npm audit`, registry advisory submission, metadata-upload approval bypass, package upgrade or lockfile change was performed.

## Local Inventory

Reviewed package.json, package-lock.json with JSON parser, direct installed package manifests, and `npm ls --all --offline --json`. All19 declared direct packages matched their locked installed versions. Lock inventory:489 non-root package-path entries,58 not marked dev and 431 marked dev (includes platform/optional/transitive paths, not 489 unique active runtime packages).

| Classification | Declared direct installed versions |
| --- | --- |
| Production | @prisma/client 6.16.2; bcryptjs 3.0.3; jose 6.2.12; lucide-react 1.49.0; next 15.5.27; react 19.3.0; react-dom 19.3.0; zod 4.6.5 |
| Development | @eslint/js 9.39.5; @types/node 24.19.1; @types/react 19.3.0; @types/react-dom 19.3.0; eslint 9.39.5; eslint-config-next 15.5.27; prisma 6.16.2; tsx 4.23.15; typescript 5.9.3; typescript-eslint 8.71.0; vitest 4.1.11 |
| Overrides preserved | deepmerge-ts 8.0.2; effect 3.20.1 (dev path); postcss 8.5.28 (production-reachable transitive path) |

Version ranges are not patched-status evidence. Runtime reachability of every unknown advisory cannot be inferred from a matching lockfile. The production/build toolchain and external advisory freshness both need acceptance.

## Finding Register

| Finding | Classification | Local evidence | Acceptance/action |
| --- | --- | --- | --- |
| Historical GHSA-82fw-gwwq-j7x9 Vitest/mocker | Development-only, direct + transitive; known upgrade already applied | vitest and @vitest/mocker 4.1.11; historical maintainer evidence in DEPENDENCY_SECURITY.md; Node-only runner/API disabled | Specific historical upgrade preserved, not a fresh advisory verification. No additional locally justified upgrade performed. |
| Historical GHSA-vfj7-8cjw-p6xm braces lint chain | Development-only, transitive; proposed accepted risk still requires owner sign-off | braces 3.0.3 -> micromatch 4.0.8 -> fast-glob 3.3.1 -> Next lint15.5.27; paths marked dev | Existing documented exception permits only exact development chain in review script. Trusted lint patterns and isolated secret-free runner required. Release-owner acceptance NOT VERIFIED; not certified accepted for launch. |
| Extraneous @img/sharp-wasm32@0.35.5 | Installed-tree finding, optional image-toolchain candidate; needs removal/reproducible-install review | Offline npm tree flags extraneous; not a declared direct package and no corresponding lock entry | Do not ship this local node_modules tree. Approved clean `npm ci --ignore-scripts --no-audit` on build runner, explicit generation and full checks; verify absence or intentionally reviewed lock path. Removal/reinstall NOT RUN in this wave. |
| Extraneous @emnapi/runtime@1.11.3 | Installed-tree finding, transitive/optional candidate; unable to certify runtime reachability | Offline tree flags extraneous; appears as child of extraneous sharp-wasm32; no lock entry | Same clean-install gate. No claim it is a vulnerability or runtime-safe without reviewed artifact inventory. |
| Newly disclosed production/transitive advisories | Potentially production-impacting, unable to verify | No fresh approved advisory dataset available locally | Current external inventory NOT VERIFIED; production launch gate remains. Do not claim zero vulnerabilities. |
| Newly disclosed development/transitive advisories | Development-only exposure still relevant to CI, unable to verify | Local tree only; historical inventory not current | Security/release owner reviews approved full inventory and runner exposure; unknown findings fail acceptance. |

No broad upgrade/removal was inferred from package age or version ranges. Public advisory links in the existing security document are historical evidence and were not refreshed here. No current external-source assertion is made.

## Release Evidence Required

Obtain explicit organizational approval before any npm audit metadata submission. On approved isolated runner: reproducible clean install, lockfile/direct/transitive artifact inventory, fresh production and full advisory reports, per-finding runtime/CI reachability, known patched-version compatibility tests, accountable signed exceptions with review/expiry dates. Preserve failures and unknown findings rather than suppressing/downgrading them. No remote CI execution, dependency exception sign-off or clean production artifact installation is claimed by Wave 03.
