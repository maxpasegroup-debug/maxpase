import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { initializeGroupStructure } from "@/server/group/structure";
import { createApplicantAccess, applicantPermissionKeys } from "@/server/nicejobs/applicant-access";
import { createAuthenticationService } from "@/server/auth/service";
import { createJobsEmailAuth } from "@/server/auth/jobs-email-auth";
import { jobsPhoneInput } from "@/server/auth/jobs-phone";
import { hashJobsPin, verifyJobsPin } from "@/server/auth/jobs-pin";
import { createJobsPinActivation } from "@/server/auth/jobs-pin-activation";
import { hashPassword } from "@/server/auth/password";
import type { OtpDelivery } from "@/server/auth/resend-otp";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phone-pin-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const secret = randomBytes(32).toString("hex");
process.env.NICEJOBS_PIN_PEPPER = randomBytes(32).toString("hex");
const env = { NICEJOBS_EMAIL_AUTH_ENABLED: "true", RESEND_API_KEY: "isolated-not-live", NICEJOBS_AUTH_FROM: "auth@test.invalid", NICEJOBS_OTP_SECRET: secret };
const messages: OtpDelivery[] = [], notices: string[] = [];
let now = new Date("2026-10-20T09:00:00Z"), userId: string;
const service = createJobsEmailAuth(db, { now: () => now, env, send: async message => { messages.push(message); return "mock-receipt"; }, notifyPinChange: async (_id, email) => { notices.push(email); } });
const auth = createAuthenticationService(db, () => now);
const raw = { displayName: "Phone applicant", email: "phone@test.invalid", country: "IN", nationalNumber: "9876543210", pin: "123456", confirmPin: "123456", acknowledge: true };

beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(name => /^\d/.test(name)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close();
  await db.$transaction(initializeGroupStructure);
  for (const key of applicantPermissionKeys) await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key, scope: "GROUP" } });
  userId = (await createApplicantAccess(db).register(raw)).userId;
}, 30000);
beforeEach(async () => { now = new Date("2026-10-20T09:00:00Z"); messages.length = 0; notices.length = 0; await db.securityRateBucket.deleteMany(); await db.emailAuthChallenge.deleteMany(); await db.session.deleteMany(); await db.user.update({ where: { id: userId }, data: { email: raw.email, jobsPhone: "+919876543210", jobsPinHash: await hashJobsPin(raw.pin), passwordHash: null, emailVerifiedAt: null, status: "ACTIVE", person: { update: { email: raw.email } } } }); });
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Nice Jobs phone and PIN candidate authentication", () => {
  it("normalizes international numbers and rejects invalid or duplicate phones", async () => {
    expect(jobsPhoneInput.parse({ country: "IN", nationalNumber: "98765 43210" })).toBe("+919876543210");
    expect(jobsPhoneInput.parse({ country: "US", nationalNumber: "202-555-0123" })).toBe("+12025550123");
    expect(() => jobsPhoneInput.parse({ country: "IN", nationalNumber: "123" })).toThrow();
    await expect(createApplicantAccess(db).register({ ...raw, email: "other@test.invalid", nationalNumber: "98765 43210" })).rejects.toThrow();
    await expect(createApplicantAccess(db).register({ ...raw, email: "other@test.invalid", nationalNumber: "9876543211", pin: "12a456", confirmPin: "12a456" })).rejects.toThrow();
    await expect(createApplicantAccess(db).register({ ...raw, email: "other@test.invalid", nationalNumber: "9876543211", pin: "12345", confirmPin: "12345" })).rejects.toThrow();
  });
  it("requires email verification before PIN login; binds sessions to the jobs realm", async () => {
    expect(await auth.loginJobsPin({ country: "IN", nationalNumber: raw.nationalNumber, pin: raw.pin }, secret)).toBeNull();
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.jobsPinHash).toMatch(/^\$argon2id\$/);
    expect(await verifyJobsPin(raw.pin, user.jobsPinHash!)).toBe(true);
    const proof = await service.beginRegistration(userId);
    expect(messages.at(-1)?.purpose).toBe("REGISTER");
    const session = await service.completeRegistration({ ...proof, code: messages.at(-1)!.code }, secret);
    expect(await auth.validate(session.token, secret, "jobs")).toMatchObject({ userId });
    expect(await auth.validate(session.token, secret, "labs")).toBeNull();
    await expect(service.completeRegistration({ ...proof, code: messages.at(-1)!.code }, secret)).rejects.toThrow();
    expect(await auth.loginJobsPin({ country: "IN", nationalNumber: raw.nationalNumber, pin: "654321" }, secret)).toBeNull();
    expect(await auth.loginJobsPin({ country: "IN", nationalNumber: raw.nationalNumber, pin: raw.pin }, secret)).not.toBeNull();
  });
  it("recovers by registered email only and atomically revokes old sessions", async () => {
    const proof = await service.beginRegistration(userId);
    const session = await service.completeRegistration({ ...proof, code: messages.at(-1)!.code }, secret);
    now = new Date(now.getTime() + 61000);
    const reset = await service.beginPinReset({ country: "IN", nationalNumber: raw.nationalNumber });
    expect(messages.at(-1)?.purpose).toBe("RESET_PIN");
    const wrong = messages.at(-1)!.code === "000000" ? "111111" : "000000";
    await expect(service.completePinReset({ ...reset, code: wrong, pin: "654321", confirmPin: "654321" })).rejects.toThrow();
    await service.completePinReset({ ...reset, code: messages.at(-1)!.code, pin: "654321", confirmPin: "654321" });
    expect(await auth.validate(session.token, secret, "jobs")).toBeNull();
    expect(notices).toEqual([raw.email]);
    await expect(service.completePinReset({ ...reset, code: messages.at(-1)!.code, pin: "123456", confirmPin: "123456" })).rejects.toThrow();
    expect(await auth.loginJobsPin({ country: "IN", nationalNumber: raw.nationalNumber, pin: "654321" }, secret)).not.toBeNull();
  });
  it("returns opaque recovery challenges for unknown phones and throttles guessing", async () => {
    const result = await service.beginPinReset({ country: "IN", nationalNumber: "9876543219" });
    expect(result.challengeId).toMatch(/^[a-f0-9-]{36}$/);
    expect(messages).toHaveLength(0);
    for (let i = 0; i < 3; i++) expect(await auth.loginJobsPin({ country: "IN", nationalNumber: raw.nationalNumber, pin: "999999" }, secret)).toBeNull();
    await expect(auth.loginJobsPin({ country: "IN", nationalNumber: raw.nationalNumber, pin: raw.pin }, secret)).rejects.toThrow("Too many requests");
    now = new Date(now.getTime() + 61000);
    for (let i = 0; i < 2; i++) expect(await auth.loginJobsPin({ country: "IN", nationalNumber: raw.nationalNumber, pin: "999999" }, secret)).toBeNull();
    await expect(auth.loginJobsPin({ country: "IN", nationalNumber: raw.nationalNumber, pin: raw.pin }, secret)).rejects.toThrow("Too many requests");
  });
  it("rejects expired and purpose-mismatched codes, and bounds resend attempts", async () => {
    const registration = await service.beginRegistration(userId);
    const firstCode = messages.at(-1)!.code;
    await expect(service.beginRegistration(userId)).rejects.toThrow("Too many requests");
    now = new Date(now.getTime() + 600001);
    await expect(service.completeRegistration({ ...registration, code: firstCode }, secret)).rejects.toThrow();
    const fresh = await service.beginRegistration(userId);
    await service.completeRegistration({ ...fresh, code: messages.at(-1)!.code }, secret);
    now = new Date(now.getTime() + 61000);
    const reset = await service.beginPinReset({ country: "IN", nationalNumber: raw.nationalNumber });
    expect(messages.at(-1)?.purpose).toBe("RESET_PIN");
    await expect(service.completeRegistration({ ...reset, code: messages.at(-1)!.code }, secret)).rejects.toThrow();
  });
  it("does not enable verification after delivery failure", async () => {
    const failing = createJobsEmailAuth(db, { now: () => now, env, send: async () => { throw new Error("mock delivery failed"); } });
    await expect(failing.beginRegistration(userId)).rejects.toThrow("temporarily unavailable");
    expect((await db.emailAuthChallenge.findFirstOrThrow({ where: { userId } })).status).toBe("FAILED");
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).toBeNull();
  });
  it("corrects an unverified recovery email, cancels the old code and verifies only the new address", async () => {
    const old = await service.beginRegistration(userId);
    const oldCode = messages.at(-1)!.code;
    const corrected = await service.changeRegistrationEmail({ country: "IN", nationalNumber: raw.nationalNumber, pin: raw.pin, email: "corrected@test.invalid" });
    if (!("challengeId" in corrected)) throw new Error("Expected a new verification challenge");
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { person: true } });
    expect(user.email).toBe("corrected@test.invalid");
    expect(user.person?.email).toBe("corrected@test.invalid");
    expect(user.emailVerifiedAt).toBeNull();
    expect(messages.at(-1)?.email).toBe("corrected@test.invalid");
    expect((await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: old.challengeId } })).status).toBe("CANCELLED");
    await expect(service.completeRegistration({ ...old, code: oldCode }, secret)).rejects.toThrow();
    const session = await service.completeRegistration({ ...corrected, code: messages.at(-1)!.code }, secret);
    expect(await auth.validate(session.token, secret, "jobs")).toMatchObject({ userId });
    expect(await db.auditEvent.count({ where: { actorUserId: userId, action: "auth.registration_email_changed" } })).toBe(1);
    await expect(service.changeRegistrationEmail({ country: "IN", nationalNumber: raw.nationalNumber, pin: raw.pin, email: "another@test.invalid" })).rejects.toThrow();
  });
  it("does not change email with a wrong PIN or turn failed delivery into verification", async () => {
    const rejected = await service.changeRegistrationEmail({ country: "IN", nationalNumber: raw.nationalNumber, pin: "654321", email: "wrong@test.invalid" });
    if (!("challengeId" in rejected)) throw new Error("Expected an opaque challenge");
    expect(rejected.challengeId).toMatch(/^[a-f0-9-]{36}$/);
    expect(messages).toHaveLength(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).email).toBe(raw.email);
    const failing = createJobsEmailAuth(db, { now: () => now, env, send: async () => { throw new Error("mock delivery failed"); } });
    expect(await failing.changeRegistrationEmail({ country: "IN", nationalNumber: raw.nationalNumber, pin: raw.pin, email: "undelivered@test.invalid" })).toEqual({ deliveryPending: true });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { person: true } });
    expect(user.email).toBe("undelivered@test.invalid");
    expect(user.person?.email).toBe(user.email);
    expect(user.emailVerifiedAt).toBeNull();
    expect((await db.emailAuthChallenge.findFirstOrThrow({ where: { userId } })).status).toBe("FAILED");
    now = new Date(now.getTime() + 61000);
    const retry = await service.resendRegistration({ country: "IN", nationalNumber: raw.nationalNumber, pin: raw.pin });
    expect(messages.at(-1)?.email).toBe("undelivered@test.invalid");
    expect(await service.completeRegistration({ ...retry, code: messages.at(-1)!.code }, secret)).toBeTruthy();
  });
  it("rolls back an unverified email correction when audit persistence fails", async () => {
    const sql = new DatabaseSync(file);
    sql.exec("CREATE TRIGGER EmailChangeAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'auth.registration_email_changed' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    try {
      await expect(service.changeRegistrationEmail({ country: "IN", nationalNumber: raw.nationalNumber, pin: raw.pin, email: "rollback@test.invalid" })).rejects.toThrow();
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { person: true } });
      expect(user.email).toBe(raw.email);
      expect(user.person?.email).toBe(raw.email);
      expect(messages).toHaveLength(0);
    } finally { sql.exec("DROP TRIGGER EmailChangeAuditFailure"); sql.close(); }
  });
  it("allows only one concurrent PIN reset effect", async () => {
    const registration = await service.beginRegistration(userId);
    await service.completeRegistration({ ...registration, code: messages.at(-1)!.code }, secret);
    now = new Date(now.getTime() + 61000);
    const reset = await service.beginPinReset({ country: "IN", nationalNumber: raw.nationalNumber });
    const input = { ...reset, code: messages.at(-1)!.code, pin: "654321", confirmPin: "654321" };
    const results = await Promise.allSettled([service.completePinReset(input), service.completePinReset(input)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { actorUserId: userId, action: "auth.pin_reset" } })).toBeGreaterThan(0);
  });
  it("transitions a legacy candidate without changing identity and retires old credentials and sessions", async () => {
    const oldPassword = "legacy-test-password-123";
    await db.user.update({ where: { id: userId }, data: { jobsPhone: null, jobsPinHash: null, passwordHash: await hashPassword(oldPassword), emailVerifiedAt: now } });
    const oldSession = await db.session.create({ data: { userId, createdAt: now, expiresAt: new Date(now.getTime() + 3600000) } });
    const activate = createJobsPinActivation(db, () => now);
    await expect(activate("forged-user", oldSession.id, { country: "US", nationalNumber: "2025550123", pin: "654321", confirmPin: "654321" })).rejects.toThrow();
    await activate(userId, oldSession.id, { country: "US", nationalNumber: "2025550123", pin: "654321", confirmPin: "654321" });
    const current = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { person: true } });
    expect(current.jobsPhone).toBe("+12025550123"); expect(current.person?.phone).toBe("+12025550123");
    expect(current.passwordHash).toBeNull(); expect(current.jobsPinHash).toMatch(/^\$argon2id\$/);
    expect(await db.session.count({ where: { userId } })).toBe(0);
    await expect(activate(userId, oldSession.id, { country: "US", nationalNumber: "2025550123", pin: "654321", confirmPin: "654321" })).rejects.toThrow();
    expect(await auth.loginJobsPin({ country: "US", nationalNumber: "2025550123", pin: "654321" }, secret)).not.toBeNull();
  });
  it("rolls back legacy activation if the audit write fails", async () => {
    await db.user.update({ where: { id: userId }, data: { jobsPhone: null, jobsPinHash: null, passwordHash: await hashPassword("legacy-test-password-123"), emailVerifiedAt: now } });
    const oldSession = await db.session.create({ data: { userId, createdAt: now, expiresAt: new Date(now.getTime() + 3600000) } });
    const sql = new DatabaseSync(file);
    sql.exec("CREATE TRIGGER ActivationAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'auth.jobs_pin_activated' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    try {
      await expect(createJobsPinActivation(db, () => now)(userId, oldSession.id, { country: "US", nationalNumber: "2025550123", pin: "654321", confirmPin: "654321" })).rejects.toThrow();
      const current = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(current.jobsPhone).toBeNull(); expect(current.jobsPinHash).toBeNull(); expect(current.passwordHash).not.toBeNull();
      expect(await db.session.count({ where: { userId } })).toBe(1);
    } finally { sql.exec("DROP TRIGGER ActivationAuditFailure"); sql.close(); }
  });
  it("does not issue a session if the PIN hash changes after credential verification", async () => {
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
    const replacement = await hashJobsPin("654321");
    const racing = db.$extends({ query: { user: { async findUnique({ args, query }) {
      const result = await query(args);
      if (args.where.jobsPhone === "+919876543210") await db.user.update({ where: { id: userId }, data: { jobsPinHash: replacement } });
      return result;
    } } } });
    const result = await createAuthenticationService(racing as unknown as PrismaClient, () => now).loginJobsPin({ country: "IN", nationalNumber: raw.nationalNumber, pin: raw.pin }, secret);
    expect(result).toBeNull();
    expect(await db.session.count({ where: { userId } })).toBe(0);
  });
});
