"use server";
import { redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { candidateAboutYou } from "@/server/nicejobs/candidate-about-you";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
import { NiceJobsError } from "@/server/nicejobs/input";
import { safeDiagnostic } from "@/server/security/diagnostics";

export async function completeOpportunityEcosystemAction() {
  const { site, paths } = await requestPortal("jobs", true);
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  let retry = false, missingProfile = false;
  try {
    await consumeSecurityBudget(securityKey("nicejobs:onboarding:ecosystem", session.userId), 10, 60);
    await candidateAboutYou.completeOpportunityEcosystem(session.userId);
  } catch (error) {
    if (error instanceof AccessError) missingProfile = true;
    else if (error instanceof RateLimitError || error instanceof NiceJobsError) retry = true;
    else { safeDiagnostic("operation_failed"); retry = true; }
  }
  if (missingProfile) redirect(`${paths.signup}/about-you`);
  if (retry) redirect(`${paths.signup}/next?error=retry`);
  redirect(`${paths.signup}/next-stage`);
}
