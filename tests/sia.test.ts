import { describe, expect, it } from "vitest";
import { foundationalSiaTools } from "@/server/sia/contracts";

describe("SIA foundation", () => {
  it("defines controlled tools with permissions and approval policy", () => {
    expect(foundationalSiaTools.every((tool) => tool.requiredPermission && tool.scope)).toBe(true);
    expect(foundationalSiaTools.some((tool) => tool.requiresApproval)).toBe(true);
  });
});
