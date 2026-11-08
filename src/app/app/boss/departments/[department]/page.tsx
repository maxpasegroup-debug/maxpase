import Link from "next/link";
import { Prisma } from "@prisma/client";
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
import { HrOnboarding } from "./hr-onboarding";
import { marketingDivisionSlug } from "@/server/group/brand-marketing-scope";
import { hrCompanyConfig } from "@/server/group/hr-company-config";
import { HrCompanySettings } from "./hr-company-settings";
import { RoleTemplateForm } from "@/app/app/boss/command/role-template-form";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { hrRecruitmentService } from "@/server/group/hr-recruitment";
import { HrRecruitingWorkspace } from "./hr-recruiting";
import { hrPayrollService } from "@/server/group/hr-payroll";
import { HrPayrollWorkspace } from "./hr-payroll";
import { HrOperationsWorkspace } from "./hr-operations";

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
    let employeeRows: Awaited<ReturnType<typeof hrEmploymentService.list>>;
    try {
      employeeRows = await hrEmploymentService.list(session.userId, { companyId: company?.organizationId, brandId: query.view === "add-employee" ? undefined : brand?.id, departmentId: query.departmentId, status: query.employmentStatus, search: query.search, page: employeePage });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2021", "P2022"].includes(error.code)) throw error;
      const correlationId = safeDiagnostic("operation_failed", undefined, { stage: "readiness", reason: "database_schema_missing" });
      return <section className="business-empty" role="alert"><h1>HR setup is pending</h1><p>The HR records cannot be loaded because the database schema does not match this release. No employee or access change was made. An operator must verify the database backup and apply the reviewed pending migrations.</p><p>Support reference: {correlationId}</p></section>;
    }
    const employees = employeeRows.slice(0, 50);
    const employeeNextPage = employeeRows.length > 50;
    const departments = company ? await prisma.organization.findMany({ where: { type: "DEPARTMENT", OR: [{ parentId: company.organizationId }, { parent: { parentId: company.organizationId } }] }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 100 }) : [];
    const records = !brand && data.readable.person ? await workforceService.list(session.userId, "people", { organizationId: company?.organizationId, search: query.search }) : [];
    const people = records.flatMap(row => "displayName" in row && "memberships" in row && Array.isArray(row.memberships) ? [{ id: row.id, displayName: String(row.displayName), status: String(row.status), memberships: row.memberships.map(member => ({ organizationId: member.organizationId })) }] : []);
    for (const employee of employees) if (!people.some(person => person.id === employee.person.id)) people.push({ id: employee.person.id, displayName: employee.person.displayName, status: employee.person.status, memberships: [] });
    let staffPanel: React.ReactNode = null;
    if (query.view === "manage" && company?.organization.slug === "aira-skill-city") {
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
    const roleScopes = company && ["access-permissions", "roles-access"].includes(query.view ?? "") ? await prisma.organization.findMany({ where: { OR: [{ id: company.organizationId }, { parentId: company.organizationId }] }, select: { id: true, name: true }, take: 100 }) : [];
    const roles = roleScopes.length ? await prisma.role.findMany({ where: { organizationId: { in: roleScopes.map(scope => scope.id) }, principalType: "HUMAN" }, select: { id: true, name: true, key: true, status: true, organizationId: true, permissions: { select: { permission: { select: { key: true } } } } }, orderBy: { name: "asc" }, take: 100 }) : [];
    const employeeHref = (page: number) => { const params = new URLSearchParams({ view: query.view ?? "people", page: String(page) }); if (company) params.set("companyId", company.organizationId); if (brand) params.set("brandId", brand.id); if (query.departmentId) params.set("departmentId", query.departmentId); if (query.employmentStatus) params.set("employmentStatus", query.employmentStatus); if (query.search) params.set("search", query.search); return `/app/boss/departments/hr?${params}`; };
    const employeePanel = <HrEmployees employees={employees} brands={brandChoices.map(item => ({ ...item, parentName: item.parentBrand?.name ?? null }))} departments={departments} companyId={company?.organizationId} people={people} view={query.view === "manage" ? "employees" : "directory"}/>;
    const recruitingData = query.view === "recruitment" && company ? await hrRecruitmentService.list(session.userId, company.organizationId) : null;
    const recruitingPanel = recruitingData && company ? <HrRecruitingWorkspace companyId={company.organizationId} companyName={company.legalName ?? company.displayName} companySlug={company.organization.slug} brands={brandChoices.map(item => ({ id: item.id, name: item.name }))} candidates={recruitingData.candidates} templates={recruitingData.templates} letters={recruitingData.letters} employees={employees.map(row => ({ id: row.id, status: row.status, designation: row.designation, person: { id: row.person.id, displayName: row.person.displayName, email: row.person.email } }))} mailReady={recruitingData.mailReady} webhookReady={recruitingData.webhookReady} documentStorageReady={recruitingData.documentStorageReady}/> : null;
    let payrollData: Awaited<ReturnType<typeof hrPayrollService.list>> | null = null, payrollSchemaPending = false;
    if (query.view === "payroll" && company) {
      try { payrollData = await hrPayrollService.list(session.userId, company.organizationId); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) payrollSchemaPending = true; else throw error; }
    }
    const payrollPanel = payrollSchemaPending ? <section className="executive-band" role="alert"><h2>Payroll database setup is pending</h2><p>The payroll tables are not in the active database yet. Apply the reviewed HR payroll migration through the normal release process before using this workspace.</p></section> : payrollData && company ? <HrPayrollWorkspace companyId={company.organizationId} companyName={payrollData.company.name} rules={payrollData.rules} compensation={payrollData.compensation} runs={payrollData.runs} employees={payrollData.employees} payslipStorageReady={payrollData.payslipStorageReady}/> : null;
    const { ctx } = await bossService.authority(session.userId);
    const canAddEmployee = !!company && (await ctx.decide("person.create", { organizationId: company.organizationId })).allowed;
    const readableCompanyIds = data.companies.map(row => row.organizationId).filter(id => ctx.organizationIds("person.read").includes(id));
    const draftCount = await prisma.employment.count({ where: { companyId: { in: company ? readableCompanyIds.filter(id => id === company.organizationId) : readableCompanyIds }, status: "DRAFT" } });
    const countWhere = { companyId: company?.organizationId ? { in: readableCompanyIds.filter(id => id === company.organizationId) } : { in: readableCompanyIds }, ...(brand ? { assignments: { some: { brandId: brand.id } } } : {}) };
    const employmentCounts = await prisma.employment.groupBy({ by: ["status"], where: countWhere, _count: { _all: true } });
    const hrCounts = { active: employmentCounts.find(row => row.status === "ACTIVE")?._count._all ?? 0, draft: employmentCounts.find(row => row.status === "DRAFT")?._count._all ?? 0, ended: employmentCounts.find(row => row.status === "ENDED")?._count._all ?? 0, total: employmentCounts.reduce((sum, row) => sum + row._count._all, 0) };
    const hrViewHref = (target: string, companyId: string, brandId?: string) => { const params = new URLSearchParams({ view: target, companyId }); if (brandId) params.set("brandId", brandId); return `/app/boss/departments/hr?${params}`; };
    const operationsView = ["reminders", "workflows", "reports", "launch-checks"].includes(query.view ?? "") ? query.view as "reminders" | "workflows" | "reports" | "launch-checks" : null;
    let operationsPanel: React.ReactNode = null;
    if (operationsView && company) {
      const withinBrand = brand ? { assignments: { some: { brandId: brand.id } } } : {};
      const scopedEmployment = { companyId: company.organizationId, ...withinBrand };
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 30);
      const [missingContacts, documentsDue, lettersNeedingAttention, payrollAwaitingReconciliation, categories, activeRules, activeRoles, companyConfig, brandReports] = await Promise.all([
        prisma.employment.count({ where: { ...scopedEmployment, status: "ACTIVE", OR: [{ contactEmail: null }, { contactPhone: null }, { emergencyContactName: null }, { emergencyContactPhone: null }] } }),
        prisma.hrDocument.count({ where: { companyId: company.organizationId, ...(brand ? { brandId: brand.id } : {}), status: "ACTIVE", retentionDueAt: { lte: cutoff } } }),
        prisma.hrLetter.count({ where: { companyId: company.organizationId, ...(brand ? { brandId: brand.id } : {}), status: { in: ["DRAFT", "FAILED", "DELIVERY_UNKNOWN"] } } }),
        prisma.hrPayrollRun.count({ where: { companyId: company.organizationId, status: "REVIEWED" } }),
        prisma.hrDocumentCategory.findMany({ where: { companyId: company.organizationId, active: true }, select: { retentionDays: true, retentionDecisionReference: true }, take: 100 }),
        prisma.hrPayrollRuleSet.findFirst({ where: { companyId: company.organizationId, status: "ACTIVE", accountantName: { not: null }, accountantReviewReference: { not: null }, accountantReviewedAt: { not: null } }, select: { id: true } }),
        prisma.role.count({ where: { organizationId: company.organizationId, principalType: "HUMAN", status: "ACTIVE" } }),
        prisma.hrCompanyOnboardingConfig.findUnique({ where: { companyId: company.organizationId }, select: { proposedPortalHost: true, proposedSenderEmail: true } }),
        !brand ? Promise.all(brandChoices.map(async row => {
          const where = { companyId: company.organizationId, assignments: { some: { brandId: row.id } } };
          const [groups, incomplete] = await Promise.all([prisma.employment.groupBy({ by: ["status"], where, _count: { _all: true } }), prisma.employment.count({ where: { ...where, status: "ACTIVE", OR: [{ contactEmail: null }, { contactPhone: null }, { emergencyContactName: null }, { emergencyContactPhone: null }] } })]);
          const count = (status: string) => groups.find(item => item.status === status)?._count._all ?? 0;
          return { id: row.id, name: row.name, active: count("ACTIVE"), drafts: count("DRAFT"), ended: count("ENDED"), missingContacts: incomplete };
        })) : Promise.resolve([]),
      ]);
      const report = { active: hrCounts.active, drafts: hrCounts.draft, ended: hrCounts.ended, missingContacts, documentsDue, lettersNeedingAttention, payrollAwaitingReconciliation };
      const reminders = [
        ...(hrCounts.draft ? [{ title: `Employment drafts (${hrCounts.draft})`, detail: "Complete employee and assignment details", href: hrViewHref("people", company.organizationId, brand?.id) }] : []),
        ...(missingContacts ? [{ title: `Incomplete employee profiles (${missingContacts})`, detail: "Add contact and emergency contact details", href: hrViewHref("people", company.organizationId, brand?.id) }] : []),
        ...(documentsDue ? [{ title: `Documents due for review (${documentsDue})`, detail: "Review retention dates and recorded policy references", href: hrViewHref("documents", company.organizationId, brand?.id) }] : []),
        ...(lettersNeedingAttention ? [{ title: `Letters needing attention (${lettersNeedingAttention})`, detail: "Draft, failed, or uncertain delivery status", href: hrViewHref("recruitment", company.organizationId, brand?.id) }] : []),
        ...(payrollAwaitingReconciliation ? [{ title: `Payroll registers awaiting reconciliation (${payrollAwaitingReconciliation})`, detail: "Review payments and reconcile against evidence", href: hrViewHref("payroll", company.organizationId, brand?.id) }] : []),
      ];
      const checks = [
        { label: "Company HR records", status: hrCounts.total ? "ready" as const : "attention" as const, detail: `${hrCounts.total} employment records are available in this scope.` },
        { label: "Brand assignment coverage", status: !brand || hrCounts.total ? "ready" as const : "attention" as const, detail: brand ? `${hrCounts.total} employee records are assigned to ${brand.name}.` : "Choose a brand to verify its employee assignment coverage." },
        { label: "Human staff roles", status: activeRoles ? "ready" as const : "attention" as const, detail: `${activeRoles} active human roles are configured at company level.` },
        { label: "Document retention decisions", status: categories.length && categories.every(item => item.retentionDays !== null && !!item.retentionDecisionReference) ? "ready" as const : "attention" as const, detail: categories.length ? `${categories.filter(item => item.retentionDays !== null && item.retentionDecisionReference).length} of ${categories.length} active categories have a recorded retention period and reference.` : "No active document categories have been configured." },
        { label: "Letter templates", status: await prisma.hrLetterTemplate.count({ where: { companyId: company.organizationId, active: true, ...(brand ? { OR: [{ brandId: null }, { brandId: brand.id }] } : {}) } }).then(n => n ? "ready" as const : "attention" as const), detail: "Use company-reviewed templates and verify sender setup before delivery." },
        { label: "Accountant-reviewed payroll rules", status: activeRules ? "ready" as const : "attention" as const, detail: activeRules ? "An active rule set has a recorded accountant name and review reference." : "Payroll register creation remains unavailable until reviewed rules are recorded." },
        { label: "Sender and brand domain verification", status: "attention" as const, detail: companyConfig?.proposedPortalHost && companyConfig.proposedSenderEmail ? `Proposed ${companyConfig.proposedPortalHost} / ${companyConfig.proposedSenderEmail}; verify domain ownership and sender with the provider.` : "Record the intended portal host and sender, then verify them with the domain and email providers." },
      ];
      const workflows = [
        { title: "Hire and onboard", detail: "Create an employment draft, assign a brand, and complete the employee profile.", href: hrViewHref("add-employee", company.organizationId, brand?.id) },
        { title: "Recruit and send a letter", detail: "Manage candidates, use a saved template, preview and track delivery.", href: hrViewHref("recruitment", company.organizationId, brand?.id) },
        { title: "Compensation and monthly payroll", detail: "Record effective compensation, prepare a register, store payslips, and reconcile.", href: hrViewHref("payroll", company.organizationId, brand?.id) },
        { title: "Maintain employee records", detail: "Search staff, update profiles, and manage private documents.", href: hrViewHref("people", company.organizationId, brand?.id) },
        { title: "Review access and roles", detail: "Check employee access separately from job titles and brand assignments.", href: hrViewHref("roles-access", company.organizationId, brand?.id) },
      ];
      operationsPanel = <HrOperationsWorkspace view={operationsView} companyId={company.organizationId} companyName={company.legalName ?? company.displayName} brandName={brand?.name} reminders={reminders} checks={checks} report={report} brandReports={brandReports} workflows={workflows} reminderMode="ready"/>;
    }
    const groupedAssignments = company && query.view === "organization" ? await prisma.hrAssignment.groupBy({ by: ["brandId"], where: { brandId: { in: brandChoices.map(row => row.id) }, status: "ACTIVE", employment: { companyId: company.organizationId, status: "ACTIVE" } }, _count: { _all: true } }) : [];
    const brandCounts = Object.fromEntries(groupedAssignments.map(row => [row.brandId, row._count._all]));
    const onboardingPanel = canAddEmployee && company ? <HrOnboarding companyId={company.organizationId} companyName={company.legalName ?? company.displayName} brands={brandChoices.map(row => ({ id: row.id, name: row.name, parentName: row.parentBrand?.name ?? null, status: row.status }))} people={people.map(person => ({ id: person.id, displayName: person.displayName, email: employees.find(row => row.person.id === person.id)?.person.email ?? null }))} departments={departments} managers={employees.filter(row => row.status === "ACTIVE").map(row => ({ personId: row.person.id, name: row.person.displayName })).filter((row, index, all) => all.findIndex(candidate => candidate.personId === row.personId) === index)}/> : null;
    return <CentralHrWorkspace companies={data.companies} brands={brandChoices.map(item => ({ ...item, parentName: item.parentBrand?.name ?? null }))} company={company} brand={brand} view={query.view} search={query.search} recruitingPanel={recruitingPanel} payrollPanel={payrollPanel} operationsPanel={operationsPanel} onboardingPanel={onboardingPanel} employeePanel={employeePanel} staffPanel={staffPanel} configPanel={<HrCompanySettings companies={onboardingSettings}/>} rolePanel={<section className="executive-band"><h2>Scoped human roles</h2>{!company ? <p>Select a company to view its roles.</p> : <><p>Designations do not grant access. Roles start with only their explicitly assigned permissions.</p>{company.organization.slug === "aira-skill-city" && <RoleTemplateForm/>}<Link href={`/app/workforce/roles?organization=${encodeURIComponent(company.organizationId)}&create=true`}>Create company role</Link>{!roles.length && <p>No human roles in this company scope.</p>}<ul>{roles.map(role => <li key={role.id}><strong>{role.name}</strong> · {role.status} · {roleScopes.find(scope => scope.id === role.organizationId)?.name} · {role.permissions.length} permissions · <Link href={`/app/workforce/roles?organization=${encodeURIComponent(role.organizationId ?? company.organizationId)}`}>Manage role and permissions</Link></li>)}</ul></>}</section>} departments={departments} departmentId={query.departmentId} employmentStatus={query.employmentStatus} draftCount={draftCount} counts={hrCounts} brandCounts={brandCounts} canAddEmployee={canAddEmployee} previousPage={employeePage > 1 ? employeeHref(employeePage - 1) : undefined} nextPage={employeeNextPage ? employeeHref(employeePage + 1) : undefined}/>;
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
