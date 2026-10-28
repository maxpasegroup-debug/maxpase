import { randomInt } from "node:crypto";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { createAuthenticationService } from "@/server/auth/service";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { requirePortalAccess } from "@/server/portals/policy";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { createSecurityLimiter, securityKey } from "@/server/security/rate-limit";
import { operationalEvent } from "@/server/domain/operational-events";
import { buildAuditEventData } from "@/server/audit/audit-service";

const pin = z.string().regex(/^[0-9]{6}$/);
const credentials = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), pin });
const dummy = hashPassword(String(randomInt(100000, 1000000)));
export function createLabsPin(client: PrismaClient = prisma) {
  const auth = createAuthenticationService(client), consume = createSecurityLimiter(client);
  async function login(raw: unknown, secret: string) {
    await consume("labs:pin:global", 60, 60);
    const data = credentials.safeParse(raw);
    const email = data.success ? data.data.email : "invalid";
    await consume(securityKey("labs:pin:account", email), 5, 900);
    await consume(securityKey("labs:pin:daily", email), 20, 86400);
    const denied=async()=>{await client.auditEvent.create({data:buildAuditEventData({action:"auth.login",entityType:"User",result:"DENIED",metadata:{channel:"LABS_PIN",accountReference:securityKey("account",email)}})});return null;};
    const user = data.success ? await client.user.findUnique({ where: { email }, include: { person: true } }) : null;
    const valid = await verifyPassword(data.success ? data.data.pin : "invalid", user?.passwordHash ?? await dummy);
    if (!user?.passwordHash || !valid || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE") return denied();
    const metadata = JSON.parse(user.person.metadata ?? "{}");
    if (metadata.authenticationRealm !== "labs" || metadata.credentialKind !== "LABS_PIN" || await client.user.count({where:{personId:user.person.id}})!==1) return denied();
    try { await requirePortalAccess(client, user.id, "labs", true); return await auth.create(user.id, secret, user.passwordHash, 8 * 3600000, "labs"); }
    catch (error) { if (error instanceof AccessError) return denied(); throw error; }
  }
  async function rotate(userId: string, raw: unknown) {
    await consume(securityKey("labs:pin:change", userId), 5, 900);
    const data = z.object({ currentPin: pin, newPin: pin, confirmPin: pin }).refine(v => v.newPin === v.confirmPin && v.newPin !== v.currentPin, "Choose a different matching PIN").parse(raw);
    const hash = await hashPassword(data.newPin);
    await client.$transaction(async db => {
      const access = await requirePortalAccess(db, userId, "labs", true);
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { person: true } });
      const metadata = JSON.parse(user.person?.metadata ?? "{}");
      if (!user.person || metadata.authenticationRealm !== "labs" || metadata.credentialKind !== "LABS_PIN" || !user.passwordHash || !await verifyPassword(data.currentPin, user.passwordHash)) throw new AccessError("Could not change PIN");
      await db.user.update({ where: { id: userId }, data: { passwordHash: hash } });
      await db.person.update({ where: { id: user.person.id }, data: { metadata: JSON.stringify({ ...metadata, labsPinChangeRequired: false }) } });
      await db.session.deleteMany({ where: { userId } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: user.person.id, organizationId: access.divisionId, action: "labs.pin_changed", entityType: "User", entityId: userId, result: "SUCCESS" });
    });
  }
  // Provision only a previously authorized account. This does not create memberships or roles.
  async function provision(operatorId: string, targetUserId: string, initialPin: string) {
    pin.parse(initialPin);
    const hash = await hashPassword(initialPin);
    await client.$transaction(async db => {
      const employee = await requirePortalAccess(db, operatorId, "skillcity");
      const division = await db.organization.findUnique({ where: { slug: "aira-labs" }, select: { id: true, parentId: true, status: true } });
      if (!division || division.parentId !== employee.companyId || division.status !== "ACTIVE") throw new AccessError("Labs scope unavailable");
      const ctx = await createAccessContext(operatorId, db, undefined, { organizationId: division.id });
      await ctx.requireAccess("organization.read", { organizationId: division.id });
      await ctx.requireAccess("user.update", { organizationId: division.id });
      await ctx.requireAccess("person.update", { organizationId: division.id });
      await requirePortalAccess(db, targetUserId, "labs", true);
      const target = await db.user.findUniqueOrThrow({ where: { id: targetUserId }, include: { person: true } });
      const metadata = JSON.parse(target.person?.metadata ?? "{}");
      if (!target.person || metadata.authenticationRealm && metadata.authenticationRealm !== "labs") throw new AccessError("Account belongs to another realm");
      if(metadata.credentialKind&&metadata.credentialKind!=="LABS_PIN")throw new AccessError("Use a dedicated Labs credential account");
      if (await db.user.count({ where: { personId: target.person.id } }) !== 1) throw new AccessError("Use a dedicated account without shared person credentials");
      await db.user.update({ where: { id: targetUserId }, data: { passwordHash: hash } });
      await db.person.update({ where: { id: target.person.id }, data: { metadata: JSON.stringify({ ...metadata, authenticationRealm: "labs", credentialKind: "LABS_PIN", labsPinChangeRequired: true }) } });
      await db.session.deleteMany({ where: { userId: targetUserId } });
      await operationalEvent(db, { actorUserId: operatorId, actorPersonId: ctx.user!.personId, organizationId: division.id, action: "labs.pin_provisioned", entityType: "User", entityId: targetUserId, result: "SUCCESS" });
    });
  }
  return { login, rotate, provision };
}
export const labsPin = createLabsPin();
