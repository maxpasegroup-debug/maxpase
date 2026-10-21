import { randomInt, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { createSecurityLimiter, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { accountPortalRealm } from "./account-realm";
import { createAuthenticationService } from "./service";
import { hashPassword } from "./password";
import { hashJobsPin } from "./jobs-pin";
import { verifyJobsPin } from "./jobs-pin";
import { jobsPhoneInput, jobsPinInput } from "./jobs-phone";
import { claimJobsOtp, jobsOtpHash } from "./jobs-otp-proof";
import { createResendOtpSender, createResendPinNoticeSender, emailAuthSettings, EmailAuthUnavailable, type OtpDelivery } from "./resend-otp";
import { requirePortalAccess } from "@/server/portals/policy";
import { AccessError } from "@/server/authorization/engine";

const emailInput = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const proofInput = z.object({ challengeId: z.uuid(), code: z.string().regex(/^[0-9]{6}$/) }).strict();
const newPassword = z.string().min(12).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72);
const resetInput = proofInput.extend({ password: newPassword, confirmPassword: z.string() }).refine(value => value.password === value.confirmPassword);

export function createJobsEmailAuth(client: PrismaClient = prisma, options: { now?: () => Date; env?: Record<string, string | undefined>; send?: (message: OtpDelivery) => Promise<string>; notifyPinChange?: (id: string, email: string) => Promise<void> } = {}) {
  const now = options.now ?? (() => new Date()), env = options.env ?? process.env;
  const send = options.send ?? createResendOtpSender(env), notifyPinChange = options.notifyPinChange ?? createResendPinNoticeSender(env), auth = createAuthenticationService(client, now), consume = createSecurityLimiter(client, now);
  function ready() { return emailAuthSettings(env); }
  async function requestBudget(email: string) {
    await consume("nicejobs:otp:global", 30, 60);
    await consume(securityKey("nicejobs:otp:cooldown", email), 1, 60);
    await consume(securityKey("nicejobs:otp:hour", email), 3, 3600);
    await consume(securityKey("nicejobs:otp:day", email), 10, 86400);
  }
  async function dispatch(user: { id: string; email: string; passwordHash: string | null; jobsPinHash?: string | null }, purpose: "LOGIN" | "RESET" | "REGISTER" | "RESET_PIN") {
    const settings = ready(), id = randomUUID(), code = String(randomInt(0, 1000000)).padStart(6, "0");
    const credentialHash = purpose === "LOGIN" || purpose === "RESET" ? user.passwordHash : user.jobsPinHash;
    if (!credentialHash) throw new AccessError("Account unavailable");
    await client.$transaction(async db => {
      if (await db.emailAuthChallenge.findFirst({ where: { userId: user.id, email: user.email, createdAt: { gt: new Date(now().getTime() - 60000) } }, select: { id: true } })) throw new RateLimitError();
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, purpose, status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      await db.emailAuthChallenge.create({ data: { id, userId: user.id, email: user.email, purpose, credentialHash, otpHash: jobsOtpHash(id, code, settings.NICEJOBS_OTP_SECRET), createdAt: now(), expiresAt: new Date(now().getTime() + 600000) } });
      await db.auditEvent.create({ data: buildAuditEventData({ action: "auth.otp_requested", entityType: "EmailAuthChallenge", entityId: id, result: "SUCCESS", metadata: { portal: "jobs", purpose } }) });
    });
    try {
      const providerRef = await send({ id, email: user.email, code, purpose });
      await client.$transaction(async db => {
        const updated = await db.emailAuthChallenge.updateMany({ where: { id, status: "PENDING", expiresAt: { gt: now() } }, data: { status: "SENT", providerRef } });
        if (updated.count !== 1) throw new EmailAuthUnavailable();
        await db.auditEvent.create({ data: buildAuditEventData({ action: "auth.otp_provider_accepted", entityType: "EmailAuthChallenge", entityId: id, result: "SUCCESS", metadata: { portal: "jobs", purpose } }) });
      });
    } catch {
      await client.$transaction(async db => {
        await db.emailAuthChallenge.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
        await db.auditEvent.create({ data: buildAuditEventData({ action: "auth.otp_delivery_failed", entityType: "EmailAuthChallenge", entityId: id, result: "FAILURE", metadata: { portal: "jobs", purpose } }) });
      });
      throw new EmailAuthUnavailable();
    }
    return { challengeId: id };
  }
  async function beginLogin(raw: unknown) {
    ready();
    const input = z.object({ email: emailInput, password: z.string().min(8).max(72) }).strict().parse(raw);
    await requestBudget(input.email);
    const user = await auth.checkJobsPassword(input);
    if (!user) return { challengeId: randomUUID() };
    return dispatch(user, "LOGIN");
  }
  async function completeLogin(raw: unknown, secret: string) {
    const settings = ready(), proof = proofInput.parse(raw);
    await consume("nicejobs:otp:verify:global", 120, 60);
    const challenge = await client.emailAuthChallenge.findUnique({ where: { id: proof.challengeId } });
    if (!challenge || challenge.purpose !== "LOGIN") throw new AccessError("Invalid or expired code");
    try { return await auth.create(challenge.userId, secret, challenge.credentialHash, 8 * 3600000, "jobs", { ...proof, pepper: settings.NICEJOBS_OTP_SECRET }); }
    catch (error) {
      if (error instanceof AccessError) await client.auditEvent.create({ data: buildAuditEventData({ action: "auth.otp_verify", entityType: "EmailAuthChallenge", entityId: proof.challengeId, result: "DENIED", metadata: { portal: "jobs", purpose: "LOGIN" } }) });
      throw error;
    }
  }
  async function beginReset(raw: unknown) {
    ready();
    const input = z.object({ email: emailInput }).strict().parse(raw);
    await requestBudget(input.email);
    const user = await client.user.findUnique({ where: { email: input.email }, include: { person: { select: { metadata: true, status: true } } } });
    if (!user || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || accountPortalRealm(user.person.metadata) !== "jobs" || !user.passwordHash) return { challengeId: randomUUID() };
    try { await requirePortalAccess(client, user.id, "jobs"); }
    catch (error) { if (error instanceof AccessError) return { challengeId: randomUUID() }; throw error; }
    try { return await dispatch(user, "RESET"); }
    catch (error) { if (error instanceof EmailAuthUnavailable) return { challengeId: randomUUID() }; throw error; }
  }
  async function completeReset(raw: unknown) {
    const settings = ready(), input = resetInput.parse(raw);
    await consume("nicejobs:otp:verify:global", 120, 60);
    const attempted = await client.emailAuthChallenge.updateMany({ where: { id: input.challengeId, purpose: "RESET", status: "SENT", expiresAt: { gt: now() }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    if (attempted.count !== 1) throw new AccessError("Invalid or expired code");
    const passwordHash = await hashPassword(input.password);
    await client.$transaction(async db => {
      const challenge = await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: input.challengeId } });
      const user = await db.user.findUnique({ where: { id: challenge.userId }, include: { person: { select: { metadata: true, status: true } } } });
      if (!user || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || accountPortalRealm(user.person.metadata) !== "jobs") throw new AccessError("Invalid or expired code");
      const scope = await requirePortalAccess(db, user.id, "jobs");
      await claimJobsOtp(db, { challengeId: input.challengeId, code: input.code, pepper: settings.NICEJOBS_OTP_SECRET }, user, "RESET", now());
      await db.user.update({ where: { id: user.id }, data: { passwordHash, emailVerifiedAt: now() } });
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: user.id, actorPersonId: user.personId, organizationId: scope.divisionId, action: "auth.password_reset", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { portal: "jobs", challengeId: input.challengeId } }) });
    });
  }
  async function beginRegistration(userId: string) {
    ready();
    const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.jobsPinHash || user.emailVerifiedAt) throw new AccessError("Account unavailable");
    await requestBudget(user.email);
    return dispatch(user, "REGISTER");
  }
  async function resendRegistration(raw: unknown) {
    ready();
    const input = z.object({ country: z.string(), nationalNumber: z.string(), pin: jobsPinInput }).strict().parse(raw);
    const phone = jobsPhoneInput.parse({ country: input.country, nationalNumber: input.nationalNumber });
    await consume("nicejobs:registration-resend:global", 30, 60);
    await consume(securityKey("nicejobs:registration-resend:phone", phone), 3, 3600);
    const user = await client.user.findUnique({ where: { jobsPhone: phone }, include: { person: { select: { metadata: true, status: true } } } });
    if (!user || !user.jobsPinHash || user.emailVerifiedAt || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || accountPortalRealm(user.person?.metadata) !== "jobs" || !await verifyJobsPin(input.pin, user.jobsPinHash)) return { challengeId: randomUUID() };
    try { return await beginRegistration(user.id); }
    catch (error) { if (error instanceof EmailAuthUnavailable) return { challengeId: randomUUID() }; throw error; }
  }
  async function changeRegistrationEmail(raw: unknown) {
    ready();
    const input = z.object({ country: z.string(), nationalNumber: z.string(), pin: jobsPinInput, email: emailInput }).strict().parse(raw);
    const phone = jobsPhoneInput.parse({ country: input.country, nationalNumber: input.nationalNumber });
    await consume("nicejobs:registration-email:global", 30, 60);
    await consume(securityKey("nicejobs:registration-email:phone", phone), 3, 3600);
    await requestBudget(input.email);
    const candidate = await client.user.findUnique({ where: { jobsPhone: phone }, include: { person: { select: { id: true, metadata: true, status: true } } } });
    if (!candidate?.jobsPinHash || !await verifyJobsPin(input.pin, candidate.jobsPinHash)) return { challengeId: randomUUID() };
    try {
      const updated = await client.$transaction(async db => {
        const user = await db.user.findUnique({ where: { id: candidate.id }, include: { person: { select: { id: true, metadata: true, status: true } } } });
        if (!user?.person || !user.jobsPinHash || user.jobsPinHash !== candidate.jobsPinHash || user.jobsPhone !== phone || user.emailVerifiedAt || user.email === input.email || user.status !== "ACTIVE" || user.person.status !== "ACTIVE" || accountPortalRealm(user.person.metadata) !== "jobs" || JSON.parse(user.person.metadata ?? "{}").identitySource !== "SELF_REGISTRATION") throw new AccessError("Email change unavailable");
        const scope = await requirePortalAccess(db, user.id, "jobs");
        if (await db.user.findUnique({ where: { email: input.email } }) || await db.person.findUnique({ where: { email: input.email } })) throw new AccessError("Email change unavailable");
        const changed = await db.user.update({ where: { id: user.id }, data: { email: input.email }, select: { id: true, email: true, passwordHash: true, jobsPinHash: true } });
        await db.person.update({ where: { id: user.person.id }, data: { email: input.email } });
        await db.emailAuthChallenge.updateMany({ where: { userId: user.id, status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
        await db.session.deleteMany({ where: { userId: user.id } });
        await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: user.id, actorPersonId: user.person.id, organizationId: scope.divisionId, action: "auth.registration_email_changed", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { portal: "jobs", emailVerified: false } }) });
        return changed;
      });
      try { return await dispatch(updated, "REGISTER"); }
      catch (error) { if (error instanceof EmailAuthUnavailable) return { deliveryPending: true as const }; throw error; }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new AccessError("Email change unavailable");
      throw error;
    }
  }
  async function completeRegistration(raw: unknown, secret: string) {
    const settings = ready(), proof = proofInput.parse(raw);
    await consume("nicejobs:otp:verify:global", 120, 60);
    const challenge = await client.emailAuthChallenge.findUnique({ where: { id: proof.challengeId } });
    if (!challenge || challenge.purpose !== "REGISTER") throw new AccessError("Invalid or expired code");
    return auth.create(challenge.userId, secret, undefined, 8 * 3600000, "jobs", { ...proof, pepper: settings.NICEJOBS_OTP_SECRET, purpose: "REGISTER" });
  }
  async function beginPinReset(raw: unknown) {
    ready();
    const input = z.object({ country: z.string(), nationalNumber: z.string() }).strict().parse(raw);
    const phone = jobsPhoneInput.parse(input);
    await consume("nicejobs:pin-reset:global", 30, 60);
    await consume(securityKey("nicejobs:pin-reset:phone", phone), 3, 3600);
    const user = await client.user.findUnique({ where: { jobsPhone: phone }, include: { person: { select: { metadata: true, status: true } } } });
    if (!user || !user.jobsPinHash || !user.emailVerifiedAt || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || accountPortalRealm(user.person?.metadata) !== "jobs") return { challengeId: randomUUID() };
    try { await requirePortalAccess(client, user.id, "jobs"); return await dispatch(user, "RESET_PIN"); }
    catch (error) { if (error instanceof AccessError || error instanceof EmailAuthUnavailable) return { challengeId: randomUUID() }; throw error; }
  }
  async function completePinReset(raw: unknown) {
    const settings = ready(), input = proofInput.extend({ pin: jobsPinInput, confirmPin: jobsPinInput }).refine(value => value.pin === value.confirmPin).parse(raw);
    await consume("nicejobs:otp:verify:global", 120, 60);
    const attempted = await client.emailAuthChallenge.updateMany({ where: { id: input.challengeId, purpose: "RESET_PIN", status: "SENT", expiresAt: { gt: now() }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    if (attempted.count !== 1) throw new AccessError("Invalid or expired code");
    const jobsPinHash = await hashJobsPin(input.pin);
    const recipient = await client.$transaction(async db => {
      const challenge = await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: input.challengeId } });
      const user = await db.user.findUnique({ where: { id: challenge.userId }, include: { person: { select: { metadata: true, status: true } } } });
      if (!user || !user.jobsPinHash || !user.emailVerifiedAt || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || accountPortalRealm(user.person?.metadata) !== "jobs") throw new AccessError("Invalid or expired code");
      const scope = await requirePortalAccess(db, user.id, "jobs");
      await claimJobsOtp(db, { challengeId: input.challengeId, code: input.code, pepper: settings.NICEJOBS_OTP_SECRET }, user, "RESET_PIN", now());
      await db.user.update({ where: { id: user.id }, data: { jobsPinHash } });
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.emailAuthChallenge.updateMany({ where: { userId: user.id, status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: user.id, actorPersonId: user.personId, organizationId: scope.divisionId, action: "auth.pin_reset", entityType: "User", entityId: user.id, result: "SUCCESS", metadata: { portal: "jobs", challengeId: input.challengeId } }) });
      return user.email;
    });
    try { await notifyPinChange(input.challengeId, recipient); }
    catch {
      await client.auditEvent.create({ data: buildAuditEventData({ action: "auth.pin_reset_notice_failed", entityType: "EmailAuthChallenge", entityId: input.challengeId, result: "FAILURE", metadata: { portal: "jobs" } }) });
    }
  }
  return { ready, beginLogin, completeLogin, beginReset, completeReset, beginRegistration, resendRegistration, changeRegistrationEmail, completeRegistration, beginPinReset, completePinReset };
}
export const jobsEmailAuth = createJobsEmailAuth();
