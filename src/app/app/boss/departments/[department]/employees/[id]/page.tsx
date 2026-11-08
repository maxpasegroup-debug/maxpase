import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService, hrProfileCompleteness } from "@/server/group/hr-employment";
import { hrAccess } from "@/server/group/hr-access";
import { hrDocuments } from "@/server/group/hr-documents";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { staffOnboardingService } from "@/server/skillcity/staff-onboarding";
import { prisma } from "@/server/db";
import { HrDocumentPanel } from "./panel";
import { HrAccessPanel } from "./access/panel";
import { HrStaffAppointment } from "./access/staff-appointment";
import { HrEmployeeProfileForm } from "./profile-form";

const tabs = ["overview", "work", "access", "documents", "history"] as const;
type Tab = typeof tabs[number];
const labels: Record<Tab, string> = { overview: "Overview", work: "Work & assignments", access: "Access", documents: "Documents", history: "History" };

export default async function EmployeeProfilePage({ params, searchParams }: { params: Promise<{ department: string; id: string }>; searchParams: Promise<{ tab?: string; category?: string; search?: string }> }) {
  const { department, id } = await params;
  if (department !== "hr") notFound();
  const query = await searchParams;
  const tab: Tab = tabs.includes(query.tab as Tab) ? query.tab as Tab : "overview";
  const session = await requireSession();
  try {
    const employee = await hrEmploymentService.get(session.userId, id);
    const access = await hrAccess.overview(session.userId, id);
    const canEditProfile = tab === "overview" ? await hrEmploymentService.canUpdateProfile(session.userId, id) : false;
    const base = `/app/boss/departments/hr/employees/${encodeURIComponent(id)}`;
    const activeAssignments = employee.assignments.filter(row => row.status === "ACTIVE");
    const canLogIn = employee.status === "ACTIVE" && access.account?.status === "ACTIVE" && access.account.verified && access.memberships.some(row => row.status === "ACTIVE");
    const profileCompleteness = hrProfileCompleteness({ ...employee, displayName: employee.person.displayName, email: employee.person.email });
    const staffScopes: { organizationId: string; name: string; roleId: string; roleName: string; managers: { id: string; email: string }[] }[] = [];
    const staffDrafts: { scopeId: string; rows: { id: string; email: string; role: string; reviewable: boolean; decisionsRecorded: boolean }[]; managers: { id: string; email: string }[] }[] = [];
    if (tab === "access" && employee.status === "ACTIVE" && employee.person.email && (!access.account || access.account.status === "INACTIVE")) {
      for (const target of access.targets) {
        const desiredRole = target.brandId ? "Full Stack Developer" : "Administrative Officer";
        const options = await staffOnboardingService.options(session.userId, target.id).catch(error => { if (error instanceof AccessError) return null; throw error; });
        if (!options?.canPrepare) continue;
        const role = options.roles.find(item => item.name === desiredRole);
        if (!access.account && role) staffScopes.push({ organizationId: target.id, name: target.name, roleId: role.id, roleName: desiredRole, managers: options.managers });
        if (access.account?.status === "INACTIVE") {
          const rows = await staffInvite.drafts(session.userId, target.id).catch(error => { if (error instanceof AccessError) return []; throw error; });
          const own = rows.filter(row => row.id === access.account?.id);
          if (own.length) staffDrafts.push({ scopeId: target.id, rows: own, managers: options.managers });
        }
      }
    }
    const [categories, documents, canManageDocuments, canManageCompanyDocuments] = tab === "documents" ? await Promise.all([hrDocuments.categories(session.userId, employee.companyId), hrDocuments.list(session.userId, id, { categoryKey: query.category, search: query.search }), hrDocuments.canManage(session.userId, id), hrDocuments.canManageCompany(session.userId, employee.companyId)]) : [[], [], false, false];
    const history = tab === "history" ? await prisma.operationalEvent.findMany({ where: { organizationId: employee.companyId, OR: [{ entityType: "Employment", entityId: id }, { entityType: "HrAssignment", entityId: { in: employee.assignments.map(row => row.id) } }] }, select: { id: true, eventType: true, status: true, createdAt: true, actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) : [];
    return <div className="boss-view boss-hr-profile"><header className="boss-heading"><div><p className="eyebrow">PEOPLE / {employee.company.name}</p><h1>{employee.person.displayName}</h1><p>{employee.designation || "Designation pending"} · {employee.status}</p></div><Link href={`/app/boss/departments/hr?companyId=${encodeURIComponent(employee.companyId)}&view=people`}>← Back to people</Link></header>
      <nav className="boss-hr-tabs" aria-label="Employee profile">{tabs.map(item => <Link key={item} href={`${base}?tab=${item}`} aria-current={tab === item ? "page" : undefined}>{labels[item]}</Link>)}</nav>
      {tab === "overview" && <><section className="executive-band"><h2>At a glance</h2><div className="boss-hr-profile-facts"><div><span>Company</span><strong>{employee.company.name}</strong></div><div><span>Employment</span><strong>{employee.status}</strong></div><div><span>Works with</span><strong>{activeAssignments.map(row => row.brand.name).join(", ") || "No active assignment"}</strong></div><div><span>Login access</span><strong>{canLogIn ? "Active, verified and scoped" : access.account ? "Pending review or inactive" : "No linked account"}</strong></div></div><p>Invitation: {access.invitation?.status ?? "Not sent"}. Account access requires verification, an authorized role and an active membership.</p><Link href={`${base}?tab=work`}>Review assignments</Link> · <Link href={`${base}?tab=access`}>Review access</Link></section><HrEmployeeProfileForm profile={{ employmentId: employee.id, identityEmail: employee.person.email, contactEmail: employee.contactEmail, contactPhone: employee.contactPhone, emergencyContactName: employee.emergencyContactName, emergencyContactRelationship: employee.emergencyContactRelationship, emergencyContactPhone: employee.emergencyContactPhone, emergencyContactEmail: employee.emergencyContactEmail, completeness: profileCompleteness }} editable={canEditProfile && employee.status !== "ENDED"}/></>}
      {tab === "work" && <section className="executive-band"><h2>Work &amp; assignments</h2><p>Assignments are historical records. A draft assignment grants no workspace access.</p>{employee.assignments.length ? <ul className="boss-hr-structure">{employee.assignments.map(row => <li key={row.id}><strong>{row.brand.name}</strong><span>{row.designation} · {row.status} · {new Date(row.startDate).toLocaleDateString()}{row.endDate ? ` to ${new Date(row.endDate).toLocaleDateString()}` : ""} · {row.department?.name ?? "No department"} · Manager: {row.manager?.displayName ?? "Unassigned"}</span></li>)}</ul> : <p>No brand assignments yet.</p>}<Link href={`/app/boss/departments/hr?companyId=${encodeURIComponent(employee.companyId)}&view=manage&search=${encodeURIComponent(employee.person.displayName)}`}>Add, transfer or end assignments</Link></section>}
      {tab === "access" && <>{employee.status !== "ACTIVE" && <p role="status">Activate the employment record before preparing a staff account. <Link href={`/app/boss/departments/hr?companyId=${encodeURIComponent(employee.companyId)}&view=manage&search=${encodeURIComponent(employee.person.displayName)}`}>Review employment</Link></p>}{employee.status === "ACTIVE" && employee.assignments.some(row => row.brand.slug === "aira-labs" && row.status === "DRAFT") && <p role="status">Activate the AIRA Labs assignment before inviting a developer. <Link href={`/app/boss/departments/hr?companyId=${encodeURIComponent(employee.companyId)}&view=manage&search=${encodeURIComponent(employee.person.displayName)}`}>Review assignments</Link></p>}<HrStaffAppointment employmentId={id} scopes={staffScopes} drafts={staffDrafts} deliveryReady={staffInvite.deliveryReady()}/><HrAccessPanel employmentId={id} data={access} deliveryReady={staffInvite.deliveryReady()} managedInvite={staffDrafts.length > 0}/></>}
      {tab === "documents" && <HrDocumentPanel employmentId={id} companyId={employee.companyId} employeeName={employee.person.displayName} activeEmployment={employee.status !== "ENDED"} canManage={canManageDocuments} canManageCompany={canManageCompanyDocuments} configured={hrDocuments.configured()} categories={categories} assignments={activeAssignments.map(row => ({ id: row.brand.id, name: row.brand.name }))} documents={documents.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null, retentionDueAt: row.retentionDueAt?.toISOString() ?? null, retentionReviewedAt: row.retentionReviewedAt?.toISOString() ?? null }))} selectedCategory={query.category ?? ""} search={query.search ?? ""}/>}
      {tab === "history" && <section className="executive-band"><h2>Employment history</h2>{history.length ? <ul className="boss-hr-history">{history.map(row => <li key={row.id}><strong>{row.eventType.replaceAll("_", " ")}</strong><span>{new Date(row.createdAt).toLocaleString()} · {row.status} · {row.actor?.email ?? "System"}</span></li>)}</ul> : <p>No employment or assignment events are recorded in this scope.</p>}<p>Access and invitation changes are recorded in the <Link href={`${base}?tab=access`}>Access</Link> tab.</p></section>}
    </div>;
  } catch (error) { if (error instanceof AccessError) notFound(); throw error; }
}
