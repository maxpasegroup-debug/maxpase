"use server";
import { redirect } from "next/navigation";
import { destroySession, setSessionCookie } from "@/server/auth/session";
import { authenticationService } from "@/server/auth/service";
import { config } from "@/server/config";
import { RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { headers } from "next/headers";
import { validateActionOrigin } from "@/server/security/origin";

export type LoginState = { error?: string };
export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  try {
    const requestHeaders = await headers();
    validateActionOrigin(requestHeaders.get("origin"), requestHeaders.get("host"), process.env.APP_ORIGIN);
    const result = await authenticationService.login({ email: formData.get("email"), password: formData.get("password") }, config.AUTH_SECRET);
    if (!result) return { error: "Invalid credentials." };
    await setSessionCookie(result.token, result.session.expiresAt);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    safeDiagnostic("authentication_failed");
    return { error: "Sign-in is temporarily unavailable." };
  }
  redirect("/app");
}
export async function logoutAction() {
  const requestHeaders = await headers();
  validateActionOrigin(requestHeaders.get("origin"), requestHeaders.get("host"), process.env.APP_ORIGIN);
  await destroySession();
  redirect("/login");
}
