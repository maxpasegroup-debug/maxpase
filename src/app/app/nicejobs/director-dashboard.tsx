import Image from "next/image";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Bell, BriefcaseBusiness, CalendarDays, ChevronDown, CircleDollarSign, CircleHelp, CloudUpload, GraduationCap, LayoutDashboard, LockKeyhole, Menu, PlayCircle, Settings, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { niceJobsControlHref } from "@/lib/nicejobs-control-navigation";
import { portalLogoutAction } from "@/app/sites/[site]/actions";
import { DirectorGreeting } from "./director-greeting";
import { BossSia } from "./boss-sia";
import type { workforceCommandCenter } from "@/server/nicejobs/command-center";

type Overview = Awaited<ReturnType<typeof workforceCommandCenter.overview>>;
type Entry = { view: string; label: string };
type Group = { key: string; label: string; entries: Entry[] };
type Assistance = { state: "AVAILABLE" | "NOT_CONFIGURED" | "NOT_AUTHORIZED"; siaId: string | null; organizationId: string };

const menu = [
  { label: "Overview", view: "office-admin", Icon: LayoutDashboard },
  { label: "Opportunities", view: "templates", Icon: BriefcaseBusiness },
  { label: "Participants", view: "active-workforce", Icon: UsersRound },
  { label: "Training & Tasks", view: "training-management", Icon: GraduationCap },
  { label: "Earnings", view: "finance-incentives", Icon: CircleDollarSign },
  { label: "Introduction Media", view: "intro-video", Icon: PlayCircle },
  { label: "Team & Access", view: null, Icon: ShieldCheck, unavailable: "Staff appointments and access are managed by the MAXPASE Boss through HR." },
  { label: "Settings", view: null, Icon: Settings, unavailable: "Director settings are not available for this role." },
] as const;

const quickActions = [
  { label: "Publish Introduction Audio", view: "intro-video", Icon: PlayCircle, tone: "violet" },
  { label: "Create Opportunity", view: "templates", Icon: BriefcaseBusiness, tone: "blue" },
  { label: "Add Participant", view: "active-workforce", Icon: UsersRound, tone: "teal", available: false, unavailable: "Participants enter through the approved application and activation workflow; direct creation is not available." },
  { label: "Create Training Task", view: "training-management", Icon: CalendarDays, tone: "green" },
  { label: "Upload Media", view: "content-management", Icon: CloudUpload, tone: "pink" },
] as const;

function displayCount(data: Overview, key: string) {
  const metric = data.metrics.find(item => item.key === key);
  if (!metric) return { value: "—", note: "Not available" };
  if (metric.state !== "AVAILABLE" || metric.value === null) return { value: "—", note: metric.state === "NOT_AUTHORIZED" ? "Not available for this role" : "Not configured" };
  return { value: new Intl.NumberFormat("en-IN").format(metric.value), note: metric.value === 1 ? "record" : "records" };
}

