import { describe, expect, it } from "vitest";
import { applicationConfiguration, guidedLaunchApplication, validateAnswers } from "@/server/nicejobs/application-configuration";

describe("Nice Jobs guided application configuration", () => {
  const form = applicationConfiguration.parse({ fields: [
    { key: "interest", label: "Interest", type: "TEXT", phase: "SHORT", required: true },
    { key: "experience", label: "Experience", type: "NUMBER", phase: "DETAILED", required: true }
  ] });

  it("requires only short answers for an orientation invitation and all answers for detailed submission", () => {
    expect(validateAnswers(form, { interest: "Interested" }, true, "SHORT")).toEqual({ interest: "Interested" });
    expect(() => validateAnswers(form, {}, true, "SHORT")).toThrow("Required: Interest");
    expect(() => validateAnswers(form, { interest: "Interested" }, true)).toThrow("Required: Experience");
    expect(validateAnswers(form, { interest: "Interested", experience: 2 }, true)).toEqual({ interest: "Interested", experience: 2 });
  });

  it("limits guided launch to the two intended codes with required orientation", () => {
    expect(guidedLaunchApplication("JOB-001", { preOfferRequired: true })).toBe(true);
    expect(guidedLaunchApplication("JOB-DCM", { preOfferRequired: true })).toBe(true);
    expect(guidedLaunchApplication("JOB-BAM", { preOfferRequired: true })).toBe(false);
    expect(guidedLaunchApplication("JOB-001", { preOfferRequired: false })).toBe(false);
  });

  it("rejects a short question that depends on an answer collected after orientation", () => {
    expect(applicationConfiguration.safeParse({ fields: [
      { key: "interest", label: "Interest", type: "TEXT", phase: "SHORT", when: { field: "experience", operator: "EQ", value: "yes" } },
      { key: "experience", label: "Experience", type: "TEXT", phase: "DETAILED" }
    ] }).success).toBe(false);
  });
});
