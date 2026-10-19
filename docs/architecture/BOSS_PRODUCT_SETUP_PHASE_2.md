# Boss Company and Product Setup: Phase 2

Phase 2 extends the explicit `initializeGroupStructure` operator transaction. It is not run on page load or application startup. The AIRA company keeps its existing IDs and divisions. Product draft registration refuses an existing record with conflicting identity, division, brand or publication state; it never overwrites that record. New drafts are audited once and repeated initialization is idempotent.

| Product | Legal owner | Division | Brand link | Record state | Terms and authority |
| --- | --- | --- | --- | --- | --- |
| BGOS | AIRA SKILL CITY PRIVATE LIMITED | AIRA Labs | AIRA Labs | Reviewed draft; `CONCEPT` / `INACTIVE` | Commercial terms, product owner, independent approval authority and publication approval pending. |
| PBA | AIRA SKILL CITY PRIVATE LIMITED | AIRA Startup School | Startup School | Reviewed draft; `CONCEPT` / `INACTIVE` | Commercial terms, product owner, independent approval authority and publication approval pending. |
| GenZ Builder | AIRA SKILL CITY PRIVATE LIMITED | AIRA Skill Studio | No separate verified brand link | Reviewed draft; `CONCEPT` / `INACTIVE` | Commercial terms, product owner, independent approval authority and publication approval pending. |

These records express reviewed **ownership and draft identity**, not reviewed selling terms. The generic business editor cannot change these controlled slugs to `ACTIVE` or `LIVE`, or silently change their names, division or brand. A future publication workflow must validate approved terms, legal issuer, product owner, independent approver and audit evidence before enabling sales. No prices, benefits, targets, tax rules or external messages are configured here.

## In-house position requirement

`Senior Academic Advisor` is recorded in source-controlled draft configuration for AIRA SKILL CITY PRIVATE LIMITED. The owner-stated salary is **INR 18,000 per month** (`INR` 1,800,000 minor units). Its intended scope is BGOS, PBA and GenZ Builder. This is **not** a Nice Jobs part-time opportunity, employee account, employment agreement, payroll entry or wage obligation. Its manager person ID, agreement approval and payroll configuration are null. The existing canonical designation remains available, but assigning it to a person is a separate authorized action.

Before activation, verify the named employee and manager accounts, legal employment agreement and commencement date, salary and payroll policy, statutory requirements, reporting scope, decision authority and any product-specific training. A designated human approver must record evidence through an authorized workflow. Do not infer an appointment from a role name or email address.

## Gate and operator action

Running `scripts/initialize-group.ts` against a **verified authorized target** is required to persist these drafts. This phase ran only isolated tests; it did not mutate a shared or production database. The Boss view distinguishes registered draft records from not-configured records. Products remain unsellable through this setup, and no manager or owner is assigned. Live products, quotations, employment decisions and payroll require later reviewed controls.
