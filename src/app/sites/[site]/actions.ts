"use server";
import { redirect } from "next/navigation";
import { authenticationService } from "@/server/auth/service";
import { config } from "@/server/config";
import { requestPortal } from "@/server/portals/request";
import { setPortalCookie, revokePortalSession } from "@/server/portals/session";
import { RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { applicantAccess } from "@/server/nicejobs/applicant-access";
import { NiceJobsError, NiceJobsUnavailable } from "@/server/nicejobs/input";
import { ZodError } from "zod";
import { jobsEmailAuth } from "@/server/auth/jobs-email-auth";
import { EmailAuthUnavailable } from "@/server/auth/resend-otp";
import { labsPin } from "@/server/labs/pin";

export type PortalLoginState = { error?: string; challengeId?: string; message?: string; complete?: boolean };
export async function applicantSignupAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  await requestPortal("jobs", true);
  try {
    jobsEmailAuth.ready();
    await applicantAccess.register({ displayName: form.get("displayName"), email: form.get("email"), password: form.get("password"), confirmPassword: form.get("confirmPassword"), acknowledge: form.get("acknowledge") === "on" });
    const result = await jobsEmailAuth.beginLogin({ email: form.get("email"), password: form.get("password") });
    return { ...result, message: "Check your email for a six-digit code. It expires in 10 minutes." };
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof NiceJobsError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Enter your name, a valid email, matching passwords of at least 12 characters, and confirm the account notice." };
    if (error instanceof NiceJobsUnavailable || error instanceof EmailAuthUnavailable) return { error: "Applicant registration or email delivery is temporarily unavailable. Please try again later. If you already created an account, use Sign in to request a new code." };
    safeDiagnostic("operation_failed");
    return { error: "Could not finish registration. If your account was created, use Sign in to continue." };
  }
}
export async function portalLoginAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  let destination: string;
  try {
    const { site, paths } = await requestPortal(String(form.get("site") ?? ""), true);
    if (site.id === "jobs") return { error: "Use the Nice Jobs email and code sign-in form." };
    const result = site.id === "labs" ? await labsPin.login({ email: form.get("email"), pin: form.get("password") }, config.AUTH_SECRET) : await authenticationService.loginPortal({ email: form.get("email"), password: form.get("password") }, config.AUTH_SECRET, site.id);
    if (!result) return { error: "Invalid credentials or gateway access unavailable." };
    await setPortalCookie(site, result.token, result.session.expiresAt);
    destination = paths.gateway;
  } catch (e) {
    if (e instanceof RateLimitError) return { error: e.message };
    safeDiagnostic("authentication_failed");
    return { error: "Invalid credentials or gateway access unavailable." };
  }
  redirect(destination);
}
export async function jobsEmailLoginAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  const { site, paths } = await requestPortal("jobs", true);
  let destination: string;
  try {
    if (form.get("step") !== "VERIFY") {
      const result = await jobsEmailAuth.beginLogin({ email: form.get("email"), password: form.get("password") });
      return { ...result, message: "If the credentials and gateway access are valid, a code will arrive by email. It expires in 10 minutes." };
    }
    const result = await jobsEmailAuth.completeLogin({ challengeId: form.get("challengeId"), code: form.get("code") }, config.AUTH_SECRET);
    await setPortalCookie(site, result.token, result.session.expiresAt);
    const versionId = form.get("versionId");
    destination = typeof versionId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(versionId) ? `${paths.gateway}?view=opportunities&versionId=${encodeURIComponent(versionId)}` : paths.gateway;
  } catch (error) {
    if (error instanceof EmailAuthUnavailable) return { error: error.message };
    if (!(error instanceof RateLimitError || error instanceof ZodError)) safeDiagnostic("authentication_failed");
    const challengeId = String(form.get("challengeId") ?? "");
    return { ...( /^[a-f0-9-]{36}$/.test(challengeId) ? { challengeId } : {}), error: error instanceof RateLimitError ? error.message : "Could not sign in. Check your details or request a new code; email delivery may be unavailable." };
  }
  redirect(destination);
}
export async function jobsPasswordResetAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  await requestPortal("jobs", true);
  try {
    if (form.get("step") !== "VERIFY") {
      const result = await jobsEmailAuth.beginReset({ email: form.get("email") });
      return { ...result, message: "If this email has an eligible Nice Jobs account, a reset code will arrive. It expires in 10 minutes." };
    }
    await jobsEmailAuth.completeReset({ challengeId: form.get("challengeId"), code: form.get("code"), password: form.get("password"), confirmPassword: form.get("confirmPassword") });
    return { complete: true, message: "Password changed. Existing sessions have been signed out. Sign in with your new password and a new email code." };
  } catch (error) {
    if (error instanceof EmailAuthUnavailable) return { error: error.message };
    if (!(error instanceof RateLimitError || error instanceof ZodError)) safeDiagnostic("authentication_failed");
    const challengeId = String(form.get("challengeId") ?? "");
    return { ...( /^[a-f0-9-]{36}$/.test(challengeId) ? { challengeId } : {}), error: error instanceof RateLimitError ? error.message : "Could not reset your password. Use a valid unexpired code and matching passwords of at least 12 characters, or request a new code." };
  }
}
export async function portalLogoutAction(form: FormData) {
  const { site, paths } = await requestPortal(String(form.get("site") ?? ""), true);
  await revokePortalSession(site); redirect(paths.login);
}
