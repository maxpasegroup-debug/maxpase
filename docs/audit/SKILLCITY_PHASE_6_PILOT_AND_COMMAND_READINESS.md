# Skill City Phase 6: pilot and command readiness

Status: **BLOCKED for real pilot and staff traffic migration**. This register records local evidence only. No production account, role, listing, compensation policy, customer record or deployment was changed.

## Implemented control surface

- `maxpase.com` uses the existing Boss-only account and explicit provisioning path. Provisioning is operator-initiated; the dashboard does not create or reset Boss credentials.
- The Boss Companies view now shows the mapped company, division, product and brand hierarchy as a grid. Each mapped unit opens a Boss-only scoped command centre. Missing registry records remain labelled not configured; recorded website values are not proof of DNS or TLS.
- Unit command centres link to the existing People & Access, work and approvals modules with company return context and the unit scope. Their server-side read requires Boss authority and scoped company permissions. HR continues to use audited person, account, membership and role actions. A person record alone cannot sign in.
- Local host-header requests returned HTTP 200 for `maxpase.com`, `airaskillcity.com`, `airastartupskool.com`, `airalabs.online` and `nicejobs.online` against the running development server. This is routing smoke evidence, not live domain or certificate verification.

## Pilot gates

| Flow or gate | Local evidence | Real pilot status / next action |
| --- | --- | --- |
| Advisor BGOS queue | Existing Labs assigned-lead flow and isolated SIA read-only tests | **BLOCKED**: confirm an authorized Senior Academic Advisor account, manager and real lead scope. |
| Advisor PBA and GenZ Builder queues | Dashboard currently reports these pipelines as not configured | **BLOCKED**: implement and approve product-specific pipelines on the shared CRM foundation before a three-pipeline pilot. |
| One Labs developer project | Existing assignment-scoped developer view | **BLOCKED**: verify developer identity, director assignment and an approved test project. |
| Director decisions and Boss directives | Isolated NEXA/SIA replay, authorization, approval and audit tests | **BLOCKED**: nominate verified director and independent approver accounts; approve scope and test instruction. |
| Labs customer isolation | Existing explicit customer grant and revocation tests | **BLOCKED**: identify consenting pilot customer accounts and confirm access to only their own records. |
| Domain sessions and revocation | Isolated portal realm and access tests; local host routing smoke | **NOT VERIFIED** on deployed domains; test live TLS, cookies, logout and revocation with authorized accounts. |
| HR and portal activation | Existing audited People, Accounts, Memberships and Roles controls | **BLOCKED**: verify each employee, approve role/scope, establish credential delivery and verify domain sign-in. No automatic account activation from a person record. |
| Real-data reporting | Boss and director views derive from authorized records | **NOT VERIFIED** with pilot records. Confirm source quality, freshness and manager interpretation. |
| Mobile, keyboard and screen reader | Responsive CSS added for hierarchy and command tiles | **NOT VERIFIED** in a browser or on physical devices; complete accessibility and mobile walkthroughs. |
| Employment, commercial and financial decisions | Existing human approval and execution boundaries | **BLOCKED** until authorized approvers, terms and audit evidence are confirmed. NEXA/SIA have no autonomous approval or payment authority. |

Do not move staff traffic or claim the Phase 6 completion gate until every blocked pilot flow is evidenced and signed off by accountable human owners. The new command-centre grid is navigation and scoped control, not proof that any product, domain, role or account is production-ready.
