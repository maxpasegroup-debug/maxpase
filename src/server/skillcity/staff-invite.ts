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
import { hasStaffWorkspaceCapabilities, isPreparedStaffRole, staffPortalForRole } from "./staff-roles";

const settings = z.object({ SKILLCITY_EMAIL_AUTH_ENABLED: z.literal("true"), RESEND_API_KEY: z.string().min(10), SKILLCITY_AUTH_FROM: z.email(), SKILLCITY_OTP_SECRET: z.string().min(32).refine(v => !/replace-with|changeme|dev-only/i.test(v)) });
const sendInput = z.object({ userId: z.string().min(1), verificationEvidence: z.string().trim().min(10).max(1000) }).strict();
const password = z.string().min(12).max(72).refine(v => Buffer.byteLength(v, "utf8") <= 72);
const activateInput = z.object({ challengeId: z.uuid(), code: z.string().regex(/^[0-9]{6}$/), password, confirmPassword: z.string(), portal: z.enum(["skillcity", "labs"]) }).strict().refine(v => v.password === v.confirmPassword);
const resetRequestInput = z.object({ email: z.email().transform(value => value.trim().toLowerCase()), portal: z.enum(["skillcity", "labs"]) }).strict();
const resetInput = z.object({ challengeId: z.uuid(), code: z.string().regex(/^[0-9]{6}$/), password, confirmPassword: z.string(), portal: z.enum(["skillcity", "labs"]) }).strict().refine(v => v.password === v.confirmPassword);
const otpHash = (id: string, code: string, secret: string) => createHash("sha256").update(`${id}:${code}:${secret}`).digest("hex");

