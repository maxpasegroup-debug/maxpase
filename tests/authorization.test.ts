import { describe, expect, it } from "vitest";
import { hasPermission, requirePermission } from "@/server/authorization/permissions";

const grants = [
  { key: "organization.read", scope: "GROUP" as const, organizationId: "group-1" },
  { key: "company.read", scope: "COMPANY" as const, organizationId: "company-1" }
];

describe("authorization", () => {
  it("allows a scoped permission for the matching organization", () => {
    expect(hasPermission(grants, { permission: "company.read", organizationId: "company-1" })).toBe(true);
  });

  it("denies a scoped permission for another organization", () => {
    expect(hasPermission(grants, { permission: "company.read", organizationId: "company-2" })).toBe(false);
  });

  it("throws when a required permission is missing", () => {
    expect(() => requirePermission(grants, { permission: "audit.read", organizationId: "group-1" })).toThrow(
      "Permission denied"
    );
  });
});
