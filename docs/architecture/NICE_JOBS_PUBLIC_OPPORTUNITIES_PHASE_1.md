# Nice Jobs public opportunities - Phase 1

Job-to-training setup update (2026-10-11): the three current launch identities now have a guided checklist and mandatory Draft -> Ready for Review -> Approved -> Published gates, including active nominated reviewers, approval evidence, required role orientation and training outcomes. See [Job and Programme Setup](NICE_JOBS_JOB_PROGRAMME_SETUP_PHASE_1.md). Existing historical behavior below is retained where not superseded by that scoped gate. No real draft was published or approved by this implementation.

Current catalogue scope (2026-10-11): Junior Academic Advisor, Business Automation Manager and Defence Career Mentor only. The owner removed First Oppo and internships from the current scope. Landing/catalogue internship navigation is removed, legacy internship URLs redirect to jobs, and participant opportunity/search/Home reads exclude internship versions. Existing generic models and historical records are retained; no draft is published by this change.

Current authentication update (2026-10-10): [Nice Jobs Email Authentication](NICE_JOBS_EMAIL_AUTHENTICATION.md) replaces the original password-only signup/login experience with Resend email OTP and OTP-based password reset. The original Phase 1 implementation and validation below are historical; live sender/configuration and launch verification remain outstanding. Email proof does not authorize employment or pilot access.

## Model and publication

The catalogue uses existing NiceJobsTemplate and immutable published NiceJobsVersion records. The typed configuration.opportunity section separates legal employer, brand, business division, employment classification, eligibility, compensation, incentives, location, work arrangement and actual reporting manager. Canonical employer, brand and manager references are validated by the service. No duplicate model or new migration is needed.

DRAFT, PENDING_VERIFICATION, APPROVED and PUBLISHED coexist with the existing review/pause/archive lifecycle. Approval/publication require permission and complete employer evidence, engagement, compensation/incentive disclosures, location and actual manager. Returning an approved version to draft invalidates approval. Creation/submission recheck publication. Offers with opportunity metadata require confirmed employer, engagement and compensation before ready, issuance or acceptance; existing independent hiring approval remains mandatory.

Public output excludes private screening rules, employer evidence and manager identifiers. Draft, internal, paused, archived, historical and incomplete published records cannot be applied to. Unavailable data is distinct from an empty catalogue.

## Applicant access

Apply Now preserves the selected opportunity through signup/login. Signup creates one canonical Person/User and an audited non-descendant Career Hub applicant membership with only organization.read, nicejobs.application.self, notification.read and sia.access.read. An expanded/inactive applicant role fails closed. Existing identities are not merged or taken over. Passwords are hashed; signup/login are rate limited; mutations use session identity and origin checks. Applicant identities and sessions are Nice Jobs realm only.

Contact ownership remains explicitly UNVERIFIED. No email/SMS verification or account-recovery provider is integrated. Application access is not verified identity, employment or a guaranteed offer. Reserved boss addresses cannot self-register. The future Nice Jobs Boss PIN account is not provisioned in this phase.

The form supports guided questions, save draft, review and explicit submission. Applicant SIA is a read-only deterministic evidence tool, get_application_guide, with a separate APPLICANT audience. It explains owned application status, form hints and published terms, excluding private answers, scores, management notes and other applicants. Human permission and explicitly configured agent/tool grants must intersect. The UI reports unavailable assistance when configuration is absent. No live language model, automatic answers, submission, approval or worker activation is implied.

## Owner-supplied drafts

The authorized transactional seedInitialOpportunities command creates three drafts idempotently. It refuses to overwrite modified drafts; only a pristine legacy Junior Academic Advisor stub can be upgraded in place. Descriptions and eligibility use owner-supplied text. No compensation figures, benefits, manager names or locations are invented.

- Junior Academic Advisor: AIRA Skill City Private Limited; Academic Advisory / Admissions function. Performance-based; no fixed salary intended subject to applicable legal requirements. Confirm canonical division mapping, employment classification, legally compliant compensation/incentives, commission verification and payment schedule, location, arrangement and actual manager.
- Business Automation Manager: AIRA Skill City Private Limited is the legal employer; AIRA Labs is its linked brand/division. Confirm classification/engagement, compensation/incentives, location, arrangement and actual manager.
- Defence Career Mentor: Nidus Academy is an employer label only; registered legal name/entity evidence and recruitment relationship remain unconfirmed. Career Hub is recruitment scope, not proof that Nidus is an AIRA division. External-employer recruitment is not currently authorized. Establish canonical employer relationship and authority, then classification, compensation, location, arrangement and manager.

AIRA employer evidence records owner confirmation, not government-registry verification. The performance-only model requires appropriate legal review before publication; this implementation does not certify legality.

## Scope

No new payroll, CRM, finance, messaging delivery, challenge-level engine or autonomous SIA execution is introduced. Existing onboarding/OJT, wallet and offer engines remain in place. Regression fixtures use synthetic confirmed opportunities in isolated databases, not real published vacancies.
