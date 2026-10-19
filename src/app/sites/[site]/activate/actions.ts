"use server";
import { ZodError } from "zod";
import { requestPortal } from "@/server/portals/request";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { AccessError } from "@/server/authorization/engine";
import { RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type ActivationState = { message?: string; error?: string };
export async function activateStaffAction(_state: ActivationState, form: FormData): Promise<ActivationState> {
  await requestPortal("skillcity", true);
  try {
    await staffInvite.activate({ challengeId: String(form.get("challengeId") ?? ""), code: String(form.get("code") ?? ""), password: String(form.get("password") ?? ""), confirmPassword: String(form.get("confirmPassword") ?? "") });
    return { message: "Your account is active. Sign in with your work email and new password." };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the code and password, then retry." };
    safeDiagnostic("authentication_failed");
    return { error: "Activation is unavailable. Your account has not been activated." };
  }
}
