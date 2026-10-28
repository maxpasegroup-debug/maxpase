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
import { accountPortalRealm } from "./account-realm";
import { transitionLegacyLabsStaff } from "@/server/skillcity/staff-realm-transition";
import { claimJobsOtp, type JobsOtpProof } from "./jobs-otp-proof";
import { jobsPhoneInput, jobsPinInput } from "./jobs-phone";
import { hashJobsPin, verifyJobsPin } from "./jobs-pin";

const loginSchema = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(8).max(72) });
const issuer = "maxpase-os", audience = "maxpase-os-web";
const dummyHash = hashPassword("non-account-timing-comparison-only");
const jobsPinProof = Symbol("verified-jobs-pin");
type VerifiedJobsPin = { kind: typeof jobsPinProof; credentialHash: string };

export function createAuthenticationService(client: PrismaClient = prisma, now = () => new Date()) {
  const consume = createSecurityLimiter(client, now);
  let dummyJobsHash: Promise<string> | undefined;
  async function issue(userId: string, secret: string, passwordHash?: string | null, lifetimeMs = 7 * 86400000, portal?: PortalId, proof?: JobsOtpProof | VerifiedJobsPin) {
    if (portal === "jobs") {
      if (!proof) throw new AccessError("Email verification required");
      if (!("kind" in proof)) {
        const attempt = await client.emailAuthChallenge.updateMany({ where: { id: proof.challengeId, userId, purpose: proof.purpose ?? "LOGIN", status: "SENT", expiresAt: { gt: now() }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
        if (attempt.count !== 1) throw new AccessError("Invalid or expired code");
      }
    }
    return client.$transaction(async db => {
      const user = await db.user.findUnique({ where: { id: userId }, include: { person: { select: { status: true, metadata: true } } } });
      if (!user || user.status !== "ACTIVE" || user.person && user.person.status !== "ACTIVE" || passwordHash !== undefined && user.passwordHash !== passwordHash) throw new Error("Inactive account");
      const accountRealm = accountPortalRealm(user.person?.metadata);
      if (accountRealm && portal !== accountRealm) throw new AccessError("Account realm unavailable");
      const portalScope = portal ? await requirePortalAccess(db, userId, portal, portal === "labs") : null;
      if (portal === "jobs") {
        if (proof && "kind" in proof) {
          if (proof.kind !== jobsPinProof || !user.emailVerifiedAt || !user.jobsPhone || !user.jobsPinHash || user.jobsPinHash !== proof.credentialHash) throw new AccessError("Account verification required");
        } else {
          await claimJobsOtp(db, proof, user, proof?.purpose ?? "LOGIN", now());
          await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now() } });
          await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: user.id, actorPersonId: user.personId, organizationId: portalScope?.divisionId, action: "auth.email_verified", entityType: "EmailAuthChallenge", entityId: proof!.challengeId, result: "SUCCESS", metadata: { portal: "jobs", purpose: proof?.purpose ?? "LOGIN" } }) });
        }
      }
      const expiresAt = new Date(now().getTime() + lifetimeMs);
      const session = await db.session.create({ data: { userId, expiresAt } });
      if (portal === "startup" && accountRealm === "startup" && !user.emailVerifiedAt) throw new AccessError("Verified email required");
      const token = await new SignJWT({ sessionId: session.id, ...(portal === "jobs" ? { verifiedEmail: user.email } : {}), ...((portal === "skillcity" || portal === "startup" && accountRealm === "startup") ? { verifiedEmail: user.email, verifiedAt: user.emailVerifiedAt?.toISOString() } : {}) }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuer(issuer).setAudience(portal ? `${audience}:portal:${portal}` : audience).setIssuedAt(Math.floor(now().getTime() / 1000)).setExpirationTime(Math.floor(expiresAt.getTime() / 1000)).sign(new TextEncoder().encode(secret));
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: user.id, actorPersonId: user.personId, organizationId: portalScope?.divisionId, action: passwordHash === undefined ? "auth.session_created" : "auth.login", entityType: "Session", entityId: session.id, result: "SUCCESS", ...(portal ? { metadata: { portal } } : {}) }) });
      return { session, token };
    });
  }
  async function credentials(raw: unknown, boss = false, portal?: PortalId) {
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
    let candidate = await client.user.findUnique({ where: { email: parsed.data.email }, include: { person: { select: { status: true, metadata: true } } } });
    const valid = await verifyPassword(parsed.data.password, candidate?.passwordHash ?? await dummyHash);
    if (candidate?.passwordHash && valid && candidate.status === "ACTIVE" && candidate.person?.status === "ACTIVE" && portal === "skillcity" && accountPortalRealm(candidate.person.metadata) === "labs") {
      try {
        await transitionLegacyLabsStaff(client, candidate.id, candidate.passwordHash);
        candidate = await client.user.findUnique({ where: { id: candidate.id }, include: { person: { select: { status: true, metadata: true } } } });
      } catch (error) { if (!(error instanceof AccessError)) throw error; }
    }
    if (!candidate?.passwordHash || !valid || candidate.status !== "ACTIVE" || candidate.person && candidate.person.status !== "ACTIVE" || accountPortalRealm(candidate.person?.metadata) && portal !== accountPortalRealm(candidate.person?.metadata) || boss && JSON.parse(candidate.person?.metadata ?? "{}").credentialKind !== "BOSS_PIN" || portal === "labs" || portal === "startup" && accountPortalRealm(candidate.person?.metadata) === "startup" && !candidate.emailVerifiedAt) {
      await client.auditEvent.create({ data: buildAuditEventData({ action: "auth.login", entityType: "User", result: "DENIED", metadata: { accountReference: securityKey("account", parsed.data.email) } }) });
      return null;
    }
    try { if (portal) await requirePortalAccess(client, candidate.id, portal); return candidate; }
    catch (e) {
      if (!portal || !(e instanceof AccessError)) throw e;
      await client.auditEvent.create({ data: buildAuditEventData({ actorUserId: candidate.id, actorPersonId: candidate.personId, action: "auth.login", entityType: "User", result: "DENIED", metadata: { portal } }) });
      return null;
    }
  }
  async function authenticate(raw: unknown, secret: string, boss = false, portal?: PortalId) {
    const candidate = await credentials(raw, boss, portal);
    if (!candidate || portal === "jobs") return null;
    try { return await issue(candidate.id, secret, candidate.passwordHash, boss || portal ? 8 * 3600000 : 7 * 86400000, portal); }
    catch (error) { if (portal && error instanceof AccessError) return null; throw error; }
  }
  async function loginJobsPin(raw: unknown, secret: string) {
    await consume("nicejobs:pin:global", 80, 60);
    const parsed = z.object({ country: z.string(), nationalNumber: z.string(), pin: jobsPinInput }).strict().safeParse(raw);
    const phone = parsed.success ? jobsPhoneInput.safeParse({ country: parsed.data.country, nationalNumber: parsed.data.nationalNumber }) : null;
    const accountKey = phone?.success ? phone.data : "malformed";
    await consume(securityKey("nicejobs:pin:account:minute", accountKey), 3, 60);
    await consume(securityKey("nicejobs:pin:account:15m", accountKey), 5, 900);
    await consume(securityKey("nicejobs:pin:account:day", accountKey), 15, 86400);
    const candidate = phone?.success ? await client.user.findUnique({ where: { jobsPhone: phone.data }, include: { person: { select: { status: true, metadata: true } } } }) : null;
    const dummy = await (dummyJobsHash ??= hashJobsPin("000000"));
    const valid = await verifyJobsPin(parsed.success ? parsed.data.pin : "000000", candidate?.jobsPinHash ?? dummy);
    if (!valid || !candidate?.jobsPinHash || !candidate.emailVerifiedAt || candidate.status !== "ACTIVE" || candidate.person?.status !== "ACTIVE" || accountPortalRealm(candidate.person?.metadata) !== "jobs") {
      await client.auditEvent.create({ data: buildAuditEventData({ action: "auth.login", entityType: "User", result: "DENIED", metadata: { portal: "jobs", accountReference: securityKey("account", accountKey) } }) });
      return null;
    }
    try { return await issue(candidate.id, secret, undefined, 8 * 3600000, "jobs", { kind: jobsPinProof, credentialHash: candidate.jobsPinHash }); }
    catch (error) { if (error instanceof AccessError) return null; throw error; }
  }
  async function payloadFor(token: string, secret: string, portal?: PortalId) {
    try { return (await jwtVerify(token, new TextEncoder().encode(secret), { issuer, audience: portal ? `${audience}:portal:${portal}` : audience, algorithms: ["HS256"], currentDate: now() })).payload; } catch { return null; }
  }
  async function validate(token: string, secret: string, portal?: PortalId) {
    const payload = await payloadFor(token, secret, portal);
    if (!payload?.sub || typeof payload.sessionId !== "string") return null;
    const session = await client.session.findFirst({ where: { id: payload.sessionId, userId: payload.sub, expiresAt: { gt: now() }, user: { status: "ACTIVE", OR: [{ personId: null }, { person: { status: "ACTIVE" } }] } }, include: { user: { select: { email: true, emailVerifiedAt: true, jobsPinHash: true, personId: true, person: { select: { metadata: true } } } } } });
    if (portal === "jobs" && (!session?.user.emailVerifiedAt || payload.verifiedEmail !== session.user.email)) return null;
    if (portal === "skillcity" && (!session?.user.emailVerifiedAt || payload.verifiedEmail !== session.user.email || payload.verifiedAt !== session.user.emailVerifiedAt.toISOString())) return null;
    const accountRealm = accountPortalRealm(session?.user.person?.metadata);
    if (portal === "startup" && accountRealm === "startup" && (!session?.user.emailVerifiedAt || payload.verifiedEmail !== session.user.email || payload.verifiedAt !== session.user.emailVerifiedAt.toISOString())) return null;
    if (accountRealm && portal !== accountRealm) return null;
    return session ? { userId: session.userId, sessionId: session.id, email: session.user.email, personId: session.user.personId, needsPinChange: portal === "labs" && JSON.parse(session.user.person?.metadata ?? "{}").labsPinChangeRequired === true, needsJobsPinActivation: portal === "jobs" && JSON.parse(session.user.person?.metadata ?? "{}").identitySource === "SELF_REGISTRATION" && !session.user.jobsPinHash } : null;
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
  return { create: issue, loginJobsPin, checkJobsPassword: (raw: unknown) => credentials(raw, false, "jobs"), login: (raw: unknown, secret: string) => authenticate(raw, secret), loginBoss: (raw: unknown, secret: string) => authenticate(raw, secret, true), loginPortal: (raw: unknown, secret: string, portal: PortalId) => { if (!siteById(portal)) throw new Error("Gateway unavailable"); return authenticate(raw, secret, false, portal); }, validate, revoke };
}
export const authenticationService = createAuthenticationService();
