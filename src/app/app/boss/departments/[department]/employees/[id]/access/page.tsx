import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { hrAccess } from "@/server/group/hr-access";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { HrAccessPanel } from "./panel";

export default async function HrAccessPage({ params }: { params: Promise<{ department: string; id: string }> }) {
  const { department, id } = await params;
  if (department !== "hr") notFound();
  const session = await requireSession();
  try {
    const [employee, overview] = await Promise.all([hrEmploymentService.get(session.userId, id), hrAccess.overview(session.userId, id)]);
    return <div className="boss-view"><header className="boss-heading"><div><p className="eyebrow">MAXPASE HR / EMPLOYEE</p><h1>{employee.person.displayName}</h1><p>{employee.company.name} · {employee.status}</p></div><Link href={`/app/boss/departments/hr?companyId=${encodeURIComponent(employee.companyId)}&view=employees`}>Back to employees</Link></header><nav className="boss-detail-links" aria-label="Employee profile"><Link href={`/app/boss/departments/hr/employees/${encodeURIComponent(id)}`}>Documents</Link><strong aria-current="page">Access &amp; onboarding</strong></nav><HrAccessPanel employmentId={id} data={overview} deliveryReady={staffInvite.deliveryReady()}/></div>;
  } catch (error) { if (error instanceof AccessError) notFound(); throw error; }
}
