# Browser And Device Checklist

Status: MANUAL VALIDATION. Computer-use inventory during Phase 10 returned no apps/browsers. No screenshots, browser clicks, device testing or assistive-technology certification are claimed.

- Test desktop 1440x900 and 1024x768, mobile 390x844 and 320x568, portrait/landscape and 200% zoom. Check long names/text, table-contained scrolling, selectors, dialogs and no overlapping labels/buttons.
- Prioritize director/executive Command Center, SIA, AIRA Command Center, Communications and Operations. Verify mobile attention/decision hierarchy, source links, empty/loading/error/unauthorized states and real authorized counts.
- Navigate entirely by keyboard. Verify visible focus, Skip to content, logical order, no traps, select/checkbox labels, icon button names, error alerts, pending button states and screen-reader headings/table semantics. Measure computed contrast in a real browser; do not infer full accessibility compliance from CSS.
- Login with approved test identities, verify secure host-only HttpOnly/SameSite cookies over HTTPS, logout, expired/revoked sessions, person/account suspension, privilege revocation without signing out and direct unauthorized URLs.
- Try cross-company/department/project filters and copied URLs. Verify hidden records do not affect counts, search, health, attention, decisions, communication or SIA context. Test canonical APP_ORIGIN/server-action CSRF rejection behind the actual proxy.
- Prepare a communication, inspect exact recipient/channel/content/purpose/company/risk/approval, submit and use independent human approval. Confirm explicitly; cancellation/archive/rejection prompts must work. A revised preview requires new approval; consent/contact/authority changes must block dispatch. Mock results must remain SIMULATED.
- Review every registered SIA tool and memory scope/expiry/review. Attempt prompt/memory injection and unauthorized high-impact execution. Approval alone must never execute a tool or communicate.
- Exercise finite processing and safe failure/retry states. UNKNOWN/SENDING must not be blindly retried. Inbound text must remain inert plain text.
- Confirm authenticated content is not cached by proxy/service worker/back navigation across users; check session switching and no sensitive details in browser payloads/console/error boundaries.

Record browser/OS/device versions, viewport, actual outcomes, reviewer, evidence location and unresolved findings. Live provider/device/production acceptance is distinct from local HTTP/SSR smoke results.

Wave 03 adds `docs/audit/BROWSER_E2E_ACCEPTANCE_CHECKLIST.md` with 14 concrete workflows plus the deployed proxy/security endpoint matrix. Every expected result/security/evidence/PASS-FAIL field is currently NOT RUN; browser and device acceptance remain MANUAL VALIDATION. Static CSS/form/loading fixes and service regressions do not fill those acceptance fields.
