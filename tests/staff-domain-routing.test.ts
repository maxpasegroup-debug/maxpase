import { describe, expect, it } from "vitest";
import { staffPortalForRole, isPreparedStaffRole } from "@/server/skillcity/staff-roles";
import { siteByHost } from "@/server/portals/sites";

describe("AIRA staff domain routing", () => {
  it("routes Labs-only employees to the Labs authentication realm", () => {
    for (const key of ["labs-full-stack-developer", "labs-junior-developer", "labs-business-development-manager"]) {
      expect(isPreparedStaffRole(key, "aira-labs")).toBe(true);
      expect(isPreparedStaffRole(key, "aira-startup-school")).toBe(false);
      expect(staffPortalForRole(key)).toBe("labs");
    }
    expect(siteByHost("airalabs.online")?.id).toBe("labs");
  });

  it("keeps directors and advisors in the Skill City workplace", () => {
    for (const key of ["aira-03", "aira-26", "labs-division-director", "labs-junior-academic-advisor"]) {
      expect(staffPortalForRole(key)).toBe("skillcity");
    }
    expect(siteByHost("airaskillcity.com")?.id).toBe("skillcity");
  });
});
