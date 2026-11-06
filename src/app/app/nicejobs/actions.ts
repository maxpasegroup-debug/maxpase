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
import { referralService } from "@/server/nicejobs/referrals";
import { niceJobsSourceService } from "@/server/nicejobs/source-events";
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
      case "seed-opportunities": await service.seedInitialOpportunities(userId); break;
      case "seed-launch": await service.seedInitialOpportunities(userId, true); break;
      case "assign": await service.assign(userId, { personId: form.get("personId"), versionId: form.get("versionId"), divisionId: form.get("divisionId"), managerId: String(form.get("managerId") ?? "") || null }); break;
      case "lifecycle": await service.transition(userId, { id, revision, to: form.get("to"), reason: form.get("reason") }); break;
      case "referral-link": await referralService.create(userId); break;
      case "admission-record": await referralService.record(userId, { token: form.get("token"), externalApplicationId: String(form.get("externalApplicationId") ?? "") || undefined, externalAdmissionId: form.get("externalAdmissionId"), eventReference: form.get("eventReference"), evidenceReference: form.get("evidenceReference") }); break;
      case "admission-decide": await referralService.decide(userId, { id, decision: form.get("decision"), evidenceReference: form.get("evidenceReference") }); break;
      case "source-create": await niceJobsSourceService.create(userId, { companyId: form.get("companyId"), name: form.get("name"), credentialReference: form.get("credentialReference") }); break;
      case "source-activate": await niceJobsSourceService.activate(userId, { id, approvalReference: form.get("approvalReference") }); break;
      case "source-review": await niceJobsSourceService.review(userId, { id, decision: form.get("decision"), evidenceReference: form.get("evidenceReference") }); break;
      case "source-reconcile": await niceJobsSourceService.reconcile(userId, { id, referralToken: form.get("referralToken"), evidenceReference: form.get("evidenceReference") }); break;
      case "source-manual": await niceJobsSourceService.submitManual(userId, { connectionId: form.get("connectionId"), evidenceReference: form.get("evidenceReference"), event: { eventId: form.get("eventId"), companyId: form.get("companyId"), opportunityId: form.get("opportunityId"), referralToken: form.get("referralToken"), type: form.get("eventType"), occurredAt: form.get("occurredAt"), externalApplicationId: String(form.get("externalApplicationId") ?? "") || undefined, externalAdmissionId: String(form.get("externalAdmissionId") ?? "") || undefined, externalTransactionId: String(form.get("externalTransactionId") ?? "") || undefined, amountMinor: String(form.get("amountMinor") ?? "") || undefined, currency: String(form.get("currency") ?? "") || undefined } }); break;
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
