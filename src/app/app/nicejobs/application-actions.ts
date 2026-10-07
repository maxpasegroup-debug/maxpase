"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { getPortalSession } from "@/server/portals/session";
import { requestPortal } from "@/server/portals/request";
import { siteByHost } from "@/server/portals/sites";
import { validateActionOrigin } from "@/server/security/origin";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { AccessError } from "@/server/authorization/engine";
import { NiceJobsError } from "@/server/nicejobs/input";
import { applicationService } from "@/server/nicejobs/applications";
import { niceJobsService } from "@/server/nicejobs/service";
import { recruitmentService } from "@/server/nicejobs/recruitment";
import { onboardingService } from "@/server/nicejobs/onboarding";
export type ApplicationActionState = { success?: string; error?: string; reference?: string; applicationId?: string | null };
export async function applicationAction(_state: ApplicationActionState, form: FormData): Promise<ApplicationActionState> {
  let userId: string;
  if (form.get("realm") === "jobs") {
    const { site, paths } = await requestPortal("jobs", true);
    const session = await getPortalSession(site);
    if (!session) redirect(paths.login);
    userId = session.userId;
  } else {
    const h = await headers();
    if (siteByHost(h.get("host"))) throw new AccessError("Access denied");
    validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    userId = (await requireSession()).userId;
  }
  await consumeSecurityBudget(securityKey("authenticated", userId), 300, 60);
  try {
    const operation = String(form.get("operation"));
    if (operation === "ONBOARDING") {
      if (!["true", "false"].includes(String(form.get("own")))) throw new NiceJobsError("Invalid onboarding context");
      const result = await onboardingService.mutate(userId, JSON.parse(String(form.get("command"))), form.get("own") === "true");
      revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway");
      return { success: "Saved", reference: result.reference };
    }
    if (operation === "RECRUITMENT") {
      const result = await recruitmentService.mutate(userId, JSON.parse(String(form.get("command"))));
      revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway");
      return { success: "Saved", reference: result.reference };
    }
    if (operation === "CONFIGURE") {
      const id = String(form.get("versionId"));
      const { version } = await niceJobsService.detail(userId, id);
      await niceJobsService.edit(userId, id, Number(form.get("revision")), { title: version.title, description: version.description, context: version.context, engagement: version.engagement, divisionIds: version.areas.map(a => a.divisionId), configuration: JSON.parse(String(form.get("configuration"))) });
      revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway");
      return { success: "Configuration saved" };
    }
    const answers = form.has("answers") ? JSON.parse(String(form.get("answers"))) : undefined;
    const result = operation === "CREATE" ? await applicationService.create(userId, { versionId: form.get("versionId"), divisionId: form.get("divisionId"), answers: answers ?? {} }) : await applicationService.mutate(userId, { reference: form.get("reference"), revision: Number(form.get("revision")), action: operation, ...(answers !== undefined ? { answers } : {}), ...(form.get("reason") ? { reason: form.get("reason") } : {}), ...(form.get("candidateMessage") ? { candidateMessage: form.get("candidateMessage") } : {}), ...(form.get("category") ? { category: form.get("category") } : {}), ...(form.get("reviewResult") ? { reviewResult: form.get("reviewResult") } : {}) });
    revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway");
    return { success: operation === "SUBMIT" ? "Application submitted: " + result.applicationId : "Saved", reference: result.reference, applicationId: result.applicationId };
  } catch (e) {
    if (e instanceof NiceJobsError) return { error: e.message };
    if (e instanceof AccessError) return { error: "This application or action is not available to your account." };
    if (e instanceof ZodError || e instanceof SyntaxError) return { error: "Check the application fields and configuration." };
    return { error: "Could not save. Refresh and retry. Reference: " + safeDiagnostic("operation_failed") };
  }
}
