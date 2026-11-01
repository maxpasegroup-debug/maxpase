"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrAccess } from "@/server/group/hr-access";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { staffOnboardingService } from "@/server/skillcity/staff-onboarding";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type AccessState = { message?: string; error?: string };
export async function accessAction(_previous: AccessState, form: FormData): Promise<AccessState> {
  const session = await requireSession();
  const value = (key: string) => String(form.get(key) ?? "").trim();
  try {
    const employmentId = value("employmentId");
    switch (value("intent")) {
      case "grant": await hrAccess.grant(session.userId, { employmentId, organizationId: value("organizationId"), roleId: value("roleId"), ...(value("brandId") ? { brandId: value("brandId") } : {}) }); break;
      case "change": await hrAccess.change(session.userId, { employmentId, membershipId: value("membershipId"), action: value("action") }); break;
      case "revoke-invite": await hrAccess.revokeInvitation(session.userId, { employmentId, challengeId: value("challengeId") }); break;
      case "suspend-account": await hrAccess.suspendAccount(session.userId, { employmentId, decisionReference: value("decisionReference") }); break;
      case "resume-account": await hrAccess.resumeAccount(session.userId, { employmentId, decisionReference: value("decisionReference") }); break;
      case "send-invite": {
        const overview = await hrAccess.overview(session.userId, employmentId);
        if (!["AIRA Skill City", "AIRA Labs"].includes(overview.portal) || !overview.account || overview.account.id !== value("userId")) throw new AccessError("Invitation unavailable");
        await staffInvite.send(session.userId, { userId: value("userId"), verificationEvidence: value("verificationEvidence") });
        break;
      }
      case "prepare-staff": {
        const employee = await hrEmploymentService.get(session.userId, employmentId);
        const overview = await hrAccess.overview(session.userId, employmentId);
        const organizationId = value("organizationId");
        if (employee.status !== "ACTIVE" || !employee.person.email || overview.account) throw new AccessError("Active employment without an existing account is required");
        const target = overview.targets.find(item => item.id === organizationId);
        if (!target) throw new AccessError("Employee has no active assignment in this scope");
        const options = await staffOnboardingService.options(session.userId, organizationId);
        const role = options.roles.find(item => item.id === value("roleId"));
        if (!options.canPrepare || !role || role.name !== (target.brandId ? "Full Stack Developer" : "Administrative Officer")) throw new AccessError("Prepared role unavailable in this employee scope");
        await staffOnboardingService.prepare(session.userId, { organizationId, existingPersonId: employee.person.id, roleId: role.id, scopeDecisionReference: value("scopeDecisionReference"), ...(value("managerUserId") ? { managerUserId: value("managerUserId"), managerDecisionReference: value("managerDecisionReference") } : {}) });
        break;
      }
      default: throw new AccessError("Unknown access action");
    }
    revalidatePath(`/app/boss/departments/hr/employees/${employmentId}/access`);
    revalidatePath(`/app/boss/departments/hr/employees/${employmentId}`);
    return { message: value("intent") === "prepare-staff" ? "Staff appointment saved as an inactive draft. Review the manager decision before invitation." : "Access record updated." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the required fields." };
    safeDiagnostic("operation_failed");
    return { error: "The access change could not be saved." };
  }
}
