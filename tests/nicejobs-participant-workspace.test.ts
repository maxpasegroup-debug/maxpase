import { describe, expect, it } from "vitest";
import { participantSection, participantSections } from "@/lib/participant-navigation";
import { learningSummary } from "@/server/nicejobs/learning-summary";
import { ojtConfiguration } from "@/server/nicejobs/onboarding-input";
import { customerMaterial } from "@/server/nicejobs/customer-material";

describe("Unified participant workspace", () => {
  it("keeps seven stable destinations and places detailed workspaces in their section", () => {
    expect(participantSections.map(([, title]) => title)).toEqual(["Today", "Training", "Work", "Reports", "Wallet", "Resources", "Help"]);
    for (const view of ["worker-statements", "worker-statement", "worker-incentive-detail", "worker-payouts"]) expect(participantSection(view)).toBe("worker-wallet");
    expect(participantSection("worker-performance-detail")).toBe("worker-reports");
    expect(participantSection("worker-messages")).toBe("worker-help");
    expect(participantSection("my-followups")).toBe("my-work");
  });
  it("uses recorded OJT completion rather than submitted evidence or elapsed time for milestones", () => {
    const plan = ojtConfiguration.parse({ durationDays: 100, stages: [{ key: "practice", title: "Synthetic practice", order: 1, activities: [{ key: "first", title: "First practice", type: "PRACTICE", order: 1, instruction: "Fixture only", expectedOutcome: "Trainer reviewed evidence", evidenceRequired: true, reviewRequired: true, maxAttempts: 2, practiceMinutes: 15, dueDays: 1 }] }] });
    const start = new Date("2026-10-10T10:00:00Z"), now = new Date("2026-10-11T09:59:59Z");
    expect(learningSummary(plan, [{ phase: "OJT", key: "first", status: "SUBMITTED" }], start, now)).toMatchObject({ elapsedDay: 1, milestones: [{ completed: 0 }] });
    expect(learningSummary(plan, [{ phase: "OJT", key: "first", status: "APPROVED" }], start, now).milestones[0]).toMatchObject({ completed: 1, status: "COMPLETED" });
    expect(learningSummary(null, [], null, now)).toMatchObject({ configured: false, elapsedDay: null, milestones: [] });
    expect(ojtConfiguration.safeParse({ ...plan, stages: [{ ...plan.stages[0], activities: [{ ...plan.stages[0].activities[0], practiceMinutes: 121 }] }] }).success).toBe(false);
  });
  it("fails closed for draft, internal, archived, expired and private customer materials", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    const v = { resourceType: "CUSTOMER_MATERIAL", status: "PUBLISHED", current: true, visibility: "WORKER", reviewedAt: now, publishedAt: now, expiresAt: null, title: "Approved fixture", body: "Customer-facing fixture text", url: null, privateReference: null };
    expect(customerMaterial(v, now)?.text).toBe(v.body);
    for (const patch of [{ status: "DRAFT" }, { status: "ARCHIVED" }, { current: false }, { visibility: "MANAGEMENT" }, { reviewedAt: null }, { expiresAt: now }, { resourceType: "REFERENCE" }, { privateReference: "private" }, { url: "javascript:alert(1)" }]) expect(customerMaterial({ ...v, ...patch }, now)).toBeNull();
  });
});
