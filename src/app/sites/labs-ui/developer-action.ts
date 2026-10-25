"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { skillCityDeveloperDesk } from "@/server/skillcity/developer-desk";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type LabsDeveloperActionState = { error?: string; message?: string };
const field = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function labsDeveloperAction(_state: LabsDeveloperActionState, form: FormData): Promise<LabsDeveloperActionState> {
  const { site, paths } = await requestPortal("labs", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again before saving." };
  try {
    await consumeSecurityBudget(securityKey("labs:developer", session.userId), 30, 60);
    const reference = field(form, "reference");
    switch (field(form, "action")) {
      case "TASK":
        await skillCityDeveloperDesk.updateOwnTask(session.userId, { taskId: field(form, "taskId"), revision: Number(field(form, "revision")), description: field(form, "description"), status: field(form, "status"), reference });
        break;
      case "DEV_CONTRIBUTE":
        await skillCityDeveloperDesk.contribute(session.userId, { taskId: field(form, "taskId"), detail: field(form, "detail"), reference });
        break;
      case "DEV_REVIEW":
        await skillCityDeveloperDesk.review(session.userId, { taskId: field(form, "taskId"), duty: field(form, "duty"), verdict: field(form, "verdict"), comment: field(form, "comment"), reference });
        break;
      default: throw new AccessError("Developer action unavailable");
    }
    revalidatePath(paths.gateway);
    return { message: "Work saved." };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the work details and try again." };
    safeDiagnostic("operation_failed");
    return { error: "Could not save this work. Refresh and try again." };
  }
}
