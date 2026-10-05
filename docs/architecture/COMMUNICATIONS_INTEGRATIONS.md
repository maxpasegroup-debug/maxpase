# Communications, Integrations And Automation

## Wave 03 Configuration Readiness

No live provider, TalkinLabs, private document delivery or autonomous SIA capability was activated. Configuration remains disabled-first and deployment-owned, with exact organization-bound credential binding, reviewed adapter contract, current consent/policy/source authority and independent human approval plus explicit confirmation. Provider status is separate from application liveness/readiness; PROVIDER_NOT_CONFIGURED and SIMULATED are never successful external delivery. Real provider credential rotation/configuration, callback/proxy validation and reconciliation remain NOT VERIFIED. Follow PRODUCTION_DEPLOYMENT.md and the unexecuted deployed/browser acceptance matrix; historical jobs require accountable owner review, not automatic catch-up.

## Phase 10 Hardening And Recovery

An additional shared durable public webhook budget precedes parsing/provider lookup for accepted JSON/body streams; integration-specific signature/time/event/fingerprint/rate controls remain intact. Runtime configuration/credential boundaries, independent human approval, explicit confirmation and source authorization are unchanged. Unknown/SENDING messages must not blindly retry after failure or database restoration. Safe headers/diagnostics and recovery runbooks do not make mock providers live. TALKINLABS LIVE INTEGRATION remains BLOCKED / NOT CONFIGURED; live email, WhatsApp and private document delivery remain unconfigured. See PHASE_10_VALIDATION.md and BACKUP_RESTORE.md.

Phase 09 extends MAXPASE's existing authorization, operational requests, human approval chains, notifications, reminders, audit and SIA registry. It does not replace them. No CRM, admissions, marketing campaign system, external AI provider or autonomous principal is added. No integrations, messages, consent, templates, rules or jobs are seeded as fictitious business activity.

## Integration And Credential Boundary

Integration belongs to an actual GROUP or COMPANY Organization and records provider, channel, name, enabled state, safe configuration, credential reference, creator, version and timestamps. Scope, provider and channel cannot be transferred through editing. CAS protects configuration updates. Configuration accepts only a sender address and bounded webhook rate: arbitrary API keys, URLs, scripts and secret metadata are rejected. Activations, updates and credential-reference changes are audited atomically. Normal projections expose a credential-referenced boolean, not the reference or its secret.

Credentials resolve server-side through an injected CredentialResolver. The environment implementation requires a deployment-owned `MAXPASE_CREDENTIAL_BINDING_<integration-id>` equal to `<organization-id>:<environment-key>`, as well as the Integration's matching `env:<environment-key>` reference. Editing a reference cannot read arbitrary process secrets, including AUTH_SECRET. Deployment supplies both bindings and actual secrets; no production value is created. Rotation replaces the environment value or explicitly changes the reference/binding. This is an environment-reference boundary, not encrypted database storage or a completed managed secret vault. Credentials never enter message records, templates, audit metadata, UI responses or webhook errors.

## Provider Adapters

CommunicationAdapter owns fixed provider identity, live/simulation classification, idempotent-send support, send, optional delivery lookup, webhook verification and strict normalization. No provider code appears in business modules. The registered adapters are MOCK, EMAIL_UNCONFIGURED and TALKINLABS. Adapters cannot be selected by arbitrary URLs or uploaded executable code. Injected adapters/credentials are internal test/deployment seams, never request parameters.

MOCK is an explicit development protocol: sends and inbound fixtures are SIMULATED, with no sent/delivered timestamp or live-delivery claim. Non-live adapters cannot turn ACCEPTED/SENT responses into real send states. Unavailable live adapters cannot be activated. No email SMTP/API or TalkinLabs contract is invented.

**TALKINLABS LIVE INTEGRATION: BLOCKED / NOT CONFIGURED.** Actual provider documentation, account credentials, permitted senders, sandbox endpoints and signature/delivery contracts are required before a real adapter and live validation can be supplied. Mock tests are not provider sandbox tests.

## Consent And Policy

CommunicationConsent references the existing active Person, exact Organization and channel. Address derives from the person's real recorded contact, not client recipient text. OPTED_IN/OPTED_OUT, human evidence source, server recording time and revision preserve explicit attestation. Contact existence is not consent. Active dated membership, scope, current address and consent are checked on preparation and dispatch. Consent is a foundation for existing scoped people; external leads/customers require future canonical recipient-domain authorization, not arbitrary address sends.

Existing NotificationPreference is reused for recipient accounts: specific category overrides ALL; any applicable external-channel opt-out blocks sending. In-app notification behavior is unchanged. Consent and preferences do not manufacture permission or a provider connection.

CommunicationPolicy is immutable and exact organization/project scoped. It references an existing ACTIVE independent human ControlPoint, with channels, allowed senders, OPERATIONAL/TRANSACTIONAL categories, ACTIVE_SCOPED_PEOPLE recipient scope, required approval, sensitive-content DENY, per-minute/day limits and optional UTC business hours. Archive and create a replacement to change policy. Company-wide approval cannot authorize project work; a project message needs its actual project control/policy. Only NORMAL plain-text content is accepted by the current send contract. This is not an automated content-classification/DLP system; humans must review content and no tool automatically exports private domain data.

