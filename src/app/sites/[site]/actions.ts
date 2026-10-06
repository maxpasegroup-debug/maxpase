"use server";
import { redirect } from "next/navigation";
import { authenticationService } from "@/server/auth/service";
import { config } from "@/server/config";
import { requestPortal } from "@/server/portals/request";
import { setPortalCookie, revokePortalSession } from "@/server/portals/session";
import { RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type PortalLoginState = { error?: string };
export async function portalLoginAction(_state: PortalLoginState, form: FormData): Promise<PortalLoginState> {
  let destination: string;
  try {
    const { site, paths } = await requestPortal(String(form.get("site") ?? ""), true);
    const result = await authenticationService.loginPortal({ email: form.get("email"), password: form.get("password") }, config.AUTH_SECRET, site.id);
    if (!result) return { error: "Invalid credentials or gateway access unavailable." };
    await setPortalCookie(site, result.token, result.session.expiresAt); destination = paths.gateway;
  } catch (e) {
    if (e instanceof RateLimitError) return { error: e.message };
    safeDiagnostic("authentication_failed");
    return { error: "Invalid credentials or gateway access unavailable." };
  }
  redirect(destination);
}
export async function portalLogoutAction(form: FormData) {
  const { site, paths } = await requestPortal(String(form.get("site") ?? ""), true);
  await revokePortalSession(site); redirect(paths.login);
}
