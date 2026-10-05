import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";
import { headers } from "next/headers";
import { validateActionOrigin } from "@/server/security/origin";

export async function requireSession() {
  const requestHeaders = await headers();
  if (requestHeaders.has("origin")) validateActionOrigin(requestHeaders.get("origin"), requestHeaders.get("host"), process.env.APP_ORIGIN);
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  await consumeSecurityBudget(securityKey("authenticated", session.userId), 300, 60);
  return session;
}
