import { describe, expect, it } from "vitest";
import { applicantGuidance, applicationQueueGuidance, founderGuidance, staffGuidance } from "../src/server/sia/startup-guidance";

describe("Startup Skool deterministic guidance", () => {
  it("keeps applicant approval separate from enrollment", () => {
    const advice = applicantGuidance({ id: "own-application", status: "APPROVED" });
    expect(advice.next).toMatch(/separate programme terms and an authorized enrollment/i);
    expect(advice.source).toBe("STARTUP_APPLICATION:own-application");
    expect(advice.provider).toBe("DETERMINISTIC_PORTAL_GUIDANCE");
    expect(advice.limitation).toMatch(/No AI model was used/);
  });
  it("does not claim a learning action without active enrollment and an approved plan", () => {
    const advice = founderGuidance([{ participantId: "participant", status: "PLANNED", plan: { id: "plan", milestones: [] } }]);
    expect(advice.heading).toBe("Learning access pending");
    expect(advice.next).toMatch(/coordinator/);
  });
  it("prioritizes rework and records accepted progress without inventing outcomes", () => {
    const advice = founderGuidance([{ participantId: "own-participant", status: "ACTIVE", plan: { id: "approved-plan", milestones: [{ key: "step-1", submission: { status: "ACCEPTED" } }, { key: "step-2", submission: { status: "REWORK_REQUIRED" } }] } }]);
    expect(advice.fact).toMatch(/1 of 2 milestones/);
    expect(advice.next).toMatch(/improve your evidence/);
    expect(advice.source).toBe("STARTUP_FOUNDER_PLAN:approved-plan");
  });
  it("uses bounded queue counts and reserves decisions for humans", () => {
    const advice = staffGuidance([{ id: "batch", plan: { status: "DRAFT" } }], [{ id: "evidence" }], [{ id: "application", status: "SUBMITTED" }]);
    expect(advice.fact).toMatch(/1 applications and 1 evidence submissions/);
    expect(advice.next).toMatch(/record your own feedback decision/);
    expect(advice.coverage).toContain("FIRST_1_APPLICATIONS");
    expect(applicationQueueGuidance([]).fact).toMatch(/first 0 visible records/);
  });
});
