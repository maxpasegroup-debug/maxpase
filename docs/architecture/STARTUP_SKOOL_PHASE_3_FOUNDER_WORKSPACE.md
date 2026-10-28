# Startup Skool Phase 3 — founder learning workspace

**Phase 5 safety amendment:** New and activated Startup Skool participants now also require the approved Kerala intake register, active mapped PBA product, human-approved application, current authorized reviewer/mentor accounts and participant consent evidence. Founder learning reads and evidence submission recheck this gate. An older active participant row or plan alone no longer opens the pilot workspace.

The founder workspace extends the existing Startup portal. It does not create a second account or enrollment system. `Program`, `Batch` and `BatchParticipant` remain the source of enrollment truth. An admissions `APPROVED` application from Phase 2 is **not** an enrollment. A participant sees practice only if the programme, batch, participation and independently approved batch plan are active.

## Learning loop

An authorized `program.manage` staff member drafts a batch plan with a tier, written terms approval reference, practical milestones and required text evidence. A different authorized person approves the plan. Approved plans are immutable in this phase; later curriculum changes require a reviewed versioning workflow. Milestones are ordered: the next practice is unlocked only after a human accepts the preceding evidence. Submissions can be accepted or returned for rework with visible mentor feedback. No progress is inferred from a page view, AI suggestion or unreviewed submission.

The plan, evidence and community updates reuse scoped `ExecutiveRecord`, `ExecutiveHistory` and `OperationalEvent`. Stable source keys prevent duplicate milestone records. Status/version checks reject replayed decisions and stale resubmissions. Mutations and their history/events are transactional. The actor comes from the server session. Reviewers require current Startup division `program.manage` authority and cannot review their own evidence. Student reads recheck active enrollment and owner scope.

## Tier and community boundary

Starter and Pro map to a **mentoring** board; Extraordinary Entrepreneur maps to a **training** board. The board is private to an active, approved batch and currently contains programme-team updates only. No peer posting, external community provider, direct messaging, or automated SIA mentor action is enabled. The displayed tier is the independently approved batch plan, not a fee or payment entitlement. A bare application choice or draft plan never opens community access.

## Release dependencies

The current legal operator remains AIRA Skill City Private Limited. The standalone entity, tier terms, actual approving owners, programme content, mentor appointments, and live participant accounts are unverified in the Phase 1 register. A string approval reference is an auditable attestation by a human reviewer, not independent verification of a contract. Before a real intake, approve written tier terms and curriculum, verify reviewers and enrollments, and run database-backed isolation, replay, rollback, and acceptance tests against a disposable PostgreSQL target. This implementation did not enroll students, publish prices, collect payment, or change production data.
