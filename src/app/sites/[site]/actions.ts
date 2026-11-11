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
import { getPortalSession } from "@/server/portals/session";
import { prisma } from "@/server/db";
import { jobsPinActivation, jobsRegistrationPin } from "@/server/auth/jobs-pin-activation";
import { assertJobsPinReady } from "@/server/auth/jobs-pin";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { clearJobsRegistrationProof, hasJobsRegistrationProof, setJobsRegistrationProof } from "@/server/auth/jobs-registration-proof";
import { staffInvite } from "@/server/skillcity/staff-invite";

export type PortalLoginState = { error?: string; challengeId?: string; message?: string; complete?: boolean; pendingVerification?: boolean; deliveryPending?: boolean };
export async function staffPasswordResetRequestAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  try {
    const { site } = await requestPortal(String(form.get("site") ?? ""), true);
    if (site.id !== "skillcity" && site.id !== "labs") return { error: "Recovery is unavailable for this portal." };
    const result = await staffInvite.beginPasswordReset({ email: String(form.get("email") ?? ""), portal: site.id });
    return { challengeId: result.challengeId, message: "If this is an eligible staff account, a recovery code will be sent to its verified work email. Check your inbox or spam folder." };
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Enter a valid work email address." };
    safeDiagnostic("authentication_failed");
    return { error: "Recovery is temporarily unavailable. Try again later." };
  }
}
export async function staffPasswordResetCompleteAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  try {
    const { site } = await requestPortal(String(form.get("site") ?? ""), true);
    if (site.id !== "skillcity" && site.id !== "labs") return { error: "Recovery is unavailable for this portal." };
    await staffInvite.completePasswordReset({ challengeId: String(form.get("challengeId") ?? ""), code: String(form.get("code") ?? ""), password: String(form.get("password") ?? ""), confirmPassword: String(form.get("confirmPassword") ?? ""), portal: site.id });
    return { complete: true, message: "Password changed. Existing sessions have been signed out. Sign in with your new password." };
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the recovery code and matching passwords (at least 12 characters)." };
    safeDiagnostic("authentication_failed");
    return { error: "Could not reset this password. Check the unexpired code or request a new one." };
  }
}
export async function jobsPhoneSignupAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  await requestPortal("jobs", true);
  let registeredUserId: string | undefined;
  try {
    jobsEmailAuth.ready();
    assertJobsPinReady();
    const registered = await applicantAccess.register({ displayName: form.get("displayName"), country: form.get("country"), nationalNumber: form.get("nationalNumber"), email: form.get("email"), acknowledge: form.get("acknowledge") === "on" });
    registeredUserId = registered.userId;
    const result = await jobsEmailAuth.beginRegistration(registered.userId);
    await setJobsRegistrationProof(result.challengeId);
    return { ...result, pendingVerification: true, message: "Check your email for a six-digit verification code. It expires in 10 minutes." };
  } catch (error) {
    if (registeredUserId) {
      let challengeId: string | undefined;
      try { challengeId = (await prisma.emailAuthChallenge.findFirst({ where: { userId: registeredUserId, purpose: "REGISTER" }, orderBy: { createdAt: "desc" }, select: { id: true } }))?.id; }
      catch { safeDiagnostic("operation_failed"); }
      if (challengeId) await setJobsRegistrationProof(challengeId);
      return { pendingVerification: true, challengeId, error: "Account created, but a verification code could not be sent. Request a new code after email delivery is available." };
    }
    if (error instanceof RateLimitError || error instanceof NiceJobsError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check your name, country, phone and email." };
    if (error instanceof EmailAuthUnavailable) return { error: "We can’t send email codes right now. No account was created. Please try again later." };
    if (error instanceof NiceJobsUnavailable) return { error: "Registration is temporarily unavailable. No account was created." };
    safeDiagnostic("operation_failed");
    return { error: "Could not finish registration. Please try again later." };
  }
}
export async function jobsChangeRecoveryEmailAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  await requestPortal("jobs", true);
  try {
    if (!await hasJobsRegistrationProof(String(form.get("challengeId") ?? ""))) return { error: "Email change is unavailable. Start a new verification request or contact support." };
    const result = await jobsEmailAuth.changeRegistrationEmail({ challengeId: form.get("challengeId"), email: form.get("email") });
    if ("deliveryPending" in result) return { deliveryPending: true, error: "Recovery email updated, but a code could not be sent. Request a new code when delivery is available." };
    await setJobsRegistrationProof(result.challengeId);
    return { ...result, message: "If these details match an unverified account, a code will arrive at the updated email." };
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    if (!(error instanceof ZodError || error instanceof EmailAuthUnavailable)) safeDiagnostic("operation_failed");
    return { error: "Could not update or send a code. Check your details and try again later." };
  }
}
export async function jobsPhoneLoginAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  const { site, paths } = await requestPortal("jobs", true);
  try {
    const result = await authenticationService.loginJobsPin({ country: form.get("country"), nationalNumber: form.get("nationalNumber"), pin: form.get("pin") }, config.AUTH_SECRET);
    if (!result) return { error: "Could not sign in. Check your details or try again later." };
    await setPortalCookie(site, result.token, result.session.expiresAt);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    safeDiagnostic("authentication_failed");
    return { error: "Could not sign in. Check your details or try again later." };
  }
  redirect(paths.gateway);
}
export async function jobsVerifyEmailAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  const { site, paths } = await requestPortal("jobs", true);
  try {
    const result = await jobsEmailAuth.completeRegistration({ challengeId: form.get("challengeId"), code: form.get("code") }, config.AUTH_SECRET);
    await setPortalCookie(site, result.token, result.session.expiresAt);
    await clearJobsRegistrationProof();
  } catch (error) {
    if (!(error instanceof RateLimitError || error instanceof ZodError)) safeDiagnostic("authentication_failed");
    return { challengeId: String(form.get("challengeId") ?? ""), error: error instanceof RateLimitError ? error.message : "Invalid or expired code. Request a new code if needed." };
  }
  redirect(`${paths.signup}/setup-pin`);
}
export async function jobsResendVerificationAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  await requestPortal("jobs", true);
  try {
    const result = await jobsEmailAuth.resendRegistration({ country: form.get("country"), nationalNumber: form.get("nationalNumber"), email: form.get("email") || undefined, pin: form.get("pin") || undefined });
    return { ...result, message: "If this account still needs verification, a code will arrive at its registered email." };
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    if (!(error instanceof ZodError)) safeDiagnostic("operation_failed");
    return { error: "Could not request a code. Check your details or try again later." };
  }
}
export async function jobsFinishSignupAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  const { site, paths } = await requestPortal("jobs", true);
  const session = await getPortalSession(site, true);
  if (!session?.needsJobsPinActivation) return { error: "Verify your email again to finish setting up your account." };
  let phone: string;
  try {
    phone = await jobsRegistrationPin(session.userId, session.sessionId, { pin: form.get("pin"), confirmPin: form.get("confirmPin"), acceptLegal: form.get("acceptLegal") === "on" });
  } catch (error) {
    if (!(error instanceof ZodError)) safeDiagnostic("operation_failed");
    return { error: "Create matching six-digit PINs and accept the Terms & Conditions and Privacy Policy to finish registration." };
  }
  const parsed = parsePhoneNumberFromString(phone);
  if (!parsed?.country) redirect(paths.login);
  let signedIn = false;
  try {
    const result = await authenticationService.loginJobsPin({ country: parsed.country, nationalNumber: parsed.nationalNumber, pin: form.get("pin") }, config.AUTH_SECRET);
    if (result) { await setPortalCookie(site, result.token, result.session.expiresAt); signedIn = true; }
  } catch (error) {
    if (!(error instanceof RateLimitError)) safeDiagnostic("authentication_failed");
  }
  if (!signedIn) redirect(paths.login);
  redirect(`${paths.signup}/complete`);
}
export async function jobsActivatePinAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  const { site, paths } = await requestPortal("jobs", true);
  const session = await getPortalSession(site, true);
  if (!session) return { error: "Sign in with your existing account and email code first." };
  try {
    await jobsPinActivation(session.userId, session.sessionId, { country: form.get("country"), nationalNumber: form.get("nationalNumber"), pin: form.get("pin"), confirmPin: form.get("confirmPin") });
  } catch (error) {
    if (!(error instanceof ZodError)) safeDiagnostic("operation_failed");
    return { error: "Could not activate your PIN. Check the phone number and use a fresh sign-in code." };
  }
  await revokePortalSession(site);
  redirect(paths.login);
}
export async function jobsPinResetAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  await requestPortal("jobs", true);
  try {
    if (form.get("step") !== "VERIFY") {
      const result = await jobsEmailAuth.beginPinReset({ email: form.get("email") });
      return { ...result, message: "If the account is eligible, a code will arrive at its registered email. It expires in 10 minutes." };
    }
    await jobsEmailAuth.completePinReset({ challengeId: form.get("challengeId"), code: form.get("code"), pin: form.get("pin"), confirmPin: form.get("confirmPin") });
    return { complete: true, message: "PIN changed. Existing sessions have been signed out. Sign in with your new PIN." };
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError && form.get("step") !== "VERIFY") return { error: "Enter a valid registered email address." };
    if (!(error instanceof ZodError)) safeDiagnostic("operation_failed");
    return { challengeId: form.get("step") === "VERIFY" ? String(form.get("challengeId") ?? "") : undefined, error: "Could not complete recovery. Check the code and matching PINs, or request a new code." };
  }
}
export async function portalLoginAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  let destination: string;
  try {
    const { site, paths } = await requestPortal(String(form.get("site") ?? ""), true);
    if (site.id === "jobs") return { error: "Use the Nice Jobs phone and PIN sign-in form." };
    const password = form.get("password");
    const result = site.id === "labs" && form.get("labsAccount") === "customer"
      ? await labsPin.login({ email: form.get("email"), pin: password }, config.AUTH_SECRET)
      : site.id === "labs" && form.get("labsAccount") !== "staff"
        ? null
        : await authenticationService.loginPortal({ email: form.get("email"), password }, config.AUTH_SECRET, site.id);
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
    const legacy = await prisma.user.findUnique({ where: { id: result.session.userId }, select: { jobsPinHash: true, person: { select: { metadata: true } } } });
    if (!legacy?.jobsPinHash && JSON.parse(legacy?.person?.metadata ?? "{}").identitySource === "SELF_REGISTRATION") destination = paths.login.replace(/\/login$/, "/activate-pin");
    else {
    const versionId = form.get("versionId");
    destination = typeof versionId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(versionId) ? `${paths.gateway}?view=opportunities&versionId=${encodeURIComponent(versionId)}` : paths.gateway;
    }
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
