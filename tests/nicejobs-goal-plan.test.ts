import { describe, expect, it } from "vitest";
import { draftGoalPlan, goalOutcome, isCareerGoal } from "@/server/nicejobs/goal-plan";
import { goalCommand } from "@/server/nicejobs/goals";
import { skillLevels } from "@/server/nicejobs/skill-levels";
describe("Career Hub planning draft", () => {
  it("uses cumulative 10/20/30-day checkpoints and daily quantities without inventing earnings", () => {
    const p = draftGoalPlan(goalOutcome.parse({ outcome: "Verified fixture work", target: 17, unit: "verified outcomes" }));
    expect(p.checkpoints).toEqual([{ day: 10, target: 6 }, { day: 20, target: 12 }, { day: 30, target: 17 }]);
    expect(p.daily).toHaveLength(30); expect(p.daily.reduce((n, d) => n + d.target, 0)).toBe(17);
    expect(JSON.stringify(p)).not.toMatch(/amountMinor|wallet|salary|payout/);
  });
  it("rejects forged identities, money entries and unconfirmed proposals", () => {
    const c = { operation: "PROPOSE", confirmed: true, idempotencyKey: crypto.randomUUID(), outcome: { outcome: "Fixture", target: 1, unit: "count" } };
    expect(goalCommand.safeParse(c).success).toBe(true);
    for (const extra of [{ actorUserId: "forged" }, { organizationId: "other-company" }, { amountMinor: "100" }, { confirmed: false }]) expect(goalCommand.safeParse({ ...c, ...extra }).success).toBe(false);
    expect(goalOutcome.safeParse({ outcome: "Fixture", target: 1.5, unit: "count" }).success).toBe(false);
  });
  it("recognizes protected career plans without changing ordinary goals", () => {
    expect(isCareerGoal('{"kind":"NICE_JOBS_30_DAY"}')).toBe(true);
    expect(isCareerGoal(null)).toBe(false); expect(isCareerGoal("invalid")).toBe(false);
  });
  it("unlocks ordered practice levels from reviewed evidence, never money", () => {
    const configuration = { stages: [1, 2].map(n => ({ key: "stage" + n, title: "Fixture skill " + n, order: n, activities: [{ key: "activity" + n, title: "Fixture practice", type: "PRACTICE", order: 1, required: true, instruction: "Practise safely", expectedOutcome: "Reviewed fixture skill", reviewRequired: true, evidenceRequired: true, maxAttempts: 2 }] })) };
    const rows = [1, 2].map(n => ({ id: "p" + n, phase: "OJT", key: "activity" + n, status: n === 1 ? "SUBMITTED" : "APPROVED" }));
    expect(skillLevels(configuration, rows).map(l => l.unlocked)).toEqual([false, false]);
    rows[0].status = "APPROVED";
    expect(skillLevels(configuration, rows).map(l => l.unlocked)).toEqual([true, true]);
    expect(JSON.stringify(skillLevels(configuration, rows))).not.toMatch(/amount|wallet|salary|wage/);
  });
});
