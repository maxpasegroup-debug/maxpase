"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { hrCompanyConfig } from "@/server/group/hr-company-config";
import { hrAccess } from "@/server/group/hr-access";
import { staffOnboardingService } from "@/server/skillcity/staff-onboarding";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { niceJobsDirectorInvite } from "@/server/auth/nicejobs-director-invite";
import { prisma } from "@/server/db";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type HrState = { message?: string; error?: string; employmentId?: string; inviteSent?: boolean; activationUrl?: string; shareMessage?: string; shareEmail?: string; removed?: boolean };
async function appoint(actorId: string, form: FormData): Promise<HrState> {
  const val = (key: string) => String(form.get(key) ?? "").trim();
  const data = z.object({ companyId: z.string().min(1), brandId: z.string().optional(), designation: z.string().trim().min(2).max(120), displayName: z.string().trim().min(2).max(200), email: z.email().max(254).transform(v => v.toLowerCase()), phone: z.string().trim().regex(/^\+?[0-9().\-\s]{7,24}$/), joiningDate: z.coerce.date(), reportToUserId: z.string().min(1) }).strict().parse({ companyId: val("companyId"), ...(val("brandId") ? { brandId: val("brandId") } : {}), designation: val("designation"), displayName: val("displayName"), email: val("email"), phone: val("phone"), joiningDate: val("joiningDate"), reportToUserId: val("reportToUserId") });
  const reference = "Boss HR appointment";
  if (data.designation === "NICEJOBS Director") throw new AccessError("NICEJOBS administration is managed from the Boss NICEJOBS module.");
  let employmentId: string | undefined;
  try {
    const reportingPerson = await prisma.user.findUnique({ where: { id: data.reportToUserId }, select: { personId: true, status: true, emailVerifiedAt: true } });
    if (!reportingPerson?.personId || reportingPerson.status !== "ACTIVE" || !reportingPerson.emailVerifiedAt) throw new AccessError("The selected reporting person is no longer active. Choose another person.");
    const requestedStartupAo = data.designation === "Administrative Officer" && !!data.brandId;
    if (requestedStartupAo) {
      const [startupBrand, startupDivision] = await Promise.all([
        prisma.brand.findFirst({ where: { id: data.brandId, organizationId: data.companyId, slug: "startup-school" }, select: { id: true } }),
        prisma.organization.findFirst({ where: { slug: "aira-startup-school", parentId: data.companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } })
      ]);
      if (!startupBrand || !startupDivision) throw new AccessError("Startup Skool AO appointments must be assigned to the active Startup Skool work area.");
      const directorMembership = await prisma.membership.findFirst({
        where: {
          personId: reportingPerson.personId,
          organizationId: startupDivision.id,
          projectId: null,
          status: "ACTIVE",
          roles: { some: { role: { organizationId: startupDivision.id, key: "startup-division-director", status: "ACTIVE" } } }
        },
        select: { id: true }
      });
      if (!directorMembership) throw new AccessError("A Startup Skool Administrative Officer must report to an active Startup Skool Director.");
    }
    employmentId = await hrEmploymentService.create(actorId, { companyId: data.companyId, displayName: data.displayName, email: data.email, phone: data.phone, designation: data.designation, joiningDate: data.joiningDate, initialBrandIds: data.brandId ? [data.brandId] : [], ...(data.brandId ? { initialManagerPersonId: reportingPerson.personId } : {}), assignmentDecisionReference: data.brandId ? reference : undefined, activateImmediately: true, decisionReference: reference });
    const employee = await hrEmploymentService.get(actorId, employmentId);
    const overview = await hrAccess.overview(actorId, employmentId);
    const target = overview.targets.find(item => data.brandId ? item.brandId === data.brandId : item.id === data.companyId && !item.brandId);
    if (!target) throw new AccessError("The selected dashboard workspace is not configured for appointments");
    const targetOrganization = await prisma.organization.findUnique({ where: { id: target.id }, select: { slug: true } });
    const expected = data.designation === "Director"
      ? "Division Director"
      : targetOrganization?.slug === "aira-startup-school" && data.designation === "Administrative Officer"
        ? "Startup Skool Administrative Officer"
        : data.designation;
    const role = overview.roles.find(item => item.organizationId === target.id && item.name === expected);
    if (!role) throw new AccessError("The dashboard role is not configured for this workspace. The employee record is saved; access remains pending.");
    let delivery: { sent: boolean; activationUrl?: string };
    if (data.designation === "NICEJOBS Director") {
      const nationalNumber = data.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
      const appointment = await hrAccess.prepareNiceJobsDirector(actorId, { employmentId, organizationId: target.id, roleId: role.id, country: "IN", nationalNumber, decisionReference: reference });
      delivery = await niceJobsDirectorInvite.send(actorId, { userId: appointment.userId });
    } else {
      const draft = await staffOnboardingService.prepare(actorId, { organizationId: target.id, existingPersonId: employee.person.id, roleId: role.id, managerUserId: data.reportToUserId, managerDecisionReference: reference, scopeDecisionReference: reference });
      delivery = await staffInvite.send(actorId, { userId: draft.id, verificationEvidence: "Boss-approved appointment recorded in HR." });
    }
    revalidatePath("/app/boss/departments/hr");
    revalidatePath("/app/boss/departments/hr/employees/" + encodeURIComponent(employmentId));
    const activationUrl = delivery.activationUrl;
    const assignedBrand = employee.assignments.find(item => item.status === "ACTIVE")?.brand.name;
    const workArea = assignedBrand === "Startup School" ? "Startup Skool" : assignedBrand ?? employee.company.name;
    const shareMessage = activationUrl ? `Hello ${data.displayName}, your ${data.designation} workspace with ${workArea} is ready for setup. Start here: ${activationUrl}. We have emailed your verification code to ${data.email}. Enter that code on the setup page and create your own sign-in credential. Please do not share your verification code.` : undefined;
    return { employmentId, inviteSent: delivery.sent, activationUrl, shareMessage, shareEmail: data.email, message: "Employee record and role-based access are prepared. Setup instructions were emailed; access activates after the employee verifies their identity and creates their own sign-in credential." };
  } catch (error) {
    if (employmentId) { revalidatePath("/app/boss/departments/hr"); return { employmentId, message: "The employee record is saved. Dashboard access remains pending until the setup invitation is completed.", error: error instanceof AccessError ? error.message : "Setup access could not be prepared. Open the employee record to review it." }; }
    throw error;
  }
}

