import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
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
import { createResendOtpSender, emailAuthSettings, type OtpDelivery } from "@/server/auth/resend-otp";
import { hashPassword, verifyPassword } from "@/server/auth/password";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-email-auth-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const secret = randomBytes(32).toString("hex"), password = randomBytes(24).toString("hex");
const env = { NICEJOBS_EMAIL_AUTH_ENABLED: "true", RESEND_API_KEY: "isolated-key-not-live", NICEJOBS_AUTH_FROM: "auth@test.invalid", NICEJOBS_OTP_SECRET: secret };
let clock: Date, userId: string, personId: string, membershipId: string, messages: OtpDelivery[];
const send = async (message: OtpDelivery) => { messages.push(message); return "isolated-provider-receipt"; };
const auth = createAuthenticationService(db, () => clock), service = createJobsEmailAuth(db, { now: () => clock, env, send });
const credentials = { email: "otp-applicant@test.invalid", password };
const latest = () => messages[messages.length - 1];
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close(); await db.$transaction(initializeGroupStructure);
  for (const key of applicantPermissionKeys) await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key, scope: "GROUP" } });
  userId = (await createApplicantAccess(db).register({ displayName: "Isolated applicant", ...credentials, confirmPassword: password, acknowledge: true })).userId;
  personId = (await db.user.findUniqueOrThrow({ where: { id: userId } })).personId!;
  membershipId = (await db.membership.findFirstOrThrow({ where: { personId } })).id;
}, 30000);
beforeEach(async () => {
  clock = new Date("2026-10-10T08:00:00Z"); messages = [];
  await db.session.deleteMany(); await db.emailAuthChallenge.deleteMany(); await db.securityRateBucket.deleteMany();
  await db.membership.update({ where: { id: membershipId }, data: { status: "ACTIVE" } });
  await db.user.update({ where: { id: userId }, data: { email: credentials.email, passwordHash: await hashPassword(password), emailVerifiedAt: null, status: "ACTIVE" } });
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
describe("Nice Jobs email OTP authentication", () => {
  it("requires password plus a single-use email proof; preserves least privilege and realm isolation", async () => {
    expect(await auth.loginPortal(credentials, secret, "jobs")).toBeNull();
    await expect(auth.create(userId, secret, undefined, 300000, "jobs")).rejects.toThrow();
    const proof = await service.beginLogin(credentials);
    expect(await db.session.count()).toBe(0);
    const stored = await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: proof.challengeId } });
    expect(stored.otpHash).not.toBe(latest().code); expect(stored.otpHash).toHaveLength(64);
    const session = await service.completeLogin({ ...proof, code: latest().code }, secret);
    expect(await auth.validate(session.token, secret, "jobs")).toMatchObject({ userId });
    for (const realm of [undefined, "labs", "startup", "skillcity"] as const) expect(await auth.validate(session.token, secret, realm)).toBeNull();
    await expect(service.completeLogin({ ...proof, code: latest().code }, secret)).rejects.toThrow();
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).not.toBeNull();
    expect(await db.membershipRole.count({ where: { membershipId } })).toBe(1);
    const audit = await db.auditEvent.findMany({ where: { action: { startsWith: "auth.otp" } } });
    expect(JSON.stringify(audit)).not.toContain(latest().code);
  });
  it("rejects wrong codes after five attempts and rejects expired and wrong-purpose proofs", async () => {
    const proof = await service.beginLogin(credentials);
    const wrong = latest().code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await expect(service.completeLogin({ ...proof, code: wrong }, secret)).rejects.toThrow();
    await expect(service.completeLogin({ ...proof, code: latest().code }, secret)).rejects.toThrow();
    expect((await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: proof.challengeId } })).attempts).toBe(5);
    clock = new Date(clock.getTime() + 3600000);
    const reset = await service.beginReset({ email: credentials.email });
    await expect(service.completeLogin({ ...reset, code: latest().code }, secret)).rejects.toThrow();
    clock = new Date(clock.getTime() + 600001);
    await expect(service.completeReset({ ...reset, code: latest().code, password, confirmPassword: password })).rejects.toThrow();
  });
  it("enforces resend cooldown, cancels superseded codes and bounds account send budgets", async () => {
    const first = await service.beginLogin(credentials), firstCode = latest().code;
    await expect(service.beginLogin(credentials)).rejects.toThrow("Too many requests");
    clock = new Date(clock.getTime() + 60001);
    await service.beginLogin(credentials);
    await expect(service.completeLogin({ ...first, code: firstCode }, secret)).rejects.toThrow();
    clock = new Date(clock.getTime() + 60001); await service.beginLogin(credentials);
    clock = new Date(clock.getTime() + 60001); await expect(service.beginLogin(credentials)).rejects.toThrow("Too many requests");
    expect(messages).toHaveLength(3);
  });
  it("returns opaque challenges for unknown credentials/accounts and cannot reset corporate accounts", async () => {
    const unknown = await service.beginLogin({ email: "unknown@test.invalid", password });
    expect(unknown.challengeId).toMatch(/^[a-f0-9-]{36}$/); expect(messages).toHaveLength(0);
    await service.beginReset({ email: "missing@test.invalid" }); expect(messages).toHaveLength(0);
    await db.user.create({ data: { email: "corporate-reset@test.invalid", passwordHash: await hashPassword(password) } });
    await service.beginReset({ email: "corporate-reset@test.invalid" }); expect(messages).toHaveLength(0);
  });
  it("resets only the bound account, revokes sessions and cancels other outstanding proofs", async () => {
    const login = await service.beginLogin(credentials);
    const session = await service.completeLogin({ ...login, code: latest().code }, secret);
    clock = new Date(clock.getTime() + 60001);
    const reset = await service.beginReset({ email: credentials.email });
    const replacement = randomBytes(24).toString("hex");
    await service.completeReset({ ...reset, code: latest().code, password: replacement, confirmPassword: replacement });
    expect(await auth.validate(session.token, secret, "jobs")).toBeNull();
    expect(await verifyPassword(replacement, (await db.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash!)).toBe(true);
    await expect(service.completeReset({ ...reset, code: latest().code, password: replacement, confirmPassword: replacement })).rejects.toThrow();
    expect(await db.auditEvent.count({ where: { action: "auth.password_reset", actorUserId: userId } })).toBe(1);
  });
  it("rechecks current membership, account and credential/email binding at completion", async () => {
    const proof = await service.beginLogin(credentials);
    await db.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } });
    await expect(service.completeLogin({ ...proof, code: latest().code }, secret)).rejects.toThrow();
    await db.membership.update({ where: { id: membershipId }, data: { status: "ACTIVE" } });
    await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword("changed-password-123") } });
    await expect(service.completeLogin({ ...proof, code: latest().code }, secret)).rejects.toThrow();
    expect(await db.session.count()).toBe(0);
  });
  it("permits only one effect for concurrent login confirmations", async () => {
    const proof = await service.beginLogin(credentials), input = { ...proof, code: latest().code };
    const results = await Promise.allSettled([service.completeLogin(input, secret), service.completeLogin(input, secret)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.session.count()).toBe(1);
  });
  it("denies stale email bindings and suspended accounts without issuing sessions", async () => {
    const proof = await service.beginLogin(credentials), code = latest().code;
    await db.user.update({ where: { id: userId }, data: { email: "changed-otp-email@test.invalid" } });
    await expect(service.completeLogin({ ...proof, code }, secret)).rejects.toThrow();
    await db.user.update({ where: { id: userId }, data: { email: credentials.email, status: "SUSPENDED" } });
    await expect(service.completeLogin({ ...proof, code }, secret)).rejects.toThrow();
    expect(await db.session.count()).toBe(0);
  });
  it("allows only one concurrent password reset effect", async () => {
    const proof = await service.beginReset({ email: credentials.email });
    const input = { ...proof, code: latest().code, password: "replacement-test-password-123", confirmPassword: "replacement-test-password-123" };
    const count = await db.auditEvent.count({ where: { action: "auth.password_reset" } });
    const results = await Promise.allSettled([service.completeReset(input), service.completeReset(input)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { action: "auth.password_reset" } })).toBe(count + 1);
  });
  it("invalidates a Jobs session when its verified email no longer matches the account", async () => {
    const proof = await service.beginLogin(credentials);
    const session = await service.completeLogin({ ...proof, code: latest().code }, secret);
    expect(await auth.validate(session.token, secret, "jobs")).not.toBeNull();
    await db.user.update({ where: { id: userId }, data: { email: "changed-session-email@test.invalid" } });
    expect(await auth.validate(session.token, secret, "jobs")).toBeNull();
  });
  it("rolls back proof consumption, verification and session issuance on audit failure", async () => {
    const proof = await service.beginLogin(credentials);
    const sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER OtpAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'auth.login' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    try {
      await expect(service.completeLogin({ ...proof, code: latest().code }, secret)).rejects.toThrow();
      expect(await db.session.count()).toBe(0);
      expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).toBeNull();
      expect((await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: proof.challengeId } })).status).toBe("SENT");
    } finally { sql.exec("DROP TRIGGER OtpAuditFailure"); sql.close(); }
  });
  it("rolls back password, revocation and reset consumption if audit fails", async () => {
    const proof = await service.beginReset({ email: credentials.email }), code = latest().code;
    const prior = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await db.session.create({ data: { userId, expiresAt: new Date(clock.getTime() + 3600000) } });
    const sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER ResetAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'auth.password_reset' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    try {
      await expect(service.completeReset({ ...proof, code, password: "new-test-password-123", confirmPassword: "new-test-password-123" })).rejects.toThrow();
      expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash).toBe(prior.passwordHash);
      expect(await db.session.count()).toBe(1);
      expect((await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: proof.challengeId } })).status).toBe("SENT");
    } finally { sql.exec("DROP TRIGGER ResetAuditFailure"); sql.close(); }
  });
  it("fails closed without configuration and records unusable challenges on delivery failure", async () => {
    expect(() => emailAuthSettings({})).toThrow();
    const unavailable = createJobsEmailAuth(db, { env: {}, send });
    await expect(unavailable.beginLogin(credentials)).rejects.toThrow(); expect(messages).toHaveLength(0);
    const failed = createJobsEmailAuth(db, { env, now: () => clock, send: async () => { throw new Error("not delivered"); } });
    await expect(failed.beginLogin(credentials)).rejects.toThrow("temporarily unavailable");
    expect((await db.emailAuthChallenge.findFirstOrThrow({ where: { userId } })).status).toBe("FAILED");
  });
});
describe("Resend OTP transport (mocked HTTP only)", () => {
  it("uses the fixed endpoint, bounded signal, idempotency key and strict provider receipt", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ id: "receipt" }), { status: 200 }));
    const message: OtpDelivery = { id: "test-request", email: "recipient@test.invalid", code: "123456", purpose: "LOGIN" };
    expect(await createResendOtpSender(env, transport as typeof fetch)(message)).toBe("receipt");
    const [url, request] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails"); expect(request.redirect).toBe("error"); expect(request.signal).toBeInstanceOf(AbortSignal);
    expect((request.headers as Record<string, string>)["Idempotency-Key"]).toBe("nicejobs-otp/test-request");
    expect(JSON.parse(request.body as string)).toMatchObject({ to: [message.email], from: env.NICEJOBS_AUTH_FROM });
  });
  it("does not retry rejected, malformed or timed-out responses", async () => {
    for (const response of [new Response("denied", { status: 403 }), new Response("{}", { status: 200 })]) {
      const transport = vi.fn(async () => response);
      await expect(createResendOtpSender(env, transport as typeof fetch)({ id: "test", email: "recipient@test.invalid", code: "123456", purpose: "RESET" })).rejects.toThrow("temporarily unavailable");
      expect(transport).toHaveBeenCalledTimes(1);
    }
    const transport = vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); });
    await expect(createResendOtpSender(env, transport as typeof fetch)({ id: "timeout", email: "recipient@test.invalid", code: "123456", purpose: "LOGIN" })).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
