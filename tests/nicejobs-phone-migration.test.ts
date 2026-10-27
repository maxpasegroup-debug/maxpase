import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresFixture } from "./helpers/postgres-fixture";

const postgres = createPostgresFixture();
const db = postgres.db;

beforeAll(() => postgres.initialize(), 120000);
afterAll(() => postgres.dispose(), 30000);

describe("Nice Jobs PostgreSQL phone/PIN baseline", () => {
  it("preserves password accounts and outstanding email challenges alongside phone uniqueness", async () => {
    await db.user.create({ data: { id: "legacy-user", email: "legacy@test.invalid", passwordHash: "existing-hash", status: "ACTIVE" } });
    await db.emailAuthChallenge.create({ data: { id: "legacy-challenge", userId: "legacy-user", email: "legacy@test.invalid", purpose: "LOGIN", otpHash: "existing-otp-hash", credentialHash: "existing-hash", status: "SENT", attempts: 2, expiresAt: new Date("2026-10-20T12:00:00Z") } });
    expect(await db.user.findUniqueOrThrow({ where: { id: "legacy-user" }, select: { id: true, email: true, passwordHash: true, jobsPhone: true, jobsPinHash: true } })).toEqual({ id: "legacy-user", email: "legacy@test.invalid", passwordHash: "existing-hash", jobsPhone: null, jobsPinHash: null });
    expect(await db.emailAuthChallenge.findUniqueOrThrow({ where: { id: "legacy-challenge" }, select: { id: true, userId: true, purpose: true, otpHash: true, attempts: true } })).toEqual({ id: "legacy-challenge", userId: "legacy-user", purpose: "LOGIN", otpHash: "existing-otp-hash", attempts: 2 });
    await db.user.create({ data: { id: "duplicate", email: "other@test.invalid", jobsPhone: "+919876543210", status: "ACTIVE" } });
    await expect(db.user.create({ data: { id: "duplicate2", email: "other2@test.invalid", jobsPhone: "+919876543210", status: "ACTIVE" } })).rejects.toThrow();
    expect(await db.user.count({ where: { jobsPhone: "+919876543210" } })).toBe(1);
  });
});
