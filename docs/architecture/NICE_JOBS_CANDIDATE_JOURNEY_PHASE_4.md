# Nice Jobs: Application, Orientation and Offer (Phase 4)

Updated: 2026-10-13. Phase 4 of the job/programme setup sequence. This connects the existing application, recruitment, pre-offer and onboarding foundations; it does not replace them.

## Candidate Path

Published, currently eligible job disclosure -> candidate-owned application -> authorized human eligibility/screening and shortlist -> required interview/evaluation or an explicitly configured exemption -> independent management approval -> pre-offer role orientation/comprehension -> versioned policy acknowledgement -> reviewed offer issuance -> candidate acceptance and authenticated download -> explicit enrollment into the pinned training programme.

Orientation/policy preparation can occur while human review is pending, but it cannot bypass selection or issue an offer. Comprehension failure cannot record a pass, policies cannot be acknowledged before the pass, and issuance/acceptance still require the exact audited policy evidence. A disabled interview is a deliberate reviewed role-policy exemption, not missing interview configuration. The integration fixture requires and actually records an interview.

## Programme Binding

configuration.ojt remains the canonical 100-day curriculum; orientation and readiness remain their existing typed sections. A shared configuredTrainingPlan helper produces the same normalized plan for offer issuance and enrollment. The issued offer records programme.versionId, fingerprint, durationDays, dayMode and timezone, without disclosing quiz answer keys, private file handles or internal reviewer accounts. The fingerprint binds the entire frozen orientation/OJT/readiness plan, not only the duration.

Acceptance and enrollment compare that recorded summary against the application's immutable published job version. Missing or mismatched programme evidence fails closed for curriculum-backed offers. A newer job version does not silently change an existing candidate's offered programme. Existing non-curriculum legacy offers retain their established behavior rather than being retroactively labelled 100-day programmes.

The canonical job publication controls establish programme review/approval before application. Hiring independently uses the existing operational request/control-point approval chain and scoped human permissions. No client-selected plan ID, actor identity, legal employer or approval result becomes authority.

## Offer, Policies and Download

Offer issuance retains canonical employer identity, disclosed engagement/compensation, management approval, ready confirmation, issuance permission and validity checks. It snapshots the versioned policies, completion/acknowledgement timestamps and source event IDs. Acceptance writes its existing audit/history and scoped public-applicant training-access grant in one transaction.

The existing authenticated document service now includes offered training days, calendar/timezone and job version. It remains an escaped print-ready HTML offer, not a signed PDF or legal certification. Downloads are owned, audited and no-store. Email draft/device sharing remains candidate-controlled and is not proof of delivery. No new email/WhatsApp provider or autonomous sending is enabled.

Pre-offer orientation currently uses the existing configured approved HTTPS video URL. Internal private library uploads remain available through the frozen accepted-offer training references; this phase does not grant applicants general private-library access or add pre-offer private-file delivery. Video completion remains explicit candidate attestation plus a server-graded comprehension check, not verified watch telemetry. Actual media, captions/transcripts and legal policies still need human review before launch.

## Enrollment and Interface

Accepting an offer is not enrollment or workforce activation. The candidate must explicitly confirm ENROLL. Existing unique application enrollment and job-version training-plan constraints prevent duplication, and exact accepted-offer audit proof remains mandatory. Retries reauthorize ownership and return an existing enrollment instead of creating another; cancelled enrollment is not resurrected by retry.

The candidate application page shows recorded application/screening/interview/orientation/policy/offer/enrollment checkpoints. Unknown configuration, pending review, expired offers, cancellations and recorded steps remain distinct. Current offer/interview observations do not depend on historical-page pagination. Recruitment detail is fetched once for the page and passed into its existing controls rather than fetched twice.

An enrollment-status read validates active participant permissions and actual ownership, then applies the existing offer/plan/resource relation checks. Once enrolled, the page shows the recorded status/version and a Training link, hides the duplicate enrollment command and changes the next-step wording. Management forms, existing detailed evidence/history and branded/corporate session boundaries remain unchanged.

Published opportunity projections retain templateId internally so JOB-targeted curriculum files can be validated against their actual role. Candidate projections still exclude private programme configuration and grading rules.

## Validation and Business Boundary

The isolated full-journey test uses a public self-registered applicant, separate authorized interviewer/management approver, a reviewed complete synthetic 100-day programme, comprehension failure/pass, exact policy versions, reviewed issuance, acceptance/download and simultaneous enrollment retries. It verifies one enrollment/audit event, rejection of mismatched programme evidence, correct current records on history pages and no workforce assignment.

No real job is published, applicant selected, offer issued, worker activated, incentive rate configured, payment initiated or external message sent. The CEO has not yet supplied approved role content, reviewers and all business/pilot decisions. Academic Advisor - Junior, Business Automation Manager and Defence Career Mentor remain unpublished.

See [Phase 4 validation](../audit/NICE_JOBS_CANDIDATE_JOURNEY_PHASE_4_VALIDATION.md). Local workflow verification does not mean production pilot authorization. Phase 5 is not started.
