import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService, hrProfileCompleteness } from "@/server/group/hr-employment";
import { bossService } from "@/server/group/boss-service";
import { HrEmployeeProfileForm } from "./profile-form";
import { EmployeeRemoval } from "./removal";

export default async function EmployeeDetailsPage({ params }: { params: Promise<{ department: string; id: string }> }) {
  const { department, id } = await params;
  if (department !== "hr") notFound();
  const session = await requireSession();
  let employee: Awaited<ReturnType<typeof hrEmploymentService.get>>;
  try { employee = await hrEmploymentService.get(session.userId, id); }
  catch (error) { if (error instanceof AccessError) notFound(); throw error; }

  const editable = await hrEmploymentService.canUpdateProfile(session.userId, id);
  let canDeletePermanently = false;
  try { await bossService.authority(session.userId); canDeletePermanently = true; }
  catch (error) { if (!(error instanceof AccessError)) throw error; }
  const profile = {
    employmentId: employee.id,
    displayName: employee.person.displayName,
    identityEmail: employee.person.email,
    identityPhone: employee.person.phone,
    contactEmail: employee.contactEmail,
    contactPhone: employee.contactPhone,
    emergencyContactName: employee.emergencyContactName,
    emergencyContactRelationship: employee.emergencyContactRelationship,
    emergencyContactPhone: employee.emergencyContactPhone,
    emergencyContactEmail: employee.emergencyContactEmail,
    completeness: hrProfileCompleteness({ ...employee, displayName: employee.person.displayName, email: employee.person.email }),
  };
  const activeAssignments = employee.assignments.filter(assignment => assignment.status === "ACTIVE");

  return <main className="boss-view boss-hr-employee-profile-page">
    <nav className="boss-crumbs" aria-label="Breadcrumb"><Link href="/app/boss">MAXPASE</Link><span>›</span><Link href="/app/boss/departments/hr?view=people">People &amp; HR</Link><span>›</span><span>{employee.person.displayName}</span></nav>
    <header className="boss-heading boss-hr-profile-heading">
      <div><p className="eyebrow">EMPLOYEE PROFILE · {employee.company.name}</p><h1>{employee.person.displayName}</h1><p>{employee.designation || activeAssignments[0]?.designation || "Employee"} · {employee.status}</p></div>
      <div className="boss-hr-profile-header-actions">
        <Link className="button secondary" href="#employee-profile">Edit profile</Link>
        <EmployeeRemoval employmentId={employee.id} employeeName={employee.person.displayName} canArchive={editable && employee.status !== "ENDED"} canDeletePermanently={canDeletePermanently} />
        <Link href="/app/boss/departments/hr?view=people">Back to employees</Link>
      </div>
    </header>
    <section className="executive-band boss-hr-profile-summary">
      <div><small>Work email</small><strong>{employee.person.email ?? "Not recorded"}</strong></div>
      <div><small>Mobile</small><strong>{employee.person.phone ?? "Not recorded"}</strong></div>
      <div><small>Joining date</small><strong>{employee.startDate?.toLocaleDateString() ?? "Not recorded"}</strong></div>
      <div><small>Dashboard assignment</small><strong>{activeAssignments.length ? activeAssignments.map(assignment => assignment.brand.name).join(", ") : "No active brand assignment"}</strong></div>
    </section>
    <div id="employee-profile"><HrEmployeeProfileForm profile={profile} editable={editable && employee.status !== "ENDED"} /></div>
  </main>;
}
