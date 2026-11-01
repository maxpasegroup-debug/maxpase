"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrAccess } from "@/server/group/hr-access";
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
      default: throw new AccessError("Unknown access action");
    }
    revalidatePath(`/app/boss/departments/hr/employees/${employmentId}/access`);
    return { message: "Access record updated." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the required fields." };
    safeDiagnostic("operation_failed");
    return { error: "The access change could not be saved." };
  }
}
