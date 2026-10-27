# MAXPASE workplace: Phase 3 Skill City shell

The existing `airaskillcity.com` gateway remains the single employee entry point. Server-side portal access is rechecked for each request. The available Advisor, Director and Labs Developer views are derived from current active scoped role and capability grants. A stale link to a revoked view redirects to the default authorized workspace; when no Skill City portal access remains, the session is sent to sign-in. The browser does not supply identity or role authority.

The shared shell shows the role switcher only when more than one view is currently authorized. It keeps the immediate queue first in document and keyboard order: Advisor follow-ups, Director decisions, or assigned Labs delivery work. Existing product drafts, CRM records, approval controls and staff onboarding actions retain their service-level authorization. The shell adds a skip link, visible focus, wrapping for long content and a compact horizontal switcher on narrow screens.

This phase grants no role, employment access, project assignment or agent execution authority. The isolated portal test covers mid-session role revocation and cross-company boundaries. A production-domain and physical-device visual review has not been performed.
