"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/server/auth/guards";
import { getPortalSession } from "@/server/portals/session";
import { requestPortal } from "@/server/portals/request";
import { siteByHost } from "@/server/portals/sites";
import { validateActionOrigin } from "@/server/security/origin";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";
import { operationsService } from "@/server/domain/operations-service";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { AccessError } from "@/server/authorization/engine";
import { participantDashboard } from "@/server/nicejobs/participant-dashboard";

export async function dashboardNotificationAction(_state: { message?: string; ok?: boolean }, form: FormData) {
  let userId: string;
  if (form.get("realm") === "jobs") {
    const { site, paths } = await requestPortal("jobs", true), session = await getPortalSession(site);
    if (!session) redirect(paths.login);
    userId = session.userId;
    await consumeSecurityBudget(securityKey("authenticated", userId), 300, 60);
  } else {
    const h = await headers();
    if (siteByHost(h.get("host"))) throw new AccessError("Access denied");
    validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    userId = (await requireSession()).userId;
  }
  try {
    const id = z.string().min(1).max(200).parse(form.get("id"));
    const visible = await participantDashboard.notifications(userId);
    if (!visible.data?.some(n => n.id === id)) throw new AccessError("Notification unavailable");
    await operationsService.markRead(userId, id, form.get("read") === "true");
    revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway");
    return { ok: true, message: "Notification updated." };
  } catch (error) {
    if (!(error instanceof AccessError) && !(error instanceof z.ZodError)) safeDiagnostic("operation_failed");
    return { ok: false, message: "Notification could not be updated. Refresh and try again." };
  }
}
