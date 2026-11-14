import Link from "next/link";
import { ArrowRight, Building2, BriefcaseBusiness, Users, Wallet } from "lucide-react";
import { Status } from "@/components/ui/status";
import { bossHref } from "@/server/group/boss-reliability";
import { overviewHref, overviewKey } from "@/server/group/boss-overview";
import { departmentHref } from "@/lib/boss-departments";
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
  const workspaces = [
    { label: "My Money", description: "Private personal money tracker", href: "/app/boss/money", icon: Wallet },
    { label: "Growth", description: "Marketing, sales and opportunities", href: bossHref("growth", scope, query), icon: BriefcaseBusiness },
    { label: "People & HR", description: "Employees and hiring", href: departmentHref("hr", scope), icon: Users },
    { label: "Money", description: "Finance and company records", href: departmentHref("finance", scope), icon: Wallet },
    { label: "Work & Delivery", description: "Projects and daily operations", href: departmentHref("operations", scope), icon: Building2 },
  ];

  return <div className="boss-simple-dashboard">
    <header className="boss-home-heading">
      <p className="eyebrow">MAXPASE GROUP</p>
      <h1>Your group at a glance</h1>
      <p>See what needs your attention, then open the workspace for the job.</p>
    </header>

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

    <section className="executive-band boss-home-companies">
      <header><div><h2>Your companies</h2><p>Open a company to manage its brands and work.</p></div><Link href={bossHref("companies", scope, query)}>View all <ArrowRight size={16}/></Link></header>
      {data.cards.length ? <div className="boss-home-company-grid">{data.cards.slice(0, 4).map(company => <article key={company.organizationId}>
        <div className="boss-home-company-mark"><Building2 size={18} aria-hidden="true"/></div>
        <div className="boss-home-company-copy"><h3>{company.legalName ?? company.displayName}</h3><p>Company record status: <Status value={company.status}/></p></div>
        <Link aria-label={`Open ${company.legalName ?? company.displayName}`} href={bossHref("companies", company.organizationId, query)}><ArrowRight size={18}/></Link>
      </article>)}</div> : <p className="boss-home-empty">Company records are unavailable in this view.</p>}
    </section>

    <section className="executive-band boss-home-workspaces">
      <header><div><h2>Open a workspace</h2><p>Choose the area you want to manage.</p></div></header>
      <nav aria-label="Business workspaces">{workspaces.map(({ label, description, href, icon: Icon }) => <Link key={label} href={href}>
        <span className="boss-home-workspace-icon"><Icon size={19} aria-hidden="true"/></span><span><strong>{label}</strong><small>{description}</small></span><ArrowRight size={17} aria-hidden="true"/>
      </Link>)}</nav>
    </section>
  </div>;
}
