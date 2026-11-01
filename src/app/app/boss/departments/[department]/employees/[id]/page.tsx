import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { hrDocuments } from "@/server/group/hr-documents";
import { HrDocumentPanel } from "./panel";

export default async function EmployeeDocumentsPage({ params, searchParams }: { params: Promise<{ department: string; id: string }>; searchParams: Promise<{ category?: string; search?: string }> }) {
  const { department, id } = await params;
  if (department !== "hr") notFound();
  const session = await requireSession();
  try {
    const employee = await hrEmploymentService.get(session.userId, id);
    const query = await searchParams;
    const [categories, documents] = await Promise.all([hrDocuments.categories(session.userId, employee.companyId), hrDocuments.list(session.userId, id, { categoryKey: query.category, search: query.search })]);
    return <div className="boss-view boss-hr-documents"><header className="boss-heading"><div><p className="eyebrow">MAXPASE HR / EMPLOYEE</p><h1>{employee.person.displayName}</h1><p>{employee.company.name} · {employee.status}</p></div><Link href={`/app/boss/departments/hr?companyId=${encodeURIComponent(employee.companyId)}&view=employees`}>Back to employees</Link></header>
      <nav className="boss-detail-links" aria-label="Employee profile"><Link href={`/app/workforce/people?recordId=${encodeURIComponent(employee.person.id)}&organization=${encodeURIComponent(employee.companyId)}`}>Profile</Link><strong aria-current="page">Documents</strong><Link href={`/app/boss/departments/hr/employees/${encodeURIComponent(employee.id)}/access`}>Access &amp; onboarding</Link></nav>
      <HrDocumentPanel employmentId={employee.id} companyId={employee.companyId} employeeName={employee.person.displayName} activeEmployment={employee.status !== "ENDED"} configured={hrDocuments.configured()} categories={categories} assignments={employee.assignments.filter(a => a.status === "ACTIVE").map(a => ({ id: a.brand.id, name: a.brand.name }))} documents={documents.map(d => ({ ...d, createdAt: d.createdAt.toISOString(), archivedAt: d.archivedAt?.toISOString() ?? null }))} selectedCategory={query.category ?? ""} search={query.search ?? ""}/>
    </div>;
  } catch (error) { if (error instanceof AccessError) notFound(); throw error; }
}
