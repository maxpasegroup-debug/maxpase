# Nice Jobs: revised single-role pilot readiness audit

Reviewed: 2026-10-16 (Asia/Calcutta). Scope: documentation and source audit plus isolated tests. **Academic Advisor - Junior is BLOCKED for real publication and pilot.** Business approvals and live provider state were not independently verified. No production data, listing, offer, account, payment or deployment was changed.

This audit supplements the [pilot approval register](NICE_JOBS_PILOT_APPROVAL_REGISTER.md); that register remains the decision/evidence source. The existing [candidate journey](../architecture/NICE_JOBS_CANDIDATE_JOURNEY_PHASE_4.md) remains authoritative. One pilot role does not change the draft-only status of the other two jobs.

## Executive findings

| Finding and source | Current status / impact | Required action |
| --- | --- | --- |
| Three role definitions exist in [initial-opportunities.ts](../../src/server/nicejobs/initial-opportunities.ts), but the [approval register](NICE_JOBS_PILOT_APPROVAL_REGISTER.md) records no complete real-role approval. | **BLOCKED**: a source definition or database draft is not publication authority; live database contents were not inspected. | Select `JOB-001` as the first pilot only; keep all three unpublished until each passes its own gates. |
| [Opportunity publication validation](../../src/server/nicejobs/opportunity-configuration.ts) and the [job/programme checklist](../architecture/NICE_JOBS_JOB_PROGRAMME_SETUP_PHASE_1.md) require employer evidence, engagement/compensation disclosure, location, manager and reviewers. | **IMPLEMENTED LOCALLY; BUSINESS BLOCKED**: the supplied employer label is not independent registry or legal review. | Verify legal employing entity and approve the exact role/version and written terms. |
| [Application states](../../src/server/nicejobs/application-configuration.ts), [recruitment](../../src/server/nicejobs/recruitment.ts), [pre-offer](../../src/server/nicejobs/pre-offer.ts), [offer](../../src/server/nicejobs/offer-document.ts) and [enrollment](../../src/server/nicejobs/onboarding.ts) are separate guarded records/commands. | **IMPLEMENTED LOCALLY; PILOT BLOCKED**: no real manager, reviewer, terms, video, policies or candidate are approved. | Configure reviewed evidence and rehearse the exact published version with authorized accounts before a real candidate. |
| [100-day builder](../architecture/NICE_JOBS_100_DAY_CURRICULUM_PHASE_3.md), [daily training](../../src/server/nicejobs/training-day.ts), review and [activation](../../src/server/nicejobs/employee.ts) exist. | **IMPLEMENTED LOCALLY; CONTENT BLOCKED**: an empty duration is not a reviewed 100-day programme. Readiness does not itself activate work. | Supply and review every role-specific day, stage, evidence rubric, timezone, pause rule and independent readiness/activation owner. |
| [Goal plan](../architecture/NICE_JOBS_GOALS_EARNINGS_PHASE_4.md) is a 30-day quantity/activity plan for an active assignment; no mandatory INR 50,000 minimum or CIA authority was found in the inspected code. | **NO CODE REMOVAL NEEDED**: the proposed minimum is rejected. Pre-activation optional learning goals and any approved-rate earnings planner are not this existing workflow. | Keep goal setting optional. Add a separately scoped learning/activity goal only if approved; never infer a money forecast from unapproved rates. Candidate-facing CIA, if used, is a presentation of governed SIA only. |
| [Incentive versions and wallet](../../src/server/nicejobs/finance.ts) retain effective dates, review/publication, source-backed calculations, adjustments, settlement and audit. [Financial architecture](../architecture/NICE_JOBS_INCENTIVE_WALLET_SETTLEMENT_ARCHITECTURE.md) distinguishes internal intent from transfer confirmation. | **IMPLEMENTED LOCALLY; FINANCIAL LAUNCH BLOCKED**: no real Junior Advisor rate, source measure, payment schedule or provider transfer is approved/verified. | Approve a versioned policy before use; verify source evidence and reconcile any actual external payment separately. Do not recalculate prior earnings under a new rate. |
| [Nice Jobs email authentication](../architecture/NICE_JOBS_EMAIL_AUTHENTICATION.md) has gated Resend OTP flows. [Offer sharing](../architecture/NICE_JOBS_PRE_OFFER_PHASE_2.md) is candidate-controlled download/unsent email draft, not provider delivery. | **AUTH IMPLEMENTED LOCALLY; LIVE SENDER NOT VERIFIED. OFFER EMAIL DELIVERY NOT IMPLEMENTED.** Local process and `.env` have no nonempty `NICEJOBS_EMAIL_AUTH_ENABLED`, `NICEJOBS_AUTH_FROM`, `NICEJOBS_OTP_SECRET` or `RESEND_API_KEY` entry; values were not printed. Railway/production configuration was not accessed. | Verify provider domain/configuration and delivery evidence separately. If automatic offer email is required, add a consented, audited sender with explicit failed/accepted/delivered distinctions; do not treat an `.eml` draft as sent. |
| [Phase 5 Command Center](../architecture/NICE_JOBS_HYBRID_CONTROL_PHASE_5.md) already groups Opportunities, Applicants, Workforce, Earnings and System with scoped permissions and SIA drafts. | **REUSABLE; REAL OPERATOR AUTHORITY BLOCKED**. No second dashboard is warranted. | Nominate verified manager, publication reviewer, interview/offer reviewer, independent readiness reviewer and financial approver using existing roles and control points. |

