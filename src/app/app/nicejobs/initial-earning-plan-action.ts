"use server";
import { redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { candidateAboutYou } from "@/server/nicejobs/candidate-about-you";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
import { NiceJobsError } from "@/server/nicejobs/input";
import { safeDiagnostic } from "@/server/security/diagnostics";

export async function completeInitialEarningPlanAction() {
  const { site, paths } = await requestPortal("jobs", true);
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  let retry = false, missingPrerequisite = false;
  try {
    await consumeSecurityBudget(securityKey("nicejobs:onboarding:initial-earning-plan", session.userId), 10, 60);
    await candidateAboutYou.completeInitialEarningPlan(session.userId);
  } catch (error) {
    if (error instanceof AccessError) missingPrerequisite = true;
    else if (error instanceof RateLimitError || error instanceof NiceJobsError) retry = true;
    else { safeDiagnostic("operation_failed"); retry = true; }
  }
  if (missingPrerequisite) redirect(`${paths.signup}/next-stage`);
  if (retry) redirect(`${paths.signup}/target-complete?error=retry`);
  redirect(`${paths.signup}/plan-complete`);
}
