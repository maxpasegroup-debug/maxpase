import Link from "next/link";
import { Bell, BookOpen, BriefcaseBusiness, ChevronDown, CircleHelp, Compass, FileText, GraduationCap, House, ListChecks, LogOut, Menu, Search, UserRound, Wallet } from "lucide-react";
import { dashboardSection, dashboardSections } from "@/lib/nicejobs-dashboard";
import type { ReactNode } from "react";

const icons = [House, ListChecks, Search, GraduationCap, Wallet, UserRound, CircleHelp];
const candidateSections = [
  { key: "home", title: "Home", icon: House },
  { key: "opportunities", title: "Explore", icon: Compass },
  { key: "my-applications", title: "Applications", icon: FileText },
  { key: "worker-profile", title: "Profile", icon: UserRound }
] as const;

export function DashboardShell({ base, view, name, email, search = "", unread, logout, children, candidate = false }: { base: string; view: string; name: string; email: string; search?: string; unread: number | null; logout: ReactNode; children: ReactNode; candidate?: boolean }) {
  const navigation = candidate ? candidateSections : dashboardSections.map(([key, title], i) => ({ key, title, icon: icons[i] }));
  const active = (key: string) => candidate ? (view === "overview" ? "home" : view) === key : dashboardSection(view) === key;
  const links = navigation.map(({ key, title, icon: Icon }) => <Link prefetch={false} key={key} href={`${base}?view=${key}`} aria-current={active(key) ? "page" : undefined}><Icon size={20} aria-hidden="true" /><span>{title}</span></Link>);
  return <div className={`nj-dashboard${candidate ? " nj-dashboard-candidate" : ""}`}>
    <a className="nj-dashboard-skip" href="#nicejobs-main">Skip to content</a>
    <aside className="nj-dashboard-sidebar"><Link href={`${base}?view=home`} className="nj-dashboard-brand"><span><BriefcaseBusiness size={22} aria-hidden="true" /></span><div>Nice Jobs<small>{candidate ? "Find your next step." : "Work. Learn. Earn."}</small></div></Link><nav aria-label="Nice Jobs">{links}</nav><div className="nj-dashboard-sidebar-footer">{!candidate && <label htmlFor="nj-language">Language<select id="nj-language" defaultValue="en"><option value="en">English</option><option value="ml" disabled>Malayalam (not available yet)</option></select></label>}<div className="nj-dashboard-logout"><LogOut size={19} aria-hidden="true" />{logout}</div></div></aside>
    <div className="nj-dashboard-main"><header className="nj-dashboard-header"><details className="nj-dashboard-menu"><summary aria-label="Open navigation"><Menu size={22} aria-hidden="true" /><span>Nice Jobs</span></summary><nav aria-label="Mobile Nice Jobs">{links}{!candidate && <Link href={`${base}?view=worker-resources`}><BookOpen size={20} aria-hidden="true" />Resources</Link>}{logout}</nav></details>{!candidate && <form action={base} method="get" role="search"><input type="hidden" name="view" value="search" /><label className="sr-only" htmlFor="nj-search">Search jobs, training and resources</label><Search size={19} aria-hidden="true" /><input key={search} id="nj-search" name="search" type="search" maxLength={120} defaultValue={search} placeholder="Search jobs, training or resources..." /><button type="submit" className="nj-icon-button" aria-label="Search"><Search size={19} aria-hidden="true" /></button></form>}<Link className="nj-dashboard-bell" href={`${base}?view=notifications`} aria-label={unread === null ? "Notifications; unread status unavailable" : `Notifications; ${unread} unread`}><Bell size={22} aria-hidden="true" />{unread !== null && unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}</Link><details className="nj-dashboard-account"><summary aria-label={`Account menu for ${name}`}><span className="nj-dashboard-avatar" aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</span><span>Hi, {name}<small>Your Nice Jobs account</small></span><ChevronDown size={16} aria-hidden="true" /></summary><div><p>{email}</p><Link href={`${base}?view=worker-profile`}>My profile</Link>{logout}</div></details></header>
      <main id="nicejobs-main" className="nj-dashboard-content" tabIndex={-1}>{children}</main>
      <nav className="nj-dashboard-bottom" aria-label="Quick navigation">{candidate ? candidateSections.map(({ key, title, icon: Icon }) => <Link prefetch={false} key={key} href={`${base}?view=${key}`} aria-current={active(key) ? "page" : undefined}><Icon size={21} aria-hidden="true" /><span>{title}</span></Link>) : [0, 1, 3, 4, 5].map(i => { const [key] = dashboardSections[i]; const Icon = icons[i]; return <Link prefetch={false} key={key} href={`${base}?view=${key}`} aria-current={dashboardSection(view) === key ? "page" : undefined}><Icon size={21} aria-hidden="true" /><span>{["Home", "Work", "Learn", "Earnings", "Profile"][[0, 1, 3, 4, 5].indexOf(i)]}</span></Link>; })}</nav>
    </div>
  </div>;
}
