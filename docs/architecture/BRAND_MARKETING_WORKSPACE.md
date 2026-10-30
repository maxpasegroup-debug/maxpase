# Brand marketing workspace

The Marketing module is an internal planning surface for authorized MAXPASE Boss users and AIRA Skill City staff. It uses the existing `Brand`, `ExecutiveRecord`, `ExecutiveHistory`, `Task`, and `OperationalEvent` models. There is no new Prisma schema or migration.

## Scope and authority

- A campaign source key contains the stable brand ID. Reads and writes check its company, active brand ancestry, mapped division when configured, `executive.read`, and the current user session. Skill City staff additionally pass the existing employee portal gate and company identity check.
- `task.manage` permits drafting, content preparation, internal work orders, and review requests. `decision.decide` plus `approval.decide` permits a review decision. The reviewer must be a different person from the campaign owner and latest preparer.
- Owners and work-order assignees must have an active, verified account and an active membership covering the company or mapped division. Existing account presence alone is insufficient.
- AIRA sub-brands inherit the verified parent brand's division; brands without a verified division map to their legal company. A staff account outside AIRA cannot enter through Skill City.

## Lifecycle

`DRAFT` → `IN_REVIEW` → `APPROVED` or `REJECTED`. A rejected campaign can be revised and resubmitted. Review requires an owner, future IST start/end times, and at least one draft text asset. Versioned updates prevent stale decisions. Campaign changes, work orders, and decisions write history and audit events in the same transaction. Work orders are canonical internal Tasks; a unique ExecutiveRecord receipt protects their request reference from replay.

**APPROVED means internal campaign-plan review only.** No code path in this module publishes content, sends an email/WhatsApp message, starts a provider job, or treats a proposed channel as configured delivery. The current assets are draft copy and creative briefs stored within the campaign record; authorized preparers can revise or remove them before approval with recorded history. Media file upload, binary storage, public sharing, and provider delivery need their own secure content and consent implementation before activation.

All schedule fields are entered and displayed in India Standard Time and persisted as UTC instants. This is explicit until user timezone support is introduced to this workspace.

## Verification boundary

Focused tests cover brand source-key filtering, a foreign-company denial before record reads, review prerequisites, independent decision/replay rules, and navigation availability. TypeScript, lint, and build checks verify wiring. No local dedicated PostgreSQL target was available for transaction and concurrency integration checks. Do not claim live campaign delivery or production approval based on these tests.