## Role approval snapshot

| Role | Verified facts | Blocking decisions |
| --- | --- | --- |
| Academic Advisor - Junior / `JOB-001` | Owner-supplied AIRA Skill City Private Limited employer label; intended Startup School and Skill Studio areas; performance-based/no fixed salary *intent*. Draft definition only. | Legal/employer evidence and canonical area mapping; lawful engagement classification; approved compensation, incentive rules, verification/payment timing; location/arrangement; named manager, reviewers and independent approver; role-specific orientation, policies, complete 100-day curriculum; consenting candidate accounts. **BLOCKED.** |
| Business Automation Manager / `JOB-BAM` | Owner-supplied AIRA Skill City employer label and AIRA Labs brand/division; draft definition. | Registry/brand evidence, engagement/compensation/targets/payment terms, named manager/reviewers, content, programme and participants. **BLOCKED; not in first pilot.** |
| Defence Career Mentor / `JOB-DCM` | “Nidus Academy” is an unverified label; draft definition. | Exact legal employer, recruitment authority and relationship to AIRA, plus all engagement/compensation, manager/reviewer, content and participant approvals. External-employer recruitment is not established by a brand label. **BLOCKED; not in first pilot.** |

These are documentary/source findings, not a read of the current deployed database or provider accounts. The [pilot register](NICE_JOBS_PILOT_APPROVAL_REGISTER.md) identifies proposed accountable functions but **no confirmed person, account or approval ID** for these decisions.

## Candidate and work state map

| Candidate-facing concept | Existing state/evidence | Boundary |
| --- | --- | --- |
| Saved/bookmarked | No separate bookmark state found in inspected Nice Jobs source. Application `DRAFT` is a candidate-owned draft against a published version. | A bookmark is optional future UX; neither it nor a draft grants work access. Do not call a draft an activated opportunity. |
| Applied / under review | Application `SUBMITTED`, `ELIGIBILITY_REVIEW`, `SCREENING`, `SHORTLISTED`, `INTERVIEW`, `MANAGEMENT_REVIEW` with history. | Human screening, configured interview/evaluation and approval are server-enforced. |
| Approved / rejected | Application `APPROVED` or `REJECTED`; withdrawal/closure are separate. | Approval does not issue an offer or activate work. |
| Offer | Application `OFFER` and offer `DRAFT` -> `READY` -> `ISSUED`/`VIEWED` -> `ACCEPTED` or `DECLINED`/`EXPIRED`/`WITHDRAWN`. | Exact issuer, legal employer, policies, approval and candidate acceptance are recorded; issued is not accepted. |
| Training enrolled / onboarding | Application `OFFER_ACCEPTED`; explicit unique enrollment creates onboarding `NOT_STARTED` -> `ORIENTATION` -> `OJT` -> `READINESS_REVIEW` -> `READY`/`NOT_READY`/`CANCELLED`. | Accepted offer alone is not enrollment. Assessed pre-offer role orientation remains distinct from post-offer OJT; public preview may precede application. |
| Authorized work | Separately approved `NiceJobsAssignment` with `ACTIVE` status/lifecycle, activation timestamp, readiness proof, manager and valid membership. | Server-side activation is a distinct authorized human command, not a UI toggle or AI recommendation. Suspension and exit use assignment lifecycle controls. |
| Earnings and payment | Versioned eligible earning, wallet ledger, settlement and payout intention/confirmation records. | Estimated, calculated, approved/available, reserved and externally confirmed paid amounts must never be collapsed into one “earnings” number. |

