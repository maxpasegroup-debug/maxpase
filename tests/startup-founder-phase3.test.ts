import { describe, expect, it } from "vitest";
import { founderPlanInput } from "../src/server/portals/startup-founder";

const step = { key: "first-test", title: "Test a customer problem", practice: "Speak with three potential customers about the problem.", evidencePrompt: "Describe the conversations and what changed." };

describe("Startup founder learning plan contract", () => {
  it("accepts a bounded, explicit tier plan with practical evidence", () => {
    const result = founderPlanInput.parse({ tier: "STARTER", termsApprovalRef: "approved-terms-v1", milestones: [step] });
    expect(result.milestones[0].key).toBe("first-test");
  });
  it("rejects missing authority references, duplicate milestones and unsupported tiers", () => {
    expect(founderPlanInput.safeParse({ tier: "STARTER", termsApprovalRef: "", milestones: [step] }).success).toBe(false);
    expect(founderPlanInput.safeParse({ tier: "PRO", termsApprovalRef: "approved-terms-v1", milestones: [step, step] }).success).toBe(false);
    expect(founderPlanInput.safeParse({ tier: "VIP", termsApprovalRef: "approved-terms-v1", milestones: [step] }).success).toBe(false);
  });
  it("requires instructions and evidence prompts rather than empty progress cards", () => {
    expect(founderPlanInput.safeParse({ tier: "PRO", termsApprovalRef: "approved-terms-v1", milestones: [{ ...step, practice: "Read" }] }).success).toBe(false);
    expect(founderPlanInput.safeParse({ tier: "PRO", termsApprovalRef: "approved-terms-v1", milestones: [] }).success).toBe(false);
  });
});
