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
import { niceJobsService as service } from "@/server/nicejobs/service";
export type JobActionState = { success?: string; error?: string };
export async function niceJobsAction(_state: JobActionState, form: FormData): Promise<JobActionState> {
  let userId: string;
  if (form.get("realm") === "jobs") {
    const { site, paths } = await requestPortal("jobs", true);
    const session = await getPortalSession(site);
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
    const action = String(form.get("operation")), id = String(form.get("id") ?? ""), revision = Number(form.get("revision"));
    const version = { title: form.get("title"), description: String(form.get("description") ?? "") || null, context: String(form.get("context") ?? "") || null, engagement: form.get("engagement"), divisionIds: form.getAll("divisionIds") };
    switch (action) {
      case "create": await service.create(userId, { ...version, code: form.get("code"), visibility: form.get("visibility") }); break;
      case "edit": {
        const prior = (await service.detail(userId, id)).version;
        await service.edit(userId, id, revision, { ...version, configuration: prior.configuration ? JSON.parse(prior.configuration) : null }); break;
      }
      case "version": await service.newVersion(userId, id, revision); break;
      case "job-state": await service.changeJob(userId, { id, revision, to: form.get("to"), reason: form.get("reason") }); break;
      case "job-visibility": await service.visibility(userId, { id, revision, to: form.get("to"), reason: form.get("reason") }); break;
      case "seed": await service.seedKnown(userId); break;
      case "assign": await service.assign(userId, { personId: form.get("personId"), versionId: form.get("versionId"), divisionId: form.get("divisionId"), managerId: String(form.get("managerId") ?? "") || null }); break;
      case "lifecycle": await service.transition(userId, { id, revision, to: form.get("to"), reason: form.get("reason") }); break;
      default: throw new NiceJobsError("Unknown operation");
    }
    revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway");
    return { success: "Saved" };
  } catch (e) {
    if (e instanceof NiceJobsError) return { error: e.message };
    if (e instanceof AccessError) return { error: "You do not have permission for this operation." };
    if (e instanceof ZodError) return { error: "Check the required fields and business areas." };
    return { error: "The change could not be saved. Refresh and retry. Reference: " + safeDiagnostic("operation_failed") };
  }
}