function displayIncentives(data: Overview) {
  const rows = data.incentiveTotals;
  if (rows === null) return { value: "—", note: "Not available for this role" };
  if (!rows.length) return { value: "—", note: "No posted incentives this month" };
  if (rows.length !== 1) return { value: `${rows.length} currencies`, note: "Open earnings for details" };
  const row = rows[0];
  const minor = row._sum.amountMinor;
  if (minor === null) return { value: "—", note: "No posted incentives this month" };
  const digits = new Intl.NumberFormat("en-IN", { style: "currency", currency: row.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const scaled = Number(minor) / 10 ** digits;
  if (!Number.isFinite(scaled) || !Number.isSafeInteger(Number(minor))) return { value: "View earnings", note: "Amount exceeds the summary range" };
  return { value: new Intl.NumberFormat("en-IN", { style: "currency", currency: row.currency, maximumFractionDigits: digits }).format(scaled), note: "Posted this month" };
}

function humanAction(action: string) {
  const label = action.replace(/^nicejobs\./, "").replace(/[._]+/g, " ").trim();
  return label ? label[0].toUpperCase() + label.slice(1) : "Workspace updated";
}

export function DirectorWorkspaceShell({ children, groups, activeView, base, company, division, query }: { children: React.ReactNode; groups: Group[]; activeView: string; base: string; company: string; division: string; query: Record<string, string | string[] | undefined> }) {
  const hasView = (view: string) => groups.some(group => group.entries.some(entry => entry.view === view));
  const href = (view: string) => niceJobsControlHref(base, view, query);
  const navigation = (mobile = false) => <nav className={mobile ? "nj-director-mobile-nav" : "nj-director-nav"} aria-label="NICEJOBS Director navigation">
    {menu.map(item => {
      const Icon = item.Icon;
      const available = item.view !== null && hasView(item.view);
      return available
        ? <Link key={item.label} href={href(item.view!)} aria-current={activeView === item.view ? "page" : undefined}><Icon size={21} aria-hidden="true"/><span>{item.label}</span></Link>
        : <span key={item.label} className="nj-director-nav-disabled" aria-disabled="true" title={"unavailable" in item ? item.unavailable : "This workspace is not assigned to your account."}><Icon size={21} aria-hidden="true"/><span>{item.label}</span><LockKeyhole className="nj-director-lock" size={13} aria-hidden="true"/></span>;
    })}
  </nav>;

  return <div className="nj-director-shell">
    <aside className="nj-director-sidebar">
      <Link className="nj-director-brand" href={base} aria-label="NICEJOBS Director overview"><span className="nj-director-brand-mark" aria-hidden="true">N</span><span><strong>NICEJOBS<sup>™</sup></strong><small>Career Hub by AIRA Skill City</small></span></Link>
      {navigation()}
      <div className="nj-director-company"><Image src="/images/aira-skillcity-logo.png" alt="" width={44} height={44}/><span><strong>AIRA Skill City Pvt. Ltd.</strong><small>{company}<br/>Career Hub operating unit</small></span></div>
    </aside>
    <div className="nj-director-app">
      <header className="nj-director-topbar">
        <details className="nj-director-mobile-menu"><summary aria-label="Open navigation"><Menu size={21}/><span>Menu</span></summary><div>{navigation(true)}</div></details>
        <div className="nj-director-heading"><strong><span>NICEJOBS</span> Director</strong><small>AI-assisted Career Hub Operations</small></div>
        <div className="nj-director-top-actions">
          <details className="nj-director-notifications"><summary aria-label="Notifications"><Bell size={21}/></summary><div><strong>Notifications</strong><p>Notifications are not available in this workspace yet.</p></div></details>
          <details className="nj-director-help"><summary aria-label="Help"><CircleHelp size={22}/></summary><div><strong>Director help</strong><p>Open a workspace from the menu. Ask the MAXPASE Boss for access you need.</p></div></details>
          <details className="nj-director-profile"><summary><span className="nj-director-avatar">D</span><span>Director</span><ChevronDown size={16}/></summary><div><strong>{company}</strong><small>{division}</small><form action={portalLogoutAction}><input type="hidden" name="site" value="jobs"/><button type="submit">Sign out</button></form></div></details>
        </div>
      </header>
      <main className="nj-director-main">{children}</main>
    </div>
  </div>;
}

export function DirectorDashboard({ groups, base, query, data, assistance, realm, division, canCreateOpportunity, canManageResources, canManageTraining }: { groups: Group[]; base: string; query: Record<string, string | string[] | undefined>; data: Overview; assistance: Assistance; realm: string; division: string; canCreateOpportunity: boolean; canManageResources: boolean; canManageTraining: boolean }) {
  const hasView = (view: string) => groups.some(group => group.entries.some(entry => entry.view === view));
  const actionHref = (view: string) => {
    const target = new URL(niceJobsControlHref(base, view, query), "https://nicejobs.local");
    if (view === "content-management") target.searchParams.set("kind", "RESOURCE");
    return target.pathname + target.search;
  };
  const metrics = [
    { key: "workers", label: "Total Participants", Icon: UsersRound, tone: "blue", ...displayCount(data, "workers"), view: "active-workforce" },
    { key: "opportunities", label: "Active Opportunities", Icon: BriefcaseBusiness, tone: "violet", ...displayCount(data, "opportunities"), view: "published" },
    { key: "inTraining", label: "In Training", Icon: GraduationCap, tone: "gold", ...displayCount(data, "inTraining"), view: "training-management" },
    { key: "incentives", label: "Total Incentives (MTD)", Icon: CircleDollarSign, tone: "mint", ...displayIncentives(data), view: "finance-incentives" },
  ];
  return <section className="nj-director-dashboard">
    <section className="nj-director-welcome" aria-labelledby="director-welcome-title">
      <div className="nj-director-orb" aria-hidden="true"><span/></div>
      <div><p className="nj-director-eyebrow">{division}</p><DirectorGreeting/><h2 id="director-welcome-title">Your NICEJOBS workspace is ready.</h2><p>Manage opportunities, participants, training and introductions with the access assigned to you.</p></div>
    </section>
    <section className={`nj-director-ai ${assistance.state === "AVAILABLE" ? "is-ready" : "is-unavailable"}`} aria-label="NICEJOBS AI assistance">
      <Sparkles size={23} aria-hidden="true"/><div><strong>{assistance.state === "AVAILABLE" ? "AI operations support" : "AI assistant unavailable"}</strong><span>{assistance.state === "AVAILABLE" ? "Prepare a read-only operational review from your authorized data." : "AI support is not configured for this Director workspace."}</span></div>
      {assistance.state === "AVAILABLE" ? <BossSia realm={realm} base={base} companyId={data.companyId} divisionId={data.divisionId} requestKey={randomUUID()}/> : <span className="nj-director-ai-status">Unavailable</span>}
    </section>
    <section className="nj-director-section">
      <header className="nj-director-section-title"><h2><Sparkles size={20} aria-hidden="true"/>Quick Actions</h2><span>Start a common task</span></header>
      <div className="nj-director-quick-actions">{quickActions.map(action => {
        const Icon = action.Icon;
        const permission = action.label === "Create Opportunity" ? canCreateOpportunity : action.label === "Upload Media" ? canManageResources : action.label === "Create Training Task" ? canManageTraining : true;
        const available = hasView(action.view) && permission && (!("available" in action) || action.available);
        return available
          ? <Link key={action.label} className={`nj-director-action tone-${action.tone}`} href={actionHref(action.view)}><Icon size={28} aria-hidden="true"/><strong>{action.label}</strong><span aria-hidden="true">→</span></Link>
          : <div key={action.label} className={`nj-director-action tone-${action.tone} is-locked`} aria-disabled="true" title={("unavailable" in action && action.unavailable) || (hasView(action.view) ? "Direct participant creation is not available." : "This action requires an additional permission.")}><Icon size={28} aria-hidden="true"/><strong>{action.label}</strong><LockKeyhole size={15} aria-label="Unavailable"/></div>;
      })}</div>
    </section>
    <section className="nj-director-metrics" aria-label="Performance snapshot">{metrics.map(metric => {
      const Icon = metric.Icon;
      const allowed = hasView(metric.view);
      const content = <><span className={`nj-director-metric-icon tone-${metric.tone}`}><Icon size={26} aria-hidden="true"/></span><span className="nj-director-metric-copy"><small>{metric.label}</small><strong>{metric.value}</strong><em>{metric.note}</em></span></>;
      return allowed ? <Link className="nj-director-metric" key={metric.key} href={actionHref(metric.view)}>{content}</Link> : <div className="nj-director-metric" key={metric.key}>{content}</div>;
    })}</section>
    <div className="nj-director-bottom-grid">
      <section className="nj-director-panel"><header><h2><span className="nj-director-panel-symbol">◷</span>Recent Activity</h2>{hasView("workforce-command") && <Link href={actionHref("workforce-command")}>View all →</Link>}</header>
        {!data.activity ? <p className="nj-director-empty">Activity history is not available for this role.</p> : data.activity.length ? <ul className="nj-director-list">{data.activity.map(item => <li key={item.id}><span className="nj-director-list-icon"><Sparkles size={17}/></span><span className="nj-director-list-copy"><strong>{humanAction(item.action)}</strong><small>{item.entityType}</small></span><time dateTime={item.createdAt.toISOString()}>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}</time></li>)}</ul> : <p className="nj-director-empty">No recent NICEJOBS activity has been recorded.</p>}
      </section>
      <section className="nj-director-panel"><header><h2><CalendarDays size={20} aria-hidden="true"/>Upcoming Tasks</h2>{hasView("training-management") && <Link href={actionHref("training-management")}>Open tasks →</Link>}</header>
        {data.upcomingTasks === null ? <p className="nj-director-empty">Task details are not available for this role.</p> : data.upcomingTasks.length ? <ul className="nj-director-list nj-director-task-list">{data.upcomingTasks.map(task => <li key={task.id}><span className="nj-director-checkbox" aria-hidden="true"/><Link className="nj-director-task-title" href={niceJobsControlHref(base, "worker-detail", query) + `&assignmentId=${encodeURIComponent(task.niceJobsAssignmentId ?? "")}`}>{task.title}</Link><time dateTime={task.dueDate?.toISOString()}>{task.dueDate ? new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric" }).format(task.dueDate) : "Scheduled"}</time></li>)}</ul> : <p className="nj-director-empty">No tasks are due in the next seven days.</p>}
      </section>
    </div>
    <p className="nj-director-footnote" id="director-help">Financial figures and activity appear only when the account has permission to view them. Staff access is managed by the MAXPASE Boss.</p>
  </section>;
}
