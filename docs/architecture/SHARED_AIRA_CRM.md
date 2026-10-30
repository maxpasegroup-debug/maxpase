# Shared AIRA CRM identity and pipelines

Skill City uses the existing AIRA Labs `LABS_LEAD` and PBA/GenZ Builder `AIRA_CRM_LEAD` workflows. The authorized cross-brand queue combines them for an employee only after checking each division's permissions and assignment. A lead remains in its originating division and keeps its product-specific status, history, quotation and approval rules.

New consented leads share a company-scoped `AIRA_CRM_CONTACT` identity based on normalized email. Its source key is deterministic, and the record contains no contact name, email, phone or brand-specific notes. The lead payload stores its `contactId`. The same person may have separate product opportunities without duplicating the shared contact identity. The shared identity does not grant cross-brand read access. Existing leads remain readable; no automatic migration or merge changes their history. Legacy leads without `contactId` require a separately reviewed reconciliation before claiming complete historical deduplication.

Only authorized staff create, assign or update leads. The advisor may work an assigned product pipeline, while managers may view only permitted team records. Follow-ups and stage transitions retain the existing audit and optimistic version checks. A qualified lead is not a sale: product publication, quotations, admissions, payments and customer messages remain behind their own controls.

This phase does not send communications or merge private details between brands. Database-backed concurrency and isolation verification requires a dedicated disposable PostgreSQL test target.