## Templates, Threads And Messages

CommunicationTemplate holds key/version uniqueness, owner Person, purpose, channel, subject, body, declared variables, lifecycle and scope. Each version is immutable. The only supported substitution is literal `{{variable}}`; declared and supplied variable sets must match exactly, expression syntax is rejected, and rendered size remains bounded. There is no eval, HTML execution or arbitrary templating engine. Archive affects future template selection; already bound rendered previews remain their approved plain text.

CommunicationThread groups an integration/channel, actual authorized resource, optional project, existing Person participants, status, priority and last activity. Thread keys are canonical scoped fingerprints; no duplicate per-provider conversation system is introduced. Human operators can close/reopen a thread or explicitly mark HIGH priority. Inbound messages return to the same organization-resource/person thread where applicable. No CRM routing, chatbot, admissions or telecalling workflow is silently installed.

CommunicationMessage is the single inbound/outbound model. It references integration, thread, consent, optional template/policy, trusted creator User/Person, optional SiaIdentity and the existing OperationalRequest. It stores sender, recipient, subject/content, purpose/category/sensitivity, status, provider external reference, idempotency fingerprint, approval binding, attempts/retry policy, confirmation and actual delivery timestamps. Provider derives from Integration, not a second independently editable message provider. Database unique keys prevent duplicate local intents and external message references.

## Human Review And Outbound Intent

Preparation resolves the actual resource and requires communication.draft/read, integration.read, person.read and request/control authority. The server derives sender, recipient and human actor. One transaction creates the immutable rendered message preview, thread, normal operational request (SIA_PROPOSAL for SIA), audit and operational events. The request description binds the exact preview fingerprint; SIA also binds the complete immutable payload. Message-linked request editors reject content rewrites.

Existing submission/independent sequential or parallel approval chains are reused. Reviewers additionally require current communication.read/person.read; the existing approval/request UI displays the actual bound recipient, channel, sender, subject/message and purpose. Approval does not enqueue or send anything. The requester must explicitly confirm the approved preview before APPROVAL_REQUIRED becomes QUEUED. Cancellation/new preparation is the editing boundary: changed content or recipient requires a new preview and new human approval, never a stale approval.

Dispatch requires communication.process and the actual source/recipient reads for the human processor, plus revalidation of the creator's current send authority, canonical identity, resource, independent approvals, request binding, consent/preferences, policy, permitted hours, integration and SIA tool gates. An authorized processor cannot borrow its grants to replace a revoked creator's grants. High-impact mass send is not supported; each message has one explicit recipient and approval.

## Delivery, Retry And Transaction Boundary

Messages are the transactional outbound intent/outbox. Explicit `processDue` accepts 1-100 rows (UI 25); no timer, daemon, startup job or infinite retry exists. CAS claims a due QUEUED/retryable FAILED message as SENDING and audits the claim before invoking the adapter outside the database transaction. The same message ID is the provider idempotency key on every allowed retry. Database mutations and audits are atomic; an external send and SQLite commit cannot be made one distributed transaction.

Normalized states include APPROVAL_REQUIRED, QUEUED, SENDING, ACCEPTED, SENT, DELIVERED, READ, FAILED, REJECTED, CANCELLED, UNKNOWN, RECEIVED and explicitly SIMULATED. SENT/DELIVERED/READ are never inferred from local queueing. Delivery webhooks must match this integration and exact outbound external reference; regressions and failure-after-confirmed-delivery are rejected. Mock events cannot claim real delivery.

Retry count is bounded to three, with exponential UTC nextRetryAt, explicit safe failure codes and a retryable flag. Only a provider reporting a definite retryable failure and supporting idempotency may retry. Exceptions/ambiguous responses become UNKNOWN and never retry automatically. A crash or receipt/audit persistence failure after a provider call can leave SENDING: it remains locked against resending and requires provider-specific authorized reconciliation in a later configured adapter. No blind timeout reset is installed. A live exactly-once guarantee is deliberately not claimed.

## Verified Webhook Pipeline

The public POST endpoint is `/api/integrations/[integrationId]/webhook`. It streams at most 16 KiB, requires JSON, uses an exact configured provider ID and returns a generic rejection without raw errors. The development-only MOCK protocol uses `x-maxpase-provider`, `x-maxpase-timestamp` and `x-maxpase-signature`: HMAC-SHA256 over `<unix-seconds>.<exact-body>` with a scoped secret of at least 32 characters, constant-time verification and a five-minute signed-time and event-time window. This protocol is explicitly not TalkinLabs documentation.

