# Phase 4: Labs Customers and Startup Skool Students

## Domain boundaries

- `airalabs.online` uses the existing Labs PIN/session audience. A customer account requires an active Labs division membership with `organization.read` and `labs.customer.read`, a verified email, a dedicated Labs credential, and an explicit `LabsCustomerGrant` for each enquiry. The customer gateway never falls through to the staff workspace. Staff retain the existing Labs route unless they are customer-only accounts.
- Authorized Labs staff with `labs.customer.manage` may grant or revoke access from the enquiry. Granting requires the existing verified account's email to match the enquiry contact, plus human verification evidence. Email matching alone never grants access. Grant/revocation and audit event are transactional. No account is provisioned automatically.
- The customer view projects only linked enquiry fields, issued/accepted quotations with issuer and issuance timestamp, and linked Labs delivery stage. Drafts, approval requests, internal quote metadata, staff notes, task details, and other customers' records remain unavailable. A review-request label is informational; online client acceptance is not enabled.
- `airastartupskool.com` learner accounts without `program.manage` receive only their own active batch enrollments in active Startup Skool programmes. Learner access still requires the startup portal audience, active membership and `organization.read`. Staff with `program.manage` retain existing administrative portal views.
- `airaskillcity.com` remains the employee workplace. No customer or student account, role, enrollment, or PIN is created by this phase. Labs and Startup Skool portal sessions remain audience-scoped with separate cookies.

## Activation and gaps

- Apply the additive `LabsCustomerGrant` migration before activating the customer route. Assign customer and grant-management capabilities only after account identity and approval authority are verified. Rotate first-use Labs PINs and verify email before creating grants.
- The Senior Academic Advisor's BGOS lead queue already operates through Skill City. A shared PBA/Startup Skool relationship queue and student-specific follow-up assignments are not configured, so cross-product advising cannot be declared complete. No broad student roster access was added as a substitute.
- Startup Skool currently has enrollment/programme data, not a verified lesson/content player or completion tracker. This phase does not claim those functions exist.
- Test data is synthetic. Production customer identities, student enrollment, cross-domain TLS, and real-domain browser behavior require controlled pilot verification. Do not activate or publish draft products based on these views.
