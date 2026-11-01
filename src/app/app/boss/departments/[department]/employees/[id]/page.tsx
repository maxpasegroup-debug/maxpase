import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { hrAccess } from "@/server/group/hr-access";
import { hrDocuments } from "@/server/group/hr-documents";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { prisma } from "@/server/db";
import { HrDocumentPanel } from "./panel";
import { HrAccessPanel } from "./access/panel";

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
    const base = `/app/boss/departments/hr/employees/${encodeURIComponent(id)}`;
    const activeAssignments = employee.assignments.filter(row => row.status === "ACTIVE");
    const canLogIn = employee.status === "ACTIVE" && access.account?.status === "ACTIVE" && access.account.verified && access.memberships.some(row => row.status === "ACTIVE");
    const [categories, documents] = tab === "documents" ? await Promise.all([hrDocuments.categories(session.userId, employee.companyId), hrDocuments.list(session.userId, id, { categoryKey: query.category, search: query.search })]) : [[], []];
    const history = tab === "history" ? await prisma.operationalEvent.findMany({ where: { organizationId: employee.companyId, OR: [{ entityType: "Employment", entityId: id }, { entityType: "HrAssignment", entityId: { in: employee.assignments.map(row => row.id) } }] }, select: { id: true, eventType: true, status: true, createdAt: true, actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) : [];
    return <div className="boss-view boss-hr-profile"><header className="boss-heading"><div><p className="eyebrow">PEOPLE / {employee.company.name}</p><h1>{employee.person.displayName}</h1><p>{employee.designation || "Designation pending"} · {employee.status}</p></div><Link href={`/app/boss/departments/hr?companyId=${encodeURIComponent(employee.companyId)}&view=people`}>← Back to people</Link></header>
      <nav className="boss-hr-tabs" aria-label="Employee profile">{tabs.map(item => <Link key={item} href={`${base}?tab=${item}`} aria-current={tab === item ? "page" : undefined}>{labels[item]}</Link>)}</nav>
      {tab === "overview" && <section className="executive-band"><h2>At a glance</h2><div className="boss-hr-profile-facts"><div><span>Company</span><strong>{employee.company.name}</strong></div><div><span>Employment</span><strong>{employee.status}</strong></div><div><span>Works with</span><strong>{activeAssignments.map(row => row.brand.name).join(", ") || "No active assignment"}</strong></div><div><span>Login access</span><strong>{canLogIn ? "Active, verified and scoped" : access.account ? "Pending review or inactive" : "No linked account"}</strong></div></div><p>Invitation: {access.invitation?.status ?? "Not sent"}. Account access requires verification, an authorized role and an active membership.</p><Link href={`${base}?tab=work`}>Review assignments</Link> · <Link href={`${base}?tab=access`}>Review access</Link></section>}
      {tab === "work" && <section className="executive-band"><h2>Work &amp; assignments</h2><p>Assignments are historical records. A draft assignment grants no workspace access.</p>{employee.assignments.length ? <ul className="boss-hr-structure">{employee.assignments.map(row => <li key={row.id}><strong>{row.brand.name}</strong><span>{row.designation} · {row.status} · {new Date(row.startDate).toLocaleDateString()}{row.endDate ? ` to ${new Date(row.endDate).toLocaleDateString()}` : ""} · {row.department?.name ?? "No department"} · Manager: {row.manager?.displayName ?? "Unassigned"}</span></li>)}</ul> : <p>No brand assignments yet.</p>}<Link href={`/app/boss/departments/hr?companyId=${encodeURIComponent(employee.companyId)}&view=manage&search=${encodeURIComponent(employee.person.displayName)}`}>Add, transfer or end assignments</Link></section>}
      {tab === "access" && <HrAccessPanel employmentId={id} data={access} deliveryReady={staffInvite.deliveryReady()}/>}
      {tab === "documents" && <HrDocumentPanel employmentId={id} companyId={employee.companyId} employeeName={employee.person.displayName} activeEmployment={employee.status !== "ENDED"} configured={hrDocuments.configured()} categories={categories} assignments={activeAssignments.map(row => ({ id: row.brand.id, name: row.brand.name }))} documents={documents.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null }))} selectedCategory={query.category ?? ""} search={query.search ?? ""}/>}
      {tab === "history" && <section className="executive-band"><h2>Employment history</h2>{history.length ? <ul className="boss-hr-history">{history.map(row => <li key={row.id}><strong>{row.eventType.replaceAll("_", " ")}</strong><span>{new Date(row.createdAt).toLocaleString()} · {row.status} · {row.actor?.email ?? "System"}</span></li>)}</ul> : <p>No employment or assignment events are recorded in this scope.</p>}<p>Access and invitation changes are recorded in the <Link href={`${base}?tab=access`}>Access</Link> tab.</p></section>}
    </div>;
  } catch (error) { if (error instanceof AccessError) notFound(); throw error; }
}
