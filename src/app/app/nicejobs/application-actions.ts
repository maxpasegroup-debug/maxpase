"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { getPortalSession } from "@/server/portals/session";
import { requestPortal } from "@/server/portals/request";
import { requirePortalAccess } from "@/server/portals/policy";
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
import { leadService, LeadDuplicateError } from "@/server/nicejobs/leads";
import { employeeService } from "@/server/nicejobs/employee";
import { knowledgeService } from "@/server/nicejobs/knowledge";
import { performanceService } from "@/server/nicejobs/performance";
import { financeService } from "@/server/nicejobs/finance";
import { niceJobsAutomationControl } from "@/server/nicejobs/automation-control";
import { workforceExceptions } from "@/server/nicejobs/workforce-exceptions";
import { siaService } from "@/server/sia/service";
import { preOfferService } from "@/server/nicejobs/pre-offer";
import { goalService } from "@/server/nicejobs/goals";
import { niceJobsControlPanel } from "@/server/nicejobs/control-panel";
import { prisma } from "@/server/db";
import type { SiaResponse } from "@/server/sia/registry";
export type ApplicationActionState = { success?: string; error?: string; reference?: string; applicationId?: string | null; response?: SiaResponse; duplicates?: { matches: { id: string; name: string }[]; token: string } };
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
    if (operation === "BOSS_SIA") {
      if (form.get("realm") === "jobs") await requirePortalAccess(prisma, userId, "jobs");
      await consumeSecurityBudget(securityKey("sia", userId), 30, 60);
      const training=form.get("purpose")==="TRAINING";
      if(form.get("purpose") && !training)throw new AccessError("Assistance purpose unavailable");
      const availability = await niceJobsControlPanel.assistance(userId, { companyId: String(form.get("companyId")), ...(form.get("divisionId") ? { divisionId: String(form.get("divisionId")) } : {}) },training);
      if (availability.state !== "AVAILABLE" || !availability.siaId) throw new AccessError("SIA preparation unavailable");
      const response = await siaService.converse(userId, { siaId: availability.siaId, organizationId: availability.organizationId, message: training?"Prepare training management summary":"Prepare workforce command overview", idempotencyKey: form.get("idempotencyKey") });
      return { response };
    }
    if (operation === "GOAL_PLAN") {
      if (form.get("realm") === "jobs") await requirePortalAccess(prisma, userId, "jobs");
      const result = await goalService.mutate(userId, JSON.parse(String(form.get("command"))));
      revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway");
      return { success: "Recorded", reference: result.id };
    }
    if (operation === "PRE_OFFER") {
      const result = await preOfferService.mutate(userId, JSON.parse(String(form.get("command"))));
      revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway");
      return result.result === "PASS" ? { success: "Recorded" } : { error: "Comprehension check did not pass. Review the video before retrying." };
    }
    if (operation === "APPLICANT_SIA") {
      if (form.get("realm") === "jobs") await requirePortalAccess(prisma, userId, "jobs");
      await consumeSecurityBudget(securityKey("sia", userId), 30, 60);
      const reference = String(form.get("reference"));
      const availability = await siaService.applicantAvailability(userId, reference);
      if (!availability.available || !availability.siaId) throw new NiceJobsError("SIA application guidance is not available yet. You can complete the questions below.");
      const response = await siaService.converse(userId, { siaId: availability.siaId, organizationId: availability.organizationId, applicationReference: reference, audience: "APPLICANT", message: form.get("message"), idempotencyKey: form.get("idempotencyKey") });
      return { response };
    }
    if (operation === "AUTOMATION") { if (form.get("realm") === "jobs") await requirePortalAccess(prisma, userId, "jobs"); const result = await niceJobsAutomationControl.mutate(userId, JSON.parse(String(form.get("command")))); revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway"); return { success: result === null ? "Current source condition does not require an action." : Array.isArray(result) ? `${result.length} due jobs checked.` : "Recorded", reference: result && !Array.isArray(result) ? result.id : undefined }; }
    if (operation === "WORKFORCE_EXCEPTION") { if (form.get("realm") === "jobs") await requirePortalAccess(prisma, userId, "jobs"); const result = await workforceExceptions.mutate(userId, JSON.parse(String(form.get("command")))); revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway"); return { success: "Recorded", reference: result.id }; }
    if (operation === "FINANCE") { if (form.get("realm") === "jobs") await requirePortalAccess(prisma, userId, "jobs"); const result = await financeService.mutate(userId, JSON.parse(String(form.get("command")))); revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway"); return { success: result.status === "FAILURE" ? "Reconciliation found discrepancies. Review Exceptions." : "Recorded", reference: result.id }; }
    if (operation === "PERFORMANCE") { if (form.get("realm") === "jobs") await requirePortalAccess(prisma, userId, "jobs"); const result = await performanceService.mutate(userId, JSON.parse(String(form.get("command")))); revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway"); return { success: "Saved", reference: result.id }; }
    if (operation === "KNOWLEDGE") { if (form.get("realm") === "jobs") await requirePortalAccess(prisma, userId, "jobs"); const result = await knowledgeService.mutate(userId, JSON.parse(String(form.get("command")))); revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway"); return { success: "Saved", reference: result.id }; }
    if (form.get("realm") === "jobs" && ["EMPLOYEE", "EMPLOYEE_SIA", "LEAD"].includes(operation)) await requirePortalAccess(prisma, userId, "jobs");
    if (operation === "LEAD") { const result = await leadService.mutate(userId, JSON.parse(String(form.get("command")))); revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway"); return { success: "Saved", reference: result.id }; }
    if (operation === "EMPLOYEE") {
      await employeeService.mutate(userId, JSON.parse(String(form.get("command"))));
      revalidatePath("/app/nicejobs"); revalidatePath("/sites/jobs/gateway");
      return { success: "Saved" };
    }
    if (operation === "EMPLOYEE_SIA") {
      await consumeSecurityBudget(securityKey("sia", userId), 30, 60);
      const day = await employeeService.day(userId);
      const identity = await prisma.siaIdentity.findFirst({ where: { status: "ACTIVE" }, select: { id: true }, orderBy: { id: "asc" } });
      if (!identity) throw new AccessError("SIA not configured");
      const response = await siaService.converse(userId, { siaId: identity.id, organizationId: day.assignment.divisionId, audience: "WORKER", message: form.get("message"), idempotencyKey: form.get("idempotencyKey") });
      return { response };
    }
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
    if (e instanceof LeadDuplicateError) return { error: e.message, duplicates: { matches: e.matches, token: e.token } };
    if (e instanceof NiceJobsError) return { error: e.message };
    if (e instanceof AccessError) return { error: "This application or action is not available to your account." };
    if (e instanceof ZodError || e instanceof SyntaxError) return { error: "Check the application fields and configuration." };
    return { error: "Could not save. Refresh and retry. Reference: " + safeDiagnostic("operation_failed") };
  }
}
