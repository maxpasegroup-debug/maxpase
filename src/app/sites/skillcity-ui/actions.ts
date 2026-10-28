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
import { staffOnboardingService } from "@/server/skillcity/staff-onboarding";
import type { StaffDraftState } from "@/app/app/boss/command/staff-actions";
import { advisorCrm } from "@/server/skillcity/crm";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { skillCityManagerDesk } from "@/server/skillcity/manager-desk";
import { skillCityDeveloperDesk } from "@/server/skillcity/developer-desk";
import { labsCustomerService } from "@/server/labs/customer";

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
    } else if (field(form, "action") === "CRM_LEAD") {
      await skillCityEmployeeDashboard.dashboard(session.userId, "advisor");
      const followUp = field(form, "nextFollowUp");
      await advisorCrm.update(session.userId, { id: field(form, "id"), version: Number(field(form, "version")), reference, status: field(form, "status"), outcome: field(form, "outcome"), qualification: field(form, "qualification"), nextFollowUp: followUp || null });
    } else if (field(form, "action") === "CRM_CREATE") {
      await skillCityEmployeeDashboard.dashboard(session.userId, "director");
      await advisorCrm.create(session.userId, { product: field(form, "product"), ownerUserId: field(form, "ownerUserId"), name: field(form, "name"), email: field(form, "email"), phone: field(form, "phone"), need: field(form, "need"), consent: form.get("consent") === "true", reference });
    } else if (field(form, "action") === "LABS_CREATE") {
      await skillCityEmployeeDashboard.dashboard(session.userId, "business-development");
      await skillCityLabsService.createLead(session.userId, { company: field(form, "company"), name: field(form, "name"), email: field(form, "email"), phone: field(form, "phone"), need: field(form, "need"), source: "MANUAL", consent: form.get("consent") === "on" });
    } else if (field(form, "action") === "LABS_UPDATE") {
      await skillCityEmployeeDashboard.dashboard(session.userId, "business-development");
      await skillCityLabsService.updateLead(session.userId, { id: field(form, "id"), version: Number(field(form, "version")), reference, status: field(form, "status"), outcome: field(form, "outcome"), qualification: field(form, "qualification"), nextFollowUp: field(form, "nextFollowUp") || null });
    } else if (field(form, "action") === "LABS_CUSTOMER_GRANT") {
      await skillCityEmployeeDashboard.dashboard(session.userId, "director");
      await labsCustomerService.grant(session.userId, { leadId: field(form, "leadId"), customerEmail: field(form, "customerEmail"), evidence: field(form, "evidence") });
    } else if (field(form, "action") === "TASK") {
      await skillCityEmployeeDashboard.dashboard(session.userId, "developer");
      await skillCityDeveloperDesk.updateOwnTask(session.userId, { taskId: field(form, "taskId"), revision: Number(field(form, "revision")), description: field(form, "description"), status: field(form, "status"), reference });
    } else if (field(form, "action") === "DEV_CONTRIBUTE") {
      await skillCityDeveloperDesk.contribute(session.userId, { taskId: field(form, "taskId"), detail: field(form, "detail"), reference });
    } else if (field(form, "action") === "DEV_REVIEW") {
      await skillCityDeveloperDesk.review(session.userId, { taskId: field(form, "taskId"), duty: field(form, "duty"), verdict: field(form, "verdict"), comment: field(form, "comment"), reference });
    } else if (field(form, "action") === "DEV_ASSIGN") {
      await skillCityDeveloperDesk.assignTask(session.userId, { projectId: field(form, "projectId"), ...(field(form, "taskId") ? { taskId: field(form, "taskId") } : { title: field(form, "title"), dueDate: field(form, "dueDate") }), developerUserId: field(form, "developerUserId"), reference });
    } else if (field(form, "action") === "DEV_DUTY") {
      await skillCityDeveloperDesk.assignDuty(session.userId, { taskId: field(form, "taskId"), reviewerUserId: field(form, "reviewerUserId"), duty: field(form, "duty"), reference });
    } else if (field(form, "action") === "DEV_COMPLETE") {
      await skillCityDeveloperDesk.completeReviewedTask(session.userId, { taskId: field(form, "taskId"), revision: Number(field(form, "revision")), reason: field(form, "reason"), reference });
    } else if (field(form, "action") === "DECISION") {
      const desk = await skillCityEmployeeDashboard.dashboard(session.userId, "director");
      if (!desk.data || !("decisions" in desk.data) || !Array.isArray(desk.data.decisions) || !desk.data.decisions.some(item => item.id === field(form, "id"))) throw new AccessError("Decision unavailable in this company");
      await operationsService.decide(session.userId, { approvalId: field(form, "id"), decision: field(form, "decision"), comment: field(form, "comment") });
    } else if (field(form, "action") === "FOCUS") {
      await skillCityEmployeeDashboard.dashboard(session.userId, "manager");
      await skillCityManagerDesk.setFocus(session.userId, { organizationId: field(form, "organizationId"), personId: field(form, "personId"), title: field(form, "title"), startsOn: field(form, "startsOn"), endsOn: field(form, "endsOn"), decisionReference: field(form, "decisionReference"), reference });
    } else if (field(form, "action") === "FOCUS_END") {
      await skillCityManagerDesk.endFocus(session.userId, { focusId: field(form, "focusId"), reason: field(form, "reason"), reference });
    } else if (field(form, "action") === "TASK_CONTROL") {
      await skillCityManagerDesk.changeTask(session.userId, { taskId: field(form, "taskId"), revision: Number(field(form, "revision")), status: field(form, "status"), deadlineMode: field(form, "deadlineMode"), dueDate: field(form, "dueDate") || null, reason: field(form, "reason"), reference });
    } else if (field(form, "action") === "TASK_BLOCKER") {
      await skillCityManagerDesk.setBlocker(session.userId, { taskId: field(form, "taskId"), ...(field(form, "blockerId") ? { blockerId: field(form, "blockerId") } : { description: field(form, "description"), expectedResolution: field(form, "expectedResolution") || null }), reason: field(form, "reason"), reference });
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

export async function skillCityStaffDraftAction(_state: StaffDraftState, form: FormData): Promise<StaffDraftState> {
  const { site, paths } = await requestPortal("skillcity", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again before continuing." };
  try {
    await consumeSecurityBudget(securityKey("skillcity:staff-draft", session.userId), 10, 3600);
    await skillCityEmployeeDashboard.dashboard(session.userId, "director");
    await staffOnboardingService.prepare(session.userId, {
      organizationId: field(form, "organizationId"),
      ...(field(form, "existingPersonId") ? { existingPersonId: field(form, "existingPersonId") } : { displayName: field(form, "displayName"), email: field(form, "email") }),
      roleId: field(form, "roleId"), scopeDecisionReference: field(form, "scopeDecisionReference"),
      ...(field(form, "managerUserId") ? { managerUserId: field(form, "managerUserId"), managerDecisionReference: field(form, "managerDecisionReference") } : {})
    });
    revalidatePath(paths.gateway);
    return { message: "Onboarding draft recorded. The account remains inactive." };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the employee details, scope and role." };
    safeDiagnostic("operation_failed");
    return { error: "Could not record the draft. No access was granted." };
  }
}

export async function skillCityStaffInviteAction(_state: StaffDraftState, form: FormData): Promise<StaffDraftState> {
  const { site, paths } = await requestPortal("skillcity", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again before continuing." };
  try {
    await consumeSecurityBudget(securityKey("skillcity:staff-invite", session.userId), 10, 3600);
    await skillCityEmployeeDashboard.dashboard(session.userId, "director");
    await staffInvite.send(session.userId, { userId: field(form, "userId"), verificationEvidence: field(form, "verificationEvidence") });
    revalidatePath(paths.gateway);
    return { message: "Invitation accepted by the email provider. Activation remains pending." };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the evidence and Skill City email configuration." };
    safeDiagnostic("operation_failed");
    return { error: "Invitation could not be sent. The account remains inactive." };
  }
}
