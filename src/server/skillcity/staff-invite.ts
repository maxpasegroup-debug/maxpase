import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";
import { createSecurityLimiter, securityKey } from "@/server/security/rate-limit";
import { createBossService } from "@/server/group/boss-service";
import { hasStaffWorkspaceCapabilities, isPreparedStaffRole } from "./staff-roles";

const settings = z.object({ SKILLCITY_EMAIL_AUTH_ENABLED: z.literal("true"), RESEND_API_KEY: z.string().min(10), SKILLCITY_AUTH_FROM: z.email(), SKILLCITY_OTP_SECRET: z.string().min(32).refine(v => !/replace-with|changeme|dev-only/i.test(v)) });
const sendInput = z.object({ userId: z.string().min(1), verificationEvidence: z.string().trim().min(10).max(1000) }).strict();
const password = z.string().min(12).max(72).refine(v => Buffer.byteLength(v, "utf8") <= 72);
const activateInput = z.object({ challengeId: z.uuid(), code: z.string().regex(/^[0-9]{6}$/), password, confirmPassword: z.string() }).strict().refine(v => v.password === v.confirmPassword);
const otpHash = (id: string, code: string, secret: string) => createHash("sha256").update(`${id}:${code}:${secret}`).digest("hex");

export function createStaffInvite(client: PrismaClient = prisma, env: Record<string, string | undefined> = process.env, now = () => new Date(), transport: typeof fetch = fetch) {
  const consume = createSecurityLimiter(client, now);
  const deliveryReady = () => settings.safeParse(env).success;
  async function drafts(actorUserId: string, organizationId: string) {
    const ctx = await createAccessContext(actorUserId, client, undefined, { organizationId });
    await ctx.requireAccess("user.read", { organizationId });
    await ctx.requireAccess("membership.read", { organizationId });
    const rows = await client.user.findMany({ where: { status: "INACTIVE", person: { memberships: { some: { organizationId, status: "INVITED" } } } }, select: { id: true, email: true, person: { select: { metadata: true, memberships: { where: { organizationId, status: "INVITED" }, select: { title: true } } } } }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.filter(row => { try { return JSON.parse(row.person?.metadata ?? "{}").authenticationRealm === "skillcity"; } catch { return false; } }).map(row => ({ id: row.id, email: row.email, role: row.person?.memberships[0]?.title ?? "Not assigned" }));
  }
  async function send(actorUserId: string, raw: unknown) {
    const data = sendInput.parse(raw), config = settings.parse(env);
    await consume(securityKey("skillcity:invite", data.userId), 3, 86400);
    const id = randomUUID(), code = String(randomInt(0, 1000000)).padStart(6, "0");
    const target = await client.$transaction(async db => {
      const user = await db.user.findUnique({ where: { id: data.userId }, include: { person: true } });
      if (!user?.person || user.status !== "INACTIVE" || user.passwordHash || user.emailVerifiedAt) throw new AccessError("Staff draft unavailable");
      const metadata = JSON.parse(user.person.metadata ?? "{}");
      if (metadata.authenticationRealm !== "skillcity" || !["DRAFT", "INVITED"].includes(metadata.staffOnboarding) || user.person.email?.toLowerCase() !== user.email.toLowerCase()) throw new AccessError("Staff identity requires review");
      const memberships = await db.membership.findMany({ where: { personId: user.personId! }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
      const eligible = memberships.filter(item => item.status === "INVITED" && item.projectId === null && item.roles.some(assignment => assignment.role.status === "ACTIVE" && assignment.role.principalType === "HUMAN"));
      if (eligible.length !== 1 || eligible[0].roles.length !== 1) throw new AccessError("Invited role unavailable");
      const membership = eligible[0];
      const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true } });
      const memberScope = await db.organization.findUnique({ where: { id: membership.organizationId }, select: { parentId: true, slug: true } });
      if (!company || !(membership.organizationId === company.id || memberScope?.parentId === company.id)) throw new AccessError("Staff scope unavailable");
      const ctx = await createAccessContext(actorUserId, db, undefined, { organizationId: membership.organizationId });
      for (const permission of ["user.update", "person.update", "membership.manage", "membership.assign_role"]) await ctx.requireAccess(permission, { organizationId: membership.organizationId });
      const role = membership.roles[0]?.role;
      if (!role || !memberScope || !isPreparedStaffRole(role.key, memberScope.slug) || role.organizationId !== membership.organizationId || !hasStaffWorkspaceCapabilities(role.key, role.permissions.map(item => item.permission.key))) throw new AccessError("Role permissions are not prepared");
      if (role.name === "Director" || role.name === "Division Director") {
        await createBossService(client).authority(actorUserId, db);
        if (membership.scope !== (role.name === "Director" ? "DESCENDANTS" : "ORGANIZATION") || !role.permissions.some(item => item.permission.key === "decision.decide")) throw new AccessError("Director authority is not prepared");
      } else {
        const manager = await db.reportingRelationship.findFirst({ where: { personId: user.personId!, organizationId: membership.organizationId, status: "ACTIVE", manager: { users: { some: { status: "ACTIVE", emailVerifiedAt: { not: null } } } } } });
        if (!manager) throw new AccessError("Verified manager assignment required before invitation");
      }
      if (await db.emailAuthChallenge.findFirst({ where: { userId: user.id, purpose: "STAFF_INVITE", createdAt: { gt: new Date(now().getTime() - 60000) } } })) throw new AccessError("Wait before requesting another invitation");
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, purpose: "STAFF_INVITE", status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      await db.emailAuthChallenge.create({ data: { id, userId: user.id, email: user.email, purpose: "STAFF_INVITE", otpHash: otpHash(id, code, config.SKILLCITY_OTP_SECRET), credentialHash: "", expiresAt: new Date(now().getTime() + 86400000) } });
      await db.person.update({ where: { id: user.personId! }, data: { metadata: JSON.stringify({ ...metadata, identityVerification: "MANAGER_ATTESTED", staffOnboarding: "INVITED", verificationEvidence: data.verificationEvidence }) } });
      await operationalEvent(db, { actorUserId, actorPersonId: ctx.user!.personId, organizationId: membership.organizationId, action: "staff.invitation_requested", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { challengeId: id, roleId: role.id } });
      return { email: user.email, organizationId: membership.organizationId };
    });
    try {
      const response = await transport("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `skillcity-invite/${id}` }, body: JSON.stringify({ from: config.SKILLCITY_AUTH_FROM, to: [target.email], subject: "Activate your AIRA Skill City workplace account", text: `Your AIRA Skill City activation code is ${code}. Open https://airaskillcity.com/activate?challenge=${id} and enter this code. It expires in 24 hours. Do not share it.` }) });
      if (!response.ok) throw new Error("Email provider unavailable");
      const receipt = z.object({ id: z.string().min(1) }).parse(await response.json());
      if ((await client.emailAuthChallenge.updateMany({ where: { id, status: "PENDING", expiresAt: { gt: now() } }, data: { status: "SENT", providerRef: receipt.id } })).count !== 1) throw new Error("Invitation state changed");
      return { sent: true };
    } catch {
      await client.$transaction(async db => {
        await db.emailAuthChallenge.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
        const person = await db.user.findUnique({ where: { id: data.userId }, select: { personId: true, person: { select: { metadata: true } } } });
        if (person?.personId) {
          const metadata = JSON.parse(person.person?.metadata ?? "{}");
          if (metadata.authenticationRealm === "skillcity" && metadata.staffOnboarding === "INVITED") await db.person.update({ where: { id: person.personId }, data: { metadata: JSON.stringify({ ...metadata, staffOnboarding: "DRAFT" }) } });
        }
        await operationalEvent(db, { actorUserId, organizationId: target.organizationId, action: "staff.invitation_delivery_failed", entityType: "User", entityId: data.userId, result: "FAILURE", metadata: { challengeId: id } });
      });
      throw new AccessError("Invitation delivery is unavailable; the account remains inactive");
    }
  }
  async function activate(raw: unknown) {
    const data = activateInput.parse(raw), config = settings.parse(env);
    await consume(securityKey("skillcity:activate", data.challengeId), 8, 900);
    const attempted = await client.emailAuthChallenge.updateMany({ where: { id: data.challengeId, purpose: "STAFF_INVITE", status: "SENT", expiresAt: { gt: now() }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    if (attempted.count !== 1) throw new AccessError("Invalid or expired invitation");
    const hash = await hashPassword(data.password);
    return client.$transaction(async db => {
      const challenge = await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: data.challengeId } });
      const expected = Buffer.from(challenge.otpHash, "hex"), supplied = Buffer.from(otpHash(challenge.id, data.code, config.SKILLCITY_OTP_SECRET), "hex");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied) || challenge.status !== "SENT" || challenge.expiresAt <= now()) throw new AccessError("Invalid or expired invitation");
      const user = await db.user.findUnique({ where: { id: challenge.userId }, include: { person: true } });
      if (!user?.person || user.person.status !== "ACTIVE" || user.email !== challenge.email || user.status !== "INACTIVE" || user.passwordHash || user.emailVerifiedAt) throw new AccessError("Invitation unavailable");
      const metadata = JSON.parse(user.person.metadata ?? "{}");
      if (metadata.authenticationRealm !== "skillcity" || metadata.staffOnboarding !== "INVITED" || metadata.identityVerification !== "MANAGER_ATTESTED") throw new AccessError("Invitation unavailable");
      const memberships = await db.membership.findMany({ where: { personId: user.personId! }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
      const eligible = memberships.filter(item => item.status === "INVITED" && item.projectId === null && item.roles.some(assignment => assignment.role.status === "ACTIVE" && assignment.role.principalType === "HUMAN" && assignment.role.organizationId === item.organizationId && assignment.role.permissions.some(p => p.permission.key === "organization.read")));
      if (eligible.length !== 1 || eligible[0].roles.length !== 1) throw new AccessError("Role appointment unavailable");
      const membership = eligible[0];
      const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true } });
      const memberScope = await db.organization.findUnique({ where: { id: membership.organizationId }, select: { parentId: true, slug: true } });
      if (!company || !(membership.organizationId === company.id || memberScope?.parentId === company.id)) throw new AccessError("Staff scope unavailable");
      if (!memberScope || !isPreparedStaffRole(membership.roles[0].role.key, memberScope.slug) || !hasStaffWorkspaceCapabilities(membership.roles[0].role.key, membership.roles[0].role.permissions.map(item => item.permission.key))) throw new AccessError("Role appointment unavailable");
      if (!["Director", "Division Director"].includes(membership.roles[0]?.role.name ?? "") && !(await db.reportingRelationship.findFirst({ where: { personId: user.personId!, organizationId: membership.organizationId, status: "ACTIVE", manager: { users: { some: { status: "ACTIVE", emailVerifiedAt: { not: null } } } } } }))) throw new AccessError("Manager appointment unavailable");
      if ((await db.emailAuthChallenge.updateMany({ where: { id: challenge.id, status: "SENT", attempts: { lte: 5 } }, data: { status: "CONSUMED", consumedAt: now() } })).count !== 1) throw new AccessError("Invitation already used");
      await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE", passwordHash: hash, emailVerifiedAt: now() } });
      await db.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
      await db.person.update({ where: { id: user.personId! }, data: { metadata: JSON.stringify({ ...metadata, staffOnboarding: "ACTIVE" }) } });
      await requirePortalAccess(db, user.id, "skillcity");
      await operationalEvent(db, { actorUserId: user.id, actorPersonId: user.personId, organizationId: membership.organizationId, action: "staff.account_activated", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { challengeId: challenge.id, roleId: membership.roles[0]?.roleId } });
      return { activated: true };
    });
  }
  return { drafts, send, activate, deliveryReady };
}

export const staffInvite = createStaffInvite();
