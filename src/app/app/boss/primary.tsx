import Link from "next/link";
import { ArrowUpRight, Bot, Building2, ShieldCheck } from "lucide-react";
import { Status } from "@/components/ui/status";
import { UserTime } from "@/components/ui/user-time";
import { bossHref } from "@/server/group/boss-reliability";
import { overviewHref, overviewKey } from "@/server/group/boss-overview";
import { projectBossStructure } from "@/server/group/boss-structure";
import { buildBossHierarchy } from "@/server/group/boss-hierarchy";
import { workspaceHref, bossViews, type PrimaryBossView } from "@/lib/workspace-navigation";
import type { bossService } from "@/server/group/boss-service";
import { OverviewRows } from "./overview";
import { BossHierarchy } from "./hierarchy";

type Data = Awaited<ReturnType<typeof bossService.dashboard>>;
type Query = Record<string, string | string[] | undefined>;

function CompanySummary({data,query}:{data:Data;query:Query}) {
  const companies=projectBossStructure(data);
  return <div className="boss-companies boss-primary-companies">{companies.map(company=><article className="boss-company" key={company.organizationId}>
    <header><Building2 size={20}/><div><h3><Link prefetch={false} href={bossHref("companies",company.organizationId,query)}>{company.legalName}</Link></h3><Status value={company.status}/></div></header>
    {company.recordedLegalName!==company.legalName&&<p className="boss-record-state">Recorded name: {company.recordedLegalName ?? "Unavailable"}. Legal-name correction is pending in this database.</p>}
    <p>{company.divisions.length ? `${company.divisions.length} mapped divisions` : `${company.products.length} mapped products`}; recorded status is shown in Companies &amp; Brands.</p>
    <p className="muted">Operational health: <Status value={company.health}/> / {company.evidence.coverage}</p>
    <Link prefetch={false} href={bossHref("companies",company.organizationId,query)}>Open company <ArrowUpRight size={15}/></Link>
  </article>)}</div>;
}

function CompanyBrowser({data,query}:{data:Data;query:Query}) {
  const brands = data.brands.flatMap(row => "organizationId" in row && "name" in row && "status" in row ? [{ id: row.id, organizationId: String(row.organizationId), parentBrandId: "parentBrandId" in row && row.parentBrandId ? String(row.parentBrandId) : null, name: String(row.name), status: String(row.status), website: "website" in row && row.website ? String(row.website) : null }] : []);
  const products = data.products.flatMap(row => "organizationId" in row && "name" in row && "type" in row && "status" in row && "lifecycle" in row ? [{ id: row.id, organizationId: String(row.organizationId), name: String(row.name), type: String(row.type), status: String(row.status), lifecycle: String(row.lifecycle), brandId: "brandId" in row ? String(row.brandId || "") : null, divisionId: "divisionId" in row ? String(row.divisionId || "") : null }] : []);
  const root = buildBossHierarchy({ groupId: data.groupId, organizations: data.graph.organizations, companies: data.companies, brands, products });
  return <BossHierarchy root={root} selectedCompanyId={data.selectedCompanyId} initialSearch={typeof query.hierarchySearch === "string" ? query.hierarchySearch : ""} initialStatus={typeof query.hierarchyStatus === "string" ? query.hierarchyStatus : ""} brandReadable={data.readable.brand} productReadable={data.readable.product}/>;
}

