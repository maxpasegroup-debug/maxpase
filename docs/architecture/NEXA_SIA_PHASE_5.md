# NEXA and SIA Phase 5

## Identity and visibility

NEXA is a distinct private group identity in `NexaIdentity`, not a User, SIA identity, role, or authorization principal. Only the authenticated Boss can read the private Boss instruction and structured group plan through the Boss command desk. The plan is a deterministic structured draft of the Boss's own instruction; no model-generated reasoning is claimed. Directors see only their assigned company brief, SIA preparation, decision history and controlled action outcome. No NEXA persona is exposed in the Skill City workplace. Operational events retain the real Boss/director user IDs, organization scope, opaque directive ID, and separate SIA/action IDs. Audit readers may inspect real actor provenance; hiding the persona from ordinary users is not falsifying audit identity.

## Controlled flow

1. The Boss selects an active group company and a verified, active director account appointed in that exact company. `boss.access`, `executive.read`, company `organization.read`, and `decision.manage` are rechecked. A replay key binds the complete instruction and brief.
2. A `NexaDirective` records source `BOSS_INSTRUCTION`, group plan, company, responsible director, state `DIRECTOR_REVIEW`, and audit event in one transaction. NEXA gains no capabilities or tool access.
3. The assigned director may request read-only SIA preparation only if an active SIA identity, enabled `get_company_overview` tool, and human/agent intersected permission permit it. The bounded facts and recommendations are stored with source and timestamp. State becomes `PREPARED`.
4. The same currently authorized director explicitly approves or rejects the preparation with a reason. Approval means permission to seek the next control, not execution authority. Optimistic version checks and transactions prevent replay or partial audit.
5. An approved director may propose a `create_task` action only through the existing SIA service and an active independent task approval control point. The request, action, directive link and audit are committed together. Existing request submission, independent human approval, current tool authorization, explicit human execution confirmation, result verification and execution audit remain mandatory. This phase adds no NEXA executor, no payroll/quotation/payment/deployment action, and no autonomous SIA execution.

## Advisor assistance

`get_advisor_day` is a disabled-by-default read-only SIA tool requiring `labs.sales.self` and a verified Senior Academic Advisor workplace. Its deterministic context is limited to the authenticated advisor's 30-record assigned Labs queue, with due follow-ups, draft coaching, evidence references, bounded coverage and explicit limitations. It never contacts prospects or changes lead status. PBA and GenZ Builder pipelines are not represented as configured. Without an active SIA identity, agent role, enabled tool and matching human grant, the workplace says assistance is unavailable.

## Operational constraints

No production identity, director appointment, SIA tool, agent grant or control point is seeded by this phase. Private directive data is not returned by generic activity or SIA projections; generic audit events use opaque `GroupDirective` and `GroupAgent` references. Operators must apply the additive migration before enabling the feature. The Boss and director interfaces are separate authentication realms; server services reauthorize every mutation and read. Real director appointments, SIA grants, independent control policies, pilot accounts and deployment verification remain business/operational prerequisites.
