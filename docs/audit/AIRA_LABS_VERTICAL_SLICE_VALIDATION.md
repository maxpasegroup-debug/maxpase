# AIRA Labs Vertical Slice: Validation and Activation Register

Status: **LOCAL IMPLEMENTATION / PRODUCTION ACTIVATION BLOCKED**. Date: 2026-10-14 (Asia/Calcutta). See [architecture](../architecture/AIRA_LABS_BUSINESS_OPERATIONS.md). The 265-entry dirty worktree predates this AIRA Labs task; it is preserved and unstaged.

## Implemented and tested locally

Public Labs landing and consented unassigned enquiry receipt; realm-scoped six-digit PIN login and first-change gate for an existing dedicated account; explicit lead assignment, qualification and follow-up; private draft quotations with exact decimal calculation; independent control-point approval and issuer gates; human-recorded client acceptance; canonical project/task delivery and internal reminders; transactional audit and duplicate protection. The workspace offers Overview, Sales, Projects, People, Finance, and Settings. Test data uses disposable isolated SQLite databases and synthetic identities.

The service and UI checks cover company and owner isolation, forged actor rejection, stale/replayed commands, reminder recipient rechecks, quote ownership transfer, legal-issuer gate, approval independence, completion evidence and audit rollback. The current private quote download is HTML. Acceptance evidence is entered by an authorized manager and is not an electronic signature or verified provider receipt. This task did not provision a director or seed approved business data into the local preview.

## Awaiting owner decisions

| Decision | Owner to nominate | Evidence needed | Status |
| --- | --- | --- | --- |
| Director account and authority | AIRA Skill City authorized access owner | Existing dedicated account, current Labs membership and approved scoped grants for `director@airalabs.online` | PENDING |
| Sales advisors and developer assignments | Labs operating manager | Verified current employee accounts, role appointments and project/task scope | PENDING |
| Independent quote approver | Commercial authority owner | Appointed human account, independent review chain, permitted scope and approval policy | PENDING |
| Enquiry owner and response process | Labs operating manager | Authorized assignment roster and service-response expectations | PENDING |
| Legal issuer and tax basis | Company legal/finance owner | Registered legal name, address, tax registration, tax treatment, approval evidence and allowed rates | NOT VERIFIED |
| Customer acceptance process | Commercial authority owner | Approved format for client acceptance reference, identity/evidence retention and consent | PENDING |
| Dual Jobs/Labs employee access | Identity/access owner | Reviewed account/person/realm model without credential sharing or unauthorized conversion | PENDING |

No existing account or draft record proves any appointment or approval. Current live personnel records were not queried or changed.

## Awaiting verified configuration

- Confirm the current company profile and legal evidence before setting its legal-verification flag, billing configuration, or issuer authority.
- Create and independently review the scoped quote control point; authorize its human approver. Until then, quotation draft and preview only.
- Enable `AIRALABS_INTAKE` only after a named owner and consent/response process exist. Disabled or absent configuration returns an explicit unavailable result.
- Provide the director's initial PIN only through secure local environment configuration to an authorized operator. The local provisioning script requires an already authorized dedicated account and verified operator session; it is not a production provisioning path.
- Establish a separately verified Labs commercial Resend sender, consent policy, delivery integration, and receipt handling before any external email. Existing Resend settings are Nice Jobs OTP-only. No live commercial email has been sent.
- Specify scheduler owner, cadence, monitoring and retry operation before automatic reminder processing. Manual bounded internal processing is available where authorized.

## Blocked from production activation

Real director/advisor/developer provisioning or permission changes; quote approval and formal issuance; outbound commercial messages; legal invoices/PDFs; payments or financial settlement; live customer acceptance verification; autonomous SIA actions; production deployment. The three Nice Jobs jobs remain their prior unpublished drafts. Nothing here authorizes publishing them or granting their pilot participants access.

This implementation covers an initial connected slice, not full CRM, full project management, HR, accounting, service catalogue, quote revision workflow, commercial outbox, or SIA automation. The People view is a current scoped account view; Finance is quotations and explicit unavailable states. Bounded lists and manual reminders require further operational scaling work before a larger live rollout.

## Validation record

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Focused Labs, Labs UI, Nice Jobs dashboard and portal regression | PASS | `npm.cmd test -- tests/labs.test.ts tests/labs-ui.test.ts tests/nicejobs-dashboard.test.ts tests/portals.test.ts`: 51 tests, 4 files, exit 0, isolated synthetic SQLite. |
| Full test suite | PASS | `npm.cmd test`: 664 tests, 48 files, exit 0 (716.38 seconds). |
| ESLint | PASS | `npm.cmd run lint`: exit 0. |
| TypeScript | PASS | `npm.cmd run typecheck`: exit 0 after the final approval-projection correction. |
| Prisma schema | PASS | `npm.cmd run prisma:validate`: exit 0; existing schema is valid. |
| Fresh migrations / repeat deploy / isolated restore | PASS | `npm.cmd run validate:migrations` completed earlier against isolated targets; no existing database was migrated. |
| Production build | PASS | `npm.cmd run build`: exit 0 against the confirmed isolated preview environment. |
| Local HTTP routes | PASS | `/sites/labs` and `/sites/labs/login` returned 200 from the isolated local preview. This is not a browser, DNS or TLS check. |
| Browser/device/keyboard/screen-reader | NOT RUN | No browser session or physical device was available in this task. HTTP route checks are not browser usability testing. |
| Live providers, DNS/TLS, production database, real account | NOT RUN | No external sender, production database, Railway, or real account was accessed. |

Do not treat this register as launch sign-off. Complete the owner decisions and verified configuration, then run an authorized pilot with real accounts and independent commercial/legal review.
