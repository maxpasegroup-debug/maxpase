"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { hrCompanyConfig } from "@/server/group/hr-company-config";
import { brandWorkforceOnboardingService } from "@/server/group/brand-workforce-onboarding";
import { brandWorkspaceInviteService } from "@/server/auth/brand-workspace-invite";
import { prisma } from "@/server/db";
import { failureReason, safeDiagnostic } from "@/server/security/diagnostics";

export type HrState = { message?: string; error?: string; employmentId?: string; userId?: string; brandId?: string; canRetryInvite?: boolean; inviteSent?: boolean; dashboardReady?: boolean; activationUrl?: string; shareMessage?: string; shareEmail?: string; removed?: boolean };
async function appoint(actorId: string, form: FormData): Promise<HrState> {
  const val = (key: string) => String(form.get(key) ?? "").trim();
  const data = z.object({ companyId: z.string().min(1), brandId: z.string().min(1), roleKey: z.enum(["brand-director", "brand-administrative-officer", "brand-specialist", "brand-employee"]), displayName: z.string().trim().min(2).max(200), email: z.email().max(254).transform(v => v.toLowerCase()), phone: z.string().trim().regex(/^\+?[0-9().\-\s]{7,24}$/), joiningDate: z.coerce.date() }).strict().parse({ companyId: val("companyId"), brandId: val("brandId"), roleKey: val("roleKey"), displayName: val("displayName"), email: val("email"), phone: val("phone"), joiningDate: val("joiningDate") });
  let appointment: Awaited<ReturnType<typeof brandWorkforceOnboardingService.appoint>> | undefined;
  try {
    appointment = await brandWorkforceOnboardingService.appoint(actorId, data);
    let delivery: { sent: boolean; activationUrl?: string } = { sent: false };
    let inviteError: string | undefined;
    if (brandWorkspaceInviteService.deliveryReady()) {
      try { delivery = await brandWorkspaceInviteService.send(actorId, { userId: appointment.userId, brandId: appointment.brandId }); }
      catch (error) { if (error instanceof AccessError) inviteError = error.message; else throw error; }
    }
    revalidatePath("/app/boss/departments/hr");
    revalidatePath("/app/boss/departments/hr/employees/" + encodeURIComponent(appointment.employmentId));
    const activationUrl = delivery.activationUrl;
    const shareMessage = activationUrl ? `Hello ${data.displayName}, your ${appointment.roleName} workspace for ${appointment.brandName} is ready. Open ${activationUrl}, enter the verification code sent to ${data.email}, and set your own password. Please do not share the code.` : undefined;
    const message = delivery.sent ? "Employment and brand dashboard access are saved. The secure setup invitation was sent; the employee verifies their email and creates their own password." : inviteError ?? (brandWorkspaceInviteService.deliveryReady() ? "Employment and brand dashboard access are saved. Invitation delivery is unavailable; retry the invitation after checking email setup." : "Employment and brand dashboard access are saved. Email delivery is not configured, so sign-in remains pending.");
    return { employmentId: appointment.employmentId, userId: appointment.userId, brandId: appointment.brandId, canRetryInvite: !delivery.sent && brandWorkspaceInviteService.deliveryReady(), inviteSent: delivery.sent, dashboardReady: true, activationUrl, shareMessage, shareEmail: data.email, message, error: inviteError };
  } catch (error) {
    if (appointment) { revalidatePath("/app/boss/departments/hr"); return { employmentId: appointment.employmentId, userId: appointment.userId, brandId: appointment.brandId, canRetryInvite: brandWorkspaceInviteService.deliveryReady(), dashboardReady: true, message: "Employment and brand dashboard access are saved. Invitation delivery could not be completed.", error: error instanceof AccessError ? error.message : "Invitation delivery could not be completed." }; }
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
    if (value("intent") === "resend-brand-invite") {
      const userId = value("userId"), brandId = value("brandId"), employmentId = value("employmentId");
      try {
        const delivery = await brandWorkspaceInviteService.send(session.userId, { userId, brandId });
        revalidatePath("/app/boss/departments/hr");
        return { employmentId, userId, brandId, canRetryInvite: false, inviteSent: delivery.sent, dashboardReady: true, activationUrl: delivery.activationUrl, shareEmail: (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email, message: delivery.sent ? "The secure setup invitation was sent. The employee verifies their email and creates their own password." : "Invitation delivery remains unavailable." };
      } catch (error) {
        return { employmentId, userId, brandId, canRetryInvite: brandWorkspaceInviteService.deliveryReady(), dashboardReady: true, message: "Employment and dashboard access remain active. The invitation was not sent.", error: error instanceof AccessError ? error.message : "Invitation delivery could not be completed." };
      }
    }
    if (value("intent") === "brand-access") {
      const result = await brandWorkforceOnboardingService.changeAccess(session.userId, { employmentId: value("employmentId"), brandId: value("brandId"), action: value("accessAction") });
      revalidatePath("/app/boss/departments/hr");
      const brand = await prisma.brand.findUnique({ where: { id: result.brandId }, select: { slug: true } });
      if (brand) revalidatePath(`/app/brand/${encodeURIComponent(brand.slug)}`);
      const status = result.action === "suspend" ? "suspended" : result.action === "resume" ? "resumed" : "revoked";
      return { message: `Brand access ${status}. Existing sessions were revoked.` };
    }
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
    const rawCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const prismaCode = typeof rawCode === "string" && /^P\d{4}$/.test(rawCode) ? rawCode : undefined;
    const errorName = error instanceof Error ? error.name.slice(0, 80) : "UnknownError";
    const reference = safeDiagnostic("operation_failed", undefined, { stage: "readiness", reason: failureReason(error, "readiness"), errorName, ...(prismaCode ? { prismaCode } : {}) });
    const message = prismaCode === "P2002"
      ? "This email or employee record may already exist. Check the employee list before trying again."
      : prismaCode === "P2021" || prismaCode === "P2022"
        ? "The HR database setup is incomplete. The system owner must finish the database update before adding employees."
        : prismaCode === "P1000" || prismaCode === "P1001" || prismaCode === "P1003"
          ? "The application could not connect to its database. Please retry after service is restored."
          : "The appointment could not be saved. Share this support reference with the system owner.";
    return { error: `${message} Reference: ${reference}` };
  }
  const redirectTarget = removedRedirect;
  if (typeof redirectTarget === "string") redirect(redirectTarget);
  return { message: employmentId ? "Employee record and selected brand assignments saved as drafts. Login access is pending." : "HR record updated. Login access is unchanged.", employmentId };
}
