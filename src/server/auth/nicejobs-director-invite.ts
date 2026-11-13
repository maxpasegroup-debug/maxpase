import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { createBossService } from "@/server/group/boss-service";
import { operationalEvent } from "@/server/domain/operational-events";
import { createSecurityLimiter, securityKey } from "@/server/security/rate-limit";
import { emailAuthSettings, EmailAuthUnavailable, createResendOtpSender } from "./resend-otp";
import { createNiceJobsSmsSender, JobsSmsUnavailable } from "./nicejobs-sms";
import { hashJobsPin } from "./jobs-pin";
import { jobsPinInput } from "./jobs-phone";
import { jobsOtpHash } from "./jobs-otp-proof";
import { hasStaffWorkspaceCapabilities } from "@/server/skillcity/staff-roles";
import { requirePortalAccess } from "@/server/portals/policy";

const otp = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
const invitePurposeEmail = "JOBS_DIRECTOR_EMAIL";
const invitePurposePhone = "JOBS_DIRECTOR_PHONE";
const pepper = (env: Record<string, string | undefined>) => {
  const value = emailAuthSettings(env).NICEJOBS_OTP_SECRET;
  return value;
};

export function createNiceJobsDirectorInvite(client: PrismaClient = prisma, options: {
  env?: Record<string, string | undefined>; now?: () => Date;
  sendEmail?: (message: { id: string; email: string; code: string; purpose: "STAFF_INVITE" }) => Promise<string>;
  sendSms?: (phone: string, code: string) => Promise<string>;
} = {}) {
  const env = options.env ?? process.env, now = options.now ?? (() => new Date());
  const sendEmail = options.sendEmail ?? createResendOtpSender(env), sendSms = options.sendSms ?? createNiceJobsSmsSender(env);
  const consume = createSecurityLimiter(client, now), boss = createBossService(client);
  const digest = (id: string, code: string) => jobsOtpHash(id, code, pepper(env));

  async function appointment(userId: string, db: Prisma.TransactionClient) {
    const user = await db.user.findUnique({ where: { id: userId }, include: { person: { select: { id: true, displayName: true, email: true, phone: true, metadata: true, status: true } } } });
    if (!user?.person || user.status !== "INACTIVE" || user.passwordHash || user.jobsPinHash || !user.jobsPhone || !user.person.email || user.email.toLowerCase() !== user.person.email.toLowerCase()) throw new AccessError("NICEJOBS appointment unavailable");
    const metadata = JSON.parse(user.person.metadata ?? "{}");
    if (metadata.authenticationRealm !== "jobs" || metadata.identitySource !== "HR_APPOINTMENT" || !["PENDING", "INVITED", "EMAIL_VERIFIED"].includes(metadata.staffOnboarding)) throw new AccessError("NICEJOBS appointment unavailable");
    const memberships = await db.membership.findMany({
      where: { personId: user.personId!, scopeKey: "hr-nicejobs-director" },
      include: {
        organization: { select: { id: true, slug: true } },
        roles: { include: { role: { select: { id: true, key: true, status: true } } } }
      },
      take: 2
    });
    const membership = memberships[0];
    const role = membership?.roles[0]?.role;
    const rolePermissions = role ? await db.rolePermission.findMany({ where: { roleId: role.id }, select: { permission: { select: { key: true } } }, take: 100 }) : [];
    if (memberships.length !== 1 || !membership || membership.status !== "INVITED" || membership.organization.slug !== "aira-career-hub" || membership.roles.length !== 1 || role?.key !== "nicejobs-director" || role.status !== "ACTIVE" || !hasStaffWorkspaceCapabilities("nicejobs-director", rolePermissions.map(item => item.permission.key))) throw new AccessError("NICEJOBS Director role is not ready");
    const employments = await db.employment.findMany({ where: { personId: user.personId!, status: "ACTIVE" }, include: { company: { select: { slug: true, status: true } } }, take: 10 });
    const employment = employments.find(item => item.company.slug === "aira-skill-city" && item.company.status === "ACTIVE");
    const companyId = employment?.companyId;
    if (!employment || !companyId || !await db.hrAssignment.findFirst({ where: { employmentId: employment.id, status: "ACTIVE", brand: { organizationId: companyId, slug: "nice-jobs", parentBrandId: null, status: "ACTIVE" } }, select: { id: true } })) throw new AccessError("Active NICEJOBS employment and brand assignment required");
    if (user.jobsPhone !== user.person.phone) throw new AccessError("Appointment phone identity requires review");
    return { user, person: user.person, employment, membership, metadata };
  }

  async function send(actorUserId: string, raw: unknown) {
    const input = z.object({ userId: z.string().min(1).max(200) }).strict().parse(raw);
    await consume(securityKey("nicejobs:director-invite", input.userId), 3, 86400);
    emailAuthSettings(env);
    const id = randomUUID(), code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const target = await client.$transaction(async db => {
      const { ctx } = await boss.authority(actorUserId, db);
      const result = await appointment(input.userId, db);
      const scopeId = result.membership.organizationId;
      for (const permission of ["user.update", "membership.manage", "membership.assign_role"]) await ctx.requireAccess(permission, { organizationId: scopeId });
      if (await db.emailAuthChallenge.findFirst({ where: { userId: input.userId, purpose: invitePurposeEmail, status: { in: ["PENDING", "SENT"] }, createdAt: { gt: new Date(now().getTime() - 60000) } }, select: { id: true } })) throw new AccessError("Wait before resending this invitation");
      await db.emailAuthChallenge.updateMany({ where: { userId: input.userId, purpose: { in: [invitePurposeEmail, invitePurposePhone] }, status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      await db.emailAuthChallenge.create({ data: { id, userId: input.userId, email: result.user.email, purpose: invitePurposeEmail, credentialHash: result.user.jobsPhone!, otpHash: digest(id, code), createdAt: now(), expiresAt: new Date(now().getTime() + 10 * 60_000) } });
      await db.person.update({ where: { id: result.person.id }, data: { metadata: JSON.stringify({ ...result.metadata, staffOnboarding: "INVITED" }) } });
      await operationalEvent(db, { actorUserId, actorPersonId: ctx.user!.personId, organizationId: scopeId, action: "nicejobs.director_invitation_sent", entityType: "User", entityId: input.userId, result: "SUCCESS", metadata: { challengeId: id, roleId: result.membership.roles[0].roleId } });
      return { email: result.user.email, phone: result.user.jobsPhone!, id };
    });
    try {
      const providerRef = await sendEmail({ id, email: target.email, code, purpose: "STAFF_INVITE" });
      const updated = await client.emailAuthChallenge.updateMany({ where: { id, status: "PENDING", expiresAt: { gt: now() } }, data: { status: "SENT", providerRef } });
      if (updated.count !== 1) throw new EmailAuthUnavailable();
      return { sent: true };
    } catch {
      await client.emailAuthChallenge.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
      throw new EmailAuthUnavailable();
    }
  }

  async function sendPhoneCode(userId: string) {
    await consume("nicejobs:director-sms:global", 30, 60);
    const target = await client.$transaction(async db => {
      const { user, person, membership, metadata } = await appointment(userId, db);
      if (!user.emailVerifiedAt || metadata.staffOnboarding !== "EMAIL_VERIFIED") throw new AccessError("Verify the appointment email first");
      await consume(securityKey("nicejobs:director-sms:phone", user.jobsPhone!), 3, 3600);
      if (await db.emailAuthChallenge.findFirst({ where: { userId, purpose: invitePurposePhone, createdAt: { gt: new Date(now().getTime() - 60000) } }, select: { id: true } })) throw new AccessError("Wait before requesting another mobile code");
      await db.emailAuthChallenge.updateMany({ where: { userId, purpose: invitePurposePhone, status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      const id = randomUUID(), code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await db.emailAuthChallenge.create({ data: { id, userId, email: user.email, purpose: invitePurposePhone, credentialHash: user.jobsPhone!, otpHash: digest(id, code), createdAt: now(), expiresAt: new Date(now().getTime() + 10 * 60_000) } });
      return { id, code, phone: user.jobsPhone!, scopeId: membership.organizationId, personId: person.id };
    });
    try {
      const providerRef = await sendSms(target.phone, target.code);
      if ((await client.emailAuthChallenge.updateMany({ where: { id: target.id, status: "PENDING", expiresAt: { gt: now() } }, data: { status: "SENT", providerRef } })).count !== 1) throw new JobsSmsUnavailable();
      return { challengeId: target.id, sent: true };
    } catch {
      await client.emailAuthChallenge.updateMany({ where: { id: target.id, status: "PENDING" }, data: { status: "FAILED" } });
      throw new JobsSmsUnavailable();
    }
  }

  async function verifyEmail(raw: unknown) {
    const input = otp.parse(raw);
    await consume("nicejobs:director-email:global", 60, 60);
    await consume(securityKey("nicejobs:director-email:challenge", input.challengeId), 6, 900);
    const attempted = await client.emailAuthChallenge.updateMany({ where: { id: input.challengeId, purpose: invitePurposeEmail, status: "SENT", expiresAt: { gt: now() }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    if (attempted.count !== 1) throw new AccessError("Invalid or expired appointment code");
    const userId = await client.$transaction(async db => {
      const challenge = await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: input.challengeId } });
      const { user, person, membership, metadata } = await appointment(challenge.userId, db);
      if (challenge.email !== user.email || challenge.credentialHash !== user.jobsPhone || challenge.expiresAt <= now()) throw new AccessError("Invalid or expired appointment code");
      const expected = Buffer.from(challenge.otpHash, "hex"), supplied = Buffer.from(digest(challenge.id, input.code), "hex");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new AccessError("Invalid or expired appointment code");
      if ((await db.emailAuthChallenge.updateMany({ where: { id: challenge.id, status: "SENT", attempts: { lte: 5 }, expiresAt: { gt: now() } }, data: { status: "CONSUMED", consumedAt: now() } })).count !== 1) throw new AccessError("Appointment code already used");
      await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now() } });
      await db.person.update({ where: { id: person.id }, data: { metadata: JSON.stringify({ ...metadata, staffOnboarding: "EMAIL_VERIFIED" }) } });
      await operationalEvent(db, { actorUserId: user.id, actorPersonId: person.id, organizationId: membership.organizationId, action: "nicejobs.director_email_verified", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { challengeId: challenge.id } });
      return user.id;
    });
    return sendPhoneCode(userId);
  }

  async function resendPhone(raw: unknown) {
    const input = z.object({ challengeId: z.uuid() }).strict().parse(raw);
    const previous = await client.emailAuthChallenge.findUnique({ where: { id: input.challengeId }, select: { userId: true, purpose: true, status: true } });
    if (!previous || previous.purpose !== invitePurposeEmail || previous.status !== "CONSUMED") throw new AccessError("Mobile verification unavailable");
    return sendPhoneCode(previous.userId);
  }

  async function activate(raw: unknown) {
    const input = otp.extend({ pin: jobsPinInput, confirmPin: jobsPinInput }).refine(value => value.pin === value.confirmPin).parse(raw);
    await consume("nicejobs:director-activation:global", 60, 60);
    await consume(securityKey("nicejobs:director-activation:challenge", input.challengeId), 6, 900);
    const attempted = await client.emailAuthChallenge.updateMany({ where: { id: input.challengeId, purpose: invitePurposePhone, status: "SENT", expiresAt: { gt: now() }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    if (attempted.count !== 1) throw new AccessError("Invalid or expired mobile code");
    const pinHash = await hashJobsPin(input.pin);
    return client.$transaction(async db => {
      const challenge = await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: input.challengeId } });
      const { user, person, membership, metadata } = await appointment(challenge.userId, db);
      if (challenge.email !== user.email || challenge.credentialHash !== user.jobsPhone || challenge.expiresAt <= now() || !user.emailVerifiedAt || metadata.staffOnboarding !== "EMAIL_VERIFIED") throw new AccessError("Appointment activation unavailable");
      const expected = Buffer.from(challenge.otpHash, "hex"), supplied = Buffer.from(digest(challenge.id, input.code), "hex");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new AccessError("Invalid or expired mobile code");
      if ((await db.emailAuthChallenge.updateMany({ where: { id: challenge.id, status: "SENT", attempts: { lte: 5 }, expiresAt: { gt: now() } }, data: { status: "CONSUMED", consumedAt: now() } })).count !== 1) throw new AccessError("Mobile code already used");
      const changed = await db.user.updateMany({ where: { id: user.id, status: "INACTIVE", jobsPhone: challenge.credentialHash, jobsPinHash: null, emailVerifiedAt: { not: null } }, data: { jobsPinHash: pinHash, jobsPhoneVerifiedAt: now(), status: "ACTIVE" } });
      if (changed.count !== 1) throw new AccessError("Appointment activation unavailable");
      await db.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
      await db.person.update({ where: { id: person.id }, data: { metadata: JSON.stringify({ ...metadata, staffOnboarding: "ACTIVE", phoneVerifiedAt: now().toISOString() }) } });
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, purpose: { in: [invitePurposeEmail, invitePurposePhone] }, status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      await requirePortalAccess(db, user.id, "jobs");
      await operationalEvent(db, { actorUserId: user.id, actorPersonId: person.id, organizationId: membership.organizationId, action: "nicejobs.director_activated", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { roleId: membership.roles[0].roleId, emailVerified: true, phoneVerified: true } });
      await db.session.deleteMany({ where: { userId: user.id } });
      return { activated: true };
    });
  }

  return { send, verifyEmail, resendPhone, activate };
}

export const niceJobsDirectorInvite = createNiceJobsDirectorInvite();
