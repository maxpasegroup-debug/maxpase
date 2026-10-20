import Link from "next/link";
import { Bell, BriefcaseBusiness, ChevronDown, CircleHelp, Compass, LogOut, Target, UserRound, Wallet } from "lucide-react";
import { dashboardSection } from "@/lib/nicejobs-dashboard";
import type { ReactNode } from "react";

const primary = [
  { key: "home", title: "My Workspace", icon: BriefcaseBusiness },
  { key: "opportunities", title: "Marketplace", icon: Compass },
  { key: "worker-wallet", title: "Wallet", icon: Wallet }
] as const;

export function DashboardShell({ base, view, name, email, unread, logout, children, candidate = false }: { base: string; view: string; name: string; email: string; search?: string; unread: number | null; logout: ReactNode; children: ReactNode; candidate?: boolean }) {
  const active = (key: string) => key === "home" ? ["home", "overview", "my-work", "job-space", "my-applications", "my-onboarding", "my-day", "vision"].includes(view) || dashboardSection(view) === "my-work" : key === "worker-wallet" ? dashboardSection(view) === "worker-wallet" : view === "opportunities";
  const links = primary.map(({ key, title, icon: Icon }) => <Link prefetch={false} key={key} href={`${base}?view=${key}`} aria-current={active(key) ? "page" : undefined}><Icon size={20} aria-hidden="true" /><span>{title}</span></Link>);
  return <div className={`nj-dashboard nj-dashboard-unified${candidate ? " nj-dashboard-candidate" : ""}`}>
    <a className="nj-dashboard-skip" href="#nicejobs-main">Skip to content</a>
    <header className="nj-dashboard-header"><Link href={`${base}?view=home`} className="nj-dashboard-brand"><span><BriefcaseBusiness size={21} aria-hidden="true" /></span><strong>Nice Jobs<small>Work. Learn. Earn.</small></strong></Link>
      <nav className="nj-dashboard-primary" aria-label="Nice Jobs">{links}</nav>
      <div className="nj-dashboard-tools"><Link className="nj-dashboard-bell" href={`${base}?view=notifications`} aria-label={unread === null ? "Notifications; unread status unavailable" : `Notifications; ${unread} unread`}><Bell size={21} aria-hidden="true" />{unread !== null && unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}</Link>
        <details className="nj-dashboard-account"><summary aria-label={`Account menu for ${name}`}><span className="nj-dashboard-avatar" aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</span><span>{name}<small>My account</small></span><ChevronDown size={16} aria-hidden="true" /></summary><div><p>{email}</p><Link href={`${base}?view=worker-profile`}><UserRound size={18} aria-hidden="true" /> Profile</Link><Link href={`${base}?view=vision`}><Target size={18} aria-hidden="true" /> My goals</Link><Link href={`${base}?view=worker-help`}><CircleHelp size={18} aria-hidden="true" /> Help</Link><div className="nj-dashboard-signout"><LogOut size={18} aria-hidden="true" />{logout}</div></div></details></div>
    </header>
    <main id="nicejobs-main" className="nj-dashboard-content" tabIndex={-1}>{children}</main>
    <nav className="nj-dashboard-bottom" aria-label="Quick navigation">{links}</nav>
  </div>;
}
