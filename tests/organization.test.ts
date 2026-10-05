import { describe, expect, it } from "vitest";
import { canNestOrganization } from "@/server/domain/organization";

describe("organization hierarchy", () => {
  it("allows group to contain companies", () => {
    expect(canNestOrganization("GROUP", "COMPANY")).toBe(true);
  });

  it("prevents a company from becoming the parent of the group", () => {
    expect(canNestOrganization("COMPANY", "GROUP")).toBe(false);
  });
});
