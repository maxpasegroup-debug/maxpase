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
import { jobsPhoneInput } from "@/server/auth/jobs-phone";
import { jobsPinInput } from "@/server/auth/jobs-phone";
import { hashJobsPin } from "@/server/auth/jobs-pin";
import { getPortalSession } from "@/server/portals/session";
import { prisma } from "@/server/db";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { accountPortalRealm } from "@/server/auth/account-realm";

export type PortalLoginState = { error?: string; challengeId?: string; message?: string; complete?: boolean };
export async function jobsPhoneSignupAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  await requestPortal("jobs", true);
  try {
    jobsEmailAuth.ready();
    const registered = await applicantAccess.register({ displayName: form.get("displayName"), country: form.get("country"), nationalNumber: form.get("nationalNumber"), email: form.get("email"), pin: form.get("pin"), confirmPin: form.get("confirmPin"), acknowledge: form.get("acknowledge") === "on" });
    const result = await jobsEmailAuth.beginRegistration(registered.userId);
    return { ...result, message: "Check your email for a six-digit verification code. It expires in 10 minutes." };
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof NiceJobsError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check your name, country, phone, email and matching six-digit PINs." };
    if (error instanceof NiceJobsUnavailable || error instanceof EmailAuthUnavailable) return { error: "Registration or email delivery is temporarily unavailable. If your account was created, request a new verification code." };
    safeDiagnostic("operation_failed");
    return { error: "Could not finish registration. Please try again later." };
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
  } catch (error) {
    if (!(error instanceof RateLimitError || error instanceof ZodError)) safeDiagnostic("authentication_failed");
    return { challengeId: String(form.get("challengeId") ?? ""), error: error instanceof RateLimitError ? error.message : "Invalid or expired code. Request a new code if needed." };
  }
  redirect(paths.gateway);
}
export async function jobsResendVerificationAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  await requestPortal("jobs", true);
  try {
    const result = await jobsEmailAuth.resendRegistration({ country: form.get("country"), nationalNumber: form.get("nationalNumber"), pin: form.get("pin") });
    return { ...result, message: "If this account still needs verification, a code will arrive at its registered email." };
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    if (!(error instanceof ZodError)) safeDiagnostic("operation_failed");
    return { error: "Could not request a code. Check your details or try again later." };
  }
}
export async function jobsActivatePinAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  const { site, paths } = await requestPortal("jobs", true);
  const session = await getPortalSession(site, true);
  if (!session) return { error: "Sign in with your existing account and email code first." };
  try {
    const phone = jobsPhoneInput.parse({ country: form.get("country"), nationalNumber: form.get("nationalNumber") });
    const pin = jobsPinInput.parse(form.get("pin")), confirmPin = jobsPinInput.parse(form.get("confirmPin"));
    if (pin !== confirmPin) return { error: "PINs do not match." };
    const jobsPinHash = await hashJobsPin(pin);
    await prisma.$transaction(async db => {
      const current = await db.session.findUnique({ where: { id: session.sessionId }, include: { user: { include: { person: true } } } });
      if (!current || current.userId !== session.userId || current.createdAt.getTime() < Date.now() - 600000 || current.user.jobsPinHash || current.user.jobsPhone || !current.user.passwordHash || !current.user.emailVerifiedAt || current.user.status !== "ACTIVE" || current.user.person?.status !== "ACTIVE" || accountPortalRealm(current.user.person?.metadata) !== "jobs" || JSON.parse(current.user.person?.metadata ?? "{}").identitySource !== "SELF_REGISTRATION") throw new Error("Activation session expired");
      if (await db.user.findUnique({ where: { jobsPhone: phone } })) throw new Error("Phone unavailable");
      await db.user.update({ where: { id: current.userId }, data: { jobsPhone: phone, jobsPinHash, person: current.user.personId ? { update: { phone } } : undefined } });
      await db.session.deleteMany({ where: { userId: current.userId, id: { not: current.id } } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: current.userId, actorPersonId: current.user.personId, action: "auth.jobs_pin_activated", entityType: "User", entityId: current.userId, result: "SUCCESS", metadata: { portal: "jobs", phoneVerified: false } }) });
    });
  } catch (error) {
    if (!(error instanceof ZodError)) safeDiagnostic("operation_failed");
    return { error: "Could not activate your PIN. Check the phone number and use a fresh sign-in code." };
  }
  redirect(paths.gateway);
}
export async function jobsPinResetAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  await requestPortal("jobs", true);
  try {
    if (form.get("step") !== "VERIFY") {
      jobsPhoneInput.parse({ country: form.get("country"), nationalNumber: form.get("nationalNumber") });
      const result = await jobsEmailAuth.beginPinReset({ country: form.get("country"), nationalNumber: form.get("nationalNumber") });
      return { ...result, message: "If the account is eligible, a code will arrive at its registered email. It expires in 10 minutes." };
    }
    await jobsEmailAuth.completePinReset({ challengeId: form.get("challengeId"), code: form.get("code"), pin: form.get("pin"), confirmPin: form.get("confirmPin") });
    return { complete: true, message: "PIN changed. Existing sessions have been signed out. Sign in with your new PIN." };
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError && form.get("step") !== "VERIFY") return { error: "Enter a valid phone number." };
    if (!(error instanceof ZodError)) safeDiagnostic("operation_failed");
    return { challengeId: form.get("step") === "VERIFY" ? String(form.get("challengeId") ?? "") : undefined, error: "Could not complete recovery. Check the code and matching PINs, or request a new code." };
  }
}
export async function portalLoginAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  let destination: string;
  try {
    const { site, paths } = await requestPortal(String(form.get("site") ?? ""), true);
    if (site.id === "jobs") return { error: "Use the Nice Jobs phone and PIN sign-in form." };
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
