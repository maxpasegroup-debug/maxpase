import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { bossRegistry } from "@/server/group/boss-registry";
import { RegistryControls } from "../../registry-controls";

export default async function BossCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(), { id } = await params;
  let data: Awaited<ReturnType<typeof bossRegistry.company>>;
  try { data = await bossRegistry.company(session.userId, id); } catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const { row, brands, units } = data;
  return <main className="boss-view boss-command">
    <nav aria-label="Breadcrumb" className="boss-command-breadcrumb"><Link href="/app/boss?view=companies">Companies &amp; Brands</Link><span>/</span><strong>{row.displayName}</strong></nav>
    <header className="boss-heading"><div><p className="eyebrow">Parent company</p><h1>{row.legalName || row.displayName}</h1><p className="muted">{row.status} · {row.country || "Country not recorded"}</p></div></header>
    <section className="executive-band"><header><h2>Brands</h2>{data.canManageBrands && <Link href={`/app/business/brands?organizationId=${encodeURIComponent(id)}&create=true`}>Add brand</Link>}</header>
      {brands === null ? <p>Brand records are not authorized for this account.</p> : brands.length ? <ul className="executive-list">{brands.map(brand => <li key={brand.id}><Link href={`/app/boss/brands/${encodeURIComponent(brand.id)}`}>{brand.name} · {brand.status}</Link>{brand.website && <span> · {brand.website}</span>}</li>)}</ul> : <p>No brands recorded for this company.</p>}
    </section>
    <section className="executive-band"><h2>Divisions and business units</h2>{units.length ? <ul className="executive-list">{units.map(unit => <li key={unit.id}>{unit.name} · {unit.status}</li>)}</ul> : <p>No divisions or business units recorded.</p>}</section>
    <nav className="boss-detail-links" aria-label="Company actions"><Link href={`/app/boss?view=companies&companyId=${encodeURIComponent(id)}`}>View hierarchy</Link>{data.canManageCompany && <Link href={`/app/business/companies?recordId=${encodeURIComponent(row.id)}`}>Edit company</Link>}<Link href={`/app/business/products?organizationId=${encodeURIComponent(id)}`}>Products and services</Link></nav>
    {data.canManageCompany && <RegistryControls kind="company" id={row.id} archived={row.status === "ARCHIVED"}/>}
  </main>;
}