export function BossPrimary({view,data,query}:{view:PrimaryBossView;data:Data;query:Query}) {
  const href=(target:string)=>bossHref(target,data.selectedCompanyId,query);
  if(view==="companies")return <CompanyBrowser data={data} query={query}/>;
  if(view==="overview"){
    const first=data.overview.urgent[0];
    return <>
      <section className="executive-band boss-next-action"><header><h2>What needs attention</h2><Link prefetch={false} href={href("approvals")}>Approvals &amp; Risks <ArrowUpRight size={15}/></Link></header>
        {first?<><h3><Link prefetch={false} href={overviewHref(first.queue,data.selectedCompanyId,overviewKey(first.row),query)}>{first.row.title}</Link></h3><p>{data.overview.nextAction(first.row)}</p><small>{data.overview.owner(first.row)} / Due: <UserTime value={first.row.dueAt} empty="Not recorded"/></small></>:<p>No urgent items found in accessible records. This does not establish company health.</p>}
      </section>
      <section className="executive-band"><header><h2>Three companies</h2><Link prefetch={false} href={href("companies")}>Explore structure <ArrowUpRight size={15}/></Link></header><CompanySummary data={data} query={query}/></section>
      {data.companies.some(company => company.organization.slug === "aira-skill-city") && <section className="executive-band"><header><h2>Nice Jobs</h2><Link prefetch={false} href="/app/boss/command/aira-skill-city/aira-career-hub">Open Career Hub <ArrowUpRight size={15}/></Link></header><p>Manage opportunities, applicants, training, workforce and earnings through the scoped Career Hub command centre.</p></section>}
      <section className="executive-band"><header><h2><Bot size={18}/>NEXA Command</h2><span>{data.nexa?.initialized ? "STRUCTURED DRAFT PLANNING" : "NOT INITIALIZED"}</span></header><p>{data.nexa?.directiveCount ? `${data.nexa.directiveCount} group directives recorded. Director review and independent approval remain required.` : "No group directives recorded. NEXA does not execute actions or grant SIA permissions."}</p><Link prefetch={false} href={href("nexa")}>Open command desk <ArrowUpRight size={15}/></Link></section>
      <div className="boss-priorities"><section className="executive-band"><h2>My pending approvals</h2><OverviewRows data={data} query={query} queue="approvals" limit={3}/></section><section className="executive-band"><h2>Overdue work and blockers</h2><OverviewRows data={data} query={query} queue="overdue" limit={3}/><OverviewRows data={data} query={query} queue="blockers" limit={3}/></section></div>
    </>;
  }
  if(view==="performance")return <section className="executive-band"><header><h2>Company performance</h2><span>Authorized recorded sources only</span></header><div className="boss-companies boss-primary-companies">{data.cards.map(card=><article className="boss-company" key={card.organizationId}><h3>{card.legalName??card.displayName}</h3><p>Health: <Status value={card.health}/></p><p className="muted">{card.evidence.coverage}<br/>{card.evidence.freshness}<br/>Last record update: <UserTime value={card.evidence.lastUpdated} empty="Not recorded"/></p><dl className="boss-primary-metrics">{card.metrics.map(metric=><div key={metric.name}><dt>{metric.name}</dt><dd>{metric.value===null?"Not authorized":metric.value}</dd></div>)}</dl></article>)}</div><p className="muted">Revenue, expenses, employee headcount and customer totals are unavailable without verified legal-entity reporting sources.</p></section>;
  if(view==="approvals")return <><section className="executive-band"><h2>Assigned decisions and approvals</h2><OverviewRows data={data} query={query} queue="decisions" limit={5}/><OverviewRows data={data} query={query} queue="approvals" limit={5}/></section><section className="executive-band"><h2>Risks and delayed work</h2><OverviewRows data={data} query={query} queue="blockers" limit={5}/><OverviewRows data={data} query={query} queue="overdue" limit={5}/><OverviewRows data={data} query={query} queue="concerns" limit={5}/><p className="muted">Backup: {data.system.backup}; monitoring: {data.system.monitoring}; deployment verification: {data.system.production}.</p></section></>;
  return <section className="executive-band"><h2>Settings and detailed records</h2><nav className="boss-detail-links" aria-label="Existing management tools">{[["People and access","/app/workforce/people"],["Company registry","/app/business/companies"],["Brands and domains","/app/business/brands"],["Products","/app/business/products"],["SIA access","/app/workforce/sia"],["Integrations","/app/communications?view=integrations"],["Security","/app/security"],["Audit history","/app/operations/activity"]].map(([label,path])=><Link prefetch={false} key={path} href={workspaceHref(path,data.selectedCompanyId,"settings")}>{label}<ArrowUpRight size={15}/></Link>)}</nav><p><ShieldCheck size={17}/> These destinations recheck permissions on every request. NEXA has no agent role grants or execution authority.</p><details><summary>Detailed Boss views</summary><nav className="boss-detail-links" aria-label="Detailed Boss views">{Object.entries(bossViews).filter(([key])=>!(["overview","companies"].includes(key))).map(([key,label])=><Link prefetch={false} key={key} href={href(key)}>{label}</Link>)}</nav></details></section>;
}