export async function hrAction(_state: HrState, form: FormData): Promise<HrState> {
  const session = await requireSession();
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const optional = (key: string) => value(key) || undefined;
  let removedRedirect: string | undefined;
  let employmentId: string | undefined;
  try {
    if (value("intent") === "appoint") return await appoint(session.userId, form);
    switch (value("intent")) {
      case "create": employmentId = await hrEmploymentService.create(session.userId, { companyId: value("companyId"), ...(optional("personId") ? { personId: value("personId") } : { displayName: value("displayName"), email: value("email"), phone: optional("phone"), linkExisting: value("linkExisting") === "on" }), contactEmail: optional("contactEmail"), contactPhone: optional("contactPhone"), emergencyContactName: optional("emergencyContactName"), emergencyContactRelationship: optional("emergencyContactRelationship"), emergencyContactPhone: optional("emergencyContactPhone"), emergencyContactEmail: optional("emergencyContactEmail"), designation: optional("designation"), employmentType: optional("employmentType"), joiningDate: optional("joiningDate"), initialBrandIds: form.getAll("initialBrandIds").map(String), initialDepartmentId: optional("initialDepartmentId"), initialManagerPersonId: optional("initialManagerPersonId"), assignmentDecisionReference: optional("assignmentDecisionReference") }); break;
      case "assign": await hrEmploymentService.addAssignment(session.userId, { employmentId: value("employmentId"), brandId: value("brandId"), departmentId: optional("departmentId"), managerPersonId: optional("managerPersonId"), designation: value("designation"), startDate: value("startDate"), decisionReference: value("decisionReference") }); break;
      case "employment": await hrEmploymentService.changeEmployment(session.userId, { employmentId: value("employmentId"), action: value("transition"), decisionReference: value("decisionReference"), designation: optional("designation"), employmentType: optional("employmentType"), joiningDate: optional("joiningDate") }); break;
      case "remove-employee": {
        const result = await hrEmploymentService.removeEmployee(session.userId, { employmentId: value("employmentId"), mode: value("mode"), confirmation: value("confirmation") });
        revalidatePath("/app/boss/departments/hr");
        const notice = result.mode === "permanent" ? "employee-deleted" : "employee-archived";
        removedRedirect = `/app/boss/departments/hr?view=people&companyId=${encodeURIComponent(result.companyId)}&notice=${notice}`;
        break;
      }
      case "assignment": await hrEmploymentService.changeAssignment(session.userId, { assignmentId: value("assignmentId"), action: value("transition"), decisionReference: value("decisionReference"), nextBrandId: optional("nextBrandId"), designation: optional("designation"), departmentId: optional("departmentId"), managerPersonId: optional("managerPersonId") }); break;
      case "company-proposal": await hrCompanyConfig.saveProposal(session.userId, { companyId: value("companyId"), proposedPortalHost: optional("proposedPortalHost"), proposedSenderEmail: optional("proposedSenderEmail"), decisionReference: value("decisionReference") }); break;
      default: throw new AccessError("Unknown HR action");
    }
    revalidatePath("/app/boss/departments/hr");
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the required fields and dates." };
    safeDiagnostic("operation_failed");
    return { error: "The HR change could not be saved." };
  }
  const redirectTarget = removedRedirect;
  if (typeof redirectTarget === "string") redirect(redirectTarget);
  return { message: employmentId ? "Employee record and selected brand assignments saved as drafts. Login access is pending." : "HR record updated. Login access is unchanged.", employmentId };
}
