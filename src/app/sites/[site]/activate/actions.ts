"use server";
import { ZodError } from "zod";
import { requestPortal } from "@/server/portals/request";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { niceJobsDirectorInvite } from "@/server/auth/nicejobs-director-invite";
import { JobsSmsUnavailable } from "@/server/auth/nicejobs-sms";
import { AccessError } from "@/server/authorization/engine";
import { RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type ActivationState = { message?: string; error?: string };
export async function activateStaffAction(_state: ActivationState, form: FormData): Promise<ActivationState> {
  const site = String(form.get("site") ?? "");
  if (site !== "skillcity" && site !== "labs") return { error: "Employee activation unavailable." };
  await requestPortal(site, true);
  try {
    await staffInvite.activate({ challengeId: String(form.get("challengeId") ?? ""), code: String(form.get("code") ?? ""), password: String(form.get("password") ?? ""), confirmPassword: String(form.get("confirmPassword") ?? ""), portal: site });
    return { message: "Your account is active. Sign in with your work email and new password." };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the code and password, then retry." };
    safeDiagnostic("authentication_failed");
    return { error: "Activation is unavailable. Your account has not been activated." };
  }
}

export type JobsDirectorActivationState = { message?: string; error?: string; phoneChallengeId?: string; emailVerified?: boolean };
export async function verifyJobsDirectorEmailAction(_state: JobsDirectorActivationState, form: FormData): Promise<JobsDirectorActivationState> {
  await requestPortal("jobs", true);
  try {
    const result = await niceJobsDirectorInvite.verifyEmail({ challengeId: String(form.get("challengeId") ?? ""), code: String(form.get("code") ?? "") });
    return { phoneChallengeId: result.challengeId, emailVerified: true, message: "Email verified. A mobile code was sent to the appointed number." };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RateLimitError) return { emailVerified: true, error: error.message };
    if (error instanceof JobsSmsUnavailable) return { emailVerified: true, error: "Email is verified, but mobile code delivery is unavailable. Try resending the mobile code later." };
    if (error instanceof ZodError) return { error: "Enter the six-digit email code." };
    safeDiagnostic("authentication_failed");
    return { error: "Email verification is unavailable. Request a new appointment email if the code expired." };
  }
}
export async function resendJobsDirectorMobileCodeAction(_state: JobsDirectorActivationState, form: FormData): Promise<JobsDirectorActivationState> {
  await requestPortal("jobs", true);
  try {
    const result = await niceJobsDirectorInvite.resendPhone({ challengeId: String(form.get("challengeId") ?? "") });
    return { phoneChallengeId: result.challengeId, emailVerified: true, message: "A new mobile code was sent." };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RateLimitError) return { emailVerified: true, error: error.message };
    if (error instanceof JobsSmsUnavailable) return { emailVerified: true, error: "Mobile code delivery is not configured or available yet." };
    if (error instanceof ZodError) return { error: "This appointment link is invalid or expired." };
    safeDiagnostic("authentication_failed");
    return { emailVerified: true, error: "Could not send a mobile code. Try again later." };
  }
}
export async function activateJobsDirectorAction(_state: JobsDirectorActivationState, form: FormData): Promise<JobsDirectorActivationState> {
  await requestPortal("jobs", true);
  try {
    await niceJobsDirectorInvite.activate({ challengeId: String(form.get("challengeId") ?? ""), code: String(form.get("code") ?? ""), pin: String(form.get("pin") ?? ""), confirmPin: String(form.get("confirmPin") ?? "") });
    return { message: "Your NICEJOBS Director access is active. Sign in with your mobile number and PIN." };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RateLimitError) return { emailVerified: true, error: error.message };
    if (error instanceof ZodError) return { emailVerified: true, error: "Enter the six-digit mobile code and a matching six-digit PIN." };
    safeDiagnostic("authentication_failed");
    return { emailVerified: true, error: "Activation is unavailable. Your account remains inactive." };
  }
}
