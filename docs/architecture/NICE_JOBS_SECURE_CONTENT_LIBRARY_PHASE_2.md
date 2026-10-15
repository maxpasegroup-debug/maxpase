# Nice Jobs: Secure Content Library (Phase 2)

Updated: 2026-10-13. This is the job/programme setup sequence's Phase 2, not a replacement for the earlier workforce phases.

## Canonical Model

Reuse NiceJobsKnowledge / NiceJobsKnowledgeVersion, existing audiences, capabilities, independent review, publication and audit. NiceJobsContentFile is a private object manifest, not another resource or document lifecycle. An opaque file UUID occupies the existing privateReference. Captions and transcripts belong to each immutable content version; media changes require a new version. Original filenames are metadata, never storage paths.

Uploads require an authenticated active human, canonical company/product membership, exact organization scope, nicejobs.knowledge.read and nicejobs.knowledge.manage. Actor identity comes only from the session. Corporate and Nice Jobs routes preserve their existing separate sessions and trusted-host rules. Read permission does not grant draft management, review, publication or external delivery.

## Upload and Validation

Administrators upload raw bytes through bounded authenticated endpoints. The editor shows byte-transfer progress, validation, success, cancellation, failure and explicit retry. A retry preserves the actor-bound UUID key; selecting another file creates a new key. Save is disabled during upload. The library records filename, actual MIME/media kind, byte count and SHA-256 integrity evidence without exposing the storage location or digest to the browser.

Supported formats and per-file limits:

| Type | Formats | Maximum |
| --- | --- | --- |
| Image | PNG, JPEG, WebP | 10 MiB |
| PDF | PDF | 20 MiB |
| Video | MP4, WebM | 64 MiB |
| Audio | MP3, WAV, M4A | 32 MiB |

Filename, extension, declared MIME, maintained file-type detection, expected magic prefix and size must agree. Paths, control/bidirectional filename characters, SVG, HTML, executables, archives and Office files are rejected. PDF checks require its header/end marker and reject visible active-action, embedded-file and encryption markers. PDFs download as attachments, never inline previews.

These checks are NOT antivirus, content-disarm/reconstruction or complete semantic media validation. This implementation is for trusted authorized administrators with human content review. A malicious-file scanner/CDR policy, operational review and relevant Windows storage ACLs remain production launch decisions, not implied certifications.

Uploads are bounded to two concurrent requests per process, 120 seconds, 64 MiB total, a per-user rate budget and company quotas of 10 GiB / 10,000 files. Media is buffered and integrity-checked; resumable streaming and high-volume/multi-instance capacity are not certified. Node.js 22 or later is required by the pinned file-type dependency.

## Storage and Integrity

Local development may use ignored .private/nicejobs-content. Production requires an absolute NICEJOBS_CONTENT_DIR on a private persistent volume, outside public/application paths. Missing configuration is unavailable, never a public fallback. Objects use random UUID .blob names, exclusive creation and restrictive filesystem modes. Root and object checks reject symbolic links and unexpected path resolution. Windows ACLs, encryption and production volume ownership require operator verification.

Upload metadata, idempotency record and mandatory operational audit commit together. A failure removes only this attempt's newly created object after confirming it has no committed manifest. Unknown commit state never causes blind deletion. Replays reauthorize and check the existing object and digest before success. A filesystem and database are not a distributed transaction: a process crash can leave an unreferenced blob. Future reconciliation must be explicit and audited; no cleanup worker or broad deletion exists. Backups/restoration must cover both database and private objects.

## Access and Preview

Each download reauthorizes before reading bytes and verifies the recorded size/digest. Management previews require exact source read scope. Activated workers use canonical assignment, current source permissions, audience, publication and date predicates. Cross-company access, expired/archived current content and forged recipients remain denied.

An accepted-offer trainee may access only uploaded resource versions explicitly pinned in their own frozen orientation/OJT plan, matching company/division/job audience and publication dates. This does not grant general resource browsing, worker activation or other application access. Cancelled enrolments are denied. Historical published versions can remain accessible through that explicit pin, but archived resources are not delivered through this training adapter.

Authenticated image, audio and video previews use the correct corporate/local-site/host-domain endpoint; cookies are not sent through the public image optimizer. Captions and transcripts are escaped text; WebVTT captions can be attached to media controls. Audio/video submission/publication requires a transcript, images require captions, and uploaded resources require descriptions. Reviewers must assess actual accessibility and accuracy; metadata alone is not WCAG certification or proof that a trainee watched a video.

Responses use private/no-store, nosniff, same-origin resource policy and sandbox headers. Authorized single byte ranges support media seeking; malformed or multiple ranges are rejected. Errors expose no stack traces, storage paths or secrets. Downloads have mandatory access audit; completion/acknowledgement remains an explicit existing workflow.

## Customer Sharing Boundary

Internal training and CUSTOMER_MATERIAL remain distinct classifications. Customer material may reference a validated uploaded file, but only independent review and publication mark the current version approved. There is no public object URL, automatic email/WhatsApp attachment delivery or provider activation. Staff may download material through authorized resource access; external provider/consent checks are unchanged. This phase never authorizes SIA execution.

## Database and Release

Additive migration: 20261013090000_nicejobs_secure_content. It adds a scoped NiceJobsContentFile manifest and empty-default caption/transcript columns without rewriting existing resources. Legacy unresolved references remain unavailable and cannot be mistaken for newly uploaded files. The training editor lists actual published, eligible uploaded versions by title.

The user selected an isolated local preview database. No existing development/production database is migrated by this task. The preparation script creates synthetic local content-author/reviewer/publisher accounts, separate runtime secrets/cookie, private objects and a fresh database under ignored .private/content-preview. It creates no jobs, offers, workers, real policies or payments. The three real job listings remain unpublished; all pilot approval restrictions remain intact.

See [validation report](../audit/NICE_JOBS_SECURE_CONTENT_LIBRARY_PHASE_2_VALIDATION.md). Production migration, storage/scanning operations, backups, mobile/browser/screen-reader review and content accessibility sign-off remain separate release gates.
