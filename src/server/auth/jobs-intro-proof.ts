import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { config } from "@/server/config";

const cookieName = "nicejobs_intro_complete";
const issuer = "maxpase-os";
const audience = "nicejobs-introduction-completion";
export async function setJobsIntroCompletion(sessionId: string, languageCode: string) {
  const expires = new Date(Date.now() + 30 * 60_000);
  const value = await new SignJWT({ sessionId, languageCode }).setProtectedHeader({ alg: "HS256" }).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(Math.floor(expires.getTime() / 1000)).sign(new TextEncoder().encode(config.AUTH_SECRET));
  (await cookies()).set(cookieName, value, { httpOnly: true, secure: config.AUTH_COOKIE_SECURE, sameSite: "strict", path: "/", expires });
}
export async function hasJobsIntroCompletion() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return false;
  try {
    const { payload } = await jwtVerify(value, new TextEncoder().encode(config.AUTH_SECRET), { issuer, audience, algorithms: ["HS256"] });
    return typeof payload.sessionId === "string" && typeof payload.languageCode === "string";
  } catch { return false; }
}
export async function clearJobsIntroCompletion() { (await cookies()).delete(cookieName); }
