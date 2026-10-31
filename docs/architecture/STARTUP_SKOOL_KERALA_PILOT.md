# Startup Skool Phase 5 — Kerala pilot register

**Current status: BLOCKED for a real intake.** This file records the pilot workflow and the evidence still needed. It does not assert that applicants, mentors, offers, payments, or an intake have been activated. The owner clarified that AIRA Startup Skool is currently a brand of AIRA Skill City Private Limited. The previous standalone-entity proposal is superseded for this pilot; tax and written issuer terms still need verification.

PBA means **Practical Business Administration**. The owner described AI, ALTT, practical business-building activities and mentoring as intended features. A six-month full programme with a proposed ₹1,20,000 fee and Starter/Pro/Extraordinary tier variants remains a planning baseline. No tier or terms version is approved for this real Kerala intake, and no price or tax is activated by the register.

## Product boundary prepared

- A verified applicant has a useful status space before approval: application received, human review, and the recorded decision each have a clear next action. `APPROVED` is explicitly **not** enrollment.
- The full founder workspace requires an active `BatchParticipant`, active batch/programme, and an independently approved batch plan. Community access follows the approved tier and active enrollment.
- Applicants and active founders can send a short, private pilot-experience note. An authorized `program.manage` reviewer sees the bounded division queue, acknowledges or resolves with a note visible to the author, and leaves `ExecutiveHistory` and `OperationalEvent` in the same transaction. The author cannot review their own note. Submission is limited to five notes per user per day. SIA guidance excludes note text.
- Pilot feedback categories distinguish signup, application, status, learning, evidence, and mentor feedback. These are self-reported friction notes, **not** measured conversion or usability outcomes. Nothing is automatically escalated or published.
- The authorised programme-team view at `/gateway?view=pilot` stores a batch-scoped draft register in the existing `ExecutiveRecord`/history/event foundation. It tracks intake code, selected tier, terms version/effective date/approval reference and authority, reviewer and mentor account IDs with authorization references, and up to 20 participant person IDs with consent timestamp and evidence reference. Only IDs and references are stored; signed documents remain outside this register. An independent `program.manage` reviewer can approve only after checking the documents, current account authority, approved applications, active PBA product and batch. The approval actor and timestamp come from record history.
- The canonical AIRA participant API rejects new or activated Startup Skool participation without an approved register, active PBA product, current authorized people, human-approved application and that participant's recorded consent evidence. The founder learning read and evidence-submit path recheck the same gate. Existing participant history is not deleted. This is an application/API boundary; direct privileged database writes remain subject to database administration controls.

## One Kerala intake: decision and evidence gate

| Requirement | Current evidence | Status | Owner action |
| --- | --- | --- | --- |
| Exact legal operator and brand relationship | Owner clarified AIRA Startup Skool is a brand of AIRA Skill City Private Limited; issuer documents and tax configuration remain unverified | PENDING VERIFICATION | Record approved public/contract issuer wording and verified tax details. |
| Approved PBA tier, terms, intake dates, Kerala delivery arrangement, tax and refund policy | Owner-stated six-month programme and three-tier proposals only; no verified final offer version | BLOCKED | Programme, legal and finance owners approve written version and intake capacity. |
| Admissions reviewer, independent plan approver, mentor and participant accounts | No verified named appointments or consenting participant list | BLOCKED | Nominate existing authorized accounts, scope and approval evidence; obtain participant consent. |
| Email verification | Resend integration is fail-closed; sender and real delivery not verified | BLOCKED | Verify sender/domain and test signup/OTP/recovery using authorized test inboxes. |
| Database-backed journey | Local contract tests only; isolated PostgreSQL pilot target not confirmed | BLOCKED | Provision approved disposable target, run migration and cross-account, replay, rollback and revocation tests. |
| Security, accessibility and operations | No physical-device/screen-reader evidence, backup/restore or live monitoring evidence for this intake | BLOCKED | Record desktop/mobile and assistive-tech walkthroughs, restore drill, alert owner and rollback procedure. |

## Controlled pilot procedure once gates pass

1. Record the approved intake version, named decision owners, consent, authorized accounts, backup and release evidence. Keep the intake closed to wider traffic.
2. Have a consenting Kerala applicant create and verify an account, submit an application, and describe whether the status space answers “what happens next?” Record the session date and observed friction without copying secrets or private answers into this register.
3. An authorized reviewer records a decision. Verify that a submitted or approved application alone does not expose founder practice or community.
4. Only after separate approved terms and enrollment, activate the participant in the intended PBA batch. Have an independent reviewer approve the practical plan. Observe milestone submission, feedback, rework and tier-scoped community access.
5. Ask the applicant and mentor to record friction in the private feedback queue. Assign an owner and resolve each note with an audited response. Re-test corrected flows with the same consent and scope.
6. Reconcile actual application, enrollment, evidence, decision and feedback records. Record defects and stop conditions. The pilot is complete only with real session evidence, not just a passing build or synthetic test.

## Expansion gate

Do not generalize prices, languages, currencies, timezones or regions from the Kerala pilot. After the observed issues are resolved, approve locale-specific copy, translations, payment/tax treatment, support coverage, timezone rules and accessibility for each new region. No language, currency or regional expansion is activated by this phase.
