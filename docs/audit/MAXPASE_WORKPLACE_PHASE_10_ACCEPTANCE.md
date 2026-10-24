# MAXPASE workplace: Phase 10 acceptance record

Status: **LOCAL ACCEPTANCE PASS; REAL-ACCOUNT ACCEPTANCE OPEN**. Recorded 2026-10-24. This is an isolated service-level walkthrough, not a production or browser sign-off. The test creates a disposable SQLite database and synthetic accounts with explicit scoped roles. It does not inspect or change the default or production database.

## Four-account walkthrough

Evidence: `tests/maxpase-workplace-acceptance.test.ts` (1/1 passed).

| Journey | Local evidence | Status |
| --- | --- | --- |
| Boss / owner | Boss PIN sign-in yields the Boss account; selected AIRA company dashboard initially has no open task; after the handoff its open-task count is one and a TEARN task is excluded. | PASS, synthetic account |
| Scoped manager | Verified Skill City sign-in, active reporting links to two direct reports, approved focus recorded with reference, two separate Labs task assignments, team count of two and then one after reviewed completion. | PASS, synthetic account |
| Developer 1 | Verified Skill City sign-in; sees only assigned task before review duty; records contribution; cannot alter Developer 2's task or approve own review; contribution and actor are audited. | PASS, synthetic account |
| Developer 2 | Verified Skill City sign-in; initially sees only own task; after explicit independent code-review and testing duties, sees the review task and records two decisions. Revoking project membership removes workspace access and blocks a further contribution. | PASS, synthetic account |
| Integrity handoff | Manager completes Developer 1's task only after independent review and testing. Persisted status, Manager and Boss totals, and actor-specific operational events reconcile. | PASS, isolated data |

Additional focused evidence: `tests/boss.test.ts`, `tests/skillcity-staff-lifecycle.test.ts`, `tests/portals.test.ts`, `tests/skillcity-manager-desk.test.ts` and `tests/skillcity-developer-desk.test.ts`. Together with the walkthrough, `npx.cmd vitest run tests/maxpase-workplace-acceptance.test.ts tests/boss.test.ts tests/skillcity-staff-lifecycle.test.ts tests/portals.test.ts tests/skillcity-manager-desk.test.ts tests/skillcity-developer-desk.test.ts --maxWorkers=1` passed **42/42 tests in 6 files**. Staff lifecycle covers Boss-created drafts, inactive membership/reporting links, mocked invitation delivery, single-use activation, and Skill City login. The integrated walkthrough itself provisions synthetic, explicitly authorized accounts directly; it does not claim that real invitations were sent.

## Open acceptance items

| Item | Required evidence | Status |
| --- | --- | --- |
| Actual Boss, manager and two developer identities | Owner-confirmed accounts, employment/role decisions, independent scope approver, reporting and project assignments. | OPEN |
| Real staff invitation and email delivery | Verified sender/provider, consent where applicable, delivery receipt and activation evidence for each account. Mock transport is not live proof. | OPEN |
| Real project/reviewer authority | Approved Labs project, two named task assignees, independent reviewer/tester and decision records. MY SOLAR mapping remains unverified. | OPEN |
| Browser and device journey | Desktop/mobile walkthrough of Boss and Skill City screens, keyboard and accessibility review with the authorized users. | NOT TESTED |
| Deployed domains and resilience | `maxpase.com` and `airaskillcity.com` session isolation, access revocation, monitoring, backup/restore and rollback evidence. | NOT TESTED |

No products were published, real accounts provisioned, messages sent, tasks assigned in production, code deployed, or permissions widened. Local acceptance does not remove the owner-approval gate for a real pilot.
