# Phase 9: Security and resilience validation

This phase validates the existing Boss, Skill City, cross-brand CRM, developer and communications boundaries using isolated disposable SQLite databases. It does not grant access, alter production data or activate an external integration.

## Boundary checks

- **Identity and sessions:** Skill City requires an active, verified employee with an authorized staff role. Portal access rechecks email verification, and newly issued Skill City tokens bind the email and verification timestamp. Clearing, changing or re-verifying the email cannot make an old token valid again. Boss and Nice Jobs authentication contracts are unchanged.
- **Object access and revocation:** Manager and developer operations recheck current reporting relationships, memberships, organization/project scope and required permissions. Manager task previews no longer expose blocker descriptions without `blocker.read`, including when `task.read` is present. Company and direct-report isolation are tested with foreign records.
- **Replay and integrity:** Existing task/focus/developer references, revisions, independent review and audit-in-transaction checks remain the mutation authority. Tests reject conflicting replays and verify rollback when audit insertion fails.
- **Integration boundary:** Existing communications tests exercise provider signatures, timestamps, duplicate webhook receipts, organization-bound credentials, consent, sender/policy restrictions and independent human approval. No live provider, Railway ingress or production webhook delivery is claimed.

The Boss oversight and manager reporting introduced in Phase 8 remain read-only. Missing permissions do not become zero counts or expose restricted blocker details. Isolated tests do not establish real-domain session behavior, production monitoring, restoration, or verified integration credentials; those require an authorized deployment and operational evidence.
