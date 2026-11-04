import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { config } from "@/server/config";

const cookieName = "nicejobs_registration";
const issuer = "maxpase-os";
const audience = "nicejobs-registration-email-change";

export async function setJobsRegistrationProof(challengeId: string) {
  const expires = new Date(Date.now() + 10 * 60_000);
  const value = await new SignJWT({ challengeId }).setProtectedHeader({ alg: "HS256" }).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(Math.floor(expires.getTime() / 1000)).sign(new TextEncoder().encode(config.AUTH_SECRET));
  (await cookies()).set(cookieName, value, { httpOnly: true, secure: config.AUTH_COOKIE_SECURE, sameSite: "strict", path: "/", expires });
}

export async function hasJobsRegistrationProof(challengeId: string) {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return false;
  try {
    const { payload } = await jwtVerify(value, new TextEncoder().encode(config.AUTH_SECRET), { issuer, audience, algorithms: ["HS256"] });
    return payload.challengeId === challengeId;
  } catch { return false; }
}

export async function clearJobsRegistrationProof() { (await cookies()).delete(cookieName); }
