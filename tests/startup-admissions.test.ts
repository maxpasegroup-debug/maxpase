import { describe, expect, it } from "vitest";
import { startupAdmissionsWhere } from "@/server/group/startup-admissions";
import { canConfirmStartupAdmission, canReviewStartupApplication, parseStartupApplicationPayload, startupApplicationInput, startupPbaProgramWhere } from "@/server/portals/startup-applications";
import { brandOperatingModules } from "@/server/group/brand-os";
import { matchesPilotApplicationProgram } from "@/server/portals/startup-pilot-register";

const answers = { tier: "STARTER", idea: "A local business problem that I want to investigate", goal: "Interview potential customers before choosing a solution", experience: "I have started looking into this problem", location: "Kerala", timeCommitment: "Five hours each week", consent: true, noticeVersion: 1 };

describe("Startup Skool admissions contract", () => {
  it("keeps search and status inside the verified application division and kind", () => {
    expect(startupAdmissionsWhere("division-1", "  Meera  ", "IN_REVIEW")).toEqual({ organizationId: "division-1", kind: "STARTUP_APPLICATION", sourceKey: { startsWith: "startup:application:" }, status: "IN_REVIEW", owner: { displayName: { contains: "Meera", mode: "insensitive" } } });
    expect(startupAdmissionsWhere("division-1", "", "ACTIVE")).toMatchObject({ organizationId: "division-1", kind: "STARTUP_APPLICATION", status: { in: ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED"] } });
  });
  it("validates legacy answers and an optional recorded Program ID without changing candidate submission", () => {
    expect(parseStartupApplicationPayload(JSON.stringify(answers)).programId).toBeUndefined();
    expect(parseStartupApplicationPayload(JSON.stringify({ ...answers, programId: "pba-program-1" })).programId).toBe("pba-program-1");
    expect(startupApplicationInput.safeParse({ ...answers, programId: "forged" }).success).toBe(false);
    expect(() => parseStartupApplicationPayload(JSON.stringify({ ...answers, programId: 4 }))).toThrow("unavailable");
    expect(() => parseStartupApplicationPayload("broken-json")).toThrow("unavailable");
  });
  it("requires a PBA Program in the same division and brand for association", () => {
    expect(startupPbaProgramWhere("programme-1", "company-1", "division-1", "brand-1")).toEqual({ id: "programme-1", companyOrganizationId: "company-1", organizationId: "division-1", status: { in: ["DRAFT", "ACTIVE", "PAUSED"] }, OR: [{ brandId: "brand-1" }, { brandId: null }], product: { organizationId: "company-1", slug: "pba", divisionId: "division-1" } });
    expect(matchesPilotApplicationProgram("programme-1", "programme-1")).toBe(true);
    expect(matchesPilotApplicationProgram("foreign-programme", "programme-1")).toBe(false);
    expect(matchesPilotApplicationProgram(undefined, "programme-1")).toBe(true); // Preserve historical unlinked applications.
  });
  it("refuses self-approval, replay and terminal decisions while preserving submitted history", () => {
    const submitted = { status: "SUBMITTED", version: 2, ownerPersonId: "applicant" };
    expect(canReviewStartupApplication(submitted, "reviewer", 2, "IN_REVIEW")).toBe(true);
    expect(canReviewStartupApplication(submitted, "applicant", 2, "APPROVED")).toBe(false);
    expect(canReviewStartupApplication(submitted, "reviewer", 1, "APPROVED")).toBe(false);
    expect(canReviewStartupApplication({ ...submitted, status: "APPROVED" }, "reviewer", 2, "REJECTED")).toBe(false);
  });
  it("keeps admission separate from application review and requires another authorized decision maker", () => {
    const application = { status: "APPROVED", version: 3, ownerPersonId: "applicant", reviewerPersonId: "application-reviewer" };
    expect(canConfirmStartupAdmission(application, "admission-reviewer", 3)).toBe(true);
    expect(canConfirmStartupAdmission(application, "applicant", 3)).toBe(false);
    expect(canConfirmStartupAdmission(application, "application-reviewer", 3)).toBe(false);
    expect(canConfirmStartupAdmission(application, "admission-reviewer", 2)).toBe(false);
    expect(canConfirmStartupAdmission({ ...application, reviewerPersonId: null }, "admission-reviewer", 3)).toBe(false);
    expect(canConfirmStartupAdmission({ ...application, status: "IN_REVIEW" }, "admission-reviewer", 3)).toBe(false);
  });
  it("exposes the admissions route only when its scoped access was checked", () => {
    const base = { startup: true, programs: true, products: false, projects: false, people: false, approvals: false };
    expect(brandOperatingModules(base).find(module => module.key === "admissions")?.href).toBeNull();
    expect(brandOperatingModules({ ...base, admissionsHref: "/app/boss/brands/verified/admissions" }).find(module => module.key === "admissions")?.href).toBe("/app/boss/brands/verified/admissions");
  });
});
