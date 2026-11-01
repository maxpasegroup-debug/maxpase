import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { bossService } from "@/server/group/boss-service";
import { bossRegistry } from "@/server/group/boss-registry";
import { bossDepartments, departmentHref, isBossDepartment, resolveDepartmentSelection } from "@/lib/boss-departments";
import { workforceService } from "@/server/domain/workforce-service";
import { CentralHrWorkspace } from "./central-hr";
import { staffOnboardingService } from "@/server/skillcity/staff-onboarding";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { StaffDraftForm } from "@/components/staff-draft-form";
import { StaffInvitePanel } from "@/components/staff-invite-panel";
import { bossStaffDraftAction, bossStaffInviteAction, bossStaffReviewAction } from "@/app/app/boss/command/staff-actions";
import { prisma } from "@/server/db";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { HrEmployees } from "./hr-employees";
import { marketingDivisionSlug } from "@/server/group/brand-marketing-scope";
import { hrCompanyConfig } from "@/server/group/hr-company-config";
import { HrCompanySettings } from "./hr-company-settings";
import { RoleTemplateForm } from "@/app/app/boss/command/role-template-form";

type Query = { companyId?: string; brandId?: string; departmentId?: string; view?: string; search?: string; employmentStatus?: string; page?: string };
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
  if (department === "hr") {
    const brandChoices = company ? await prisma.brand.findMany({ where: { id: { in: availableBrands.map(item => item.id) }, organizationId: company.organizationId }, select: { id: true, name: true, organizationId: true, status: true, parentBrand: { select: { name: true } } }, orderBy: { name: "asc" }, take: 100 }) : [];
    const employeePage = /^\d+$/.test(query.page ?? "") ? Math.max(1, Number(query.page)) : 1;
    const employeeRows = await hrEmploymentService.list(session.userId, { companyId: company?.organizationId, brandId: query.view === "add-employee" ? undefined : brand?.id, departmentId: query.departmentId, status: query.employmentStatus, search: query.search, page: employeePage });
    const employees = employeeRows.slice(0, 50);
    const employeeNextPage = employeeRows.length > 50;
    const departments = company ? await prisma.organization.findMany({ where: { type: "DEPARTMENT", OR: [{ parentId: company.organizationId }, { parent: { parentId: company.organizationId } }] }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 100 }) : [];
    const records = !brand && data.readable.person ? await workforceService.list(session.userId, "people", { organizationId: company?.organizationId, search: query.search }) : [];
    const people = records.flatMap(row => "displayName" in row && "memberships" in row && Array.isArray(row.memberships) ? [{ id: row.id, displayName: String(row.displayName), status: String(row.status), memberships: row.memberships.map(member => ({ organizationId: member.organizationId })) }] : []);
    for (const employee of employees) if (!people.some(person => person.id === employee.person.id)) people.push({ id: employee.person.id, displayName: employee.person.displayName, status: employee.person.status, memberships: [] });
    let staffPanel: React.ReactNode = null;
    if (query.view === "add-employee" && company?.organization.slug === "aira-skill-city") {
      const verifiedBrand = brand ? await bossRegistry.brand(session.userId, brand.id) : null;
      const divisionSlug = verifiedBrand?.row.parentBrandId ? undefined : verifiedBrand?.row.slug ? marketingDivisionSlug(verifiedBrand.row.slug) : undefined;
      const mappedDivision = verifiedBrand?.row.status === "ACTIVE" && divisionSlug ? await prisma.organization.findFirst({ where: { slug: divisionSlug, parentId: company.organizationId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } }) : null;
      const staffScopeId = brand ? mappedDivision?.id : company.organizationId;
      const options = staffScopeId ? await staffOnboardingService.options(session.userId, staffScopeId) : null;
      if (options?.canPrepare && staffScopeId) {
        const drafts = await staffInvite.drafts(session.userId, staffScopeId).catch(error => { if (error instanceof AccessError) return []; throw error; });
        staffPanel = <section className="executive-band"><h2>{brand ? `${brand.name} controlled staff setup` : "AIRA Skill City controlled staff setup"}</h2><StaffDraftForm action={bossStaffDraftAction} organizationId={staffScopeId} roles={options.roles} managers={options.managers} existingPeople={options.existingPeople}/><h3>Drafts awaiting activation</h3><StaffInvitePanel rows={drafts} action={bossStaffInviteAction} reviewAction={bossStaffReviewAction} managers={options.managers} deliveryReady={staffInvite.deliveryReady()}/></section>;
      }
    }
    const onboardingSettings = query.view === "hr-settings" ? await hrCompanyConfig.list(session.userId) : [];
    const roleScopes = company && query.view === "access-permissions" ? await prisma.organization.findMany({ where: { OR: [{ id: company.organizationId }, { parentId: company.organizationId }] }, select: { id: true, name: true }, take: 100 }) : [];
    const roles = roleScopes.length ? await prisma.role.findMany({ where: { organizationId: { in: roleScopes.map(scope => scope.id) }, principalType: "HUMAN" }, select: { id: true, name: true, key: true, status: true, organizationId: true, permissions: { select: { permission: { select: { key: true } } } } }, orderBy: { name: "asc" }, take: 100 }) : [];
    const employeeHref = (page: number) => { const params = new URLSearchParams({ view: query.view ?? "employees", page: String(page) }); if (company) params.set("companyId", company.organizationId); if (brand) params.set("brandId", brand.id); if (query.departmentId) params.set("departmentId", query.departmentId); if (query.employmentStatus) params.set("employmentStatus", query.employmentStatus); if (query.search) params.set("search", query.search); return `/app/boss/departments/hr?${params}`; };
    const employeePanel = <><HrEmployees employees={employees} brands={brandChoices.map(item => ({ ...item, parentName: item.parentBrand?.name ?? null }))} departments={departments} companyId={company?.organizationId} people={people} view={query.view}/>{query.view === "employees" && <nav aria-label="Employee pages" className="executive-band">{employeePage > 1 && <Link href={employeeHref(employeePage - 1)}>Previous</Link>}<span> Page {employeePage} </span>{employeeNextPage && <Link href={employeeHref(employeePage + 1)}>Next</Link>}</nav>}</>;
    return <CentralHrWorkspace companies={data.companies} brands={brandChoices.map(item => ({ ...item, status: item.status }))} company={company} brand={brand} view={query.view} search={query.search} staffPanel={staffPanel} employeePanel={employeePanel} configPanel={<HrCompanySettings companies={onboardingSettings}/>} rolePanel={<section className="executive-band"><h2>Scoped human roles</h2>{!company ? <p>Select a company to view its roles.</p> : <><p>Designations do not grant access. Roles start with only their explicitly assigned permissions.</p>{company.organization.slug === "aira-skill-city" && <RoleTemplateForm/>}<Link href={`/app/workforce/roles?organization=${encodeURIComponent(company.organizationId)}&create=true`}>Create company role</Link>{!roles.length && <p>No human roles in this company scope.</p>}<ul>{roles.map(role => <li key={role.id}><strong>{role.name}</strong> · {role.status} · {roleScopes.find(scope => scope.id === role.organizationId)?.name} · {role.permissions.length} permissions · <Link href={`/app/workforce/roles?organization=${encodeURIComponent(role.organizationId ?? company.organizationId)}`}>Manage role and permissions</Link></li>)}</ul></>}</section>} departments={departments} departmentId={query.departmentId} employmentStatus={query.employmentStatus} employmentCount={employees.length}/>;
  }
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
