import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { decodeJwt, SignJWT } from "jose";
import { createAuthenticationService } from "@/server/auth/service";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { validateRuntimeEnvironment } from "@/server/config";
import { createSecurityLimiter, securityKey } from "@/server/security/rate-limit";
import { validateActionOrigin } from "@/server/security/origin";

const directory = mkdtempSync(join(tmpdir(), "maxpase-hardening-")), path = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + path.replaceAll("\\", "/") });
const secret = "test-only-signing-secret-for-regression-32", password = "Test-auth-password-123!";
let time = new Date(), userId: string, personId: string;
const auth = createAuthenticationService(db, () => time);
beforeAll(async () => {
  const sql = new DatabaseSync(path);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  expect(sql.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]); sql.close();
  const person = await db.person.create({ data: { displayName: "Auth regression" } }); personId = person.id;
  userId = (await db.user.create({ data: { personId, email: "auth@test.invalid", passwordHash: await hashPassword(password) } })).id;
});
beforeEach(async () => {
  time = new Date();
  await db.securityRateBucket.deleteMany(); await db.session.deleteMany();
  await db.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
  await db.person.update({ where: { id: personId }, data: { status: "ACTIVE" } });
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("production configuration and origin boundaries", () => {
  it("rejects missing, example and insecure production configuration without revealing values", () => {
    for (const env of [{}, { DATABASE_URL: "file:/persistent/db", AUTH_SECRET: "dev-only-maxpase-phase-01-secret-key" }, { DATABASE_URL: "file:/persistent/db", AUTH_SECRET: secret, AUTH_COOKIE_SECURE: "false" }]) {
      expect(() => validateRuntimeEnvironment({ ...env, NODE_ENV: "production" })).toThrow("not securely configured");
    }
    expect(validateRuntimeEnvironment({ NODE_ENV: "production", DATABASE_URL: "file:/persistent/db", AUTH_SECRET: secret, APP_ORIGIN: "https://maxpase.test" }).AUTH_COOKIE_SECURE).toBe(true);
    for (const patch of [{ APP_ORIGIN: "http://maxpase.test" }, { DATABASE_URL: "file:./dev.db" }, { DEV_BOOTSTRAP_PASSWORD: "must-not-deploy" }]) expect(() => validateRuntimeEnvironment({ NODE_ENV: "production", DATABASE_URL: "file:/persistent/db", AUTH_SECRET: secret, APP_ORIGIN: "https://maxpase.test", ...patch })).toThrow("not securely configured");
    expect(validateRuntimeEnvironment({ NODE_ENV: "test" }).AUTH_COOKIE_SECURE).toBe(false);
  });
  it("enforces exact canonical origin and does not borrow spoofed host authority", () => {
    expect(() => validateActionOrigin("https://maxpase.test", "maxpase.test", "https://maxpase.test")).not.toThrow();
    for (const origin of [null, "null", "https://evil.test", "https://maxpase.test/path", "https://maxpase.test.evil.test"]) expect(() => validateActionOrigin(origin, "evil.test", "https://maxpase.test")).toThrow("Invalid request origin");
    expect(() => validateActionOrigin("http://127.0.0.1:3000", "127.0.0.1:3000")).not.toThrow();
  });
  it("rejects bcrypt truncation including multibyte passwords", async () => {
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(password + "wrong", hash)).toBe(false);
    await expect(hashPassword("\u00e9".repeat(37))).rejects.toThrow("72-byte");
    expect(await verifyPassword("\u00e9".repeat(37), hash)).toBe(false);
  });
});

describe("authentication, session lifecycle and audit integrity", () => {
  it("issues server-backed minimal tokens and an atomic success audit", async () => {
    const result = await auth.login({ email: "AUTH@test.invalid", password }, secret);
    expect(result).not.toBeNull();
    const payload = decodeJwt(result!.token);
    expect(payload).toMatchObject({ sub: userId, sessionId: result!.session.id });
    expect(payload).not.toHaveProperty("email"); expect(payload).not.toHaveProperty("personId");
    expect(await auth.validate(result!.token, secret)).toMatchObject({ userId, personId, email: "auth@test.invalid" });
    const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: result!.session.id } });
    expect(audit).toMatchObject({ action: "auth.login", actorUserId: userId, result: "SUCCESS" });
    expect(JSON.stringify(audit)).not.toContain(password); expect(JSON.stringify(audit)).not.toContain(result!.token);
  });
  it("denies missing accounts, wrong credentials and passwordless accounts generically", async () => {
    expect(await auth.login({ email: "missing@test.invalid", password }, secret)).toBeNull();
    expect(await auth.login({ email: "auth@test.invalid", password: "Wrong-password-123!" }, secret)).toBeNull();
    await db.user.create({ data: { email: "passwordless@test.invalid" } });
    expect(await auth.login({ email: "passwordless@test.invalid", password: "non-account-timing-comparison-only" }, secret)).toBeNull();
    expect(await db.session.count()).toBe(0);
    const denied = await db.auditEvent.findMany({ where: { result: "DENIED" } });
    expect(JSON.stringify(denied)).not.toContain("missing@test.invalid");
  });
  it("blocks disabled users and people on login and on every session validation", async () => {
    const result = await auth.create(userId, secret);
    await db.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    expect(await auth.validate(result.token, secret)).toBeNull(); expect(await auth.login({ email: "auth@test.invalid", password }, secret)).toBeNull();
    await db.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
    await db.person.update({ where: { id: personId }, data: { status: "ARCHIVED" } });
    expect(await auth.validate(result.token, secret)).toBeNull(); await expect(auth.create(userId, secret)).rejects.toThrow("Inactive");
  });
  it("rejects expired tokens, expired database sessions and revoked sessions", async () => {
    const result = await auth.create(userId, secret);
    await db.session.update({ where: { id: result.session.id }, data: { expiresAt: time } });
    expect(await auth.validate(result.token, secret)).toBeNull();
    await db.session.update({ where: { id: result.session.id }, data: { expiresAt: result.session.expiresAt } });
    time = new Date(time.getTime() + 8 * 86400000); expect(await auth.validate(result.token, secret)).toBeNull();
    time = new Date(); await auth.revoke(result.token, secret); expect(await auth.validate(result.token, secret)).toBeNull();
    expect(await db.auditEvent.count({ where: { action: "auth.logout", entityId: result.session.id } })).toBe(1);
    await auth.revoke(result.token, secret); expect(await db.auditEvent.count({ where: { action: "auth.logout", entityId: result.session.id } })).toBe(1);
  });
  it("rejects subject substitution, wrong signing keys, algorithms and audiences", async () => {
    const result = await auth.create(userId, secret);
    const forge = (algorithm: string, audience: string, subject: string) => new SignJWT({ sessionId: result.session.id }).setProtectedHeader({ alg: algorithm }).setSubject(subject).setIssuer("maxpase-os").setAudience(audience).setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    expect(await auth.validate(await forge("HS256", "maxpase-os-web", "another-user"), secret)).toBeNull();
    expect(await auth.validate(await forge("HS384", "maxpase-os-web", userId), secret)).toBeNull();
    expect(await auth.validate(await forge("HS256", "other-app", userId), secret)).toBeNull();
    expect(await auth.validate(result.token, secret + "wrong")).toBeNull(); expect(await auth.validate("malformed", secret)).toBeNull();
  });
  it("rolls session creation back when its mandatory audit fails", async () => {
    await db.$executeRawUnsafe("CREATE TRIGGER fail_auth_audit BEFORE INSERT ON AuditEvent WHEN NEW.action = 'auth.login' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
    try { await expect(auth.login({ email: "auth@test.invalid", password }, secret)).rejects.toThrow(); expect(await db.session.count()).toBe(0); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER fail_auth_audit"); }
  });
  it("does not silently revoke a session without its logout audit", async () => {
    const result = await auth.create(userId, secret);
    await db.$executeRawUnsafe("CREATE TRIGGER fail_logout_audit BEFORE INSERT ON AuditEvent WHEN NEW.action = 'auth.logout' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
    try { await expect(auth.revoke(result.token, secret)).rejects.toThrow(); expect(await auth.validate(result.token, secret)).not.toBeNull(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER fail_logout_audit"); }
  });
});

describe("persistent bounded abuse protection", () => {
  it("allows only the documented development audit exception and rejects unknown/runtime findings", () => {
    const file = join(directory, "audit-fixture.json");
    const run = (name: string, node: string) => {
      writeFileSync(file, JSON.stringify({ vulnerabilities: { [name]: { via: [{ url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }], nodes: [node] } } }));
      return execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/review-dependency-audit.ts", file], { stdio: "pipe" }).toString();
    };
    expect(run("braces", "node_modules/braces")).toContain("accepted development-only risk");
    expect(() => run("unknown-package", "node_modules/braces")).toThrow();
    expect(() => run("braces", "node_modules/next")).toThrow();
  });
  it("bounds concurrent requests, persists across service instances and resets only by window", async () => {
    const consume = createSecurityLimiter(db, () => time), key = securityKey("regression", userId);
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => consume(key, 3, 60)));
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(3);
    await expect(createSecurityLimiter(db, () => time)(key, 3, 60)).rejects.toThrow("Too many");
    expect((await db.securityRateBucket.findFirstOrThrow()).count).toBe(3);
    time = new Date(time.getTime() + 61000); await expect(consume(key, 3, 60)).resolves.toBeUndefined();
  });
  it("limits validly shaped account attempts without storing raw email or passwords", async () => {
    for (let i = 0; i < 8; i++) expect(await auth.login({ email: "limited@test.invalid", password }, secret)).toBeNull();
    await expect(auth.login({ email: "limited@test.invalid", password }, secret)).rejects.toThrow("Too many");
    expect(JSON.stringify(await db.securityRateBucket.findMany())).not.toContain("limited@test.invalid");
    expect(JSON.stringify(await db.auditEvent.findMany())).not.toContain(password);
  });
});
