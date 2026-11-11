"use server";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { candidateAboutYou } from "@/server/nicejobs/candidate-about-you";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { AccessError } from "@/server/authorization/engine";
import { NiceJobsError } from "@/server/nicejobs/input";

export type AboutYouActionState = { message?: string; error?: string };
export async function saveAboutYou(_state: AboutYouActionState, form: FormData): Promise<AboutYouActionState> {
  const { site, paths } = await requestPortal("jobs", true);
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  const onboarding = form.get("mode") === "ONBOARDING";
  try {
    await consumeSecurityBudget(securityKey("nicejobs:profile:about-you", session.userId), 10, 60);
    await candidateAboutYou.save(session.userId, form.get("aboutYou"));
  } catch (error) {
    if (error instanceof ZodError) return { error: "Choose the option that best describes you." };
    if (error instanceof RateLimitError) return { error: error.message };
    if (error instanceof NiceJobsError) return { error: error.message };
    if (error instanceof AccessError) return { error: "Your Nice Jobs profile cannot be updated right now." };
    safeDiagnostic("operation_failed");
    return { error: "We could not save this yet. Please try again." };
  }
  if (onboarding) redirect(`${paths.signup}/next`);
  return { message: "Your profile has been updated." };
}
