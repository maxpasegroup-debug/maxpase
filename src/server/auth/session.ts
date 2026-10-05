import { cookies } from "next/headers";
import { config } from "@/server/config";
import { authenticationService } from "./service";

export type AuthSession = { userId: string; sessionId: string; email: string; personId: string | null };
export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(config.AUTH_COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: config.AUTH_COOKIE_SECURE, expires: expiresAt, path: "/" });
}
export async function createSession(userId: string) {
  const result = await authenticationService.create(userId, config.AUTH_SECRET);
  await setSessionCookie(result.token, result.session.expiresAt);
  return result.session;
}
export async function getSession(): Promise<AuthSession | null> {
  const token = (await cookies()).get(config.AUTH_COOKIE_NAME)?.value;
  return token ? authenticationService.validate(token, config.AUTH_SECRET) : null;
}
export async function destroySession() {
  const store = await cookies(), token = store.get(config.AUTH_COOKIE_NAME)?.value;
  if (token) await authenticationService.revoke(token, config.AUTH_SECRET);
  store.delete(config.AUTH_COOKIE_NAME);
}
