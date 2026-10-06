"use server";
import { redirect } from "next/navigation";
import { destroySession, setSessionCookie } from "@/server/auth/session";
import { authenticationService } from "@/server/auth/service";
import { config } from "@/server/config";
import { RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic, failureReason, type FailureStage } from "@/server/security/diagnostics";
import { headers } from "next/headers";
import { validateActionOrigin } from "@/server/security/origin";
import { siteByHost } from "@/server/portals/sites";

export type LoginState = { error?: string };
export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  let stage: FailureStage = "origin";
  try {
    const requestHeaders = await headers();
    if (requestHeaders.has("x-maxpase-portal") || siteByHost(requestHeaders.get("host"))) throw new Error("Invalid authentication host");
    validateActionOrigin(requestHeaders.get("origin"), requestHeaders.get("host"), process.env.APP_ORIGIN);
    stage = "authentication";
    const result = await authenticationService.login({ email: formData.get("email"), password: formData.get("password") }, config.AUTH_SECRET);
    if (!result) return { error: "Invalid credentials." };
    stage = "session_cookie";
    await setSessionCookie(result.token, result.session.expiresAt);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    safeDiagnostic("authentication_failed", undefined, { stage, reason: failureReason(error, stage) });
    return { error: "Sign-in is temporarily unavailable." };
  }
  redirect("/app");
}
export async function logoutAction() {
  const requestHeaders = await headers();
  if (requestHeaders.has("x-maxpase-portal") || siteByHost(requestHeaders.get("host"))) throw new Error("Invalid authentication host");
  validateActionOrigin(requestHeaders.get("origin"), requestHeaders.get("host"), process.env.APP_ORIGIN);
  await destroySession();
  redirect("/login");
}
export async function bossLoginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  let stage: FailureStage = "origin";
  try {
    const h = await headers();
    if (h.has("x-maxpase-portal") || siteByHost(h.get("host"))) throw new Error("Invalid authentication host");
    validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    stage = "authentication";
    const result = await authenticationService.loginBoss({ email: formData.get("email"), password: formData.get("pin") }, config.AUTH_SECRET);
    if (!result) return { error: "Invalid credentials." };
    stage = "session_cookie";
    await setSessionCookie(result.token, result.session.expiresAt);
  } catch (e) {
    if (e instanceof RateLimitError) return { error: e.message };
    safeDiagnostic("authentication_failed", undefined, { stage, reason: failureReason(e, stage) });
    return { error: "Sign-in is temporarily unavailable." };
  }
  redirect("/app/boss");
}
