# Nice Jobs: Daily Training and Reporting (Phase 5)

Updated: 2026-10-13. Phase 5 of the job/programme setup sequence only.

## Today and Actual Progress

The existing trainee Today/Training entry uses the accepted offer's frozen orientation/OJT/readiness plan and canonical training progress/submission/review records. Today focuses on the scheduled day's activity plus the earliest incomplete mandatory requirement, even beyond the first history page. An overdue preceding activity or a review wait is not hidden by the current scheduled lesson. The full training/history link preserves application and corporate/Nice Jobs context.

Each focused activity shows learning text/private assigned media, practical instructions, expected outcome, evidence requirements, due time in the programme timezone, attempts and explicit lock reasons. Candidate-visible reviewer feedback/rework instructions are separate from private reviewer notes. New rework/rejection/failure/further-review decisions require nonblank released feedback; historical missing feedback remains unavailable and prompts contact with the reviewer rather than exposing private notes.

Counters are derived from real instantiated records: completed, open practice, awaiting review, overdue and future. Overdue includes review waits and is explicitly labelled as an overlapping flag; these counters must not be summed as disjoint categories. OJT day/activity progress and stages count actual configured completion, not elapsed time, media views or submitted reports. Human-review-required activities count only APPROVED; unreviewed COMPLETED rows and unknown plan keys cannot imply approved evidence. Existing server transitions still require preceding mandatory requirements.

The programme calendar controls openings/deadlines. Working-day gaps, dates before the first working day and dates after the schedule ends have distinct messages. No new lesson is invented on a nonworking date. Unresolved overdue practice remains accessible; schedule expiry alone cannot mark readiness. Upcoming milestones are configured unresolved future/due milestones, not past milestones relabelled as upcoming. Legacy unnumbered OJT is labelled in activities, not invented day counts.

Today selects from active, owned enrollments server-side, excluding READY/CANCELLED before pagination. A bounded enrollment chooser and the full training-list link support more than one authorized training programme. No company, actor, assignment or recipient is supplied as client authority.

## Daily Training Reports

NiceJobsDailyReport remains an activated-worker operational report requiring its existing assignment and workforce permissions. It is not reused by inventing a worker assignment for a trainee.

Trainee daily reports reuse NiceJobsTrainingProgress and NiceJobsTrainingSubmission under the distinct DAILY_REPORT phase. The unique onboarding/phase/date key identifies a report; numbered submissions preserve explicit corrections. Existing training phases remain ORIENTATION, OJT and ASSESSMENT. DAILY_REPORT rows are excluded before all bounded training/progress/readiness queries and cannot be reviewed as training evidence. No migration, alternate enrollment ledger or task system is introduced.

A currently authorized owner in ORIENTATION/OJT/READINESS_REVIEW/NOT_READY can record today's reflection, help request and next practice. NOT_STARTED, READY and CANCELLED cannot create new reports. The report date must equal today's date in the pinned programme timezone; legacy plans use the documented UTC convention. Backdating/future dating is not supported. Reports record actual state at submission, not a reconstructed historical snapshot.

The server derives counts, actual completion IDs for that local date, scheduled day and OJT progress. Client-supplied scores/completion counts/timezones/actor identities are rejected. Notes are self-reported narrative, not proof of completion or competence. Report snapshots are explicitly displayed as 'At reporting' and never silently recomputed as current metrics.

Correction requires the exact latest submission ID and a reason; prior versions remain intact. A maximum of ten versions per day bounds history. Actor-bound idempotency, enrollment revision and the unique date key prevent duplicate/silent overwrite. Report, submission, enrollment revision, canonical audit/event and applicable notification persistence share the existing transaction; failure rolls everything back. Report data records its canonical event reference for traceability without placing narrative text in public operational event metadata.

Owners and independently source-authorized enrollment readers/reviewers can inspect a bounded seven most recent report dates, each with at most ten versions. This is a recent window, not a complete archival report browser. No report approval is implied by the stored SUBMITTED/PENDING envelope. Reports do not advance a lesson, readiness, worker activation, wallet or incentive rule.

## Media Completion Contract

| Signal | Meaning | Does not imply |
| --- | --- | --- |
| Acknowledgement | An explicit recorded participant attestation under the configured completion rule | Verified watch time, comprehension or reviewed practical skill |
| Playback observation | A local browser play/end event; cleared on media/version reload and not persisted as authoritative evidence | Continuous viewing/listening, identity assurance, completion or approval |
| Comprehension | Existing server-graded quiz result; pass/fail can exist while human practical review is still pending | Approved practical evidence or readiness |
| Evidence approval | Actual scoped reviewer decision under the immutable plan's human-review requirement | Employment activation, earned-money policy approval or payout |

Private media controls show honest unverified browser observations. Seeking and forged browser events are not trusted viewing telemetry. No client event can complete a training record. The backend exposes no verified playback claim. Captions/transcripts and actual media accessibility still require human/browser verification. Existing quiz attempts and evidence limits remain authoritative; Today uses the same lower activity/quiz attempt budget as the mutation endpoint.

## Boundaries

No external provider, background worker, analytics engine, SIA execution authority, employment activation, payment or production mutation is introduced. Current trainee practice submission UI remains text evidence; private attachment delivery/evidence acceptance stays subject to existing resolver configuration and permissions, not an invented participant upload grant.

Real Academic Advisor - Junior, Business Automation Manager and Defence Career Mentor roles remain unpublished under existing content/business/pilot approvals. No synthetic training/report data is inserted into real role records. See [validation](../audit/NICE_JOBS_DAILY_TRAINING_PHASE_5_VALIDATION.md). [Manager Control Phase 6](NICE_JOBS_TRAINING_MANAGEMENT_PHASE_6.md) adds independently reviewed interventions and explicit internal reminders without changing accepted plans or activation boundaries.
