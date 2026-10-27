import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createPostgresFixture } from "./helpers/postgres-fixture";
import { bossProvisionDiagnostic } from "@/server/group/provision-diagnostic";
import { verifyDatabaseReadiness } from "@/server/security/readiness";
import { Prisma } from "@prisma/client";
const fixture = createPostgresFixture(); const db = fixture.db;
beforeAll(() => fixture.initialize(), 120000);
afterAll(() => fixture.dispose(), 30000);
describe("real PostgreSQL recovery diagnostics and readiness", () => {
  it("classifies a real missing table without logging the raw error", async () => {
    await db.$executeRawUnsafe('ALTER TABLE "User" RENAME TO "RecoveryUser"');
    try {
      const error = await db.user.findFirst().then(() => undefined, error => error);
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      const diagnostic = bossProvisionDiagnostic(error, "provisioning");
      expect(diagnostic).toMatchObject({ code: "database_schema_missing", prismaCode: "P2021", schemaTarget: "User" });
      expect(diagnostic.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    } finally { await db.$executeRawUnsafe('ALTER TABLE "RecoveryUser" RENAME TO "User"'); }
  });
  it("classifies a real missing column and fails readiness", async () => {
    await db.$executeRawUnsafe('ALTER TABLE "User" RENAME COLUMN "emailVerifiedAt" TO "recoveryMissingColumn"');
    try {
      const error = await db.user.findFirst().then(() => undefined, error => error);
      expect(error.code).toBe("P2022");
      expect(bossProvisionDiagnostic(error, "provisioning")).toMatchObject({code: "database_schema_missing", schemaTarget: "User.emailVerifiedAt"});
      await expect(verifyDatabaseReadiness(db)).rejects.toThrow("Schema unavailable");
    } finally { await db.$executeRawUnsafe('ALTER TABLE "User" RENAME COLUMN "recoveryMissingColumn" TO "emailVerifiedAt"'); }
    await verifyDatabaseReadiness(db);
  });
  it("detects each of the thirteen disabled safeguards and restores on rollback", async () => {
    const triggers = await db.$queryRaw<{name:string;table:string}[]>`SELECT t.tgname AS name,c.relname AS table FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname NOT LIKE 'maxpase_test_%'`;
    expect(triggers).toHaveLength(13);
    for (const trigger of triggers) {
      expect(/^[A-Za-z_][A-Za-z0-9_]*$/.test(trigger.name + trigger.table)).toBe(true);
      await expect(db.$transaction(async tx => {
        await tx.$executeRawUnsafe('ALTER TABLE "'+trigger.table+'" DISABLE TRIGGER "'+trigger.name+'"');
        await expect(verifyDatabaseReadiness(tx)).rejects.toThrow("Database safeguards unavailable");
        throw new Error("rollback safeguard rehearsal");
      })).rejects.toThrow("rollback safeguard rehearsal");
      await verifyDatabaseReadiness(db);
    }
    await fixture.assertIntegrity();
  });
});
