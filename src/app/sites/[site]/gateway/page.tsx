import Link from "next/link";
import { ParticipantPending } from "@/app/app/nicejobs/participant-pending";
import { participantEntry } from "@/lib/participant-navigation";
import { redirect, notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { portalService } from "@/server/portals/service";
import { portalLogoutAction } from "../actions";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
import { NiceJobsWorkspace } from "@/app/app/nicejobs/workspace";
import { ApplicationWorkspace } from "@/app/app/nicejobs/application-workspace";
import { OnboardingWorkspace } from "@/app/app/nicejobs/onboarding-workspace";
import { onboardingService } from "@/server/nicejobs/onboarding";
import { employeeService } from "@/server/nicejobs/employee";
import { KnowledgeWorkspace, knowledgeViews } from "@/app/app/nicejobs/knowledge-workspace";
import { PerformanceWorkspace, performanceViews } from "@/app/app/nicejobs/performance-workspace";
import { LeadWorkspace, leadViews } from "@/app/app/nicejobs/lead-workspace";
import { EmployeeWorkspace } from "@/app/app/nicejobs/employee-workspace";
import { FinanceWorkspace, financeViews } from "@/app/app/nicejobs/finance-workspace";
import { WorkforceControlWorkspace, workforceControlViews } from "@/app/app/nicejobs/workforce-control-workspace";
import { requirePortalAccess } from "@/server/portals/policy";
import { prisma } from "@/server/db";
import { BossWorkspace } from "@/app/app/nicejobs/boss-workspace";
import { isNiceJobsControlView } from "@/lib/nicejobs-control-navigation";
import { ParticipantDashboard } from "@/app/app/nicejobs/participant-dashboard";
import { isParticipantDashboardView } from "@/lib/nicejobs-dashboard";
import { LabsWorkspace } from "../../labs-ui/workspace";
import { LabsCustomerWorkspace } from "../../labs-ui/customer-workspace";
import { labsCustomerService } from "@/server/labs/customer";
import { StartupStudentWorkspace } from "../../startup-ui/student-workspace";
import { skillCityEmployeeDashboard, employeeViews } from "@/server/skillcity/employee-dashboard";
import { SkillCityWorkspace } from "../../skillcity-ui/workspace";
const views = ["overview", "programs", "projects", "tasks", "goals"];
export default async function Gateway({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { site, paths } = await requestPortal((await params).site), query = await searchParams;
  const session = await getPortalSession(site, site.id === "jobs"); if (!session) redirect(paths.login);
  if (site.id === "jobs" && session.needsJobsPinActivation) redirect(paths.login.replace(/\/login$/, "/activate-pin"));
  if(site.id==="labs"&&session.needsPinChange)redirect(paths.gateway.replace(/\/gateway$/,"")+"/pin");
  await consumeSecurityBudget(securityKey("authenticated", session.userId), 300, 60);
  const view = typeof query.view === "string" ? query.view : "overview";
  if (site.id === "skillcity" && (!query.view || employeeViews.includes(view as typeof employeeViews[number]))) {
    let data;
    try { data = await skillCityEmployeeDashboard.dashboard(session.userId, typeof query.view === "string" ? view : undefined); }
    catch (error) {
      if (!(error instanceof AccessError)) throw error;
      redirect(typeof query.view === "string" ? paths.gateway : paths.login);
    }
    return <SkillCityWorkspace data={data} email={session.email} userId={session.userId} base={paths.gateway} home={paths.home}/>;
  }
  if (site.id === "skillcity") notFound();
  if (site.id === "labs" && await labsCustomerService.isCustomer(session.userId)) {
    if (view !== "overview") notFound();
    return <LabsCustomerWorkspace userId={session.userId} email={session.email} home={paths.home}/>;
  }
  if(site.id==="labs"&&["overview","sales","projects","people","finance","settings"].includes(view))return <LabsWorkspace userId={session.userId} email={session.email} base={paths.gateway} home={paths.home} query={query}/>;
  if (site.id === "startup") {
    const access = await requirePortalAccess(prisma, session.userId, "startup");
    if (!(await access.ctx.decide("program.manage", { organizationId: access.divisionId })).allowed) {
      if (view !== "overview") notFound();
      return <StartupStudentWorkspace userId={session.userId} email={session.email} home={paths.home}/>;
    }
  }
  if (site.id === "jobs" && (isNiceJobsControlView(view, query) || !query.view && (await employeeService.navigation(session.userId)).command)) {
    await requirePortalAccess(prisma, session.userId, "jobs");
    return <main className="portal-workspace portal-jobs"><header className="portal-header"><Link href={paths.home}>Nice Jobs</Link><form action={portalLogoutAction}><input type="hidden" name="site" value="jobs" /><button>Sign out</button></form></header><BossWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={query} /></main>;
  }
  if (site.id === "jobs" && isParticipantDashboardView(typeof query.view === "string" ? query.view : undefined, query)) {
    await requirePortalAccess(prisma, session.userId, "jobs");
    return <ParticipantDashboard userId={session.userId} realm="jobs" base={paths.gateway} query={query} />;
  }
  if (site.id === "jobs" && (!query.view || ["my-day", "my-work", "worker-reports", "worker-wallet", "worker-resources", "worker-help"].includes(view))) {
    await requirePortalAccess(prisma, session.userId, "jobs");
    const nav = await employeeService.navigation(session.userId);
    const entry = participantEntry(nav.worker, nav.worker ? false : (await onboardingService.navigation(session.userId)).own, typeof query.view === "string" ? query.view : undefined);
    if (entry) {
      if (entry === "PENDING") return <main className="portal-workspace portal-jobs"><header className="portal-header"><Link href={paths.home}>Nice Jobs</Link><form action={portalLogoutAction}><input type="hidden" name="site" value="jobs" /><button>Sign out</button></form></header><ParticipantPending userId={session.userId} base={paths.gateway} view={view} /></main>;
      return <main className="portal-workspace portal-jobs"><header className="portal-header"><Link href={paths.home}>Nice Jobs</Link><form action={portalLogoutAction}><input type="hidden" name="site" value="jobs" /><button>Sign out</button></form></header><OnboardingWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={{ ...query, view: "my-day" }} /></main>;
    }
  }
  if (site.id === "jobs" && workforceControlViews.includes(view)) { await requirePortalAccess(prisma, session.userId, "jobs"); return <main className="portal-workspace portal-jobs"><WorkforceControlWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={query} /></main>; }
  if (site.id === "jobs" && financeViews.includes(view)) { await requirePortalAccess(prisma, session.userId, "jobs"); return <main className="portal-workspace portal-jobs"><FinanceWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={query} /></main>; }
  if (site.id === "jobs" && performanceViews.includes(view)) { await requirePortalAccess(prisma, session.userId, "jobs"); return <main className="portal-workspace portal-jobs"><PerformanceWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={query} /></main>; }
  if (site.id === "jobs" && knowledgeViews.includes(view)) { await requirePortalAccess(prisma, session.userId, "jobs"); return <main className="portal-workspace portal-jobs"><KnowledgeWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={query} /></main>; }
  if (site.id === "jobs" && leadViews.includes(view)) { await requirePortalAccess(prisma, session.userId, "jobs"); return <main className="portal-workspace portal-jobs"><LeadWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={query} /></main>; }
  if (site.id === "jobs" && (["my-day", "my-work", "worker-training", "worker-resources", "worker-sia", "worker-profile", "worker-reports", "worker-help", "active-workforce", "worker-detail", "activation"].includes(view) || !query.view && (await employeeService.navigation(session.userId)).worker)) {
    await requirePortalAccess(prisma, session.userId, "jobs");
    return <main className="portal-workspace portal-jobs"><header className="portal-header"><Link href={paths.home}>Nice Jobs</Link><form action={portalLogoutAction}><input type="hidden" name="site" value="jobs" /><button>Sign out</button></form></header><EmployeeWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={query} /></main>;
  }
  if (site.id === "jobs" && ["my-onboarding", "onboarding", "my-reviews", "training-management"].includes(view)) return <main className="portal-workspace portal-jobs"><header className="portal-header"><Link href={paths.gateway}>Nice Jobs gateway</Link><form action={portalLogoutAction}><input type="hidden" name="site" value="jobs" /><button className="portal-button">Sign out</button></form></header><OnboardingWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={query} /></main>;
  if (site.id === "jobs" && ["opportunities", "my-applications", "applications"].includes(view)) return <main className="portal-workspace portal-jobs"><header className="portal-header"><Link href={paths.gateway}>Nice Jobs gateway</Link><form action={portalLogoutAction}><input type="hidden" name="site" value="jobs" /><button className="portal-button">Sign out</button></form></header><ApplicationWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={query} /></main>;
  if (site.id === "jobs" && ["templates", "published", "drafts", "workforce"].includes(view)) return <main className="portal-workspace portal-jobs"><header className="portal-header"><Link href={paths.gateway}>Nice Jobs gateway</Link><form action={portalLogoutAction}><input type="hidden" name="site" value="jobs" /><button>Sign out</button></form></header><NiceJobsWorkspace userId={session.userId} realm="jobs" base={paths.gateway} query={query} /></main>;
  if (!views.includes(view)) notFound();
  if (typeof query.cursor === "string" && query.cursor.length > 200) notFound();
  let data;
  try { data = await portalService.dashboard(session.userId, site.id, view, typeof query.cursor === "string" ? query.cursor : undefined); }
  catch (e) { if (e instanceof AccessError) redirect(paths.login); throw e; }
  const programs = view === "programs", rows = programs ? data.programs.map(p => ({ ...p, title: p.name, dueAt: null })) : data.records;
  const workspaceName = { skillcity: "SKILL CITY WORKSPACE", startup: "STARTUP WORKSPACE", labs: "LABS WORKSPACE", jobs: "CAREER HUB" }[site.id];
  const training = site.id === "jobs" ? await onboardingService.navigation(session.userId) : null;
  return <main className={`portal-workspace portal-${site.theme}`}><header className="portal-header"><Link className="portal-wordmark" href={paths.home}>{site.name}<span>GATEWAY</span></Link><form action={portalLogoutAction}><input type="hidden" name="site" value={site.id} /><button className="portal-button">Sign out</button></form></header><div className="portal-workspace-inner"><header className="portal-workspace-heading"><p className="portal-kicker">{workspaceName}</p><h1>{view === "overview" ? "Your gateway" : view[0].toUpperCase() + view.slice(1)}</h1><p className="muted">{session.email}</p></header><nav className="portal-workspace-nav" aria-label="Gateway views">{(site.id === "jobs" ? [...views, "opportunities", "my-applications", "applications", "templates", "workforce"] : views).map(v => <Link key={v} href={`${paths.gateway}?view=${v}`} aria-current={view === v ? "page" : undefined}>{v[0].toUpperCase() + v.slice(1)}</Link>)}{training && [["my-onboarding", "My Onboarding", training.own], ["onboarding", "Onboarding", training.manage], ["my-reviews", "My Reviews", training.reviews]].filter(([, , allowed]) => allowed).map(([key, label]) => <Link key={String(key)} href={`${paths.gateway}?view=${key}`}>{label}</Link>)}</nav><section className="portal-records"><h2>{view === "overview" ? "Your available work" : programs ? "Programs" : "Records"}</h2>{!rows.length && <p className="executive-empty">NO DATA</p>}<ul>{rows.map(r => <li key={r.id}><div><strong>{r.title}</strong><span>{r.status.replaceAll("_", " ")}</span></div>{r.dueAt && <time dateTime={r.dueAt.toISOString()}>{r.dueAt.toISOString().slice(0, 10)} UTC</time>}</li>)}</ul>{data.nextCursor && <Link className="portal-button" href={`${paths.gateway}?view=${view}&cursor=${encodeURIComponent(data.nextCursor)}`}>Next page</Link>}</section></div></main>;
}
