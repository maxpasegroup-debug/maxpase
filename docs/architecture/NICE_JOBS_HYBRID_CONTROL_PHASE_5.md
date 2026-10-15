# Nice Jobs Hybrid Control Panel

This is Career Hub experience Phase 5, not a replacement for the original Nice Jobs Phase 10 architecture. It composes existing services and adds no employment, finance, identity, messaging or approval models.

## Entry And Navigation

Corporate `/app/nicejobs` and the Jobs realm gateway use the same server-rendered panel. An account with current `nicejobs.command.read` opens the management overview by default. Other participants keep their own application/training/worker entry points. No email, PIN or role title grants panel access.

Six groups contain capability-filtered existing destinations: Overview, Opportunities, Applicants, Workforce, Earnings, System. Source services still enforce the exact record's authority. Navigation is not authorization. Company filters must match the canonical Nice Jobs company; direct division filters must have a permitted management destination. Cross-section links retain company/division but discard stale record IDs, status filters and cursors. Source record screens display actual record scope; the shell indicates selected filter context.

Shared lead details use an explicit management presentation marker only when entered through the management workspace. Shared knowledge details require the existing management presentation flag. Neither marker confers permission. Own lead, resource and SOP navigation remains outside the management shell.

## Preparation Versus Execution

The panel's SIA preparation is available only with a configured supported provider, active identity, enabled `get_workforce_command` registry entry and current human/agent intersection including executive and source reads. There is no automatically created identity, role grant or tool activation.

The existing audited `converse` path prepares a deterministic review agenda, recorded application eligibility/screening summaries (oldest ten, without private answers/contact details), source-backed exception observations and draft follow-up wording. Source counts are actual database counts. Summaries do not perform a new applicant evaluation or recommend hiring/rejection. Daily participant plans retain Phase 4 goal approval and actual assignments, rather than being silently assigned from this management agenda.

The result carries its current SiaRun and completion-audit identifiers. Replays retain existing fingerprint and live authority checks. No conversation executes offer, activation, compensation, ledger, payout, role or external-message mutations.

## Human Gates

- Opportunities retain publication validation, verified legal employer and compensation disclosure.
- Interviews, management reviews and offers use existing canonical approval and evidence gates.
- Acceptance retains immutable issuing employer, offer/policy versions and timestamps.
- Activation requires readiness evidence and a currently authorized independent human.
- Goal activation/material changes, compensation rules, incentive decisions and settlements retain their current manager/independent approval boundaries.
- Wallet posting and payout intentions remain distinct from confirmed external transfer. Skill levels never gate access to earned money.
- External messages remain immutable previews with actual scoped recipients, current consent/preferences, exact policy/control, independent approval and explicit human-confirmed dispatch.

## Automation Evidence

The allowlist remains internal notification/reminder actions only. Successful execution now records validated processor, rule owner, action permission, pinned published version and result in existing AutomationRun evidence, in the same transaction as the effect and audit. Owner and processor are separate identities even when the same person operates both.

Detail projections withhold account identifiers without `user.read` and audit identifiers without `audit.read`. Historical records without complete evidence show that authority was not recorded; no backfill invents it. Result/version/pair mismatches produce unavailable provenance. Existing execution authority, recipient checks, replay protection and audit rollback are unchanged.

There is no durable scheduler configured. Recorded schedules require explicit authorized processing. Live WhatsApp/email adapters and payout delivery remain unavailable; MOCK is never real delivery. This phase does not provision providers, add credentials, infer consent, dispatch messages, migrate production or deploy.

## Pilot Boundary

See [Pilot and Launch Gate](../audit/NICE_JOBS_PILOT_PHASE_6.md). Local isolated regressions are not a pilot with real managers/participants or production sign-off.
