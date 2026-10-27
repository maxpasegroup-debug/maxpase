import { describe, expect, it } from "vitest";
import { bossProvisionDiagnostic } from "@/server/group/provision-diagnostic";

describe("Boss provisioning diagnostics", () => {
  it("classifies missing schema separately without exposing database details", () => {
    const detail = "secret-pin database-password private-host";
    const diagnostic = bossProvisionDiagnostic({ code: "P2021", message: detail, meta: { table: "public.User" } }, "provisioning");
    expect(diagnostic.code).toBe("database_schema_missing");
    expect(diagnostic.schemaTarget).toBe("User");
    expect(diagnostic.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(diagnostic)).not.toContain(detail);
    expect(JSON.stringify(diagnostic)).not.toContain("private-host");
  });

  it("reports only a known missing column and rejects arbitrary Prisma metadata", () => {
    expect(bossProvisionDiagnostic({ code: "P2022", meta: { column: "public.User.emailVerifiedAt" } }, "provisioning").schemaTarget).toBe("User.emailVerifiedAt");
    expect(bossProvisionDiagnostic({ code: "P2021", meta: { table: "postgresql://User/secret" } }, "provisioning").schemaTarget).toBeUndefined();
    expect(bossProvisionDiagnostic({ code: "P2021", meta: { table: "private-host-secret" } }, "provisioning").schemaTarget).toBeUndefined();
    expect(bossProvisionDiagnostic({ code: "P2022", meta: { column: "public.User.privateSecret" } }, "provisioning").schemaTarget).toBeUndefined();
  });

  it.each([
    ["P1001", "database_unreachable"],
    ["P1000", "database_access_denied"],
    ["P2002", "boss_provisioning_failed"],
  ])("classifies Prisma %s as %s", (prismaCode, expected) => {
    expect(bossProvisionDiagnostic({ code: prismaCode }, "provisioning").code).toBe(expected);
  });

  it("reports configuration failures without exposing their input", () => {
    expect(bossProvisionDiagnostic(new Error("secret configuration"), "configuration").code).toBe("boss_configuration_invalid");
  });
});
