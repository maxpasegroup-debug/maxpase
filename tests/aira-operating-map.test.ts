import { describe, expect, it } from "vitest";
import { commandBrandSlug, commandUnit } from "@/server/group/brand-command";
import { bossStructure } from "@/server/group/boss-structure";
import { skillStudioProgramDrafts } from "@/server/group/structure";

describe("AIRA operating map", () => {
  it("keeps the company workplace distinct from its four top-level brands", () => {
    expect(commandUnit("aira-skill-city", "aira-skill-city")?.label).toBe("AIRA Skill City");
    expect(commandBrandSlug("aira-skill-city", "aira-skill-city")).toBeNull();
    expect(bossStructure[0].brands.map(brand => brand.slug)).toEqual(["startup-school", "aira-skill-studio", "aira-labs", "aira-career-hub"]);
    expect(bossStructure[0].brands.map(brand => brand.slug)).not.toContain("aira-skill-city");
  });
  it("retains NiceJobs in Career Hub and maps OnSpeak to Labs", () => {
    expect(bossStructure[0].subBrands.find(brand => brand.slug === "nice-jobs")?.parentSlug).toBe("aira-career-hub");
    expect(bossStructure[0].subBrands.find(brand => brand.slug === "onspeak-mentor-hub")?.parentSlug).toBe("aira-labs");
    expect(commandUnit("aira-skill-city", "aira-career-hub")?.label).toBe("AIRA Career Hub");
    expect(commandBrandSlug("aira-skill-city", "aira-career-hub")).toBe("aira-career-hub");
    expect(commandBrandSlug("aira-skill-city", "aira-skill-studio")).toBe("aira-skill-studio");
  });
  it("records the owner-supplied Skill Studio programme names as drafts to initialize", () => {
    expect(skillStudioProgramDrafts.map(program => program.name)).toEqual(["GenZ Builder", "VIVE CODING", "Full Stack Branding Expert"]);
  });
});
