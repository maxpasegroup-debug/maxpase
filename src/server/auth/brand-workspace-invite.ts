import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { AccessError } from "@/server/authorization/engine";
import { createSecurityLimiter, securityKey } from "@/server/security/rate-limit";
import { createBossService } from "@/server/group/boss-service";
import { operationalEvent } from "@/server/domain/operational-events";
import { brandWorkspaceSlug } from "@/server/group/brand-workspaces";

const settings = z.object({ SKILLCITY_EMAIL_AUTH_ENABLED: z.literal("true"), RESEND_API_KEY: z.string().min(10), SKILLCITY_AUTH_FROM: z.email(), SKILLCITY_OTP_SECRET: z.string().min(32).refine(value => !/replace-with|changeme|dev-only/i.test(value)) });
const sendInput = z.object({ userId: z.string().min(1).max(200), brandId: z.string().min(1).max(200) }).strict();
const passwordSchema = z.string().min(12).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72);
const activateInput = z.object({ challengeId: z.uuid(), code: z.string().regex(/^[0-9]{6}$/), password: passwordSchema, confirmPassword: z.string() }).strict().refine(value => value.password === value.confirmPassword);
const digest = (id: string, code: string, secret: string) => createHash("sha256").update(`${id}:${code}:${secret}`).digest("hex");

