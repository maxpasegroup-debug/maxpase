import NavLink from "./nav-link";
import { logoutAction } from "@/server/auth/actions";
import { requireSession } from "@/server/auth/guards";
import { enterAira } from "./aira/actions";
import { BOSS_EMAIL } from "@/server/group/identity";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <div className="brand-mark">
          <strong>MAXPASE OS</strong>
          <span>MAXPASE GROUP</span>
        </div>
        <nav className="nav-list" aria-label="Main navigation">
          {session.email === BOSS_EMAIL && <NavLink href="/app/boss">Boss Panel</NavLink>}
          <details className="workspace-navigation" open={session.email !== BOSS_EMAIL}><summary>Workspace</summary>
          <NavLink href="/app/executive">Command Center</NavLink>
          <NavLink href="/app/sia">SIA Virtual CEO</NavLink>
          <NavLink href="/app/communications">Communications</NavLink>
          <NavLink href="/app/business/groups">Group</NavLink>
          <NavLink href="/app/business/companies">Companies</NavLink>
          <form action={enterAira}><button className="company-context-button">AIRA Skill City</button></form>
          <NavLink href="/app/business/organizations">Organization structure</NavLink>
          <NavLink href="/app/business/relationships">Company relationships</NavLink>
          <NavLink href="/app/business/ownership">Ownership</NavLink>
          <NavLink href="/app/business/brands">Brands</NavLink>
          <NavLink href="/app/business/products">Products &amp; services</NavLink>
          <div className="nav-section"><span>Execution</span>
            <NavLink href="/app/execution">Overview</NavLink>
            <NavLink href="/app/execution/projects">Projects</NavLink>
            <NavLink href="/app/execution/milestones">Milestones</NavLink>
            <NavLink href="/app/execution/tasks">Tasks</NavLink>
            <NavLink href="/app/execution/goals">Goals</NavLink>
            <NavLink href="/app/execution/members">Project members</NavLink>
            <NavLink href="/app/execution/dependencies">Dependencies</NavLink>
            <NavLink href="/app/execution/blockers">Blockers</NavLink>
          </div>
          <div className="nav-section"><span>Operations</span>
            <NavLink href="/app/operations">Overview</NavLink>
            <NavLink href="/app/operations/my-tasks">My Tasks</NavLink>
            <NavLink href="/app/operations/approvals">Approvals</NavLink>
            <NavLink href="/app/operations/requests">Requests</NavLink>
            <NavLink href="/app/operations/notifications">Notifications</NavLink>
            <NavLink href="/app/operations/activity">Activity</NavLink>
            <NavLink href="/app/operations/workflows">Workflows</NavLink>
            <NavLink href="/app/operations/events">Operational Events</NavLink>
            <NavLink href="/app/operations/reminders">Reminders</NavLink>
            <NavLink href="/app/operations/escalations">Escalations</NavLink>
          </div>
          <div className="nav-section">
            <span>People &amp; access</span>
            <NavLink href="/app/workforce/people">People</NavLink>
            <NavLink href="/app/workforce/users">User accounts</NavLink>
            <NavLink href="/app/workforce/organizations">Organizations</NavLink>
            <NavLink href="/app/workforce/departments">Departments</NavLink>
            <NavLink href="/app/workforce/teams">Teams</NavLink>
            <NavLink href="/app/workforce/memberships">Memberships</NavLink>
            <NavLink href="/app/workforce/roles">Roles &amp; designations</NavLink>
            <NavLink href="/app/workforce/permissions">Capabilities</NavLink>
            <NavLink href="/app/workforce/access">Access &amp; role</NavLink>
            <NavLink href="/app/workforce/reporting">Reporting</NavLink>
            <NavLink href="/app/workforce/responsibilities">Responsibilities</NavLink>
            <NavLink href="/app/workforce/sia">SIA access</NavLink>
          </div>
          <NavLink href="/app/foundation">
            Foundation
          </NavLink>
          <NavLink href="/app/architecture">
            Architecture
          </NavLink>
          <NavLink href="/app/security">
            Security
          </NavLink>
          </details>
        </nav>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        <div className="topbar">
          <div>
            <p className="eyebrow">Authenticated shell</p>
            <p className="muted">{session.email}</p>
          </div>
          <form action={logoutAction}>
            <button className="button secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>
        {children}
      </main>
    </div>
  );
}
