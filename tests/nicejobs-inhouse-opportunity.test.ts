import { describe, expect, it } from "vitest";
import { isPublicInHouseOpportunity } from "@/server/nicejobs/in-house-opportunity";

describe("NICEJOBS in-house opportunity policy", () => {
  it("allows configured in-house roles and excludes external or unconfirmed opportunities", () => {
    expect(isPublicInHouseOpportunity("PERFORMANCE_BASED")).toBe(true);
    expect(isPublicInHouseOpportunity("PART_TIME_INCENTIVE")).toBe(true);
    expect(isPublicInHouseOpportunity("INDEPENDENT_PARTNER")).toBe(false);
    expect(isPublicInHouseOpportunity("NOT_CONFIRMED")).toBe(false);
    expect(isPublicInHouseOpportunity("UNKNOWN")).toBe(false);
  });
});
