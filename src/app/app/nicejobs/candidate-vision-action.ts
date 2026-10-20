"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getPortalSession } from "@/server/portals/session";
import { requestPortal } from "@/server/portals/request";
import { validateActionOrigin } from "@/server/security/origin";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { candidateVision } from "@/server/nicejobs/candidate-vision";
import { NiceJobsError } from "@/server/nicejobs/input";
import { AccessError } from "@/server/authorization/engine";

export type VisionState = { success?: string; error?: string };
export async function saveCandidateVision(_state: VisionState, form: FormData): Promise<VisionState> {
  const { site, paths } = await requestPortal("jobs", true);
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  const h = await headers();
  validateActionOrigin(h.get("origin"), h.get("host"));
  try {
    await consumeSecurityBudget(securityKey("nicejobs:vision", session.userId), 10, 60);
    await candidateVision.save(session.userId, { outcome: form.get("outcome"), reason: form.get("reason"), nextStep: form.get("nextStep") });
    revalidatePath(paths.gateway);
    return { success: "Your personal goal was saved." };
  } catch (error) {
    if (error instanceof ZodError) return { error: "Enter a goal and a first step. Keep each under 160 characters." };
    if (error instanceof NiceJobsError || error instanceof RateLimitError) return { error: error.message };
    if (error instanceof AccessError) return { error: "Your account cannot update this goal." };
    safeDiagnostic("operation_failed");
    return { error: "Your goal could not be saved. Please try again." };
  }
}
