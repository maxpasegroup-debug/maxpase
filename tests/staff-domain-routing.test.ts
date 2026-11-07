import { describe, expect, it } from "vitest";
import { staffPortalForRole, isPreparedStaffRole, labsStaffViewsForRole, hasStaffWorkspaceCapabilities } from "@/server/skillcity/staff-roles";
import { siteByHost } from "@/server/portals/sites";
import { marketingDivisionSlug } from "@/server/group/brand-marketing-scope";
import { administrativeOfficerRolePermissions, labsDeveloperRolePermissions } from "@/server/skillcity/role-templates";

describe("AIRA staff domain routing", () => {
  it("routes prepared Labs employee roles to Labs and keeps their scope separate", () => {
    for (const key of ["labs-software-developer", "labs-full-stack-developer", "labs-junior-developer", "labs-business-development-manager"]) {
      expect(isPreparedStaffRole(key, "aira-labs")).toBe(true);
      expect(isPreparedStaffRole(key, "aira-startup-school")).toBe(false);
      expect(staffPortalForRole(key)).toBe("labs");
    }
    expect(siteByHost("airalabs.online")?.id).toBe("labs");
  });

  it("keeps Labs employee views scoped to their verified role", () => {
    for (const key of ["labs-software-developer", "labs-full-stack-developer", "labs-junior-developer"]) expect(labsStaffViewsForRole(key)).toEqual(["developer"]);
    expect(labsStaffViewsForRole("labs-business-development-manager")).toEqual(["overview", "sales", "people"]);
    expect(labsStaffViewsForRole("labs-customer")).toEqual([]);
    expect(hasStaffWorkspaceCapabilities("labs-business-development-manager", ["organization.read", "labs.sales.self", "labs.sales.read", "labs.sales.manage"])).toBe(false);
    expect(hasStaffWorkspaceCapabilities("labs-business-development-manager", ["organization.read", "notification.read", "labs.sales.self", "labs.sales.read", "labs.sales.manage"])).toBe(true);
    expect(hasStaffWorkspaceCapabilities("labs-full-stack-developer", labsDeveloperRolePermissions)).toBe(true);
    for (const forbidden of ["labs.billing.read", "labs.billing.manage", "labs.billing.review", "labs.billing.issue", "labs.billing.payment", "labs.billing.reconcile", "labs.sales.read", "labs.sales.manage", "person.read", "membership.manage"]) expect(labsDeveloperRolePermissions).not.toContain(forbidden);
  });

  it("keeps directors and advisors in the Skill City workplace", () => {
    for (const key of ["aira-03", "aira-26", "aira-administrative-officer", "labs-division-director", "labs-junior-academic-advisor"]) {
      expect(staffPortalForRole(key)).toBe("skillcity");
    }
    expect(siteByHost("airaskillcity.com")?.id).toBe("skillcity");
    expect(isPreparedStaffRole("aira-administrative-officer", "aira-skill-city")).toBe(true);
    expect(isPreparedStaffRole("aira-administrative-officer", "aira-labs")).toBe(false);
    expect(hasStaffWorkspaceCapabilities("aira-administrative-officer", ["organization.read"])).toBe(false);
    expect(hasStaffWorkspaceCapabilities("aira-administrative-officer", administrativeOfficerRolePermissions)).toBe(true);
    const aoPermissions: readonly string[] = administrativeOfficerRolePermissions;
    for (const forbidden of ["program.manage", "labs.sales.read", "person.read", "membership.manage", "labs.billing.manage", "labs.billing.review", "labs.billing.issue", "labs.billing.payment", "labs.billing.reconcile"]) expect(aoPermissions).not.toContain(forbidden);
  });
  it("maps registered top-level brand slugs to the prepared AIRA divisions", () => {
    for (const [brand, division] of [["startup-school", "aira-startup-school"], ["aira-skill-studio", "aira-skill-studio"], ["aira-labs", "aira-labs"], ["aira-career-hub", "aira-career-hub"]]) {
      expect(marketingDivisionSlug(brand)).toBe(division);
    }
    expect(marketingDivisionSlug("unknown-brand")).toBeUndefined();
  });
});
