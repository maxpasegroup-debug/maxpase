import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createAuthenticationService } from "@/server/auth/service";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { AccessError } from "@/server/authorization/engine";
import { createSecurityLimiter, securityKey, RateLimitError } from "@/server/security/rate-limit";

const email = z.email().max(254).transform(value => value.toLowerCase());
const password = z.string().min(12).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72);
const registration = z.object({ name: z.string().trim().min(2).max(120), email, password, confirmPassword: z.string(), consent: z.literal(true) }).strict().refine(value => value.password === value.confirmPassword, "Passwords must match");
const credentials = z.object({ email, password: z.string().min(8).max(72) }).strict();
const proof = z.object({ challengeId: z.uuid(), code: z.string().regex(/^[0-9]{6}$/) }).strict();
const purpose = "STARTUP_REGISTER";
const dummyHash = hashPassword("non-account-timing-comparison-only");

export class StartupAuthUnavailable extends Error { constructor() { super("Startup Skool email verification is unavailable."); } }
export function startupEmailSettings(env: Record<string, string | undefined> = process.env) {
  const parsed = z.object({ STARTUP_EMAIL_AUTH_ENABLED: z.literal("true"), STARTUP_AUTH_FROM: email, STARTUP_OTP_SECRET: z.string().min(32).refine(value => !/changeme|replace-with|dev-only/i.test(value)), RESEND_API_KEY: z.string().min(10) }).safeParse(env);
  if (!parsed.success) throw new StartupAuthUnavailable();
  return parsed.data;
}
function otpHash(id: string, code: string, secret: string) { return createHmac("sha256", secret).update(`startup:${id}:${code}`).digest("hex"); }
async function resendCode(settings: ReturnType<typeof startupEmailSettings>, id: string, address: string, code: string) {
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${settings.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `startup-verify/${id}` }, body: JSON.stringify({ from: settings.STARTUP_AUTH_FROM, to: [address], subject: "Verify your Startup Skool email", text: `Your Startup Skool verification code is ${code}. It expires in 10 minutes. Do not share it.` }) });
    if (!response.ok) throw new Error("Delivery failed");
    return z.object({ id: z.string().min(1).max(200) }).parse(await response.json()).id;
  } catch { throw new StartupAuthUnavailable(); }
}

