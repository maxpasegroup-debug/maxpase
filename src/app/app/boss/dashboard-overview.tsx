import Link from "next/link";
import { ArrowRight, Bot, Building2, BriefcaseBusiness, Wallet } from "lucide-react";
import { bossHref } from "@/server/group/boss-reliability";
import { overviewHref, overviewKey } from "@/server/group/boss-overview";
import type { bossService } from "@/server/group/boss-service";

type Data = Awaited<ReturnType<typeof bossService.dashboard>>;
type Query = Record<string, string | string[] | undefined>;

export function BossDashboardOverview({ data, query }: { data: Data; query: Query }) {
  const scope = data.selectedCompanyId;
  const brands = data.brands.filter(row => "organizationId" in row && (!scope || row.organizationId === scope));
  const urgent = data.overview.urgent.slice(0, 4);
  const metrics = [
    { label: "Companies", value: data.companies.length, note: "In your current view", href: bossHref("companies", scope, query), icon: Building2 },
    { label: "Brands", value: data.readable.brand ? brands.length : null, note: data.readable.brand ? "In your current view" : "Access not available", href: bossHref("companies", scope, query), icon: BriefcaseBusiness },
    { label: "Priority items", value: data.overview.coverage.approvals || data.overview.coverage.decisions ? data.overview.urgent.length : null, note: "Items needing attention", href: bossHref("approvals", scope, query), icon: Wallet },
  ];
  return <div className="boss-simple-dashboard">
    <header className="boss-home-heading">
      <p className="eyebrow">MAXPASE GROUP</p>
      <h1>Good to see you.</h1>
      <p>Your group workspace is ready. Choose a task or ask NEXA to help you find the right place.</p>
    </header>

    <section className="boss-home-assistant" aria-label="NEXA assistant"><span><Bot size={22}/></span><div><strong>What would you like to manage?</strong><small>Ask NEXA about your authorized companies, people or work.</small></div><Link className="button" href={bossHref("nexa", scope, query)}>Ask NEXA <ArrowRight size={16}/></Link></section>

    <section className="boss-simple-metrics" aria-label="Group summary">
      {metrics.map(({ label, value, note, href, icon: Icon }) => <Link key={label} href={href}>
        <span className="boss-home-metric-icon"><Icon size={18} aria-hidden="true"/></span>
        <span>{label}</span>
        <strong>{value === null ? "Not available" : value}</strong>
        <small>{note}</small>
      </Link>)}
    </section>

    <section className="executive-band boss-home-attention">
      <header><div><h2>Needs your attention</h2><p>Start with these items.</p></div><Link href={bossHref("approvals", scope, query)}>View decisions <ArrowRight size={16}/></Link></header>
      {urgent.length ? <ul className="executive-list">{urgent.map(({ queue, row }) => <li key={overviewKey(row)}>
        <div><Link href={overviewHref(queue, scope, overviewKey(row), query)}>{row.title}</Link><small>{data.overview.nextAction(row)}</small></div>
      </li>)}</ul> : <p className="boss-home-empty">Nothing urgent was found in the records available to your account.</p>}
    </section>

    <section className="executive-band boss-home-companies boss-home-company-shortcut"><header><div><h2>Your companies</h2><p>Manage companies and brands from one place.</p></div><Link href={bossHref("companies", scope, query)}>Open companies &amp; brands <ArrowRight size={16}/></Link></header><p>{data.companies.length} authorized {data.companies.length === 1 ? "company" : "companies"} in the current view.</p></section>
  </div>;
}
