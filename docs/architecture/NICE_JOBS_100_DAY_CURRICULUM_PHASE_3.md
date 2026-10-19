# Nice Jobs: 100-Day Curriculum Builder

The subsequent [Application, Orientation and Offer Phase 4](NICE_JOBS_CANDIDATE_JOURNEY_PHASE_4.md) binds issued offers and explicit candidate enrollment to this immutable programme and preserves its approval gates.

[Daily Training Phase 5](NICE_JOBS_DAILY_TRAINING_PHASE_5.md) projects the scheduled lesson and actual approved progress into Today, adds distinct trainee reports and keeps acknowledgement, playback and comprehension separate.

Updated: 2026-10-13. Phase 3 of the job/programme setup improvements, not a replacement for the original workforce phases.

## CEO Entry and Canonical Training

The existing authorized CEO/Boss Opportunities workspace opens a role's job version. Its programme checklist links directly to Orientation, 100-day curriculum and readiness configuration. Upload and review training files opens the existing [secure content library](NICE_JOBS_SECURE_CONTENT_LIBRARY_PHASE_2.md). Video, audio, PDF and JPG/image uploads remain private, reviewed, scoped and versioned. No second admin account, dashboard, storage provider or authentication system is introduced.

The builder reuses configuration.ojt stages and activities, NiceJobsTrainingPlan, enrolment/progress/submissions/reviews, existing quiz rules and existing job publication approval. No database migration is needed. Creating day slots requires confirmation before replacing an unpublished draft's OJT activities. It creates ten manageable ten-day stages with empty learning/practice fields, not invented lessons or approved training.

Each day has an exact dayNumber, title, learningText and/or published private resource-version reference, practical instructions, expectedOutcome, evidenceRequirements, mandatory evidence/human review, optional comprehension quiz, bounded attempts/practice time and an optional milestone marker. Stage names can express the stage outcome. Every stage must end with a milestone practical assessment; a final assessment and assessment-backed readiness are mandatory. Quiz scoring never replaces reviewed practical evidence.

## Drafts, Validation and Review

Curriculum drafts may contain empty title/instruction/outcome/learning/evidence fields. These omissions remain visible and block readiness. Legacy unnumbered OJT remains strict and unchanged; it cannot use incomplete draft activity fields without curriculum policy. The builder edits one day at a time, retains all other days, offers stage/day navigation and previews the selected participant's learning/task/outcome/evidence requirements without disclosing correct quiz answers. A date preview is labelled as a chosen start-date preview, not a real enrolment.

Server validation requires exactly one occurrence of every Day 1-100, consecutive ordered stages, no duplicate activity keys/order, mandatory practical work and evidence review, nonblank content/outcomes/evidence requirements, end-of-stage milestones, explicit calendar policy and final assessment. A durationDays value of 100 alone cannot pass. Reference IDs must resolve to published, date-valid private learning resources with real file manifests and an audience covering every job area. Curriculum reviewers need actual current source read permission for learning files; IDs and account existence are not authorization.

The three catalogue roles and all programme-configured roles require this gate before review, approval, publication, catalogue exposure and new applications. Configuring a curriculum also opts other roles into the programme gate. Once configured it cannot be removed through draft editing to bypass review. New job versions inherit the configuration and start in Draft. Returning to Draft invalidates job approval, and published versions remain immutable.

The nominated programme OJT reviewer is displayed in the builder; the existing Manager and reviewer assignments section selects their verified account. Nominations grant no permissions. Authorized managers must assign the nominated independent reviewer to the participant before OJT starts. Existing readiness review is separate. The existing nominated publication reviewer approves the full current job/curriculum version with recorded reason and audit; complete inputs are never labelled approved merely by filling fields.

Job configuration is bounded to 750 KiB UTF-8. Long lessons should use uploaded version references; the editor rejects oversized configuration before submitting. Quiz definitions must satisfy the existing strict configuration before they can be saved.

## Calendar Contract

- CALENDAR counts consecutive local dates; Day 1 is the local date containing the actual OJT start instant.
- WORKING counts only explicitly selected weekday numbers (Sunday 0 through Saturday 6). If OJT starts on a nonworking date, Day 1 is the next selected working date. No holiday calendar is implied.
- The programme's explicitly selected valid IANA timezone determines local day boundaries, including daylight-saving changes. UTC instants are stored as dueAt. No account-timezone change silently moves training dates.
- Each day closes at the last millisecond before the next local midnight. Readiness duration passes only after Day 100 closes, in addition to completed evidence, assessment and human readiness review.
- Phase 3 supported only explicitly NOT_ALLOWED pause/rescheduling choices. These accepted fixed-policy plans remain unchanged. [Manager Control Phase 6](NICE_JOBS_TRAINING_MANAGEMENT_PHASE_6.md) adds opt-in independently reviewed pause/resume and bounded deadline-extension policies for new reviewed programme versions. No automatic calendar shifting is implied; rework alone does not move historical deadlines.

Daily submissions cannot precede their configured opening date or bypass preceding mandatory reviewed activities. Overdue days remain actionable for authorized rework; missing a date does not erase evidence or earned money. The same date/opening rules appear in participant rendering and server mutation checks.

## Frozen Execution and Boundaries

Enrolment pins the existing immutable job-version training plan and fingerprint. All 100 activities are instantiated into canonical progress rows when OJT starts, with derived UTC deadlines. Draft edits/new versions do not rewrite an enrolled participant's plan or prior review. Completion, independent reviewer identity/scope, evidence validation, optimistic revisions, actor-bound replay protection, mandatory audit and transactional rollback retain their existing controls.

Participant Training shows actual day, learning text, linked private files, practical outcome, evidence requirements, milestone status, attempts and due time in the programme timezone. Working-day progress does not claim that weekends advance the curriculum. No elapsed-time-only completion, workforce activation, incentive approval, payment, external message or SIA autonomous action is introduced.

## Real Role Gate

Academic Advisor - Junior, Business Automation Manager and Defence Career Mentor remain unpublished. The CEO confirmed that training media will be uploaded from the master dashboard, but has not supplied reviewed 100-day role content or nominated reviewers in this task. Do not copy synthetic preview/test training into these roles. Their business/employer/compensation and pilot approval restrictions remain unchanged.

See [Phase 3 validation](../audit/NICE_JOBS_100_DAY_CURRICULUM_PHASE_3_VALIDATION.md). Actual role completeness/review is BLOCKED until authorized humans configure and approve the schedules. Infrastructure implementation does not mean that three role curricula have been authored.