export function createBrandWorkspaceInviteService(client: PrismaClient = prisma, env: Record<string, string | undefined> = process.env, now = () => new Date(), transport: typeof fetch = fetch) {
  const consume = createSecurityLimiter(client, now);
  function activationOrigin() {
    const raw = env.APP_ORIGIN ?? (env.NODE_ENV === "production" ? "" : "http://localhost:3000");
    try {
      const origin = new URL(raw);
      if (origin.origin !== raw || env.NODE_ENV === "production" && origin.protocol !== "https:" || !["http:", "https:"].includes(origin.protocol)) throw new Error();
      return origin.origin;
    } catch { throw new AccessError("The MAXPASE employee setup origin is not securely configured"); }
  }
  const deliveryReady = () => {
    if (!settings.safeParse(env).success) return false;
    try { activationOrigin(); return true; } catch { return false; }
  };
  async function send(actorUserId: string, raw: unknown) {
    const input = sendInput.parse(raw), config = settings.parse(env);
    const origin = activationOrigin();
    await consume(securityKey("brand-workspace:invite", input.userId), 3, 86400);
    const id = randomUUID(), code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const target = await client.$transaction(async db => {
      await createBossService(client).authority(actorUserId, db);
      const user = await db.user.findUnique({ where: { id: input.userId }, include: { person: true } });
      if (!user?.person || user.status !== "INACTIVE" || user.passwordHash || user.emailVerifiedAt || user.person.email?.toLowerCase() !== user.email.toLowerCase()) throw new AccessError("Brand employee invitation is unavailable");
      const metadata = JSON.parse(user.person.metadata ?? "{}");
      if (metadata.authenticationRealm !== "brand" || metadata.credentialKind !== "STAFF_PASSWORD" || metadata.staffOnboarding !== "INVITED" || metadata.appointmentAuthority !== "GROUP_BOSS") throw new AccessError("Brand employee appointment requires review");
      const assignment = metadata.brandAppointment as { companyId?: string; brandId?: string; roleKey?: string } | undefined;
      if (assignment?.brandId !== input.brandId) throw new AccessError("Invitation brand does not match the employee appointment");
      const brand = await db.brand.findFirst({ where: { id: input.brandId, organizationId: assignment.companyId, status: "ACTIVE", organization: { type: "COMPANY", status: "ACTIVE" } }, select: { id: true, slug: true, name: true, organizationId: true } });
      if (!brand || !assignment.roleKey) throw new AccessError("Active brand appointment required before invitation");
      const workspace = await db.organization.findFirst({ where: { slug: brandWorkspaceSlug(brand.slug), parentId: brand.organizationId, type: "BUSINESS_UNIT", status: "ACTIVE" }, select: { id: true, metadata: true } });
      const membership = workspace ? await db.membership.findFirst({ where: { personId: user.personId!, organizationId: workspace.id, status: "INVITED", roles: { some: { role: { key: assignment.roleKey, status: "ACTIVE", principalType: "HUMAN", organizationId: workspace.id } } } }, include: { roles: { where: { role: { key: assignment.roleKey } }, include: { role: true } } } }) : null;
      const permissionCount = membership ? await db.rolePermission.count({ where: { roleId: membership.roles[0]?.roleId } }) : 1;
      if (!workspace || !membership || membership.roles.length !== 1 || permissionCount > 0) throw new AccessError("An active brand role assignment is required before invitation");
      let binding: { brandId?: string; brandSlug?: string; workspaceKind?: string };
      try { binding = JSON.parse(workspace.metadata ?? "{}"); } catch { throw new AccessError("Brand workspace requires review"); }
      if (binding.brandId !== brand.id || binding.brandSlug !== brand.slug || binding.workspaceKind !== "BRAND_DEFAULT") throw new AccessError("Brand workspace scope mismatch");
      if (!(await db.employment.findFirst({ where: { personId: user.personId!, companyId: brand.organizationId, status: "ACTIVE", assignments: { some: { brandId: brand.id, status: "ACTIVE" } } }, select: { id: true } }))) throw new AccessError("Active brand employment required before invitation");
      const prior = await db.emailAuthChallenge.findFirst({ where: { userId: user.id, purpose: "STAFF_INVITE", status: "SENT", expiresAt: { gt: now() } }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (prior) return { userId: user.id, email: user.email, brandId: brand.id, brandName: brand.name, organizationId: workspace.id, challengeId: prior.id, reused: true };
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, purpose: "STAFF_INVITE", status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      await db.emailAuthChallenge.create({ data: { id, userId: user.id, email: user.email, purpose: "STAFF_INVITE", otpHash: digest(id, code, config.SKILLCITY_OTP_SECRET), credentialHash: "", expiresAt: new Date(now().getTime() + 86400000) } });
      await operationalEvent(db, { actorUserId, actorPersonId: user.personId, organizationId: workspace.id, action: "staff.invitation_requested", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { challengeId: id, brandId: brand.id, roleKey: assignment.roleKey, invitationExpiresInHours: 24 } });
      return { userId: user.id, email: user.email, brandId: brand.id, brandName: brand.name, organizationId: workspace.id, challengeId: id, reused: false };
    });
    const activationUrl = `${origin}/staff/brand-activate?challenge=${encodeURIComponent(target.challengeId)}`;
    if (target.reused) return { sent: true, activationUrl, reused: true };
    try {
      const response = await transport("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `brand-staff-invite/${target.challengeId}` }, body: JSON.stringify({ from: config.SKILLCITY_AUTH_FROM, to: [target.email], subject: `Set up your ${target.brandName} employee account`, text: `You have been appointed to the ${target.brandName} workspace. Your verification code is ${code}. Open ${activationUrl} and enter this code to verify your work email and create your own password. The code expires in 24 hours. Do not share it.` }) });
      if (!response.ok) throw new Error("Email provider unavailable");
      const receipt = z.object({ id: z.string().min(1) }).parse(await response.json());
      if ((await client.emailAuthChallenge.updateMany({ where: { id: target.challengeId, status: "PENDING", expiresAt: { gt: now() } }, data: { status: "SENT", providerRef: receipt.id } })).count !== 1) throw new Error("Invitation state changed");
      return { sent: true, activationUrl, reused: false };
    } catch {
      await client.$transaction(async db => {
        await db.emailAuthChallenge.updateMany({ where: { id: target.challengeId, status: "PENDING" }, data: { status: "FAILED" } });
        await operationalEvent(db, { actorUserId, organizationId: target.organizationId, action: "staff.invitation_delivery_failed", entityType: "User", entityId: target.userId, result: "FAILURE", metadata: { challengeId: target.challengeId, brandId: target.brandId } });
      });
      throw new AccessError("The employee record and dashboard are saved, but invitation delivery failed. Retry the invitation after checking email setup.");
    }
  }

  async function activate(raw: unknown) {
    const input = activateInput.parse(raw), config = settings.parse(env);
    await consume(securityKey("brand-workspace:activate", input.challengeId), 8, 900);
    const attempted = await client.emailAuthChallenge.updateMany({ where: { id: input.challengeId, purpose: "STAFF_INVITE", status: "SENT", expiresAt: { gt: now() }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    if (attempted.count !== 1) throw new AccessError("Invalid or expired invitation");
    const passwordHash = await hashPassword(input.password);
    return client.$transaction(async db => {
      const challenge = await db.emailAuthChallenge.findUnique({ where: { id: input.challengeId } });
      if (!challenge || challenge.purpose !== "STAFF_INVITE" || challenge.status !== "SENT" || challenge.expiresAt <= now()) throw new AccessError("Invalid or expired invitation");
      const expected = Buffer.from(challenge.otpHash, "hex"), supplied = Buffer.from(digest(challenge.id, input.code, config.SKILLCITY_OTP_SECRET), "hex");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new AccessError("Invalid or expired invitation");
      const user = await db.user.findUnique({ where: { id: challenge.userId }, include: { person: true } });
      if (!user?.person || user.status !== "INACTIVE" || user.passwordHash || user.emailVerifiedAt || user.email !== challenge.email || user.person.email?.toLowerCase() !== user.email.toLowerCase() || user.person.status !== "ACTIVE") throw new AccessError("Invitation unavailable");
      const metadata = JSON.parse(user.person.metadata ?? "{}");
      if (metadata.authenticationRealm !== "brand" || metadata.credentialKind !== "STAFF_PASSWORD" || metadata.staffOnboarding !== "INVITED" || metadata.appointmentAuthority !== "GROUP_BOSS") throw new AccessError("Invitation unavailable");
      const appointment = metadata.brandAppointment as { companyId?: string; brandId?: string; roleKey?: string } | undefined;
      if (!appointment?.brandId || !appointment.companyId || !appointment.roleKey) throw new AccessError("Brand appointment unavailable");
      const brand = await db.brand.findFirst({ where: { id: appointment.brandId, organizationId: appointment.companyId, status: "ACTIVE", organization: { status: "ACTIVE", company: { status: "ACTIVE" } } }, select: { id: true, slug: true, organizationId: true } });
      const workspace = brand ? await db.organization.findFirst({ where: { slug: brandWorkspaceSlug(brand.slug), parentId: brand.organizationId, type: "BUSINESS_UNIT", status: "ACTIVE" }, select: { id: true, metadata: true } }) : null;
      const memberships = workspace ? await db.membership.findMany({ where: { personId: user.personId!, organizationId: workspace.id, status: "INVITED", roles: { some: { role: { key: appointment.roleKey, status: "ACTIVE", principalType: "HUMAN", organizationId: workspace.id } } } }, include: { roles: { include: { role: { select: { id: true, key: true, name: true, status: true, principalType: true, organizationId: true, permissions: { select: { id: true } } } } } } } }) : [];
      const membership = memberships.find(row => row.roles.length === 1 && row.roles[0].role.key === appointment.roleKey);
      const employment = await db.employment.findFirst({ where: { personId: user.personId!, companyId: appointment.companyId, status: "ACTIVE", assignments: { some: { brandId: appointment.brandId, status: "ACTIVE" } } }, select: { id: true } });
      if (!brand || !workspace || !membership || !employment || membership.roles[0].role.organizationId !== workspace.id || membership.roles[0].role.permissions.length) throw new AccessError("Active brand appointment is required to activate this account");
      let binding: { brandId?: string; brandSlug?: string; workspaceKind?: string };
      try { binding = JSON.parse(workspace.metadata ?? "{}"); } catch { throw new AccessError("Brand workspace requires review"); }
      if (binding.brandId !== brand.id || binding.brandSlug !== brand.slug || binding.workspaceKind !== "BRAND_DEFAULT") throw new AccessError("Brand workspace scope mismatch");
      if ((await db.emailAuthChallenge.updateMany({ where: { id: challenge.id, status: "SENT", attempts: { lte: 5 }, expiresAt: { gt: now() } }, data: { status: "CONSUMED", consumedAt: now() } })).count !== 1) throw new AccessError("Invitation already used");
      await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE", passwordHash, emailVerifiedAt: now() } });
      await db.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
      await db.person.update({ where: { id: user.personId! }, data: { metadata: JSON.stringify({ ...metadata, staffOnboarding: "ACTIVE", identityVerification: "EMAIL_VERIFIED" }) } });
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, purpose: "STAFF_INVITE", status: { in: ["PENDING", "SENT"] }, id: { not: challenge.id } }, data: { status: "CANCELLED" } });
      await db.session.deleteMany({ where: { userId: user.id } });
      await operationalEvent(db, { actorUserId: user.id, actorPersonId: user.personId, organizationId: workspace.id, action: "staff.account_activated", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { challengeId: challenge.id, brandId: brand.id, roleKey: appointment.roleKey, sessionsRevoked: true } });
      return { activated: true as const, userId: user.id, brandSlug: brand.slug };
    });
  }
  return { deliveryReady, send, activate };
}
export const brandWorkspaceInviteService = createBrandWorkspaceInviteService();
