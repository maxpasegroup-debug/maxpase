# Nice Jobs Phase 2: orientation, policies and offers

The subsequent [candidate journey integration](NICE_JOBS_CANDIDATE_JOURNEY_PHASE_4.md) connects these checkpoints to the reviewed 100-day programme, recorded offer training version and explicit enrollment. It retains the pre-offer versus post-offer distinction below.

## Existing architecture

Pre-offer orientation is not post-offer OJT. The existing onboarding engine requires an accepted offer and remains unchanged. This phase records a pre-offer checkpoint using the existing application revision, application history, operational events and audit records. No second applicant, training enrollment or offer model is introduced; no new schema migration is required.

Each immutable published job version can contain typed configuration.preOffer: role video title, approved HTTPS URL, video version, comprehension configuration using the existing quiz engine, and explicit policy keys/titles/versions/full texts. configuration.preOfferRequired blocks approval/publication when content is missing. The three owner-supplied initial drafts now set this requirement. Existing published versions without this flag/configuration retain their established workflow; administrators must create a new version to adopt the checkpoint, not silently rewrite history.

Draft editing requires job editing plus scoped nicejobs.orientation.manage authority. The UI hides the checkpoint editor without that capability. A public disclosure fingerprint binds the published job version, video, question form and policy text; private grading criteria are deliberately excluded. Each application is separately owned and authorized.

## Candidate checkpoint

After submitting an application, the candidate can watch the role video and complete the comprehension check. The player requires an ended event before enabling the check, and the candidate explicitly attests completion. Server-side completion is candidate attestation supported by scored comprehension, NOT trusted viewing telemetry. Seeking or a forged browser event cannot be reliably detected by this implementation; no verified minutes watched are claimed. Video captions/transcripts and the actual media must be supplied and accessibility-tested before launch.

Quiz attempts are bounded, graded server-side and audited. Failed comprehension does not advance hiring state. Policies become visible after passing; the candidate explicitly agrees to all displayed versions. Policy acknowledgement is bound to the current job version and disclosure fingerprint. Own-resource checks, active membership, strict inputs, optimistic revisions and scoped idempotency protect both operations. Audit/history failure rolls back the revision and completion record. Completion never approves an application or activates employment.

## Offers and evidence

Existing independent management review, offer preparation, ready confirmation, issuance authority, expiry and candidate acceptance remain mandatory. Where the checkpoint is configured, issuance and acceptance require audited completion and policy acknowledgement. Issuance snapshots full policy versions/texts, video version, completion/acknowledgement timestamps and source event IDs into the existing offer snapshot, alongside issuing legal employer identity/name and candidate name. Private employer verification evidence and quiz answer keys are excluded. Revised offers remain separately versioned; accepted offers are not overwritten. Acceptance timestamp is stored on the offer and the existing audited application transition.

Candidates can download only their own issued offer, including historical issued versions, through authenticated corporate or Nice Jobs realm routes. Draft offers cannot be downloaded. Membership/session/resource ownership are rechecked on every request. Downloads are audited, rate limited, no-store and supplied as escaped, print-ready HTML, not an invented signed PDF.

Email sharing is candidate controlled: an authenticated .eml draft includes the full HTML offer attachment, with an unsent marker and no predetermined recipient or forged sender; the candidate selects the recipient and sends using their email client. Client support varies and must be manually validated. Email composition and native file sharing are additional options. Creating a draft or handing a file to a sharing application is NOT proof of delivery. There is no new server-side mail provider or automatic sending. Native device sharing is a user-selected action, not a platform WhatsApp integration.

WhatsApp API delivery remains unavailable until approved provider setup and a recorded recipient/channel consent flow exist. No provider credentials, automated messaging, billing resource, autonomous SIA action or new employment policy is created by this phase.

## Business inputs required

Supply the real approved orientation video and version for each role, scored comprehension questions/answers/attempt policy, accessibility assets, and legally reviewed terms/policies with explicit versions. Confirm the job's legal employer, working terms and reporting manager as required by Phase 1; Nidus employer/recruitment authority remains unresolved. Use an independently authorized management approver and offer issuer. None of these real business details were fabricated or deployed.
