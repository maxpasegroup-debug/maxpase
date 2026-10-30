# People and delivery assignments

Phase 4 uses the existing Person, User, Membership, ReportingRelationship, Responsibility, Program, Batch, Project, Task and TaskEvidence records. No parallel people or delivery register was introduced.

Within AIRA Skill City and its direct divisions, an **active** reporting relationship now requires both people to have active, email-verified accounts and current memberships in the exact organization scope. An active responsibility requires the same verified worker, a current active reporting relationship and a verified manager with current scope membership. Other companies retain their existing membership checks; this phase does not change Nice Jobs' phone/PIN access model. Inactive drafts and historical responsibilities remain readable; they do not grant access. Revoking a membership, account or manager relationship prevents subsequent AIRA active assignment changes and the normal authorization engine denies workspace operations using revoked access.

The People editor offers authorized programme and cohort targets alongside the existing product, project and goal targets. Only one target may be selected per responsibility. A cohort responsibility can be activated only against the matching independently approved Kerala pilot intake and its recorded decision history. A mentor assignment must also match the approved mentor account and evidence reference. These checks do not authorize enrolment, admission, compensation or payment.

Partner responsibilities can be prepared as inactive records. Activation remains blocked until a verifiable partner agreement and independent approval workflow exists. No partner identity or agreement has been inferred from a title. Tasks and evidence continue through the canonical execution and TaskEvidence services; assigning responsibility does not auto-create a task or assert evidence was submitted.

Dedicated PostgreSQL integration tests are needed to verify transactional assignment, revocation and cross-scope behavior against persisted records before release. No production records were changed during implementation.
