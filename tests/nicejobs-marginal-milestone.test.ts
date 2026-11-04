import { describe, expect, it } from "vitest";
import { marginalPreview, marginalRate, marginalRule } from "../src/server/nicejobs/marginal-milestone";
import { calculateAmount, type IncentivePolicy } from "../src/server/nicejobs/finance-input";
import { workerEarningState } from "../src/server/nicejobs/earnings-state";

const rule = { type: "MARGINAL_MILESTONE" as const, baseRateMinor: "800000", milestoneSize: 5, increment: { kind: "PERCENT" as const, percent: 50 } };

describe("Nice Jobs marginal milestone draft calculations", () => {
  it("charges each admission at its own tier without repricing earlier admissions", () => {
    expect(marginalRate(rule, 1)).toBe("800000");
    expect(marginalRate(rule, 2)).toBe("1200000");
    expect(marginalRate(rule, 3)).toBe("1600000");
    expect(marginalPreview(rule, 0, 5).totalMinor).toBe("4000000");
    expect(marginalPreview(rule, 0, 6).totalMinor).toBe("5200000");
    expect(marginalPreview(rule, 0, 10).totalMinor).toBe("10000000");
    expect(marginalPreview(rule, 5, 1).totalMinor).toBe("1200000");
  });
  it("supports fixed increments, a tier cap and exact minor-unit rounding", () => {
    const fixed = { ...rule, milestoneSize: 2, baseRateMinor: "101", increment: { kind: "FIXED" as const, amountMinor: "50" }, maxTier: 3 };
    expect(marginalPreview(fixed, 0, 7).rows.map(r => r.rateMinor)).toEqual(["101", "151", "201", "201"]);
    expect(marginalRate({ ...rule, baseRateMinor: "1", increment: { kind: "PERCENT", percent: 50 } }, 2, "FLOOR")).toBe("1");
    expect(marginalRate({ ...rule, baseRateMinor: "1", increment: { kind: "PERCENT", percent: 50 } }, 2, "HALF_UP")).toBe("2");
  });
  it("rejects invalid parameters and calculations exceeding the money bound", () => {
    expect(marginalRule.safeParse({ ...rule, milestoneSize: 0 }).success).toBe(false);
    expect(marginalRule.safeParse({ ...rule, baseRateMinor: "-1" }).success).toBe(false);
    expect(() => marginalPreview(rule, -1, 5)).toThrow();
    expect(() => marginalPreview(rule, 0, 101)).toThrow();
    expect(() => marginalPreview({ ...rule, baseRateMinor: "9000000000000" }, 0, 2)).toThrow("bound");
  });
  it("does not turn a performance count into a payable admission calculation", () => {
    expect(calculateAmount({ rule } as IncentivePolicy, "10")).toEqual({ amountMinor: null, reason: expect.stringContaining("attributed admissions") });
  });
  it("keeps estimates, approval, earned and payment evidence distinct for workers", () => {
    expect(workerEarningState("CALCULATED", true)).toContain("estimate");
    expect(workerEarningState("UNDER_REVIEW", true)).toContain("Awaiting");
    expect(workerEarningState("POSTED", true)).toContain("payment unconfirmed");
    expect(workerEarningState("POSTED", false)).toContain("No payable");
  });
});
