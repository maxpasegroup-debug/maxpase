import { SignJWT, jwtVerify } from "jose";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { hashPassword, verifyPassword } from "./password";
import { createSecurityLimiter, securityKey } from "@/server/security/rate-limit";

const loginSchema = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(8).max(72) });
const issuer = "maxpase-os", audience = "maxpase-os-web";
const dummyHash = hashPassword("non-account-timing-comparison-only");

export function createAuthenticationService(client: PrismaClient = prisma, now = () => new Date()) {
  const consume = createSecurityLimiter(client, now);
  async function issue(userId: string, secret: string, passwordHash?: string | null) {
    return client.$transaction(async db => {
      const user = await db.user.findUnique({ where: { id: userId }, include: { person: { select: { status: true } } } });
      if (!user || user.status !== "ACTIVE" || user.person && user.person.status !== "ACTIVE" || passwordHash !== undefined && user.passwordHash !== passwordHash) throw new Error("Inactive account");
      const expiresAt = new Date(now().getTime() + 7 * 86400000);
      const session = await db.session.create({ data: { userId, expiresAt } });
      const token = await new SignJWT({ sessionId: session.id }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuer(issuer).setAudience(audience).setIssuedAt(Math.floor(now().getTime() / 1000)).setExpirationTime(Math.floor(expiresAt.getTime() / 1000)).sign(new TextEncoder().encode(secret));
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: user.id, actorPersonId: user.personId, action: passwordHash === undefined ? "auth.session_created" : "auth.login", entityType: "Session", entityId: session.id, result: "SUCCESS" }) });
      return { session, token };
    });
  }
  async function login(raw: unknown, secret: string) {
    await consume("auth:global", 120, 60);
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) return null;
    await consume(securityKey("auth:account", parsed.data.email), 8, 900);
    const candidate = await client.user.findUnique({ where: { email: parsed.data.email }, include: { person: { select: { status: true } } } });
    const valid = await verifyPassword(parsed.data.password, candidate?.passwordHash ?? await dummyHash);
    if (!candidate?.passwordHash || !valid || candidate.status !== "ACTIVE" || candidate.person && candidate.person.status !== "ACTIVE") {
      await client.auditEvent.create({ data: buildAuditEventData({ action: "auth.login", entityType: "User", result: "DENIED", metadata: { accountReference: securityKey("account", parsed.data.email) } }) });
      return null;
    }
    return issue(candidate.id, secret, candidate.passwordHash);
  }
  async function payloadFor(token: string, secret: string) {
    try { return (await jwtVerify(token, new TextEncoder().encode(secret), { issuer, audience, algorithms: ["HS256"], currentDate: now() })).payload; } catch { return null; }
  }
  async function validate(token: string, secret: string) {
    const payload = await payloadFor(token, secret);
    if (!payload?.sub || typeof payload.sessionId !== "string") return null;
    const session = await client.session.findFirst({ where: { id: payload.sessionId, userId: payload.sub, expiresAt: { gt: now() }, user: { status: "ACTIVE", OR: [{ personId: null }, { person: { status: "ACTIVE" } }] } }, include: { user: { select: { email: true, personId: true } } } });
    return session ? { userId: session.userId, sessionId: session.id, email: session.user.email, personId: session.user.personId } : null;
  }
  async function revoke(token: string, secret: string) {
    const payload = await payloadFor(token, secret);
    if (!payload?.sub || typeof payload.sessionId !== "string") return;
    const sessionId = payload.sessionId, userId = payload.sub;
    await client.$transaction(async db => {
      const session = await db.session.findFirst({ where: { id: sessionId, userId }, include: { user: { select: { personId: true } } } });
      if (!session) return;
      await db.session.delete({ where: { id: session.id } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: session.userId, actorPersonId: session.user.personId, action: "auth.logout", entityType: "Session", entityId: session.id, result: "SUCCESS" }) });
    });
  }
  return { create: issue, login, validate, revoke };
}
export const authenticationService = createAuthenticationService();