Each application/offer/training/assignment remains bound to its own published job version, employer, approved terms and programme. Multiple selected opportunities must not share an offer or activate one another. Cross-employer parallel work remains a separate policy decision; do not infer it from multiple application records.

## Academic Advisor - Junior pilot checklist

All items below are **BLOCKED pending human evidence**, even where the corresponding software control exists. Owner titles are decision functions to nominate, not confirmed appointments.

| Gate | Accountable decision/evidence required |
| --- | --- |
| 1. Employer and role | Employer representative/legal reviewer verifies AIRA legal identity, authorized recruitment, exact Junior title and canonical Startup/Studio area mapping. |
| 2. Engagement and money | Legal/employer and independent financial approver sign off classification, no-fixed-salary intent or correction, versioned commission policy, qualifying source, reversals, effective date and payment schedule. |
| 3. Managers/reviewers | Director names verified manager, publication reviewer, application/interview/offer reviewers, OJT reviewer and independent readiness/activation approver; verify active accounts, memberships, scopes and separation. |
| 4. Public disclosure | Catalogue owner confirms duties, eligibility, location, arrangement, supervision, approved compensation and no guaranteed earnings; publisher reviews exact immutable version. |
| 5. Application | Recruitment owner approves form, eligibility, privacy/consent wording, human screening criteria and interview process. |
| 6. Pre-offer orientation | Role owner uploads/approves video, captions/transcript, scored comprehension and reviewer/version; formal assessed orientation follows screening approval. |
| 7. Offer and policies | Legal/employer and authorized manager approve versioned policies and offer terms, issuing entity, expiry, and independent approval route. |
| 8. Acceptance/email | Candidate acceptance and owned download are audited. Director decides whether candidate-controlled `.eml` is sufficient for pilot or separately approves verified server delivery; never claim a draft was delivered. |
| 9. Enrollment/resources | Training owner verifies accepted-offer programme fingerprint, explicit enrollment and access to only approved role files. |
| 10. Daily tasks | OJT owner and independent reviewer approve all 100 days/stages, practical outcomes, evidence rubrics, feedback, rework, unlocks, timezone and pause/reschedule rules. |
| 11. Work activation | Independent authorized human confirms readiness, valid manager/membership and employment/engagement prerequisites before activating assignment. |
| 12. Earnings/payment | Financial owner approves source verification, rate version, ledger reconciliation, adjustment route and external payment evidence; actual provider operation remains separately verified. |
| 13. Support and exit | Operations owner approves complaints, withdrawal, access revocation, earned-money visibility, suspension and exit handling. |
| 14. Pilot sign-off | Director authorizes consenting pilot accounts and records mobile/accessibility, role isolation, replay, rollback, offer, 100-day progression, finance, email/provider and operating-cost evidence before launch. |

## Smallest implementation sequence and tests

1. **Decision pack first:** complete gates 1-3, 6-7 and 10 on the existing Command Center. Do not write placeholder “approvals” into real records. Keep only `JOB-001` in first-pilot review; other definitions remain drafts.
2. **Configure and review one version:** enter approved terms, disclosure, pre-offer content, policies, 100-day programme, reviewers and current control points. Use existing Draft -> review -> Approved -> Published transitions only after independent sign-off.
3. **Close genuine capability gaps only if required for pilot:** optional beginner learning/activity goals need a separate non-financial flow; offer email needs a real audited provider only if candidate-controlled download/draft is insufficient. Bookmarking, a new CIA engine, new dashboards, referral coins and an earnings forecast are not first-pilot prerequisites.
4. **Isolated rehearsal then controlled pilot:** exercise one consented applicant with distinct manager/reviewer/approver accounts, followed by explicit launch approval. Never turn isolated fixture success into a real job approval.

Targeted read-only/source audit and disposable-database tests performed: `npm.cmd test -- tests/nicejobs-applications.test.ts tests/nicejobs-programme.test.ts tests/nicejobs-goal-plan.test.ts tests/nicejobs-finance.test.ts tests/nicejobs-email-auth.test.ts` -> **5 files, 81 tests passed**. Tests use temporary SQLite fixtures; no real listing or payment was touched. No deployed-domain, browser/device, external provider, registry, director identity, live database, actual message delivery, payout or 100-day human pilot validation was performed.

Next test plan: verify unauthorized/cross-company reads, application/offer/enrollment replay, concurrent activation, audit rollback, version-pinned policies and programme, review/rework/unlock and pause/resume, rate effective-date boundaries, historical earnings immutability, wallet reconciliation, provider failure and consent, then mobile/keyboard/screen-reader and restoration in isolated staging. Existing suites should be selected per change; do not alter production data to test.
