"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrAccess } from "@/server/group/hr-access";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { staffOnboardingService } from "@/server/skillcity/staff-onboarding";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { niceJobsDirectorInvite } from "@/server/auth/nicejobs-director-invite";
import { jobsEmailAuth } from "@/server/auth/jobs-email-auth";
import { prisma } from "@/server/db";
import { operationalEvent } from "@/server/domain/operational-events";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type AccessState = { message?: string; error?: string };
export async function accessAction(_previous: AccessState, form: FormData): Promise<AccessState> {
  const session = await requireSession();
  const value = (key: string) => String(form.get(key) ?? "").trim();
  try {
    const employmentId = value("employmentId");
    if (["grant", "change", "send-invite", "revoke-invite", "suspend-account", "resume-account", "reset-credential", "prepare-staff"].includes(value("intent"))) {
      const overview = await hrAccess.overview(session.userId, employmentId);
      if (overview.portal === "NICEJOBS") throw new AccessError("NICEJOBS administration is managed only from the Boss NICEJOBS module.");
    }
    switch (value("intent")) {
      case "grant": await hrAccess.grant(session.userId, { employmentId, organizationId: value("organizationId"), roleId: value("roleId"), ...(value("brandId") ? { brandId: value("brandId") } : {}) }); break;
      case "change": await hrAccess.change(session.userId, { employmentId, membershipId: value("membershipId"), action: value("action") }); break;
      case "revoke-invite": await hrAccess.revokeInvitation(session.userId, { employmentId, challengeId: value("challengeId") }); break;
      case "suspend-account": await hrAccess.suspendAccount(session.userId, { employmentId, decisionReference: value("decisionReference") }); break;
      case "resume-account": await hrAccess.resumeAccount(session.userId, { employmentId, decisionReference: value("decisionReference") }); break;
      case "reset-credential": {
        const overview = await hrAccess.overview(session.userId, employmentId);
        const account = overview.account;
        if (overview.employmentStatus !== "ACTIVE" || !account || account.status !== "ACTIVE" || !account.verified || !account.email) throw new AccessError("An active employee account with verified email is required");
        if (overview.portal === "NICEJOBS" && account.realm === "jobs") {
          const reset = await jobsEmailAuth.beginPinReset({ email: account.email });
          const delivered = await prisma.emailAuthChallenge.findFirst({ where: { id: reset.challengeId, userId: account.id, purpose: "RESET_PIN", status: "SENT" }, select: { id: true } });
          if (!delivered) throw new AccessError("PIN reset email was not sent. The account remains unchanged.");
        } else if (["AIRA Skill City", "AIRA Labs"].includes(overview.portal) && ["skillcity", "labs"].includes(account.realm ?? "")) {
          const reset = await staffInvite.beginPasswordReset({ email: account.email, portal: account.realm });
          if (!reset.sent) throw new AccessError("Password reset email was not sent. The account remains unchanged.");
        } else throw new AccessError("Credential reset is unavailable for this employee portal");
        await prisma.$transaction(db => operationalEvent(db, { actorUserId: session.userId, organizationId: overview.companyId, action: "hr.employee_credential_reset_requested", entityType: "User", entityId: account.id, result: "SUCCESS", metadata: { portal: overview.portal, deliveryMethod: "VERIFIED_EMAIL_OTP", employeeSetsCredential: true } }));
        break;
      }
      case "send-invite": {
        const overview = await hrAccess.overview(session.userId, employmentId);
        if (!overview.account || overview.account.id !== value("userId")) throw new AccessError("Invitation unavailable");
        if (overview.portal === "NICEJOBS") await niceJobsDirectorInvite.send(session.userId, { userId: value("userId") });
        else if (["AIRA Skill City", "AIRA Labs"].includes(overview.portal)) await staffInvite.send(session.userId, { userId: value("userId"), verificationEvidence: value("verificationEvidence") });
        else throw new AccessError("Invitation unavailable");
        break;
      }
      case "prepare-staff": {
        const employee = await hrEmploymentService.get(session.userId, employmentId);
        const overview = await hrAccess.overview(session.userId, employmentId);
        const organizationId = value("organizationId");
        const target = overview.targets.find(item => item.id === organizationId);
        if (!target) throw new AccessError("Employee has no active assignment in this scope");
        if (employee.status !== "ACTIVE" || !employee.person.email || overview.account && !(target.name === "NICEJOBS Director workspace" && overview.account.status === "INACTIVE" && overview.account.realm === "jobs")) throw new AccessError("Active employment without an existing account is required");
        const options = await staffOnboardingService.options(session.userId, organizationId);
        const role = options.roles.find(item => item.id === value("roleId"));
        const assignment = target.brandId ? employee.assignments.find(item => item.brand.id === target.brandId && item.status === "ACTIVE") : null;
        const targetOrganization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { slug: true } });
        const expectedRole = target.name === "NICEJOBS Director workspace" ? "NICEJOBS Director" : targetOrganization?.slug === "aira-startup-school" && employee.designation === "Administrative Officer" ? "Startup Skool Administrative Officer" : !target.brandId ? "Administrative Officer" : employee.designation === "Director" ? "Division Director" : employee.designation === "Academic Advisor" ? "Junior Academic Advisor" : employee.designation;
        if (!options.canPrepare || !role || role.name !== expectedRole || target.brandId && !assignment) throw new AccessError("Prepared role unavailable in this employee scope");
        if (role.name === "NICEJOBS Director") {
          const appointment = await hrAccess.prepareNiceJobsDirector(session.userId, { employmentId, organizationId, roleId: role.id, country: value("country"), nationalNumber: value("nationalNumber"), decisionReference: value("scopeDecisionReference") });
          await niceJobsDirectorInvite.send(session.userId, { userId: appointment.userId });
        } else {
          const draft = await staffOnboardingService.prepare(session.userId, { organizationId, existingPersonId: employee.person.id, roleId: role.id, scopeDecisionReference: value("scopeDecisionReference"), ...(value("managerUserId") ? { managerUserId: value("managerUserId"), managerDecisionReference: value("managerDecisionReference") } : {}) });
          await staffInvite.send(session.userId, { userId: draft.id, verificationEvidence: "Boss-approved appointment recorded in HR." });
        }
        break;
      }
      default: throw new AccessError("Unknown access action");
    }
    revalidatePath(`/app/boss/departments/hr/employees/${employmentId}/access`);
    revalidatePath(`/app/boss/departments/hr/employees/${employmentId}`);
    return { message: value("intent") === "prepare-staff" ? "Appointment saved and setup instructions emailed. The employee must verify their identity and set their own credential before access activates." : value("intent") === "send-invite" ? "Activation instructions sent to the employee's registered email." : value("intent") === "reset-credential" ? "Secure reset instructions sent to the employee's verified email. They set their own new password or PIN; HR never sees it." : "Access record updated." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the required fields." };
    safeDiagnostic("operation_failed");
    return { error: "The access change could not be saved." };
  }
}
