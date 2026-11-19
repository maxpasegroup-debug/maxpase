"use server";
import { revalidatePath } from "next/cache";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { AccessError } from "@/server/authorization/engine";
import { RateLimitError } from "@/server/security/rate-limit";
import { startupAdmissionsDesk } from "@/server/skillcity/startup-admissions-desk";
import { startupApplications } from "@/server/portals/startup-applications";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";

export type AdmissionsActionState = { error?: string; message?: string };
const field = (form: FormData, name: string) => String(form.get(name) ?? "");
async function context() {
  const { site } = await requestPortal("skillcity", true), session = await getPortalSession(site);
  if (!session) throw new AccessError("Sign in again before continuing.");
  return session;
}
function result(error: unknown, fallback: string): AdmissionsActionState {
  if (error instanceof AccessError || error instanceof RateLimitError) return { error: error.message };
  if (error instanceof ZodError) return { error: "Check the entered details and try again." };
  safeDiagnostic("operation_failed");
  return { error: fallback };
}
export async function recordAdmissionsFollowup(_state: AdmissionsActionState, form: FormData): Promise<AdmissionsActionState> {
  try {
    const session = await context(), localDate = field(form, "nextFollowUpAt");
    const nextFollowUpAt = localDate ? new Date(localDate).toISOString() : undefined;
    await startupAdmissionsDesk.addFollowup(session.userId, { caseId: field(form, "caseId"), contactMethod: field(form, "contactMethod"), outcome: field(form, "outcome"), note: field(form, "note"), ...(nextFollowUpAt ? { nextFollowUpAt } : {}) });
    revalidatePath("/sites/skillcity/admissions"); revalidatePath("/admissions");
    return { message: "Follow-up recorded with the current user and timestamp." };
  } catch (error) { return result(error, "Follow-up could not be recorded."); }
}
export async function completeAdmissionsFollowup(_state: AdmissionsActionState, form: FormData): Promise<AdmissionsActionState> {
  try {
    const session = await context();
    await startupAdmissionsDesk.completeFollowup(session.userId, { caseId: field(form, "caseId"), followUpId: field(form, "followUpId") });
    revalidatePath("/sites/skillcity/admissions"); revalidatePath("/admissions");
    return { message: "Follow-up marked complete." };
  } catch (error) { return result(error, "Follow-up could not be updated."); }
}
export async function forwardAdmissionsApplication(_state: AdmissionsActionState, form: FormData): Promise<AdmissionsActionState> {
  try {
    const session = await context();
    const outcome = await startupAdmissionsDesk.forward(session.userId, { caseId: field(form, "caseId"), outcome: field(form, "outcome"), reviewNote: field(form, "reviewNote"), contactVerified: field(form, "contactVerified"), programReviewed: field(form, "programReviewed"), locationReviewed: field(form, "locationReviewed") });
    revalidatePath("/sites/skillcity/admissions"); revalidatePath("/admissions"); revalidatePath("/app/boss");
    return { message: `Forwarded to the Startup Director/Boss review queue (${outcome.status}). No admission was approved.` };
  } catch (error) { return result(error, "Application was not forwarded. Refresh and review the current record."); }
}
export async function assignAdmissionsOfficer(_state: AdmissionsActionState, form: FormData): Promise<AdmissionsActionState> {
  try {
    const session = await context();
    const assigned = await startupAdmissionsDesk.assignPortal(session.userId, { caseId: field(form, "caseId"), assignedUserId: field(form, "assignedUserId"), reason: field(form, "reason") });
    revalidatePath("/sites/skillcity/admissions"); revalidatePath("/admissions");
    return { message: assigned.assigned ? "Application assigned." : "Application unassigned." };
  } catch (error) { return result(error, "Assignment could not be saved."); }
}
export async function reviewProspectLeadMatch(_state: AdmissionsActionState, form: FormData): Promise<AdmissionsActionState> {
  try {
    const session = await context();
    const outcome = await startupAdmissionsDesk.reviewLeadApplicationLink(session.userId, { caseId: field(form, "caseId"), leadId: field(form, "leadId"), decision: field(form, "decision"), reason: field(form, "reason") });
    revalidatePath("/sites/skillcity/admissions"); revalidatePath("/admissions"); revalidatePath("/gateway?view=startup-leads");
    return { message: outcome.linked ? "Prospect linked to this application. The lead and all call history remain available." : "Possible match marked as a different person. No records were merged." };
  } catch (error) { return result(error, "Prospect match could not be saved. Refresh and review the current application."); }
}
export async function assignBossAdmissionsOfficer(brandId: string, _state: AdmissionsActionState, form: FormData): Promise<AdmissionsActionState> {
  try {
    const session = await requireSession();
    const assigned = await startupAdmissionsDesk.assignBoss(session.userId, brandId, { caseId: field(form, "caseId"), assignedUserId: field(form, "assignedUserId"), reason: field(form, "reason") });
    revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/admissions`); revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/admissions/ao-assignments`);
    return { message: assigned.assigned ? "Application assigned." : "Application unassigned." };
  } catch (error) { return result(error, "Assignment could not be saved."); }
}
export async function recordStartupLeadershipDecision(brandId: string | null, _state: AdmissionsActionState, form: FormData): Promise<AdmissionsActionState> {
  try {
    let decisionResult: { status: string };
    if (brandId) {
      const session = await requireSession();
      decisionResult = await startupApplications.reviewForBoss(session.userId, brandId, { id: field(form, "caseId"), version: Number(field(form, "version")), decision: field(form, "decision"), reason: field(form, "reason") });
      revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/admissions`); revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/admissions/ao-assignments`);
    } else {
      const session = await context();
      decisionResult = await startupApplications.review(session.userId, { id: field(form, "caseId"), version: Number(field(form, "version")), decision: field(form, "decision"), reason: field(form, "reason") });
      revalidatePath("/sites/skillcity/admissions"); revalidatePath("/admissions");
    }
    return { message: `${decisionResult.status.replaceAll("_", " ")} recorded. This application decision does not confirm admission, enrollment, credentials or payment.` };
  } catch (error) { return result(error, "Decision could not be recorded. Refresh and verify the current status."); }
}
