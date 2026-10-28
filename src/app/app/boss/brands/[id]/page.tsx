import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { bossRegistry } from "@/server/group/boss-registry";
import { RegistryControls } from "../../registry-controls";

export default async function BossBrandPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(), { id } = await params;
  let data: Awaited<ReturnType<typeof bossRegistry.brand>>;
  try { data = await bossRegistry.brand(session.userId, id); } catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const { row, products, permissions } = data, companyId = row.organizationId;
  return <main className="boss-view boss-command">
    <nav aria-label="Breadcrumb" className="boss-command-breadcrumb"><Link href="/app/boss?view=companies">Companies</Link><span>/</span><Link href={`/app/boss/companies/${encodeURIComponent(companyId)}`}>{row.organization.company?.displayName}</Link><span>/</span><strong>{row.name}</strong></nav>
    <header className="boss-heading"><div><p className="eyebrow">Brand operating workspace</p><h1>{row.name}</h1><p className="muted">{row.status} · {row.website || "No domain recorded"}</p></div></header>
    <section className="executive-band"><h2>Manage this brand</h2><p>The lists below contain records linked to this brand. Shared tools open at company scope and recheck permissions; they may also contain other brands. A brand CRM or ERP needs its own configured workflows.</p><nav className="boss-command-links" aria-label="Brand tools">
      {data.commandHref && <Link href={data.commandHref}>Open configured command centre</Link>}
      {permissions.work && <Link href={`/app/execution/projects?organizationId=${encodeURIComponent(companyId)}`}>Projects and tasks</Link>}
      {permissions.approvals && <Link href={`/app/operations/approvals?organizationId=${encodeURIComponent(companyId)}`}>Decisions and approvals</Link>}
      {permissions.people && <Link href={`/app/workforce/people?organizationId=${encodeURIComponent(companyId)}`}>People and access</Link>}
      {permissions.products && <Link href={`/app/business/products?organizationId=${encodeURIComponent(companyId)}`}>Products and services</Link>}
      {permissions.manage && <Link href={`/app/business/brands?recordId=${encodeURIComponent(row.id)}`}>Edit brand and domain</Link>}
    </nav>{!permissions.work && !permissions.approvals && !permissions.people && !permissions.products && <p>No operating modules are authorized for this account.</p>}</section>
    <section className="executive-band"><h2>Brand projects</h2>{data.projects === null ? <p>Project records are not authorized.</p> : data.projects.length ? <ul className="executive-list">{data.projects.map(project => <li key={project.id}><Link href={`/app/execution/projects?recordId=${encodeURIComponent(project.id)}&organizationId=${encodeURIComponent(companyId)}`}>{project.name}</Link> · {project.status}</li>)}</ul> : <p>No projects linked to this brand.</p>}</section>
    <section className="executive-band"><h2>Products and services</h2>{products === null ? <p>Product records are not authorized.</p> : products.length ? <ul className="executive-list">{products.map(product => <li key={product.id}><Link href={`/app/business/products?recordId=${encodeURIComponent(product.id)}`}>{product.name}</Link> · {product.lifecycle} · {product.status}</li>)}</ul> : <p>No products configured for this brand.</p>}</section>
    <section className="executive-band"><h2>Operating coverage</h2><dl className="record-details"><div><dt>Brand-linked projects</dt><dd>{data.projects === null ? "Not authorized" : data.projects.length ? `${data.projects.length} shown` : "No records"}</dd></div><div><dt>Brand-linked products</dt><dd>{products === null ? "Not authorized" : products.length ? `${products.length} shown` : "No records"}</dd></div><div><dt>CRM</dt><dd>Requires a configured brand pipeline</dd></div><div><dt>ERP and finance</dt><dd>Requires verified brand policies and modules</dd></div><div><dt>Automation</dt><dd>No autonomous execution granted</dd></div></dl></section>
    {permissions.manage && <RegistryControls kind="brand" id={row.id} archived={row.status === "ARCHIVED"}/>}
  </main>;
}
