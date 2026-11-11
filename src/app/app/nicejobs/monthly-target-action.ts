"use server";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { candidateAboutYou } from "@/server/nicejobs/candidate-about-you";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
import { NiceJobsError } from "@/server/nicejobs/input";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type MonthlyTargetActionState = { error?: string; message?: string };
export async function saveMonthlyEarningTargetAction(_state: MonthlyTargetActionState, form: FormData): Promise<MonthlyTargetActionState> {
  const { site, paths } = await requestPortal("jobs", true);
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  const onboarding = form.get("mode") === "ONBOARDING";
  try {
    await consumeSecurityBudget(securityKey("nicejobs:profile:monthly-target", session.userId), 10, 60);
    await candidateAboutYou.saveMonthlyEarningTarget(session.userId, form.get("monthlyTarget"), onboarding);
  } catch (error) {
    if (error instanceof ZodError) return { error: "Enter a whole rupee amount greater than zero." };
    if (error instanceof RateLimitError) return { error: error.message };
    if (error instanceof NiceJobsError) return { error: error.message };
    if (error instanceof AccessError) return { error: "Complete the earlier Nice Jobs steps before saving this target." };
    safeDiagnostic("operation_failed");
    return { error: "We could not save this yet. Please try again." };
  }
  if (onboarding) redirect(`${paths.signup}/target-complete`);
  return { message: "Your monthly earning target has been updated." };
}
