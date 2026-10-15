"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { staffOnboardingService } from "@/server/skillcity/staff-onboarding";
import { skillCityRoleTemplates } from "@/server/skillcity/role-templates";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type StaffDraftState = { message?: string; error?: string };
export async function bossStaffDraftAction(_state: StaffDraftState, form: FormData): Promise<StaffDraftState> {
  const session = await requireSession();
  try {
    await staffOnboardingService.prepare(session.userId, {
      organizationId: String(form.get("organizationId") ?? ""),
      displayName: String(form.get("displayName") ?? ""),
      email: String(form.get("email") ?? ""),
      roleId: String(form.get("roleId") ?? ""),
      ...(form.get("managerUserId") ? { managerUserId: String(form.get("managerUserId")) } : {})
    });
    revalidatePath("/app/boss", "layout");
    return { message: "Draft recorded. No login or employment access has been activated." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the employee, role and scope before retrying." };
    safeDiagnostic("operation_failed");
    return { error: "Could not record the draft. No access was granted." };
  }
}

export async function bossRoleTemplatesAction(_state: StaffDraftState, form: FormData): Promise<StaffDraftState> {
  const session = await requireSession();
  try {
    const result = await skillCityRoleTemplates.prepare(session.userId, form.get("reviewedExistingDirectors") === "true");
    revalidatePath("/app/boss", "layout");
    return { message: `${result.configured} scoped role templates prepared. No person or account was activated.` };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    safeDiagnostic("operation_failed");
    return { error: "Role setup could not be completed. No partial role setup was retained." };
  }
}

export async function bossStaffInviteAction(_state: StaffDraftState, form: FormData): Promise<StaffDraftState> {
  const session = await requireSession();
  try {
    await staffInvite.send(session.userId, { userId: String(form.get("userId") ?? ""), verificationEvidence: String(form.get("verificationEvidence") ?? "") });
    revalidatePath("/app/boss", "layout");
    return { message: "Invitation accepted by the email provider. Account activation is still pending." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the evidence and Skill City email configuration." };
    safeDiagnostic("operation_failed");
    return { error: "Invitation could not be sent. The account remains inactive." };
  }
}
