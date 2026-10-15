# Nice Jobs Job And Programme Setup

Subsequent extension: the [100-Day Curriculum Builder](NICE_JOBS_100_DAY_CURRICULUM_PHASE_3.md) now adds a required complete-schedule gate to this checklist. The original phase descriptions below describe the earlier boundary; training outcomes or a duration alone no longer satisfy current launch readiness.

Implemented locally: 2026-10-11. This is Phase 1 of the job-to-training setup improvements, not a replacement for the historical Nice Jobs Phase 01 workforce foundation.

## Existing Model And Entry

The Boss panel's Opportunities / Job Templates workspace and corporate `/app/nicejobs` share the same version editor. Open a job to see the six-section checklist, its actual publication stage and every outstanding requirement. Authorized draft editors can open employer/working terms, pre-offer orientation/policies and programme setup. Account searches preserve the selected job and workspace context.

No duplicate workflow, approval, account, employer or training model was created. A strict, bounded `configuration.programmeSetup` section extends the existing `NiceJobsVersion` JSON configuration; no migration is required. It records exact manager, publication reviewer, OJT reviewer and readiness reviewer User references, engagement/compensation/policy review references and training outcomes. Existing `opportunity`, `preOffer`, orientation, OJT and readiness structures remain authoritative for their respective content.

## Checklist And Authority

| Section | Required evidence / validation |
| --- | --- |
| Employer, division and working terms | Existing employer identity/evidence, division confirmation, linked brand where supplied, description, eligibility, engagement/classification, compensation/incentive disclosure, location, arrangement and reporting Person. Canonical employer/brand/manager references are revalidated at approval/publication. |
| Responsible manager | Exact nominated active User linked to the reporting Person; active, date-valid membership and `nicejobs.work.manage` in every job area. A title or Person record alone is insufficient. |
| Authorized reviewers | Active User/Person and effective permissions across every area: `nicejobs.job.publish`, `nicejobs.ojt.review`, `nicejobs.readiness.review`. The publication reviewer also needs company-level publishing authority. Approval must be performed by that nominated publication reviewer. |
| Approval references | Nonblank engagement, compensation/incentives/payment and current legal/policy review evidence references. These references are human-entered evidence, not automated legal certification or financial-policy configuration. |
| Orientation and policies | `preOfferRequired=true` and validated role-specific HTTPS video/version, scored comprehension check and nonempty versioned policies. Merely having a generic content reference is insufficient. |
| Training outcomes | Nonblank role outcomes/readiness expectations. This does not claim that a complete 100-day curriculum exists. |

Configuration edits need existing job editing authority. Changing programme setup additionally requires `nicejobs.ojt.configure` at company and every old/new area, alongside existing orientation/OJT-specific protections. Nominations grant no permissions and enroll nobody. Account options are bounded active membership-based choices; the checklist separately validates current capabilities. Missing, inactive, out-of-scope and unauthorized nominations fail readiness.

Publication approval reviews the complete current immutable-on-publication version, including the evidence references. External evidence authenticity and legal compliance still require actual human review; entering a reference is not proof of either. Training nominations do not replace participant-specific independent reviewer assignment or later independent offer/activation/financial approvals.

## Publication Stages

For the current three catalogue identities (`JOB-001`, `JOB-BAM`, `JOB-DCM`) and other explicitly programme-configured definitions:

1. **Draft**: editable, incomplete inputs permitted, checklist visible.
2. **Ready for Review**: existing `PENDING_VERIFICATION` state; the server requires the complete checklist. Existing `REVIEW` is equivalent for approval eligibility.
3. **Approved**: only from a review state, by the nominated currently authorized publication reviewer, with a recorded reason.
4. **Published**: only from Approved, after rechecking current authority, checklist and canonical disclosure references.

Direct Draft-to-Approved/Published and review-to-Published requests are rejected. Clearing configuration or changing PUBLIC to INTERNAL cannot remove the mandatory gate for the three current identities. Returning to Draft invalidates publication approval; changed drafts must repeat review and approval. Published versions remain immutable; a new version starts in Draft. Pause/resume is retained, with live setup checks and resume limited to the current published version.

Legacy non-programme generic definitions retain their existing documented lifecycle for compatibility; they are not one of the three launch roles. Future roles can opt into programme setup through the editor; once saved, that setup cannot be removed (including from subsequent drafts/versions) to bypass review. Incomplete requirements can still be saved within it. This phase does not reinterpret old attestations as programme approval or migrate existing records.

Public and participant catalogue reads withhold incomplete programme-gated roles. Direct application creation, save and submission also recheck setup; existing applications can still be read/withdrawn under their existing controls. Approval references, nominated account identifiers and private setup details are excluded from candidate projections. A revoked reviewer can block new applications/publication without modifying existing workers or their earned-money access.

## Audit And Safety

Existing optimistic revisions prevent stale/duplicate transitions. Status mutation and operational/audit events remain one transaction; failed audit insertion rolls back approval/publication. Session-derived actors and existing company/area checks remain mandatory. No new SIA execution authority or external provider is enabled.

Only isolated disposable fixtures were configured/published by tests. No real draft, offer, worker, compensation rule, payment, permission or production record was changed. Internships and First Oppo remain outside the current scope.

## Remaining Inputs

All three real listings remain draft-only under the [Pilot Approval Register](../audit/NICE_JOBS_PILOT_APPROVAL_REGISTER.md). Nominate verified managers/reviewers and approve lawful engagement, compensation/payment terms, locations, work arrangements, current policies, orientation and outcomes. Resolve Junior Academic Advisor's pending business-function confirmation. Verify Nidus Academy's registered legal employer and recruitment authority; existing external-employer recruitment remains unsupported and cannot be bypassed by a label.

The later curriculum/content-upload and 100-day schedule work is not implemented by this setup phase. See [Validation](../audit/NICE_JOBS_JOB_PROGRAMME_SETUP_PHASE_1_VALIDATION.md).
