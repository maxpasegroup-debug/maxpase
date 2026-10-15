# Career Hub Experience Phase 3: One Work And Learning Space

Current experience update: [Participant Dashboard](NICE_JOBS_PARTICIPANT_DASHBOARD.md) introduces Home and the seven user-facing dashboard destinations. Today, Training, Work, Reports, Wallet, Resources and Help remain detailed authorized workflows; trainee default entry is now Home, not an automatic training action. The original implementation description below is retained as historical context. No activation or financial boundary is relaxed.

## Navigation And Participant Entry

Today, Training, Work, Reports, Wallet, Resources and Help are the common participant navigation in both the corporate workspace and the jobs portal. Existing detailed task, follow-up, performance, wallet and content views remain within their matching section. Management workspaces keep their existing capability-governed navigation.

Active, readiness-backed workers retain the existing employee services. An authorized trainee opens Today on an existing incomplete training track, with the next requirement, evidence form, review state and feedback. Work, Reports, Wallet, Resources and Help explain the activation boundary and provide the same training continuation. Before activation, training submissions are the practice reporting record; employee daily reports and production tasks are not enabled. No page read enrolls, starts, submits, grades, activates or pays anyone.

Self-registration retains its original four applicant capabilities. On new management-reviewed offer acceptance, public applicants receive one training-only role on their existing non-descendant Career Hub membership. The role grants only nicejobs.onboarding.self; owned accepted-offer and audited enrollment checks still apply. Acceptance, role assignment and both audit events commit or roll back together. Existing accepted offers and revoked memberships are not silently backfilled or regranted on replay; an authorized access administrator must configure any legacy candidate's training permission.

Workers' Today also summarizes their assigned learning tracks alongside actual tasks, follow-ups, report status and blockers. Reports provides existing daily report submission/corrections and performance/improvement links. Help provides recorded manager context, messages, work instructions and blocker reporting. SIA availability is checked against actual tool configuration and human/agent authorization; no authority is granted by this experience.

## Short Practice And Milestones

The existing immutable OJT configuration and progress/submission/review models remain authoritative. Each activity may declare an optional practiceMinutes value (1-120). The field is optional, without a parser default, to preserve historic configuration fingerprints. Existing dueDays, durationDays, instructions, expected outcomes, evidence and independent review requirements are reused.

Schedules are elapsed UTC durations from the recorded OJT start: one day is 24 hours, not a local midnight or working-day calendar. Training day is the elapsed-day index; a minimum duration is not a completion score. No automatic daily completion or recurrence engine is introduced. Mandatory activities remain sequential; submitted evidence awaiting review does not complete a stage. Skill milestones show the required-activity completion of the existing configured stages, not an inferred professional qualification.

Candidates may view their own sanitized submitted evidence and submitted quiz answers, plus released feedback. Private reviewer notes remain restricted to the current authorized reviewer; other management readers do not gain evidence access. Private storage handles and related-record IDs remain masked. Correct-answer criteria are never returned.

## Customer Materials

The existing resourceType string now supports CUSTOMER_MATERIAL. It is an explicit draft designation, not approval. It requires worker visibility and text or an HTTPS link, not a private attachment. The existing independent SUBMIT / REVIEW / PUBLISH process approves that exact version. Publication, archive, expiry and current-version replacement remain audited and scoped.

After ordinary active-worker audience and capability authorization, only reviewed, published, current, unexpired CUSTOMER_MATERIAL versions expose customer-sharing data. Ordinary internal resources, drafts, archived versions, expired versions and private attachments never expose the sharing controls. Material revisions require a new reviewed version. There is no public anonymous content endpoint.

Sharing uses the browser's native share dialog, clipboard or an email composer. The UI does not claim successful delivery. No server email/WhatsApp provider, sending job, customer recipient registry or autonomous SIA sharing is enabled. Copies already exported cannot be revoked; managers must supply only information approved for external disclosure.

## Required Launch Configuration

- Confirm role-specific curricula, daily practice timing and due dates, meaningful stage names, evidence rubrics, readiness criteria and any 100-day duration explicitly.
- Assign authorized trainers and readiness reviewers. Publish the job's approved training configuration before enrollment; pinned tracks are not silently rewritten.
- Enroll accepted candidates through existing explicit actions. Activate workers only after the existing human readiness and membership checks.
- Create and independently review real customer materials in the correct audience and scope. No marketing assets are seeded by this phase.
- Configure real incentive policies and authorized wallets through existing financial controls. A recorded balance is not a transfer confirmation.

No schema changes, dependencies, production migration, seed, deployment or additional development phase are required by this experience implementation.
