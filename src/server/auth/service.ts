import { SignJWT, jwtVerify } from "jose";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { hashPassword, verifyPassword } from "./password";
import { createSecurityLimiter, securityKey } from "@/server/security/rate-limit";
import { BOSS_EMAIL, validateBossConfiguration } from "@/server/group/identity";
import { requirePortalAccess } from "@/server/portals/policy";
import { siteById, type PortalId } from "@/server/portals/sites";
import { AccessError } from "@/server/authorization/engine";

const loginSchema = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(8).max(72) });
const issuer = "maxpase-os", audience = "maxpase-os-web";
const dummyHash = hashPassword("non-account-timing-comparison-only");

export function createAuthenticationService(client: PrismaClient = prisma, now = () => new Date()) {
  const consume = createSecurityLimiter(client, now);
  async function issue(userId: string, secret: string, passwordHash?: string | null, lifetimeMs = 7 * 86400000, portal?: PortalId) {
    return client.$transaction(async db => {
      const user = await db.user.findUnique({ where: { id: userId }, include: { person: { select: { status: true } } } });
      if (!user || user.status !== "ACTIVE" || user.person && user.person.status !== "ACTIVE" || passwordHash !== undefined && user.passwordHash !== passwordHash) throw new Error("Inactive account");
      const portalScope = portal ? await requirePortalAccess(db, userId, portal) : null;
      const expiresAt = new Date(now().getTime() + lifetimeMs);
      const session = await db.session.create({ data: { userId, expiresAt } });
      const token = await new SignJWT({ sessionId: session.id }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuer(issuer).setAudience(portal ? `${audience}:portal:${portal}` : audience).setIssuedAt(Math.floor(now().getTime() / 1000)).setExpirationTime(Math.floor(expiresAt.getTime() / 1000)).sign(new TextEncoder().encode(secret));
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: user.id, actorPersonId: user.personId, organizationId: portalScope?.divisionId, action: passwordHash === undefined ? "auth.session_created" : "auth.login", entityType: "Session", entityId: session.id, result: "SUCCESS", ...(portal ? { metadata: { portal } } : {}) }) });
      return { session, token };
    });
  }
  async function authenticate(raw: unknown, secret: string, boss = false, portal?: PortalId) {
    validateBossConfiguration();
    await consume("auth:global", 120, 60);
    const parsed = (boss ? loginSchema.extend({ password: z.string().regex(/^[0-9]{6}$/) }) : loginSchema).safeParse(raw);
    // Malformed PIN attempts consume the same fixed-account budget as valid-shaped attempts.
    if (boss) {
      await consume(securityKey("auth:boss:daily", BOSS_EMAIL), 20, 86400);
      await consume(securityKey("auth:account", BOSS_EMAIL), 5, 900);
    }
    if (!parsed.success) {
      if (boss) await client.auditEvent.create({ data: buildAuditEventData({ action: "auth.login", entityType: "User", result: "DENIED", metadata: { channel: "BOSS_PIN" } }) });
      return null;
    }
    if (!boss) await consume(securityKey("auth:account", parsed.data.email), 8, 900);
    if (boss ? parsed.data.email !== BOSS_EMAIL : parsed.data.email === BOSS_EMAIL) {
      await client.auditEvent.create({ data: buildAuditEventData({ action: "auth.login", entityType: "User", result: "DENIED", metadata: { channel: boss ? "BOSS_PIN" : "PASSWORD" } }) });
      return null;
    }
    const candidate = await client.user.findUnique({ where: { email: parsed.data.email }, include: { person: { select: { status: true, metadata: true } } } });
    const valid = await verifyPassword(parsed.data.password, candidate?.passwordHash ?? await dummyHash);
    if (!candidate?.passwordHash || !valid || candidate.status !== "ACTIVE" || candidate.person && candidate.person.status !== "ACTIVE" || boss && JSON.parse(candidate.person?.metadata ?? "{}").credentialKind !== "BOSS_PIN") {
      await client.auditEvent.create({ data: buildAuditEventData({ action: "auth.login", entityType: "User", result: "DENIED", metadata: { accountReference: securityKey("account", parsed.data.email) } }) });
      return null;
    }
    try { return await issue(candidate.id, secret, candidate.passwordHash, boss || portal ? 8 * 3600000 : 7 * 86400000, portal); }
    catch (e) {
      if (!portal || !(e instanceof AccessError)) throw e;
      await client.auditEvent.create({ data: buildAuditEventData({ actorUserId: candidate.id, actorPersonId: candidate.personId, action: "auth.login", entityType: "User", result: "DENIED", metadata: { portal } }) });
      return null;
    }
  }
  async function payloadFor(token: string, secret: string, portal?: PortalId) {
    try { return (await jwtVerify(token, new TextEncoder().encode(secret), { issuer, audience: portal ? `${audience}:portal:${portal}` : audience, algorithms: ["HS256"], currentDate: now() })).payload; } catch { return null; }
  }
  async function validate(token: string, secret: string, portal?: PortalId) {
    const payload = await payloadFor(token, secret, portal);
    if (!payload?.sub || typeof payload.sessionId !== "string") return null;
    const session = await client.session.findFirst({ where: { id: payload.sessionId, userId: payload.sub, expiresAt: { gt: now() }, user: { status: "ACTIVE", OR: [{ personId: null }, { person: { status: "ACTIVE" } }] } }, include: { user: { select: { email: true, personId: true } } } });
    return session ? { userId: session.userId, sessionId: session.id, email: session.user.email, personId: session.user.personId } : null;
  }
  async function revoke(token: string, secret: string, portal?: PortalId) {
    const payload = await payloadFor(token, secret, portal);
    if (!payload?.sub || typeof payload.sessionId !== "string") return;
    const sessionId = payload.sessionId, userId = payload.sub;
    await client.$transaction(async db => {
      const session = await db.session.findFirst({ where: { id: sessionId, userId }, include: { user: { select: { personId: true } } } });
      if (!session) return;
      await db.session.delete({ where: { id: session.id } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: session.userId, actorPersonId: session.user.personId, action: "auth.logout", entityType: "Session", entityId: session.id, result: "SUCCESS" }) });
    });
  }
  return { create: issue, login: (raw: unknown, secret: string) => authenticate(raw, secret), loginBoss: (raw: unknown, secret: string) => authenticate(raw, secret, true), loginPortal: (raw: unknown, secret: string, portal: PortalId) => { if (!siteById(portal)) throw new Error("Gateway unavailable"); return authenticate(raw, secret, false, portal); }, validate, revoke };
}
export const authenticationService = createAuthenticationService();
