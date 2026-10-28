"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { startupFounderService } from "@/server/portals/startup-founder";

export type FounderActionState = { error?: string };
function errorState(error: unknown): FounderActionState {
  if (error instanceof z.ZodError) return { error: "Check every required field and try again." };
  safeDiagnostic("operation_failed");
  return { error: "This action is unavailable, changed, or already completed. Refresh and try again." };
}
async function actor(portal: "startup" | "skillcity") {
  const { site, paths } = await requestPortal(portal, true);
  const session = await getPortalSession(site);
  if (!session) return null;
  return { userId: session.userId, paths };
}
export async function founderSubmitAction(_state: FounderActionState, form: FormData): Promise<FounderActionState> {
  const current = await actor("startup"); if (!current) return { error: "Sign in again before submitting." };
  try { await startupFounderService.submit(current.userId, { batchId: form.get("batchId"), milestoneKey: form.get("milestoneKey"), text: form.get("text"), ...(form.has("version") ? { version: Number(form.get("version")) } : {}) }); }
  catch (error) { return errorState(error); }
  redirect(`${current.paths.gateway}?view=founder`);
}
export async function founderReviewAction(_state: FounderActionState, form: FormData): Promise<FounderActionState> {
  const current = await actor("skillcity"); if (!current) return { error: "Sign in again before reviewing." };
  try { await startupFounderService.review(current.userId, { evidenceId: form.get("evidenceId"), version: Number(form.get("version")), decision: form.get("decision"), feedback: form.get("feedback") }); }
  catch (error) { return errorState(error); }
  redirect(`${current.paths.gateway}?view=founder-management`);
}
export async function founderPlanAction(_state: FounderActionState, form: FormData): Promise<FounderActionState> {
  const current = await actor("skillcity"); if (!current) return { error: "Sign in again before saving." };
  try {
    const titles = form.getAll("title"), practices = form.getAll("practice"), prompts = form.getAll("evidencePrompt");
    if (titles.length !== practices.length || titles.length !== prompts.length) return { error: "Milestone fields are incomplete." };
    await startupFounderService.savePlan(current.userId, String(form.get("batchId")), { tier: form.get("tier"), termsApprovalRef: form.get("termsApprovalRef"), milestones: titles.map((title, index) => ({ key: `step-${index + 1}`, title, practice: practices[index], evidencePrompt: prompts[index] })) });
  } catch (error) { return errorState(error); }
  redirect(`${current.paths.gateway}?view=founder-management`);
}
export async function founderApprovePlanAction(_state: FounderActionState, form: FormData): Promise<FounderActionState> {
  const current = await actor("skillcity"); if (!current) return { error: "Sign in again before approving." };
  try { await startupFounderService.approvePlan(current.userId, String(form.get("batchId")), Number(form.get("version"))); }
  catch (error) { return errorState(error); }
  redirect(`${current.paths.gateway}?view=founder-management`);
}
export async function founderCommunityAction(_state: FounderActionState, form: FormData): Promise<FounderActionState> {
  const current = await actor("skillcity"); if (!current) return { error: "Sign in again before posting." };
  try { await startupFounderService.postNote(current.userId, { batchId: form.get("batchId"), title: form.get("title"), message: form.get("message") }); }
  catch (error) { return errorState(error); }
  redirect(`${current.paths.gateway}?view=founder-management`);
}
