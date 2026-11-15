"use server";
import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { hrCompanyConfig } from "@/server/group/hr-company-config";
import { hrAccess } from "@/server/group/hr-access";
import { staffOnboardingService } from "@/server/skillcity/staff-onboarding";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { niceJobsDirectorInvite } from "@/server/auth/nicejobs-director-invite";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type HrState = { message?: string; error?: string; employmentId?: string; inviteSent?: boolean; activationUrl?: string };
async function appoint(actorId: string, form: FormData): Promise<HrState> {
  const val = (key: string) => String(form.get(key) ?? "").trim();
  const data = z.object({ companyId: z.string().min(1), brandId: z.string().optional(), designation: z.string().trim().min(2).max(120), displayName: z.string().trim().min(2).max(200), email: z.email().max(254).transform(v => v.toLowerCase()), phone: z.string().trim().regex(/^\+?[0-9().\-\s]{7,24}$/), joiningDate: z.coerce.date() }).strict().parse({ companyId: val("companyId"), ...(val("brandId") ? { brandId: val("brandId") } : {}), designation: val("designation"), displayName: val("displayName"), email: val("email"), phone: val("phone"), joiningDate: val("joiningDate") });
  const reference = "Boss HR appointment";
  let employmentId: string | undefined;
  try {
    employmentId = await hrEmploymentService.create(actorId, { companyId: data.companyId, displayName: data.displayName, email: data.email, phone: data.phone, designation: data.designation, joiningDate: data.joiningDate, initialBrandIds: data.brandId ? [data.brandId] : [], assignmentDecisionReference: data.brandId ? reference : undefined });
    await hrEmploymentService.changeEmployment(actorId, { employmentId, action: "activate", decisionReference: reference, designation: data.designation, joiningDate: data.joiningDate });
    let employee = await hrEmploymentService.get(actorId, employmentId);
    if (data.brandId) {
      const assignment = employee.assignments.find(item => item.brandId === data.brandId && item.status === "DRAFT");
      if (!assignment) throw new AccessError("The selected workspace assignment could not be prepared");
      await hrEmploymentService.changeAssignment(actorId, { assignmentId: assignment.id, action: "activate", decisionReference: reference });
      employee = await hrEmploymentService.get(actorId, employmentId);
    }
    const overview = await hrAccess.overview(actorId, employmentId);
    const target = overview.targets.find(item => data.brandId ? item.brandId === data.brandId : item.id === data.companyId && !item.brandId);
    if (!target) throw new AccessError("The selected dashboard workspace is not configured for appointments");
    const expected = data.designation === "Director" ? "Division Director" : data.designation;
    const role = overview.roles.find(item => item.organizationId === target.id && item.name === expected);
    if (!role) throw new AccessError("The dashboard role is not configured for this workspace. The employee record is saved; access remains pending.");
    let delivery: { sent: boolean; activationUrl?: string };
    if (data.designation === "NICEJOBS Director") {
      const nationalNumber = data.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
      const appointment = await hrAccess.prepareNiceJobsDirector(actorId, { employmentId, organizationId: target.id, roleId: role.id, country: "IN", nationalNumber, decisionReference: reference });
      delivery = await niceJobsDirectorInvite.send(actorId, { userId: appointment.userId });
    } else {
      const draft = await staffOnboardingService.prepare(actorId, { organizationId: target.id, existingPersonId: employee.person.id, roleId: role.id, scopeDecisionReference: reference });
      delivery = await staffInvite.send(actorId, { userId: draft.id, verificationEvidence: "Boss-approved appointment recorded in HR." });
    }
    revalidatePath("/app/boss/departments/hr");
    revalidatePath("/app/boss/departments/hr/employees/" + encodeURIComponent(employmentId));
    return { employmentId, inviteSent: delivery.sent, activationUrl: delivery.activationUrl, message: "Appointment saved. The secure setup invitation was emailed. The employee must verify their identity and set their own sign-in credential before dashboard access is enabled." };
  } catch (error) {
    if (employmentId) { revalidatePath("/app/boss/departments/hr"); return { employmentId, message: "The employee record is saved. Dashboard access remains pending until the setup invitation is completed.", error: error instanceof AccessError ? error.message : "Setup access could not be prepared. Open the employee record to review it." }; }
    throw error;
  }
}

export async function hrAction(_state: HrState, form: FormData): Promise<HrState> {
  const session = await requireSession();
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const optional = (key: string) => value(key) || undefined;
  try {
    let employmentId: string | undefined;
    if (value("intent") === "appoint") return await appoint(session.userId, form);
    switch (value("intent")) {
      case "create": employmentId = await hrEmploymentService.create(session.userId, { companyId: value("companyId"), ...(optional("personId") ? { personId: value("personId") } : { displayName: value("displayName"), email: value("email"), phone: optional("phone"), linkExisting: value("linkExisting") === "on" }), contactEmail: optional("contactEmail"), contactPhone: optional("contactPhone"), emergencyContactName: optional("emergencyContactName"), emergencyContactRelationship: optional("emergencyContactRelationship"), emergencyContactPhone: optional("emergencyContactPhone"), emergencyContactEmail: optional("emergencyContactEmail"), designation: optional("designation"), employmentType: optional("employmentType"), joiningDate: optional("joiningDate"), initialBrandIds: form.getAll("initialBrandIds").map(String), initialDepartmentId: optional("initialDepartmentId"), initialManagerPersonId: optional("initialManagerPersonId"), assignmentDecisionReference: optional("assignmentDecisionReference") }); break;
      case "assign": await hrEmploymentService.addAssignment(session.userId, { employmentId: value("employmentId"), brandId: value("brandId"), departmentId: optional("departmentId"), managerPersonId: optional("managerPersonId"), designation: value("designation"), startDate: value("startDate"), decisionReference: value("decisionReference") }); break;
      case "employment": await hrEmploymentService.changeEmployment(session.userId, { employmentId: value("employmentId"), action: value("transition"), decisionReference: value("decisionReference"), designation: optional("designation"), employmentType: optional("employmentType"), joiningDate: optional("joiningDate") }); break;
      case "assignment": await hrEmploymentService.changeAssignment(session.userId, { assignmentId: value("assignmentId"), action: value("transition"), decisionReference: value("decisionReference"), nextBrandId: optional("nextBrandId"), designation: optional("designation"), departmentId: optional("departmentId"), managerPersonId: optional("managerPersonId") }); break;
      case "company-proposal": await hrCompanyConfig.saveProposal(session.userId, { companyId: value("companyId"), proposedPortalHost: optional("proposedPortalHost"), proposedSenderEmail: optional("proposedSenderEmail"), decisionReference: value("decisionReference") }); break;
      default: throw new AccessError("Unknown HR action");
    }
    revalidatePath("/app/boss/departments/hr");
    return { message: employmentId ? "Employee record and selected brand assignments saved as drafts. Login access is pending." : "HR record updated. Login access is unchanged.", employmentId };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the required fields and dates." };
    safeDiagnostic("operation_failed");
    return { error: "The HR change could not be saved." };
  }
}
