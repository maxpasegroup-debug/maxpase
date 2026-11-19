"use server";
import { revalidatePath } from "next/cache";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { startupLeadsDesk } from "@/server/skillcity/startup-leads-desk";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";
export type StartupLeadActionState = { error?: string; message?: string };
const field = (form: FormData, key: string) => String(form.get(key) ?? "");
export async function startupLeadAction(_state: StartupLeadActionState, form: FormData): Promise<StartupLeadActionState> {
  const { site } = await requestPortal("skillcity", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Please sign in again before saving." };
  try {
    await consumeSecurityBudget(securityKey("skillcity:startup-leads", session.userId), 20, 60);
    const action = field(form, "action");
    if (action === "CREATE") await startupLeadsDesk.createLead(session.userId, { name: field(form, "name"), phone: field(form, "phone"), email: field(form, "email"), district: field(form, "district"), state: field(form, "state"), centre: field(form, "centre"), source: field(form, "source"), campaign: field(form, "campaign"), programme: field(form, "programme"), contactPreference: field(form, "contactPreference"), assignedCallerUserId: field(form, "assignedCallerUserId") });
    else if (action === "ASSIGN") await startupLeadsDesk.assignLead(session.userId, { id: field(form, "id"), version: field(form, "version"), callerUserId: field(form, "callerUserId"), reason: field(form, "reason") });
    else if (action === "CALL") { const localFollowUp = field(form, "nextFollowUpAt"); const nextFollowUpAt = localFollowUp ? new Date(`${localFollowUp}:00+05:30`).toISOString() : ""; await startupLeadsDesk.logActivity(session.userId, { leadId: field(form, "leadId"), method: field(form, "method"), outcome: field(form, "outcome"), notes: field(form, "notes"), nextFollowUpAt }); }
    else return { error: "Choose a valid lead action." };
    revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
    return { message: action === "CREATE" ? "Lead added to the Startup Skool pipeline." : action === "ASSIGN" ? "Lead assignment saved." : "Contact activity saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 220) : "Could not save the lead update." };
  }
}
