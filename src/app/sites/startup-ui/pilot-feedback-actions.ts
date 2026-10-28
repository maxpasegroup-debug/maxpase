"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { startupPilotFeedback } from "@/server/portals/startup-pilot-feedback";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type PilotFeedbackState = { error?: string };
const errorState = (error: unknown): PilotFeedbackState => {
  if (error instanceof z.ZodError) return { error: "Choose a topic and describe what was difficult in at least 20 characters." };
  safeDiagnostic("operation_failed");
  return { error: "Feedback could not be recorded. Check your access or try again later." };
};
export async function pilotFeedbackSubmitAction(_state: PilotFeedbackState, form: FormData): Promise<PilotFeedbackState> {
  const { site, paths } = await requestPortal("startup", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again to send feedback." };
  try { await startupPilotFeedback.submit(session.userId, { stage: form.get("stage"), message: form.get("message"), ...(form.has("enrollmentId") ? { enrollmentId: form.get("enrollmentId") } : {}) }); }
  catch (error) { return errorState(error); }
  redirect(`${paths.gateway}?view=${form.has("enrollmentId") ? "founder" : "overview"}&feedback=recorded`);
}
export async function pilotFeedbackDecisionAction(_state: PilotFeedbackState, form: FormData): Promise<PilotFeedbackState> {
  const { site, paths } = await requestPortal("skillcity", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again to review feedback." };
  try { await startupPilotFeedback.decide(session.userId, { id: form.get("id"), version: Number(form.get("version")), status: form.get("status"), note: form.get("note") }); }
  catch (error) { return errorState(error); }
  redirect(`${paths.gateway}?view=founder-management&feedback=reviewed`);
}