export function createStaffInvite(client: PrismaClient = prisma, env: Record<string, string | undefined> = process.env, now = () => new Date(), transport: typeof fetch = fetch) {
  const consume = createSecurityLimiter(client, now);
  const deliveryReady = () => settings.safeParse(env).success;
  async function drafts(actorUserId: string, organizationId: string) {
    const ctx = await createAccessContext(actorUserId, client, undefined, { organizationId });
    await ctx.requireAccess("user.read", { organizationId });
    await ctx.requireAccess("membership.read", { organizationId });
    const rows = await client.user.findMany({ where: { status: "INACTIVE", person: { memberships: { some: { organizationId, status: "INVITED" } } } }, select: { id: true, email: true, person: { select: { metadata: true, memberships: { where: { organizationId, status: "INVITED" }, select: { title: true } } } } }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.filter(row => { try { return ["skillcity", "labs"].includes(JSON.parse(row.person?.metadata ?? "{}").authenticationRealm); } catch { return false; } }).map(row => { const metadata = JSON.parse(row.person?.metadata ?? "{}"); return { id: row.id, email: row.email, role: row.person?.memberships[0]?.title ?? "Not assigned", reviewable: metadata.staffOnboarding === "DRAFT", decisionsRecorded: typeof metadata.scopeDecisionReference === "string" && metadata.scopeDecisionReference.length >= 8 && (["Director", "Division Director"].includes(row.person?.memberships[0]?.title ?? "") || typeof metadata.managerDecisionReference === "string" && typeof metadata.managerUserId === "string") }; });
  }
  async function send(actorUserId: string, raw: unknown) {
    const data = sendInput.parse(raw), config = settings.parse(env);
    await consume(securityKey("skillcity:invite", data.userId), 3, 86400);
    const id = randomUUID(), code = String(randomInt(0, 1000000)).padStart(6, "0");
    const target = await client.$transaction(async db => {
      const user = await db.user.findUnique({ where: { id: data.userId }, include: { person: true } });
      if (!user?.person || user.status !== "INACTIVE" || user.passwordHash || user.emailVerifiedAt) throw new AccessError("Staff draft unavailable");
      const metadata = JSON.parse(user.person.metadata ?? "{}");
      if (!["skillcity", "labs"].includes(metadata.authenticationRealm) || !["DRAFT", "INVITED"].includes(metadata.staffOnboarding) || user.person.email?.toLowerCase() !== user.email.toLowerCase() || typeof metadata.scopeDecisionReference !== "string" || metadata.scopeDecisionReference.length < 8) throw new AccessError("Staff identity and scope require review");
      const memberships = await db.membership.findMany({ where: { personId: user.personId! }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
      const eligible = memberships.filter(item => item.status === "INVITED" && item.projectId === null && item.roles.some(assignment => assignment.role.status === "ACTIVE" && assignment.role.principalType === "HUMAN"));
      if (eligible.length !== 1 || eligible[0].roles.length !== 1) throw new AccessError("Invited role unavailable");
      const membership = eligible[0];
      const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true } });
      const memberScope = await db.organization.findUnique({ where: { id: membership.organizationId }, select: { parentId: true, slug: true } });
      if (!company || !(membership.organizationId === company.id || memberScope?.parentId === company.id)) throw new AccessError("Staff scope unavailable");
      if (!(await db.employment.findFirst({ where: { personId: user.personId!, companyId: company.id, status: "ACTIVE" } }))) throw new AccessError("Active company employment required before invitation");
      if (metadata.authenticationRealm === "labs" && !(await db.hrAssignment.findFirst({ where: { employment: { personId: user.personId!, companyId: company.id, status: "ACTIVE" }, status: "ACTIVE", brand: { organizationId: company.id, slug: "aira-labs", status: "ACTIVE" } } }))) throw new AccessError("Active AIRA Labs brand assignment required before invitation");
      const ctx = await createAccessContext(actorUserId, db, undefined, { organizationId: membership.organizationId });
      for (const permission of ["user.update", "person.update", "membership.manage", "membership.assign_role"]) await ctx.requireAccess(permission, { organizationId: membership.organizationId });
      const role = membership.roles[0]?.role;
      if (!role || !memberScope || !isPreparedStaffRole(role.key, memberScope.slug) || metadata.authenticationRealm !== staffPortalForRole(role.key) || metadata.credentialKind !== "STAFF_PASSWORD" || role.organizationId !== membership.organizationId || !hasStaffWorkspaceCapabilities(role.key, role.permissions.map(item => item.permission.key))) throw new AccessError("Role permissions are not prepared");
      if (role.name === "Director" || role.name === "Division Director") {
        await createBossService(client).authority(actorUserId, db);
        if (membership.scope !== (role.name === "Director" ? "DESCENDANTS" : "ORGANIZATION") || !role.permissions.some(item => item.permission.key === "decision.decide")) throw new AccessError("Director authority is not prepared");
      } else {
        const manager = await db.reportingRelationship.findFirst({
          where: {
            personId: user.personId!, organizationId: membership.organizationId, status: "INACTIVE",
            manager: { users: { some: { id: metadata.managerUserId, status: "ACTIVE", emailVerifiedAt: { not: null } } } }
          }
        });
        if (!manager || typeof metadata.managerDecisionReference !== "string" || metadata.managerDecisionReference.length < 8) throw new AccessError("Verified manager decision required before invitation");
      }
      if (await db.emailAuthChallenge.findFirst({ where: { userId: user.id, purpose: "STAFF_INVITE", createdAt: { gt: new Date(now().getTime() - 60000) } } })) throw new AccessError("Wait before requesting another invitation");
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, purpose: "STAFF_INVITE", status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      await db.emailAuthChallenge.create({ data: { id, userId: user.id, email: user.email, purpose: "STAFF_INVITE", otpHash: otpHash(id, code, config.SKILLCITY_OTP_SECRET), credentialHash: "", expiresAt: new Date(now().getTime() + 86400000) } });
      await db.person.update({ where: { id: user.personId! }, data: { metadata: JSON.stringify({ ...metadata, identityVerification: "MANAGER_ATTESTED", staffOnboarding: "INVITED", verificationEvidence: data.verificationEvidence }) } });
      await operationalEvent(db, { actorUserId, actorPersonId: ctx.user!.personId, organizationId: membership.organizationId, action: "staff.invitation_requested", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { challengeId: id, roleId: role.id } });
      return { email: user.email, organizationId: membership.organizationId, portal: metadata.authenticationRealm as "skillcity" | "labs" };
    });
    try {
      const domain = target.portal === "labs" ? "airalabs.online" : "airaskillcity.com";
      const response = await transport("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `staff-invite/${id}` }, body: JSON.stringify({ from: config.SKILLCITY_AUTH_FROM, to: [target.email], subject: "Activate your AIRA workplace account", text: `Your AIRA workplace activation code is ${code}. Open https://${domain}/activate?challenge=${id} and enter this code. It expires in 24 hours. Do not share it.` }) });
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
          if (["skillcity", "labs"].includes(metadata.authenticationRealm) && metadata.staffOnboarding === "INVITED") await db.person.update({ where: { id: person.personId }, data: { metadata: JSON.stringify({ ...metadata, staffOnboarding: "DRAFT" }) } });
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
      if (metadata.authenticationRealm !== data.portal || metadata.staffOnboarding !== "INVITED" || metadata.identityVerification !== "MANAGER_ATTESTED" || typeof metadata.scopeDecisionReference !== "string" || metadata.scopeDecisionReference.length < 8) throw new AccessError("Invitation unavailable");
      const memberships = await db.membership.findMany({ where: { personId: user.personId! }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
      const eligible = memberships.filter(item => item.status === "INVITED" && item.projectId === null && item.roles.some(assignment => assignment.role.status === "ACTIVE" && assignment.role.principalType === "HUMAN" && assignment.role.organizationId === item.organizationId && assignment.role.permissions.some(p => p.permission.key === "organization.read")));
      if (eligible.length !== 1 || eligible[0].roles.length !== 1) throw new AccessError("Role appointment unavailable");
      const membership = eligible[0];
      const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true } });
      const memberScope = await db.organization.findUnique({ where: { id: membership.organizationId }, select: { parentId: true, slug: true } });
      if (!company || !(membership.organizationId === company.id || memberScope?.parentId === company.id)) throw new AccessError("Staff scope unavailable");
      if (!(await db.employment.findFirst({ where: { personId: user.personId!, companyId: company.id, status: "ACTIVE" } }))) throw new AccessError("Active company employment required for activation");
      if (!memberScope || !isPreparedStaffRole(membership.roles[0].role.key, memberScope.slug) || staffPortalForRole(membership.roles[0].role.key) !== data.portal || !hasStaffWorkspaceCapabilities(membership.roles[0].role.key, membership.roles[0].role.permissions.map(item => item.permission.key))) throw new AccessError("Role appointment unavailable");
      const pendingManager = !["Director", "Division Director"].includes(membership.roles[0]?.role.name ?? "") ? await db.reportingRelationship.findFirst({
        where: {
          personId: user.personId!, organizationId: membership.organizationId, status: "INACTIVE",
          manager: { users: { some: { id: metadata.managerUserId, status: "ACTIVE", emailVerifiedAt: { not: null } } } }
        }
      }) : null;
      if (!["Director", "Division Director"].includes(membership.roles[0]?.role.name ?? "") && (!pendingManager || typeof metadata.managerDecisionReference !== "string" || metadata.managerDecisionReference.length < 8)) throw new AccessError("Manager appointment unavailable");
      if ((await db.emailAuthChallenge.updateMany({ where: { id: challenge.id, status: "SENT", attempts: { lte: 5 } }, data: { status: "CONSUMED", consumedAt: now() } })).count !== 1) throw new AccessError("Invitation already used");
      await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE", passwordHash: hash, emailVerifiedAt: now() } });
      await db.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
      if (pendingManager) await db.reportingRelationship.update({ where: { id: pendingManager.id }, data: { status: "ACTIVE" } });
      await db.person.update({ where: { id: user.personId! }, data: { metadata: JSON.stringify({ ...metadata, staffOnboarding: "ACTIVE" }) } });
      await requirePortalAccess(db, user.id, data.portal);
      await operationalEvent(db, { actorUserId: user.id, actorPersonId: user.personId, organizationId: membership.organizationId, action: "staff.account_activated", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { challengeId: challenge.id, roleId: membership.roles[0]?.roleId } });
      return { activated: true };
    });
  }
  async function beginPasswordReset(raw: unknown) {
    const data = resetRequestInput.parse(raw), config = settings.parse(env);
    await consume(securityKey("skillcity:staff-password-reset", data.email), 3, 900);
    const id = randomUUID(), code = String(randomInt(0, 1000000)).padStart(6, "0");
    const user = await client.user.findUnique({ where: { email: data.email }, include: { person: true } });
    let eligible = !!user && user.status === "ACTIVE" && !!user.emailVerifiedAt && !!user.passwordHash && user.person?.status === "ACTIVE";
    let organizationId: string | undefined;
    if (eligible && user) {
      try {
        const metadata = JSON.parse(user.person?.metadata ?? "{}");
        eligible = metadata.authenticationRealm === data.portal && metadata.credentialKind === "STAFF_PASSWORD" && metadata.staffOnboarding === "ACTIVE";
        const company = await client.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true } });
        organizationId = data.portal === "labs" ? (await client.organization.findFirst({ where: { slug: "aira-labs", parentId: company?.id }, select: { id: true } }))?.id : company?.id;
        eligible = eligible && !!company && !!organizationId && !!(await client.employment.findFirst({ where: { personId: user.personId!, companyId: company.id, status: "ACTIVE" } }));
        if (eligible) await requirePortalAccess(client, user.id, data.portal);
      } catch (error) { if (error instanceof AccessError) eligible = false; else throw error; }
    }
    if (!eligible || !user || !organizationId) return { challengeId: randomUUID(), sent: false };
    await client.$transaction(async db => {
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, purpose: "STAFF_PASSWORD_RESET", status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      await db.emailAuthChallenge.create({ data: { id, userId: user.id, email: user.email, purpose: "STAFF_PASSWORD_RESET", otpHash: otpHash(id, code, config.SKILLCITY_OTP_SECRET), credentialHash: user.passwordHash!, expiresAt: new Date(now().getTime() + 600000) } });
      await operationalEvent(db, { organizationId, action: "staff.password_reset_requested", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { challengeId: id, portal: data.portal } });
    });
    try {
      const domain = data.portal === "labs" ? "airalabs.online" : "airaskillcity.com";
      const response = await transport("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `staff-password-reset/${id}` }, body: JSON.stringify({ from: config.SKILLCITY_AUTH_FROM, to: [user.email], subject: `Reset your ${data.portal === "labs" ? "AIRA Labs" : "AIRA Skill City"} staff password`, text: `Your password reset code is ${code}. Open https://${domain}/recover?challenge=${id} and enter it within 10 minutes. If you did not request this, ignore the message. Do not share this code.` }) });
      if (!response.ok) throw new Error("Email provider unavailable");
      const receipt = z.object({ id: z.string().min(1) }).parse(await response.json());
      if ((await client.emailAuthChallenge.updateMany({ where: { id, status: "PENDING", expiresAt: { gt: now() } }, data: { status: "SENT", providerRef: receipt.id } })).count !== 1) throw new Error("Reset state changed");
      return { challengeId: id, sent: true };
    } catch {
      await client.emailAuthChallenge.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
      await operationalEvent(client, { organizationId, action: "staff.password_reset_delivery_failed", entityType: "User", entityId: user.id, result: "FAILURE", metadata: { challengeId: id, portal: data.portal } });
      return { challengeId: randomUUID(), sent: false };
    }
  }
  async function completePasswordReset(raw: unknown) {
    const data = resetInput.parse(raw), config = settings.parse(env);
    await consume(securityKey("skillcity:staff-password-reset-code", data.challengeId), 6, 900);
    const attempted = await client.emailAuthChallenge.updateMany({ where: { id: data.challengeId, purpose: "STAFF_PASSWORD_RESET", status: "SENT", expiresAt: { gt: now() }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    if (attempted.count !== 1) throw new AccessError("Invalid or expired reset code");
    const hash = await hashPassword(data.password);
    return client.$transaction(async db => {
      const challenge = await db.emailAuthChallenge.findUnique({ where: { id: data.challengeId } });
      const user = challenge ? await db.user.findUnique({ where: { id: challenge.userId }, include: { person: true } }) : null;
      if (!challenge || !user || challenge.email !== user.email || challenge.credentialHash !== user.passwordHash || challenge.status !== "SENT" || challenge.expiresAt <= now() || !user.emailVerifiedAt || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE") throw new AccessError("Invalid or expired reset code");
      const metadata = JSON.parse(user.person?.metadata ?? "{}");
      if (metadata.authenticationRealm !== data.portal || metadata.credentialKind !== "STAFF_PASSWORD" || metadata.staffOnboarding !== "ACTIVE") throw new AccessError("Staff account unavailable");
      const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true } });
      const organization = data.portal === "labs" ? await db.organization.findFirst({ where: { slug: "aira-labs", parentId: company?.id }, select: { id: true } }) : company;
      if (!company || !organization || !(await db.employment.findFirst({ where: { personId: user.personId!, companyId: company.id, status: "ACTIVE" } }))) throw new AccessError("Staff account unavailable");
      await requirePortalAccess(db, user.id, data.portal);
      const expected = Buffer.from(challenge.otpHash, "hex"), supplied = Buffer.from(otpHash(challenge.id, data.code, config.SKILLCITY_OTP_SECRET), "hex");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new AccessError("Invalid or expired reset code");
      const consumed = await db.emailAuthChallenge.updateMany({ where: { id: challenge.id, status: "SENT", credentialHash: user.passwordHash, attempts: { lte: 5 }, expiresAt: { gt: now() } }, data: { status: "CONSUMED", consumedAt: now() } });
      if (consumed.count !== 1) throw new AccessError("Reset code already used");
      await db.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, purpose: "STAFF_PASSWORD_RESET", status: { in: ["PENDING", "SENT"] }, id: { not: challenge.id } }, data: { status: "CANCELLED" } });
      await operationalEvent(db, { actorUserId: user.id, actorPersonId: user.personId, organizationId: organization.id, action: "staff.password_reset_completed", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { challengeId: challenge.id, portal: data.portal, sessionsRevoked: true } });
      return { reset: true };
    });
  }
  return { drafts, send, activate, beginPasswordReset, completePasswordReset, deliveryReady };
}

export const staffInvite = createStaffInvite();
