import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { portalService } from "@/server/portals/service";
import { portalLogoutAction } from "../actions";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
const views = ["overview", "programs", "projects", "tasks", "goals"];
export default async function Gateway({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { site, paths } = await requestPortal((await params).site), query = await searchParams;
  const session = await getPortalSession(site); if (!session) redirect(paths.login);
  await consumeSecurityBudget(securityKey("authenticated", session.userId), 300, 60);
  const view = typeof query.view === "string" ? query.view : "overview";
  if (!views.includes(view)) notFound();
  if (typeof query.cursor === "string" && query.cursor.length > 200) notFound();
  let data;
  try { data = await portalService.dashboard(session.userId, site.id, view, typeof query.cursor === "string" ? query.cursor : undefined); }
  catch (e) { if (e instanceof AccessError) redirect(paths.login); throw e; }
  const programs = view === "programs", rows = programs ? data.programs.map(p => ({ ...p, title: p.name, dueAt: null })) : data.records;
  const workspaceName = { skillcity: "SKILL CITY WORKSPACE", startup: "STARTUP WORKSPACE", labs: "LABS WORKSPACE", jobs: "CAREER HUB" }[site.id];
  return <main className={`portal-workspace portal-${site.theme}`}><header className="portal-header"><Link className="portal-wordmark" href={paths.home}>{site.name}<span>GATEWAY</span></Link><form action={portalLogoutAction}><input type="hidden" name="site" value={site.id} /><button className="portal-button">Sign out</button></form></header><div className="portal-workspace-inner"><header className="portal-workspace-heading"><p className="portal-kicker">{workspaceName}</p><h1>{view === "overview" ? "Your gateway" : view[0].toUpperCase() + view.slice(1)}</h1><p className="muted">{session.email}</p></header><nav className="portal-workspace-nav" aria-label="Gateway views">{views.map(v => <Link key={v} href={`${paths.gateway}?view=${v}`} aria-current={view === v ? "page" : undefined}>{v[0].toUpperCase() + v.slice(1)}</Link>)}</nav><section className="portal-records"><h2>{view === "overview" ? "Your available work" : programs ? "Programs" : "Records"}</h2>{!rows.length && <p className="executive-empty">NO DATA</p>}<ul>{rows.map(r => <li key={r.id}><div><strong>{r.title}</strong><span>{r.status.replaceAll("_", " ")}</span></div>{r.dueAt && <time dateTime={r.dueAt.toISOString()}>{r.dueAt.toISOString().slice(0, 10)} UTC</time>}</li>)}</ul>{data.nextCursor && <Link className="portal-button" href={`${paths.gateway}?view=${view}&cursor=${encodeURIComponent(data.nextCursor)}`}>Next page</Link>}</section></div></main>;
}
