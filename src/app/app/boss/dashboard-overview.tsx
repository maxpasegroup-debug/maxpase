import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { bossHref } from "@/server/group/boss-reliability";
import { overviewHref, overviewKey } from "@/server/group/boss-overview";
import { bossDepartments, departmentHref, type BossDepartment } from "@/lib/boss-departments";
import type { bossService } from "@/server/group/boss-service";

type Data = Awaited<ReturnType<typeof bossService.dashboard>>;
type Query = Record<string, string | string[] | undefined>;

export function BossDashboardOverview({ data, query }: { data: Data; query: Query }) {
  const scope = data.selectedCompanyId;
  const pending = [...data.overview.queues.decisions, ...data.overview.queues.approvals].filter(row => data.overview.canAct(row));
  const pendingCount = data.overview.coverage.decisions && data.overview.coverage.approvals ? new Set(pending.map(overviewKey)).size : null;
  const brands = data.brands.filter(row => "organizationId" in row && (!scope || row.organizationId === scope));
  const summaries = [
    { label: "Companies", value: data.companies.length, href: bossHref("companies", scope, query), note: "Authorized registry" },
    { label: "Brands", value: data.readable.brand ? brands.length : null, href: bossHref("companies", scope, query), note: "Accessible records" },
    { label: "Active people", value: data.headline.activePeople, href: departmentHref("hr", scope), note: "Active members; not employee headcount" },
    { label: "Pending decisions", value: pendingCount, href: bossHref("approvals", scope, query), note: "Actionable in current preview" },
  ];
  const shortcuts: BossDepartment[] = ["marketing", "hr", "sales", "finance", "operations"];
  return <div className="boss-simple-dashboard">
    <header><h2>Group dashboard</h2><p>Choose a department, then a company and brand to manage its work.</p></header>
    <section className="boss-simple-metrics" aria-label="Recorded group summary">{summaries.map(item => <Link key={item.label} href={item.href}><span>{item.label}</span><strong>{item.value ?? "Unavailable"}</strong><small>{item.note}</small></Link>)}</section>
    <div className="boss-simple-columns"><section className="executive-band"><header><h2>Needs your attention</h2><Link href={bossHref("approvals", scope, query)}>All approvals <ArrowRight size={16}/></Link></header>{data.overview.urgent.length ? <ul className="executive-list">{data.overview.urgent.slice(0, 4).map(({ queue, row }) => <li key={overviewKey(row)}><Link href={overviewHref(queue, scope, overviewKey(row), query)}>{row.title}</Link><small>{data.overview.nextAction(row)}</small></li>)}</ul> : <p>No urgent items in the accessible preview. This does not establish company health.</p>}</section>
      <section className="executive-band"><h2>Departments</h2><nav className="boss-simple-shortcuts" aria-label="Department workspaces">{shortcuts.map(key => <Link key={key} href={departmentHref(key, scope)}>{bossDepartments[key].label}<ArrowRight size={16}/></Link>)}</nav><p className="muted">Sales pipeline, campaign performance and financial totals are unavailable until their scoped reporting sources are connected.</p></section></div>
    <nav className="boss-simple-bottom" aria-label="Group tools"><Link href={bossHref("companies", scope, query)}>Companies &amp; Brands</Link><Link href={bossHref("performance", scope, query)}>Reports</Link><Link href={bossHref("nexa", scope, query)}>NEXA Command</Link></nav>
  </div>;
}
