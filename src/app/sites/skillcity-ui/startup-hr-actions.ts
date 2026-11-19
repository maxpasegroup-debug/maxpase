"use server";
import { revalidatePath } from "next/cache";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { startupHrDesk } from "@/server/skillcity/startup-hr-desk";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";

export type StartupHrActionState = { error?: string; message?: string };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
export async function startupHrAction(_state: StartupHrActionState, form: FormData): Promise<StartupHrActionState> {
  const { site, paths } = await requestPortal("skillcity", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again before saving." };
  try {
    await consumeSecurityBudget(securityKey("skillcity:startup-hr", session.userId), 16, 60);
    const action = value(form, "action");
    if (action === "ASSIGN_CENTRE") await startupHrDesk.assignCentre(session.userId, { assignmentId: value(form, "assignmentId"), centreId: value(form, "centreId") });
    else if (action === "UPDATE_ASSIGNMENT") await startupHrDesk.updateAssignment(session.userId, { assignmentId: value(form, "assignmentId"), designation: value(form, "designation"), startDate: value(form, "startDate"), status: value(form, "status"), endDate: value(form, "endDate") });
    else if (action === "SUBMIT_INPUT") await startupHrDesk.submitInput(session.userId, { type: value(form, "type"), centreId: value(form, "centreId"), department: value(form, "department"), period: value(form, "period"), present: value(form, "present"), leaveDays: value(form, "leaveDays"), openPositions: value(form, "openPositions"), exceptions: value(form, "exceptions") });
    else if (action === "CHECK_INPUT") await startupHrDesk.checkInput(session.userId, { id: value(form, "id"), version: value(form, "version"), outcome: value(form, "outcome"), note: value(form, "note") });
    else if (action === "SAVE_RULES") await startupHrDesk.saveRules(session.userId, { name: value(form, "name"), accountantName: value(form, "accountantName"), accountantReviewReference: value(form, "accountantReviewReference"), componentsJson: value(form, "componentsJson") });
    else if (action === "APPROVE_RULES") await startupHrDesk.approveRules(session.userId, { ruleId: value(form, "ruleId"), confirmation: value(form, "confirmation") });
    else if (action === "PREPARE_PAYROLL") await startupHrDesk.preparePayroll(session.userId, { period: value(form, "period") });
    else if (action === "RELEASE_PAYROLL") await startupHrDesk.authorizeRelease(session.userId, { runId: value(form, "runId"), reference: value(form, "reference"), reason: value(form, "reason") });
    else return { error: "Choose a valid workforce action." };
    revalidatePath(paths.gateway);
    revalidatePath("/sites/skillcity/gateway");
    revalidatePath("/gateway");
    return { message: action === "PREPARE_PAYROLL" ? "Startup Skool payroll draft prepared for Director review." : action === "RELEASE_PAYROLL" ? "Director payroll release authorization recorded. This does not initiate a bank payment." : "Startup Skool HR update saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 240) : "Unable to save this update. Please try again." };
  }
}
