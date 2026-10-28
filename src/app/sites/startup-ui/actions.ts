"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { config } from "@/server/config";
import { AccessError } from "@/server/authorization/engine";
import { RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession, setPortalCookie } from "@/server/portals/session";
import { startupAuth, StartupAuthUnavailable } from "@/server/portals/startup-auth";
import { startupApplications } from "@/server/portals/startup-applications";

export type StartupActionState = { error?: string; challengeId?: string; message?: string };
export async function startupSignupAction(_state: StartupActionState, form: FormData): Promise<StartupActionState> {
  await requestPortal("startup", true);
  try { return { ...(await startupAuth.register({ name: form.get("name"), email: form.get("email"), password: form.get("password"), confirmPassword: form.get("confirmPassword"), consent: form.get("consent") === "on" })), message: "Check your email for a six-digit code. It expires in 10 minutes." }; }
  catch (error) {
    if (error instanceof z.ZodError) return { error: "Check your name, email, matching passwords and acknowledgement." };
    if (error instanceof StartupAuthUnavailable) return { error: "Email verification is unavailable. If your account was created, request another code when delivery is restored." };
    if (error instanceof RateLimitError) return { error: error.message };
    if (!(error instanceof AccessError)) safeDiagnostic("operation_failed");
    return { error: "Could not create an account. If you already registered, sign in or request a verification code." };
  }
}
export async function startupResendAction(_state: StartupActionState, form: FormData): Promise<StartupActionState> {
  await requestPortal("startup", true);
  try { return { ...(await startupAuth.resend({ email: form.get("email"), password: form.get("password") })), message: "If your account still needs verification, a code will arrive at its email address." }; }
  catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    if (!(error instanceof z.ZodError || error instanceof StartupAuthUnavailable)) safeDiagnostic("operation_failed");
    return { error: "Could not request a code right now. Try again later." };
  }
}
export async function startupVerifyAction(_state: StartupActionState, form: FormData): Promise<StartupActionState> {
  const { site, paths } = await requestPortal("startup", true);
  try {
    const result = await startupAuth.verify({ challengeId: form.get("challengeId"), code: form.get("code") }, config.AUTH_SECRET);
    await setPortalCookie(site, result.token, result.session.expiresAt);
  } catch (error) {
    if (!(error instanceof AccessError || error instanceof z.ZodError || error instanceof RateLimitError)) safeDiagnostic("authentication_failed");
    return { challengeId: String(form.get("challengeId") ?? ""), error: error instanceof RateLimitError ? error.message : "Invalid or expired code. Request another code if needed." };
  }
  redirect(paths.gateway);
}
export async function startupSubmitAction(_state: StartupActionState, form: FormData): Promise<StartupActionState> {
  const { site, paths } = await requestPortal("startup", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again to send your application." };
  try { await startupApplications.submit(session.userId, { tier: form.get("tier"), idea: form.get("idea"), goal: form.get("goal"), experience: form.get("experience"), location: form.get("location"), timeCommitment: form.get("timeCommitment"), consent: form.get("consent") === "on" }); }
  catch (error) {
    if (error instanceof z.ZodError) return { error: "Complete each answer and acknowledge how your application will be reviewed." };
    if (!(error instanceof AccessError)) safeDiagnostic("operation_failed");
    return { error: "Your application could not be sent. Please try again later." };
  }
  redirect(paths.gateway);
}
export async function startupReviewAction(_state: StartupActionState, form: FormData): Promise<StartupActionState> {
  const { site, paths } = await requestPortal("skillcity", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again to review applications." };
  try { await startupApplications.review(session.userId, { id: form.get("id"), version: Number(form.get("version")), decision: form.get("decision"), reason: form.get("reason") }); }
  catch (error) {
    if (error instanceof z.ZodError) return { error: "Choose a decision and explain it in at least five characters." };
    if (!(error instanceof AccessError)) safeDiagnostic("operation_failed");
    return { error: "Decision unavailable or already recorded. Refresh and try again." };
  }
  redirect(`${paths.gateway}?view=startup-applications`);
}
