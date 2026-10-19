# Skill City Employee Workspaces: Phase 3

The `airaskillcity.com` gateway now has three focused employee views. A valid Skill City session, active AIRA membership, matching in-scope designation and the required live permissions are all necessary. The requested `view` parameter does not grant access. Every mutation repeats the view gate server-side, and existing domain services perform resource and transition authorization again. No account, role, manager or project assignment was created by this phase.

| View | Real records and actions | Deliberately unavailable |
| --- | --- | --- |
| Senior Academic Advisor | Own open `LABS_LEAD` records from AIRA Labs, ordered for follow-up; outcome, qualification and next follow-up can be recorded through the existing Labs transition, reminder, replay and audit rules. BGOS/PBA/GenZ product draft status is read only. | PBA and GenZ Builder lead pipelines, approved sales scripts, SIA call plans, manager coaching and any compensation/employment action. |
| Director | Scoped AIRA division project/task/program/membership and blocker signals; assigned pending approvals can be decided with a reason through the existing approval service and independent control-point checks. | Director-to-SIA instruction processing, broad CRM sales reporting where no source exists, financial or production execution by approval alone. |
| Labs Developer | Own Labs delivery projects, assigned/unassigned project tasks, specifications and recorded review/acceptance evidence. Permitted task updates use the existing Labs project/task service, replay protection and audit. | Other divisions' sales or student records, project assignment from an unverified director, and customer-facing acceptance decisions. |

Existing Labs portal routes and sessions remain untouched. The Labs service accepts a separate Skill City entry only after checking the Skill City realm and AIRA Labs organization permission; its original Labs entry retains its own realm. This is **not** a live staff-account migration. Accounts marked for the Labs realm cannot silently sign in to Skill City; the Phase 1 identity/record/rollback inventory is still a prerequisite to moving them. Customer access is not changed.

The role names are display gates, not independent authority. Senior Advisor requires `labs.sales.self`; Developer requires `labs.delivery.assignee`; Director requires AIRA company `organization.manage` and `executive.read`. Each read/action additionally checks its own permissions and scope. Manager feedback and SIA guidance are not fabricated. The existing product drafts are `CONCEPT`/`INACTIVE`; recording a follow-up does not authorize a product sale or quote.

## Completion gate

The code supports real Labs follow-ups, developer task updates and assigned human approval decisions under a Skill City session. The full "normal day" gate is **BLOCKED** until verified staff identities and memberships are assigned, shared CRM pipelines for PBA and GenZ Builder exist, approved product and manager guidance is available, and the SIA instruction/coaching boundary is implemented and reviewed. No production account or data mutation occurred in this phase.