Verified adapter data becomes a strict INBOUND_MESSAGE or DELIVERY_STATUS event. IntegrationEvent uniquely binds integration/event ID and normalized fingerprint. Identical retries do not repeat outputs; altered replay is rejected. Processing and receipt/audit/OperationalEvent commit together. Verified domain-processing failures produce a safe FAILED/PROCESSING_REJECTED receipt without adopting an altered successful event. Unverified payloads are not stored. Rejections are audited without raw headers, signatures, payloads or secrets.

Inbound senders must correlate with existing scoped contact/consent identity and current active membership; opt-out does not prohibit receiving a legitimate inbound message. The normalized message and operational event are DATA. No body text invokes SIA, SQL, shell, workflow transitions or communication dispatch. Future optional workflow routing must use explicit registered policies and existing domain authorization. Raw provider payloads do not become business commands.

Rate buckets persist bounded per-integration webhook minute, per-channel/scope sending minute/day and automation minute budgets. Limits fail closed; external provider capacity is not presumed. General internet-facing edge/DDoS hardening and bounded retention cleanup are Phase 10/deployment work, not claimed by this foundation.

## Automation And Scheduling

AutomationRule references trusted owner User/Person, actual organization, enabled state/version, one allowlisted trigger/action and strict condition. Registered pairs are TASK_OVERDUE -> NOTIFY_OWNER, APPROVAL_PENDING -> REMIND_APPROVER, PROJECT_BLOCKED -> FLAG_ATTENTION. Conditions hold minimum age and an explicit authorized recipient; overdue notices verify task owner/assignee relationship and approval reminders verify assigned approver. No scripts, arbitrary expressions, external sends or privilege-grant actions exist.

Explicit event processing rejects user-reported/other-scope events and resolves actual source state instead of trusting an event's wording. Scheduled scans use current authorized task/approval/project conditions. Rule-owner capability, canonical identity, source and recipient authority are revalidated for every output, separately from the human processor. AutomationRun keys protect each event/occurrence from duplicate output. Notifications reuse `notify`; reminders reuse `saveReminder` with an internal transaction. FLAG_ATTENTION generates a real important blocked-project notification; executive blocked-project attention remains its existing deterministic source projection, not a second attention engine.

ScheduledJob records rule target/type, UTC interval, finite maxRuns (1-1000), next/last time, enabled/status/version, attempts and bounded failure policy. Processing is explicitly authorized, at most 100 jobs and 25 source candidates per job per call (UI 25 jobs). Each job commits claim, outputs, run counters and audit together. Failure rolls outputs back, then persists a safe retry/final FAILED result with current processor authority. Next run advances from max(previous schedule, processing time); backlog is not endlessly expanded. Successful finite jobs stop; cancellation is explicit. Monthly/calendar work remains the existing RecurringWork engine, not reimplemented here.

All stored times and hours are UTC. Date-only scheduling means UTC midnight under the existing date contract; ISO instants require offsets. Non-UTC job timezones are rejected. No DST/calendar engine or distributed scheduler is introduced.

## SIA And Private Documents

The existing immutable SIA registry adds send_email/send_whatsapp with HIGH_RISK_WRITE, communication.send and mandatory independent approval. `proposeCommunication` uses the existing human/agent intersection and tool activation before creating an ordinary immutable communication intent. SIA cannot override sender/recipient, scope, consent, risk, approval or dispatch confirmation. Its generic execute method still cannot execute high-impact tools; actual delivery is the separate human-confirmed, permission-controlled outbox gateway. No autonomous communication or service-user impersonation is enabled, and no agent grants/tools are seeded.

Communication previews are visible in the communication workspace and existing approval queue. Optional draft/read/reminder/notification registry additions can later call these same bounded services; Phase 09 does not invent unrelated executors. SiaAction remains the existing synchronous task gateway; communication provenance/lifecycle is the specialized Message + SIA_PROPOSAL request, not a second approval engine or duplicate SiaAction executor.

PrivateAttachmentResolver is an authorization-only abstraction: actor, actual organization and opaque document reference must resolve to an authorized private handle. Its default fails NOT CONFIGURED. There is no document/storage domain or public signed-link generator in this repo; attachments/URLs are not accepted by the send schema. Future adapter support must authorize the canonical document and private delivery method explicitly. No private file is uploaded or publicly exposed by this phase.

## UI, Readiness And Validation

`/app/communications` supplies Overview, Integrations, Messages, Threads, Templates, Policies, Consent, Automation, Jobs, Webhooks and Delivery Status. Scope/channel/status/search and thread navigation use server services. Counts come from currently authorized records, before display limits, never seeded metrics. Creation controls require the current named capability. Existing request/approval controls remain authoritative; message display never renders inbound HTML as executable content. Normal UI exposes no credential secret or internal exception.

The shared layer is ready to extend to AIRA admissions/candidate/student/telecalling/lead communications through canonical future recipient/resources and adapter contracts. It does not install those modules, infer consent, create lead records or connect TalkinLabs. Phase 10 hardening, dependency remediation, performance, deployment, backups and production audit remain out of scope. See PHASE_09_VALIDATION.md for measured verification and explicit provider/browser/production gaps.
