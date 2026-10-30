import { describe, expect, it } from "vitest";
import { allowedStartupChange, canDecidePublication, readStartupDraft, startupProgramWhere } from "@/server/group/startup-programs";
import { validateStartupProgramTransition } from "@/server/domain/aira-service";

describe("Startup programme planning boundary", () => {
  it("reads only the validated draft proposal from existing metadata", () => {
    const draft = { deliveryFormat: "Hybrid", curriculum: null, learningOutcomes: null, eligibility: null, intendedAudience: null, tierProposal: "Unapproved proposal", writtenTermsReference: null, deliveryArrangements: null };
    expect(readStartupDraft(JSON.stringify({ startupProgramDraft: draft }))).toEqual(draft);
    expect(readStartupDraft("not-json")).toBeNull();
    expect(readStartupDraft(JSON.stringify({ startupProgramDraft: { ...draft, tierProposal: 42 } }))).toBeNull();
    expect(readStartupDraft(JSON.stringify({ startupProgramDraft: { ...draft, approved: true } }))).toBeNull();
  });
  it("combines search with verified company, division and brand scope", () => {
    expect(startupProgramWhere("company", "division", "brand", "  PBA  ", "DRAFT")).toEqual({
      companyOrganizationId: "company", organizationId: "division", status: "DRAFT",
      AND: [{ OR: [{ brandId: "brand" }, { brandId: null }] }, { OR: [{ name: { contains: "PBA", mode: "insensitive" } }, { slug: { contains: "PBA", mode: "insensitive" } }] }]
    });
    expect(startupProgramWhere("company", "division", "brand", "", "FORGED")).not.toHaveProperty("status");
  });
  it("allows pause and archive while refusing activation, resumption and archived replay", () => {
    expect(allowedStartupChange("ACTIVE", "PAUSED")).toBe(true);
    expect(allowedStartupChange("DRAFT", "ARCHIVED")).toBe(true);
    expect(allowedStartupChange("ACTIVE", "ARCHIVED")).toBe(true);
    expect(allowedStartupChange("DRAFT", "ACTIVE")).toBe(false);
    expect(allowedStartupChange("PAUSED", "ACTIVE")).toBe(false);
    expect(allowedStartupChange("ARCHIVED", "ARCHIVED")).toBe(false);
    expect(() => validateStartupProgramTransition(null, "ACTIVE")).toThrow("approved publication decision");
    expect(() => validateStartupProgramTransition("DRAFT", "ACTIVE")).toThrow("approved publication decision");
    expect(() => validateStartupProgramTransition("PAUSED", "ACTIVE")).toThrow("approved publication decision");
    expect(() => validateStartupProgramTransition("ACTIVE", "PAUSED")).not.toThrow();
    expect(() => validateStartupProgramTransition("ARCHIVED", "DRAFT")).toThrow("read-only");
  });
  it("requires an independent reviewer and an exact pending request version", () => {
    const request = { status: "PENDING", version: 2, ownerPersonId: "requester" };
    expect(canDecidePublication(request, "reviewer", 2)).toBe(true);
    expect(canDecidePublication(request, "requester", 2)).toBe(false);
    expect(canDecidePublication(request, "reviewer", 1)).toBe(false);
    expect(canDecidePublication({ ...request, status: "APPROVED" }, "reviewer", 2)).toBe(false);
    expect(canDecidePublication({ ...request, status: "REJECTED" }, "reviewer", 2)).toBe(false);
  });
});
