# Phase 7: Authorized cross-brand CRM queue

The Skill City workplace now reads existing `LABS_LEAD` and `AIRA_CRM_LEAD` `ExecutiveRecord` records into one bounded follow-up view. There is no new lead, contact, customer or pipeline table. The original Labs and AIRA CRM mutation services, record IDs, statuses and audit history remain authoritative.

`LABS_LEAD` records are labelled **AIRA Labs enquiries**. Individual Labs records have no structured product link, so this view does not assert that every Labs enquiry belongs to BGOS. PBA and GenZ Builder are identified only when their stored AIRA CRM payload product agrees with the record's division. Malformed or mismatched payloads are excluded from the displayed queue and counted as needing data review; no name, outcome or product is inferred. Draft product status is shown as recorded configuration, never as a sales or publication claim.

The advisor view requires an active, verified Skill City account, advisor role and the relevant division's `labs.sales.self` or `aira.crm.self` permission. It returns only that person's assigned open records. The manager/director view additionally requires division-specific `reporting.read` and `person.read`, plus `labs.sales.read` or `aira.crm.manage`; it returns only open records owned by current active direct reports with an active membership in that division or a company-descendants scope. Missing authorization is shown separately from an empty queue. Each pipeline is bounded to 30 displayed records, dated follow-ups first; a limit indicator prevents the shown count from being read as a company-wide total. Detail links use the existing advisor editing views; mutations still go through the source service's status, consent, scope, replay and audit controls.

## MY SOLAR ownership gate

No authoritative source currently maps MY SOLAR Solutions to a verified AIRA or other legal company, division, brand/product record, CRM source, product owner or assigned manager. Its pipeline is **NOT CONFIGURED** and is not included in this queue. Before adding it, the owner must approve and document:

1. The registered legal company and owning division/brand/product identity, with source evidence.
2. The responsible product owner, manager and verified accounts, including who may view, assign and update records.
3. The canonical CRM source and product-specific qualification/status rules, plus any migration/deduplication plan for existing records.
4. Consent, contact purpose, publication/commercial terms and independent approval authority.

Until those decisions and existing-record checks are complete, no MY SOLAR contacts, ownership assignments, outcomes or opportunities are created or inferred. Phase 7 does not publish products, send messages, alter permissions or change production data.
