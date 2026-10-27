"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BarChart3, Bell, Bot, Building2, ChevronDown, ChevronRight, ClipboardList, Gavel, Grid2X2, LayoutDashboard, Menu, Search, Settings, Users, Wallet, X } from "lucide-react";
import { bossViews, groupForPath, isBossDestination, navigationBossHref, workspaceGroups, workspaceHref, workspacePageLabel } from "@/lib/workspace-navigation";
import { timezoneLabel } from "@/lib/timezone";
import { TimezoneContext } from "./ui/user-time";

const icons = [LayoutDashboard, Building2, ClipboardList, Gavel, Users, Settings];
const bossDestinations = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "companies", label: "Companies", icon: Building2 },
  { view: "people", label: "People", icon: Users },
  { view: "projects", label: "Projects", icon: ClipboardList },
  { view: "finance", label: "Finance", icon: Wallet },
  { view: "growth", label: "Growth", icon: BarChart3 },
  { view: "ai-office", label: "AI Office", icon: Bot },
  { view: "performance", label: "Reports", icon: BarChart3 },
  { view: "settings", label: "Settings", icon: Settings },
] as const;
type Props = { boss: boolean; email: string; name: string; timezone: string; unread: number | null; companies: { id: string; name: string }[]; children: React.ReactNode; logout: React.ReactNode };
export function WorkspaceShell({ boss, email, name, timezone, unread, companies, children, logout }: Props) {
  const path = usePathname(), query = useSearchParams(), group = groupForPath(path, query.get("view") ?? undefined);
  const companyId = query.get("companyId") ?? query.get("organization") ?? query.get("organizationId") ?? undefined;
  const company = companies.find(c => c.id === companyId);
  const view = query.get("view") ?? "overview";
  const onBossPage = boss && path === "/app/boss";
  const page = workspacePageLabel(path, view);
  const dialog = useRef<HTMLDialogElement>(null), menu = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => { dialog.current?.close(); setOpen(false); menu.current?.focus(); };
  useEffect(() => {
    const media = window.matchMedia("(min-width: 901px)");
    const resize = () => { if (media.matches) { dialog.current?.close(); setOpen(false); } };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  const groupHref = (key: string) => {
    const target = workspaceGroups.find(g => g.key === key)!;
    return boss ? navigationBossHref(target.views[0], new URLSearchParams(query.toString())) : workspaceHref(target.href, companyId);
  };
  const returnView = query.get("returnView");
  const backHref = boss ? navigationBossHref(returnView && isBossDestination(returnView) ? returnView : group.views[0], new URLSearchParams(query.toString())) : workspaceHref(group.href, companyId);
  function Navigation({ mobile = false }: { mobile?: boolean }) {
    return <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"}>
      <div className="workspace-primary">{boss ? bossDestinations.map(({view:target,label,icon:Icon}) => <Link prefetch={false} key={target} href={navigationBossHref(target,new URLSearchParams(query.toString()))} aria-current={path === "/app/boss" && view === target ? "page" : undefined} onClick={mobile?close:undefined}><Icon size={19}/>{label}</Link>) : workspaceGroups.map((g, i) => { const Icon = icons[i]; return <Link prefetch={false} key={g.key} href={groupHref(g.key)} aria-current={g.key === group.key ? "true" : undefined} onClick={mobile ? close : undefined}><Icon size={19}/>{g.label}</Link>; })}</div>
      {!onBossPage && <div className="workspace-secondary"><p>{group.label}</p>{boss && group.views.map(v => <Link prefetch={false} key={v} href={navigationBossHref(v, new URLSearchParams(query.toString()))} aria-current={path === "/app/boss" && view === v ? "page" : undefined} onClick={mobile ? close : undefined}>{bossViews[v]}</Link>)}
        <details key={group.key} open={!boss}><summary>Detailed modules<ChevronDown size={16} aria-hidden="true"/></summary>{group.modules.map(m => <Link prefetch={false} key={m.href} href={workspaceHref(m.href, companyId, path === "/app/boss" ? view : returnView ?? group.views[0], new URLSearchParams(query.toString()))} aria-current={path === m.href ? "page" : undefined} onClick={mobile ? close : undefined}>{m.label}</Link>)}</details>
      </div>}
    </nav>;
  }
  return <TimezoneContext.Provider value={timezone}><div className={`app-shell workspace-shell${boss ? " boss-shell" : ""}`}><a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar workspace-sidebar"><Link prefetch={false} className="workspace-brand" href={boss ? "/app/boss" : "/app/executive"}>{boss && <Grid2X2 size={27} aria-hidden="true"/>}<span>MAXPASE<small>{boss ? "GROUP" : "Group workspace"}</small></span></Link><Navigation/>{boss && <Link prefetch={false} className="boss-sidebar-nexa" href={navigationBossHref("nexa",new URLSearchParams(query.toString()))}><span className="boss-sidebar-orb" aria-hidden="true"><Bot size={21}/></span><span><strong>NEXA</strong><small>Executive Intelligence</small></span><ChevronRight size={16}/></Link>}<div className="workspace-sidebar-footer">MAXPASE GROUP</div></aside>
    <div className="workspace-stage"><header className="workspace-header"><button ref={menu} type="button" className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="workspace-drawer" aria-expanded={open} onClick={() => { dialog.current?.showModal(); setOpen(true); }}><Menu size={22}/></button><div className="workspace-context"><strong>{boss && path === "/app/boss" ? page : company?.name ?? (companyId ? "Selected scope" : "MAXPASE GROUP")}</strong><span>{company?.name ?? (companyId ? "Selected scope" : "Group scope")} / {timezoneLabel(timezone)}</span></div>{boss && <form className="boss-header-search" method="get" action="/app/boss" role="search"><input type="hidden" name="view" value="search"/>{companyId && <input type="hidden" name="companyId" value={companyId}/>}<Search size={18} aria-hidden="true"/><input aria-label="Search authorized companies, projects and people" name="q" type="search" minLength={2} maxLength={80} defaultValue={query.get("q") ?? ""} placeholder="Search companies, projects, people..."/><button type="submit" aria-label="Search">Search</button></form>}<Link className="workspace-account" href={workspaceHref("/app/account", companyId, path === "/app/boss" ? view : returnView ?? group.views[0], new URLSearchParams(query.toString()))} prefetch={false}><span>{name}</span><small>{boss ? "Group owner · Account" : email}</small></Link><Link prefetch={false} className="icon-button notification-indicator" title={unread === null ? "Unread notifications unavailable" : `${unread} unread notifications across accessible scopes`} aria-label={unread === null ? "Notifications: unread count unavailable" : `Notifications: ${unread} unread`} href={workspaceHref("/app/operations/notifications?read=unread", companyId, path === "/app/boss" ? view : returnView ?? group.views[0], new URLSearchParams(query.toString()))}><Bell size={20}/><span>{unread === null ? "?" : unread > 99 ? "99+" : unread}</span></Link>{logout}</header>
      <main className="main workspace-main" id="main-content" tabIndex={-1}><nav className="workspace-breadcrumbs" aria-label="Breadcrumb"><Link prefetch={false} href={boss ? navigationBossHref("overview", new URLSearchParams(query.toString())) : "/app/executive"}>MAXPASE</Link><ChevronRight size={14}/><Link prefetch={false} href={onBossPage?"/app/boss":groupHref(group.key)}>{onBossPage?"Boss":group.label}</Link>{(onBossPage||page!==group.label)&&<><ChevronRight size={14}/><span aria-current="page">{page}</span></>}</nav>{!onBossPage && !(path === "/app/boss" && view === group.views[0]) && <Link className="workspace-back" prefetch={false} href={backHref}><ArrowLeft size={16}/>Back to {returnView && isBossDestination(returnView) ? workspacePageLabel("/app/boss", returnView) : group.label}</Link>}{children}</main>
    </div>
    <dialog id="workspace-drawer" ref={dialog} className="workspace-drawer" aria-labelledby="drawer-title" onClose={() => { setOpen(false); menu.current?.focus(); }} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), summary, [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onClick={e => { if (e.target === e.currentTarget) close(); }}><div className="drawer-heading"><strong id="drawer-title">MAXPASE navigation</strong><button type="button" className="icon-button" aria-label="Close navigation" onClick={close}><X size={22}/></button></div><Navigation mobile/>{boss && <Link prefetch={false} className="boss-sidebar-nexa" href={navigationBossHref("nexa",new URLSearchParams(query.toString()))} onClick={close}>NEXA · Executive Intelligence <ChevronRight size={16}/></Link>}<Link className="drawer-account" href={workspaceHref("/app/account", companyId, path === "/app/boss" ? view : returnView ?? group.views[0], new URLSearchParams(query.toString()))} prefetch={false} onClick={close}>{email}<span>Account preferences / {timezoneLabel(timezone)}</span></Link></dialog>
  </div></TimezoneContext.Provider>;
}
