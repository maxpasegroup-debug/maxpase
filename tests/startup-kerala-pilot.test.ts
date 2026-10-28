import { describe, expect, it } from "vitest";
import { applicationStatusSteps } from "../src/lib/startup-applicant-status";
import { pilotFeedbackDecision, pilotFeedbackInput } from "../src/server/portals/startup-pilot-feedback";

describe("Startup Skool pilot status and feedback contract", () => {
  it("keeps submitted and review statuses useful before approval", () => {
    const submitted = applicationStatusSteps("SUBMITTED")!;
    const review = applicationStatusSteps("IN_REVIEW")!;
    expect(submitted[0]).toMatchObject({ label: "Application received", state: "current" });
    expect(review[1]).toMatchObject({ label: "Human review", state: "current" });
    expect(review[2].detail).toBe("Not yet recorded");
  });
  it("never labels an approved application as enrollment", () => {
    expect(applicationStatusSteps("APPROVED")![2].detail).toBe("Approved for the next admissions step; not enrolled");
    expect(applicationStatusSteps("REJECTED")![2].detail).toBe("Not approved for this intake");
    expect(applicationStatusSteps("UNKNOWN")).toBeNull();
  });
  it("requires a bounded experience note and rejects fabricated stage labels", () => {
    expect(pilotFeedbackInput.safeParse({ stage: "STATUS", message: "I could not tell when my application would be reviewed." }).success).toBe(true);
    expect(pilotFeedbackInput.safeParse({ stage: "PAYMENT", message: "I could not tell when my application would be reviewed." }).success).toBe(false);
    expect(pilotFeedbackInput.safeParse({ stage: "EVIDENCE", message: "Too short" }).success).toBe(false);
  });
  it("requires an explicit human review note and a version for feedback decisions", () => {
    expect(pilotFeedbackDecision.safeParse({ id: "feedback-1", version: 0, status: "ACKNOWLEDGED", note: "Will follow up with the applicant." }).success).toBe(true);
    expect(pilotFeedbackDecision.safeParse({ id: "feedback-1", status: "RESOLVED", note: "Done" }).success).toBe(false);
  });
});
