import { cookies } from "next/headers";
import { config } from "@/server/config";
import { authenticationService } from "@/server/auth/service";
import { prisma } from "@/server/db";
import { requirePortalAccess } from "./policy";
import type { PortalSite } from "./sites";
import { AccessError } from "@/server/authorization/engine";

export async function getPortalSession(site: PortalSite) {
  const token = (await cookies()).get(site.cookie)?.value;
  if (!token) return null;
  const session = await authenticationService.validate(token, config.AUTH_SECRET, site.id);
  if (!session) return null;
  try { await requirePortalAccess(prisma, session.userId, site.id); return session; } catch (e) { if (e instanceof AccessError) return null; throw e; }
}
export async function setPortalCookie(site: PortalSite, token: string, expires: Date) {
  (await cookies()).set(site.cookie, token, { httpOnly: true, secure: config.AUTH_COOKIE_SECURE, sameSite: "lax", path: "/", expires });
}
export async function revokePortalSession(site: PortalSite) {
  const store = await cookies(), token = store.get(site.cookie)?.value;
  if (token) await authenticationService.revoke(token, config.AUTH_SECRET, site.id);
  store.delete(site.cookie);
}
