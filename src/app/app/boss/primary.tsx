import Link from "next/link";
import { ArrowUpRight, Bot, Building2, ShieldCheck } from "lucide-react";
import { Status } from "@/components/ui/status";
import { UserTime } from "@/components/ui/user-time";
import { bossHref } from "@/server/group/boss-reliability";
import { overviewHref, overviewKey } from "@/server/group/boss-overview";
import { projectBossStructure } from "@/server/group/boss-structure";
import { seniorAcademicAdvisorDraft } from "@/server/group/product-drafts";
import { workspaceHref, bossViews, type PrimaryBossView } from "@/lib/workspace-navigation";
import type { bossService } from "@/server/group/boss-service";
import { OverviewRows } from "./overview";

type Data = Awaited<ReturnType<typeof bossService.dashboard>>;
type Query = Record<string, string | string[] | undefined>;
function RecordState({row, readable}:{row:{status?:string;lifecycle?:string}|undefined;readable:boolean}) {
  return <span className="boss-record-state">{!readable ? "Not authorized" : !row ? "Not configured" : row.lifecycle ? `Recorded / ${row.lifecycle} / ${row.status ?? "Status unavailable"}` : `Recorded / ${row.status ?? "Status unavailable"}`}</span>;
}

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
  const companies=projectBossStructure(data);
  const commandHref=(companySlug:string,unitSlug:string)=>`/app/boss/command/${encodeURIComponent(companySlug)}/${encodeURIComponent(unitSlug)}`;
  const slug=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  return <section className="executive-band boss-structure" aria-labelledby="boss-structure-heading"><header><h2 id="boss-structure-heading">MAXPASE GROUP</h2><span>{companies.length} authorized company records</span></header>
    <p className="muted">The names below are the owner-approved target map. Each state comes from the current authorized registry; missing records are not treated as live offerings.</p>
    {companies.map(company=><section className="boss-structure-company" key={company.organizationId}>
      <header><h3>{company.legalName}</h3><Status value={company.status}/><Link prefetch={false} href={bossHref("companies",company.organizationId,query)}>Company overview</Link></header>
      {company.recordedLegalName!==company.legalName&&<p className="boss-record-state">Recorded legal name: {company.recordedLegalName ?? "Unavailable"}. Correction not yet applied to this database.</p>}
      <div className="boss-command-grid">
        {company.slug==="aira-skill-city"&&<Link prefetch={false} className="boss-command-tile" href={commandHref(company.slug,company.slug)}><span className="boss-command-tile-title">AIRA Skill City<ArrowUpRight size={16}/></span><small>Internal employee workplace</small><RecordState row={company.primaryBrand} readable={data.readable.brand}/></Link>}
        {company.divisions.map(item=><Link prefetch={false} className="boss-command-tile" key={item.slug} href={commandHref(company.slug,item.slug)}><span className="boss-command-tile-title">{item.label}<ArrowUpRight size={16}/></span><small>{item.product}</small><RecordState row={item.row} readable={data.readable.organization}/><RecordState row={item.productRow} readable={data.readable.product}/></Link>)}
        {company.products.map(item=><Link prefetch={false} className="boss-command-tile" key={item.name} href={commandHref(company.slug,slug(item.name))}><span className="boss-command-tile-title">{item.name}<ArrowUpRight size={16}/></span><RecordState row={item.row} readable={data.readable.product}/></Link>)}
        {company.brands.map(item=><Link prefetch={false} className="boss-command-tile" key={item.name} href={commandHref(company.slug,slug(item.name))}><span className="boss-command-tile-title">{item.name}<ArrowUpRight size={16}/></span><RecordState row={item.row} readable={data.readable.brand}/></Link>)}
      </div>
      {company.legalName==="AIRA SKILL CITY PRIVATE LIMITED"&&<p className="muted">BGOS, PBA and GenZ Builder require commercial terms, verified product owners and independent publication approval before sale.</p>}
    </section>)}
    {!companies.length&&<p className="executive-empty">No authorized company records are available.</p>}
    {companies.some(company=>company.legalName==="AIRA SKILL CITY PRIVATE LIMITED")&&<section className="boss-structure-company"><h3>In-house position setup</h3><p><strong>{seniorAcademicAdvisorDraft.title}</strong> / Draft / {seniorAcademicAdvisorDraft.engagement.replaceAll("_"," ")}</p><p>Stated salary: INR {(seniorAcademicAdvisorDraft.monthlySalaryMinor/100).toLocaleString("en-IN")} per month. No payroll or employment agreement is active.</p><p className="muted">Manager, verified account, approved agreement and payroll configuration: pending. Product scope: {seniorAcademicAdvisorDraft.scope.join(", ")}.</p></section>}
    <Link prefetch={false} href={bossHref("brands",data.selectedCompanyId,query)}>Open recorded brands and domains <ArrowUpRight size={15}/></Link>
  </section>;
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
      <section className="executive-band"><header><h2><Bot size={18}/>NEXA Command</h2><span>{data.nexa?.initialized ? "STRUCTURED DRAFT PLANNING" : "NOT INITIALIZED"}</span></header><p>{data.nexa?.directiveCount ? `${data.nexa.directiveCount} group directives recorded. Director review and independent approval remain required.` : "No group directives recorded. NEXA does not execute actions or grant SIA permissions."}</p><Link prefetch={false} href={href("nexa")}>Open command desk <ArrowUpRight size={15}/></Link></section>
      <div className="boss-priorities"><section className="executive-band"><h2>My pending approvals</h2><OverviewRows data={data} query={query} queue="approvals" limit={3}/></section><section className="executive-band"><h2>Overdue work and blockers</h2><OverviewRows data={data} query={query} queue="overdue" limit={3}/><OverviewRows data={data} query={query} queue="blockers" limit={3}/></section></div>
    </>;
  }
  if(view==="performance")return <section className="executive-band"><header><h2>Company performance</h2><span>Authorized recorded sources only</span></header><div className="boss-companies boss-primary-companies">{data.cards.map(card=><article className="boss-company" key={card.organizationId}><h3>{card.legalName??card.displayName}</h3><p>Health: <Status value={card.health}/></p><p className="muted">{card.evidence.coverage}<br/>{card.evidence.freshness}<br/>Last record update: <UserTime value={card.evidence.lastUpdated} empty="Not recorded"/></p><dl className="boss-primary-metrics">{card.metrics.map(metric=><div key={metric.name}><dt>{metric.name}</dt><dd>{metric.value===null?"Not authorized":metric.value}</dd></div>)}</dl></article>)}</div><p className="muted">Revenue, expenses, employee headcount and customer totals are unavailable without verified legal-entity reporting sources.</p></section>;
  if(view==="approvals")return <><section className="executive-band"><h2>Assigned decisions and approvals</h2><OverviewRows data={data} query={query} queue="decisions" limit={5}/><OverviewRows data={data} query={query} queue="approvals" limit={5}/></section><section className="executive-band"><h2>Risks and delayed work</h2><OverviewRows data={data} query={query} queue="blockers" limit={5}/><OverviewRows data={data} query={query} queue="overdue" limit={5}/><OverviewRows data={data} query={query} queue="concerns" limit={5}/><p className="muted">Backup: {data.system.backup}; monitoring: {data.system.monitoring}; deployment verification: {data.system.production}.</p></section></>;
  return <section className="executive-band"><h2>Settings and detailed records</h2><nav className="boss-detail-links" aria-label="Existing management tools">{[["People and access","/app/workforce/people"],["Company registry","/app/business/companies"],["Brands and domains","/app/business/brands"],["Products","/app/business/products"],["SIA access","/app/workforce/sia"],["Integrations","/app/communications?view=integrations"],["Security","/app/security"],["Audit history","/app/operations/activity"]].map(([label,path])=><Link prefetch={false} key={path} href={workspaceHref(path,data.selectedCompanyId,"settings")}>{label}<ArrowUpRight size={15}/></Link>)}</nav><p><ShieldCheck size={17}/> These destinations recheck permissions on every request. NEXA has no agent role grants or execution authority.</p><details><summary>Detailed Boss views</summary><nav className="boss-detail-links" aria-label="Detailed Boss views">{Object.entries(bossViews).filter(([key])=>!(["overview","companies"].includes(key))).map(([key,label])=><Link prefetch={false} key={key} href={href(key)}>{label}</Link>)}</nav></details></section>;
}
