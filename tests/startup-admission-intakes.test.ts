import { describe, expect, it } from "vitest";
import { intakeProgramCode, isIntakeOpen } from "@/server/group/startup-intake-policy";

describe("Startup admissions intake availability", () => {
  const now = new Date("2026-11-16T12:00:00.000Z");
  it("maps only configured 30 and 180 day PBA programs", () => {
    expect(intakeProgramCode(30, "pba-starter", "PBA Starter")).toBe("PBA_30_DAYS");
    expect(intakeProgramCode(180, "pba-pro", "PBA Pro")).toBe("PBA_180_DAYS");
    expect(intakeProgramCode(90, "other", "Other program")).toBeNull();
  });
  it("opens a published intake only when program, dates, capacity and centre permit", () => {
    const base = { programStatus: "ACTIVE", batchStatus: "ACTIVE", startDate: new Date("2026-11-01T00:00:00Z"), endDate: new Date("2026-12-01T23:59:59Z"), capacity: 30, used: 12, locationStatus: "ACTIVE" };
    expect(isIntakeOpen(base, now)).toBe(true);
    expect(isIntakeOpen({ ...base, programStatus: "DRAFT" }, now)).toBe(false);
    expect(isIntakeOpen({ ...base, batchStatus: "PLANNED" }, now)).toBe(false);
    expect(isIntakeOpen({ ...base, startDate: new Date("2026-12-01T00:00:00Z") }, now)).toBe(false);
    expect(isIntakeOpen({ ...base, endDate: new Date("2026-11-15T00:00:00Z") }, now)).toBe(false);
    expect(isIntakeOpen({ ...base, used: 30 }, now)).toBe(false);
    expect(isIntakeOpen({ ...base, locationStatus: "PLANNED" }, now)).toBe(false);
    expect(isIntakeOpen({ ...base, startDate: null }, now)).toBe(false);
    expect(isIntakeOpen({ ...base, locationStatus: null }, now)).toBe(false);
  });
});
