import { describe, expect, it } from "vitest";
import { jobsPinNextPath } from "@/lib/jobs-pin-navigation";

describe("Nice Jobs pending PIN navigation", () => {
  it("returns a newly verified phone account to PIN setup", () => {
    expect(jobsPinNextPath("/sites/jobs/login", "+919876543210")).toBe("/sites/jobs/signup/setup-pin");
  });

  it("keeps older password accounts in their existing activation journey", () => {
    expect(jobsPinNextPath("/sites/jobs/login", null)).toBe("/sites/jobs/activate-pin");
  });
});
