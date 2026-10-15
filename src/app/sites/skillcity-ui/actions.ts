"use server";
import { revalidatePath } from "next/cache";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { skillCityLabsService } from "@/server/labs/service";
import { skillCityEmployeeDashboard } from "@/server/skillcity/employee-dashboard";
import { operationsService } from "@/server/domain/operations-service";
import { nexaService } from "@/server/group/nexa-service";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { ZodError } from "zod";

export type SkillCityActionState = { error?: string; message?: string };
const field = (form: FormData, name: string) => String(form.get(name) ?? "");
export async function skillCityWorkAction(_state: SkillCityActionState, form: FormData): Promise<SkillCityActionState> {
  const { site, paths } = await requestPortal("skillcity", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again before saving." };
  try {
    await consumeSecurityBudget(securityKey("skillcity:work", session.userId), 30, 60);
    const reference = field(form, "reference");
    if (field(form, "action") === "LEAD") {
      await skillCityEmployeeDashboard.dashboard(session.userId, "advisor");
      await skillCityLabsService.updateLead(session.userId, { id: field(form, "id"), version: Number(field(form, "version")), reference, status: field(form, "status"), outcome: field(form, "outcome"), qualification: field(form, "qualification"), nextFollowUp: field(form, "nextFollowUp") || null });
    } else if (field(form, "action") === "TASK") {
      await skillCityEmployeeDashboard.dashboard(session.userId, "developer");
      await skillCityLabsService.saveTask(session.userId, { projectId: field(form, "projectId"), taskId: field(form, "taskId"), title: field(form, "title"), description: field(form, "description"), dueDate: field(form, "dueDate"), status: field(form, "status"), reference });
    } else if (field(form, "action") === "DECISION") {
      const desk = await skillCityEmployeeDashboard.dashboard(session.userId, "director");
      if (!desk.data || !("decisions" in desk.data) || !Array.isArray(desk.data.decisions) || !desk.data.decisions.some(item => item.id === field(form, "id"))) throw new AccessError("Decision unavailable in this company");
      await operationsService.decide(session.userId, { approvalId: field(form, "id"), decision: field(form, "decision"), comment: field(form, "comment") });
    } else if (field(form, "action") === "DIRECTIVE_PREPARE") {
      await nexaService.prepare(session.userId, field(form, "id"), field(form, "siaId"), Number(field(form, "version")));
    } else if (field(form, "action") === "DIRECTIVE_DECIDE") {
      await nexaService.decide(session.userId, field(form, "id"), Number(field(form, "version")), field(form, "decision") as "APPROVED" | "REJECTED", field(form, "reason"));
    } else if (field(form, "action") === "DIRECTIVE_TASK") {
      await nexaService.proposeTask(session.userId, { id: field(form, "id"), version: Number(field(form, "version")), controlPointId: field(form, "controlPointId"), parameters: { title: field(form, "title"), description: field(form, "description"), ...(field(form, "dueDate") ? { dueDate: field(form, "dueDate") } : {}), priority: field(form, "priority") } });
    } else return { error: "Action unavailable." };
    revalidatePath(paths.gateway);
    return { message: "Saved. Review the current record for the next step." };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the status, evidence and date, then retry." };
    safeDiagnostic("operation_failed");
    return { error: "Could not save. Refresh before retrying; no success is confirmed." };
  }
}
