import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Nice Jobs phone/PIN additive migration", () => {
  it("preserves legacy users and outstanding email challenges", () => {
    const directory = mkdtempSync(join(tmpdir(), "nicejobs-pin-migration-"));
    const file = join(directory, "test.db"), sql = new DatabaseSync(file);
    try {
      const folders = readdirSync("prisma/migrations").filter(name => /^\d/.test(name)).sort();
      for (const folder of folders.filter(name => name !== "20261020090000_nicejobs_phone_pin")) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
      sql.prepare('INSERT INTO "User" ("id", "email", "passwordHash", "status", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)').run("legacy-user", "legacy@test.invalid", "existing-hash", "ACTIVE");
      sql.prepare('INSERT INTO "EmailAuthChallenge" ("id", "userId", "email", "purpose", "otpHash", "credentialHash", "status", "attempts", "expiresAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run("legacy-challenge", "legacy-user", "legacy@test.invalid", "LOGIN", "existing-otp-hash", "existing-hash", "SENT", 2, "2026-10-20 12:00:00");
      sql.exec(readFileSync("prisma/migrations/20261020090000_nicejobs_phone_pin/migration.sql", "utf8"));
      expect(sql.prepare('SELECT "id", "email", "passwordHash", "jobsPhone", "jobsPinHash" FROM "User" WHERE "id" = ?').get("legacy-user")).toEqual({ id: "legacy-user", email: "legacy@test.invalid", passwordHash: "existing-hash", jobsPhone: null, jobsPinHash: null });
      expect(sql.prepare('SELECT "id", "userId", "purpose", "otpHash", "attempts" FROM "EmailAuthChallenge" WHERE "id" = ?').get("legacy-challenge")).toEqual({ id: "legacy-challenge", userId: "legacy-user", purpose: "LOGIN", otpHash: "existing-otp-hash", attempts: 2 });
      expect(() => sql.prepare('INSERT INTO "User" ("id", "email", "jobsPhone", "status", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)').run("duplicate", "other@test.invalid", "+919876543210", "ACTIVE")).not.toThrow();
      expect(() => sql.prepare('INSERT INTO "User" ("id", "email", "jobsPhone", "status", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)').run("duplicate2", "other2@test.invalid", "+919876543210", "ACTIVE")).toThrow();
    } finally { sql.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
