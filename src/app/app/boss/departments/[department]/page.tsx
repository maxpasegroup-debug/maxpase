import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { bossService } from "@/server/group/boss-service";
import { bossRegistry } from "@/server/group/boss-registry";
import { bossDepartments, departmentHref, isBossDepartment, resolveDepartmentSelection } from "@/lib/boss-departments";

type Query = { companyId?: string; brandId?: string };
export default async function BossDepartmentPage({ params, searchParams }: { params: Promise<{ department: string }>; searchParams: Promise<Query> }) {
  const { department } = await params;
  if (!isBossDepartment(department)) notFound();
  const query = await searchParams, session = await requireSession();
  let data: Awaited<ReturnType<typeof bossService.dashboard>>;
  try { data = await bossService.dashboard(session.userId, query.companyId); }
  catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const brands = data.brands.flatMap(row => "organizationId" in row && "name" in row ? [{ id: row.id, name: String(row.name), organizationId: String(row.organizationId), status: "status" in row ? String(row.status) : "UNAVAILABLE" }] : []);
  const selection = resolveDepartmentSelection(data.companies, brands, query.companyId, query.brandId);
  if (!selection) notFound();
  const { company, brand, availableBrands } = selection;
  let detail: Awaited<ReturnType<typeof bossRegistry.brand>> | undefined;
  if (brand) {
    try { detail = await bossRegistry.brand(session.userId, brand.id); }
    catch (error) { if (error instanceof AccessError) notFound(); throw error; }
    if (detail.row.organizationId !== company?.organizationId) notFound();
  }
  const brandHome = brand ? `/app/boss/brands/${encodeURIComponent(brand.id)}` : undefined;
  const preserveContext = (href: string) => { const url = new URL(href, "http://localhost"); if (company && brand) { url.searchParams.set("companyId", company.organizationId); url.searchParams.set("brandId", brand.id); } return url.pathname + url.search + url.hash; };
  const marketing = detail?.canReadMarketing ? `${brandHome}/marketing` : undefined;
  const commercial = detail?.canReadCommercial ? `${brandHome}/commercial` : undefined;
  const modules = bossDepartments[department].modules.map(label => {
    let href: string | undefined;
    let note = "Not yet available for this brand";
    if (department === "marketing" && ["Campaigns", "Content Calendar", "Creative Management"].includes(label) && marketing) { href = marketing; note = "Campaign drafts, schedule and creative briefs"; }
    if (department === "operations" && label === "Tasks and Work Orders" && detail?.permissions.work) { href = `${brandHome}#projects`; note = "Brand projects and linked tasks"; }
    if (department === "operations" && label === "Programme/Service Delivery" && detail?.programs !== null && detail?.startupDivision) { href = `${brandHome}#programs`; note = "Recorded programme states; delivery tools remain separate"; }
    if (department === "operations" && label === "Programme/Service Delivery" && detail?.programs !== null && detail?.studioDivision) { href = `${brandHome}#studio-programs`; note = "Recorded programme states; delivery tools remain separate"; }
    if (department === "finance" && label === "Commercial Terms" && commercial) { href = commercial; note = "Written terms proposals and review; no payment authority"; }
    return { label, href, note };
  });
  return <div className="boss-view boss-department">
    <header className="boss-heading"><div><p className="eyebrow">MAXPASE GROUP</p><h1>{bossDepartments[department].label}</h1></div><Link href="/app/boss?view=companies">Companies &amp; Brands</Link></header>
    <section className="executive-band boss-department-context" aria-label="Current workspace context"><strong>Company: {company?.legalName ?? company?.displayName ?? "Select a company"}</strong><strong>Brand: {brand?.name ?? "Select a brand"}</strong><strong>Department: {bossDepartments[department].label}</strong></section>
    <section className="executive-band boss-department-picker"><h2>Choose your workspace</h2><div className="boss-department-steps"><div><h3>1. Select company</h3><ul>{data.companies.map(row => <li key={row.organizationId}><Link aria-current={company?.organizationId === row.organizationId ? "step" : undefined} href={departmentHref(department, row.organizationId)}>{row.legalName ?? row.displayName}</Link></li>)}</ul>{!data.companies.length && <p>No authorized companies are available.</p>}</div><div><h3>2. Select brand</h3>{company ? availableBrands.length ? <ul>{availableBrands.map(row => <li key={row.id}><Link aria-current={brand?.id === row.id ? "step" : undefined} href={departmentHref(department, company.organizationId, row.id)}>{row.name} <small>({row.status.replaceAll("_", " ")})</small></Link></li>)}</ul> : <p>No accessible brands are recorded for this company.</p> : <p>Select a company first.</p>}</div></div></section>
    {brand && <section className="executive-band"><h2>{brand.name} · {bossDepartments[department].label}</h2><p className="muted">Only recorded, authorized modules can be opened. Unavailable areas are shown clearly.</p><div className="boss-department-modules">{modules.map(module => <div key={module.label} className="boss-department-module"><strong>{module.label}</strong><small>{module.note}</small>{module.href && <Link prefetch={false} href={preserveContext(module.href)}>Open workspace</Link>}</div>)}</div><p><Link href={preserveContext(brandHome!)}>Open Brand Master Control Center</Link></p></section>}
  </div>;
}