export function createStartupAuth(client: PrismaClient = prisma, options: { env?: Record<string, string | undefined>; send?: (id: string, email: string, code: string) => Promise<string>; now?: () => Date } = {}) {
  const env = options.env ?? process.env, now = options.now ?? (() => new Date()), consume = createSecurityLimiter(client, now), auth = createAuthenticationService(client, now);
  function ready() { return startupEmailSettings(env); }
  async function dispatch(user: { id: string; email: string; passwordHash: string | null }) {
    const settings = ready();
    if (!user.passwordHash) throw new AccessError("Account unavailable");
    await consume("startup:otp:global", 40, 60);
    await consume(securityKey("startup:otp:hour", user.email), 3, 3600);
    const id = randomUUID(), code = String(randomInt(100000, 1000000));
    await client.$transaction(async db => {
      if (await db.emailAuthChallenge.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(now().getTime() - 60000) } }, select: { id: true } })) throw new RateLimitError();
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, purpose, status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      await db.emailAuthChallenge.create({ data: { id, userId: user.id, email: user.email, purpose, otpHash: otpHash(id, code, settings.STARTUP_OTP_SECRET), credentialHash: user.passwordHash!, expiresAt: new Date(now().getTime() + 600000) } });
      await db.auditEvent.create({ data: buildAuditEventData({ action: "startup.email_code_requested", entityType: "EmailAuthChallenge", entityId: id, result: "SUCCESS", metadata: { portal: "startup" } }) });
    });
    try {
      const providerRef = await (options.send ?? ((challengeId, address, value) => resendCode(settings, challengeId, address, value)))(id, user.email, code);
      await client.$transaction(async db => {
        if ((await db.emailAuthChallenge.updateMany({ where: { id, status: "PENDING", expiresAt: { gt: now() } }, data: { status: "SENT", providerRef } })).count !== 1) throw new StartupAuthUnavailable();
        await db.auditEvent.create({ data: buildAuditEventData({ action: "startup.email_code_provider_accepted", entityType: "EmailAuthChallenge", entityId: id, result: "SUCCESS" }) });
      });
    } catch {
      await client.$transaction(async db => { await db.emailAuthChallenge.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } }); await db.auditEvent.create({ data: buildAuditEventData({ action: "startup.email_code_delivery_failed", entityType: "EmailAuthChallenge", entityId: id, result: "FAILURE" }) }); });
      throw new StartupAuthUnavailable();
    }
    return { challengeId: id };
  }
  async function register(raw: unknown) {
    ready();
    const input = registration.parse(raw);
    await consume("startup:signup:global", 20, 60);
    await consume(securityKey("startup:signup:email", input.email), 3, 3600);
    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      user = await client.$transaction(async db => {
        const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true, status: true } });
        const division = await db.organization.findUnique({ where: { slug: "aira-startup-school" }, select: { id: true, parentId: true, type: true, status: true } });
        if (!company || company.status !== "ACTIVE" || !division || division.parentId !== company.id || division.type !== "DIVISION" || division.status !== "ACTIVE") throw new StartupAuthUnavailable();
        if (await db.user.findUnique({ where: { email: input.email } }) || await db.person.findUnique({ where: { email: input.email } })) throw new AccessError("Account already exists");
        const permission = await db.permission.findUnique({ where: { key: "organization.read" } });
        if (!permission || permission.scope !== "GROUP") throw new StartupAuthUnavailable();
        let role = await db.role.findUnique({ where: { organizationId_key: { organizationId: division.id, key: "startup-applicant" } }, include: { permissions: { include: { permission: true } } } });
        if (!role) role = await db.role.create({ data: { organizationId: division.id, key: "startup-applicant", name: "Startup Skool applicant", category: "APPLICANT", system: true, permissions: { create: { permissionId: permission.id } } }, include: { permissions: { include: { permission: true } } } });
        if (role.status !== "ACTIVE" || role.principalType !== "HUMAN" || role.permissions.length !== 1 || role.permissions[0].permission.key !== "organization.read") throw new StartupAuthUnavailable();
        const person = await db.person.create({ data: { displayName: input.name, email: input.email, metadata: JSON.stringify({ authenticationRealm: "startup", identitySource: "STARTUP_APPLICATION", registrationNoticeVersion: 1 }) } });
        const account = await db.user.create({ data: { email: input.email, personId: person.id, passwordHash } });
        await db.membership.create({ data: { personId: person.id, organizationId: division.id, title: "Applicant", roles: { create: { roleId: role.id } } } });
        await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: account.id, actorPersonId: person.id, organizationId: division.id, action: "startup.account_registered", entityType: "User", entityId: account.id, result: "SUCCESS", metadata: { noticeVersion: 1, emailVerified: false } }) });
        return account;
      });
    } catch (error) { if (error instanceof AccessError || error && typeof error === "object" && "code" in error && error.code === "P2002") throw new AccessError("Use sign in or account recovery for this email"); throw error; }
    return dispatch(user);
  }
  async function resend(raw: unknown) {
    ready();
    const input = credentials.parse(raw);
    await consume("startup:resend:global", 30, 60);
    await consume(securityKey("startup:resend:email", input.email), 3, 3600);
    const user = await client.user.findUnique({ where: { email: input.email }, include: { person: { select: { metadata: true, status: true } } } });
    const valid = await verifyPassword(input.password, user?.passwordHash ?? await dummyHash);
    if (!user || !valid || user.emailVerifiedAt || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || JSON.parse(user.person?.metadata ?? "{}").authenticationRealm !== "startup") return { challengeId: randomUUID() };
    try { return await dispatch(user); } catch (error) { if (error instanceof StartupAuthUnavailable) return { challengeId: randomUUID() }; throw error; }
  }
  async function verify(raw: unknown, secret: string) {
    const settings = ready(), input = proof.parse(raw);
    await consume("startup:verify:global", 120, 60);
    const attempt = await client.emailAuthChallenge.updateMany({ where: { id: input.challengeId, purpose, status: "SENT", expiresAt: { gt: now() }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    if (attempt.count !== 1) throw new AccessError("Invalid or expired code");
    await client.$transaction(async db => {
      const challenge = await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: input.challengeId } });
      const user = await db.user.findUnique({ where: { id: challenge.userId }, include: { person: { select: { metadata: true, status: true } } } });
      const computed = otpHash(challenge.id, input.code, settings.STARTUP_OTP_SECRET);
      if (!user || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || JSON.parse(user.person?.metadata ?? "{}").authenticationRealm !== "startup" || user.emailVerifiedAt || challenge.email !== user.email || challenge.credentialHash !== user.passwordHash || challenge.status !== "SENT" || challenge.expiresAt <= now() || challenge.attempts > 5 || !/^[a-f0-9]{64}$/.test(challenge.otpHash) || !timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(challenge.otpHash, "hex"))) throw new AccessError("Invalid or expired code");
      if ((await db.emailAuthChallenge.updateMany({ where: { id: challenge.id, status: "SENT", expiresAt: { gt: now() } }, data: { status: "CONSUMED", consumedAt: now() } })).count !== 1) throw new AccessError("Invalid or expired code");
      await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now() } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: user.id, actorPersonId: user.personId, action: "startup.email_verified", entityType: "EmailAuthChallenge", entityId: challenge.id, result: "SUCCESS" }) });
    });
    const challenge = await client.emailAuthChallenge.findUniqueOrThrow({ where: { id: input.challengeId } });
    return auth.create(challenge.userId, secret, undefined, 8 * 3600000, "startup");
  }
  return { ready, register, resend, verify };
}
export const startupAuth = createStartupAuth();
