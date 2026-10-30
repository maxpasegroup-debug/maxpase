import { describe, expect, it } from "vitest";
import { approvedPilotCohort, approvedPilotMentor } from "@/server/domain/mentor-assignment";

const record = { kind: "STARTUP_KERALA_PILOT_INTAKE", status: "APPROVED", organizationId: "startup", payload: JSON.stringify({ batchId: "cohort-1", programId: "pba-1", preparedByUserId: "preparer", mentorUserId: "mentor", mentorEvidenceRef: "review-ref-1" }) };
const check = (value: typeof record | null, reviewer = "independent", batch = "cohort-1", program = "pba-1", organization = "startup", mentor = "mentor") => approvedPilotMentor(value, { actorUserId: reviewer }, batch, program, organization, mentor);

describe("approved cohort mentor assignment", () => {
  it("accepts an independently approved, exact mentor and scope mapping", () => expect(check(record)).toBe(true));
  it("fails closed for draft, self approval, another cohort, programme, scope or mentor", () => {
    expect(check({ ...record, status: "DRAFT" })).toBe(false);
    expect(check(record, "preparer")).toBe(false);
    expect(check(record, "independent", "cohort-2")).toBe(false);
    expect(check(record, "independent", "cohort-1", "pba-2")).toBe(false);
    expect(check(record, "independent", "cohort-1", "pba-1", "other")).toBe(false);
    expect(check(record, "independent", "cohort-1", "pba-1", "startup", "other")).toBe(false);
    expect(check({ ...record, payload: "{" })).toBe(false);
    expect(check({ ...record, payload: JSON.stringify({ batchId: "cohort-1", programId: "pba-1", preparedByUserId: "preparer", mentorUserId: "mentor" }) })).toBe(false);
    expect(check(null)).toBe(false);
  });
  it("requires the same independently approved cohort for non-mentor work", () => {
    expect(approvedPilotCohort(record, { actorUserId: "independent" }, "cohort-1", "pba-1", "startup")).toBe(true);
    expect(approvedPilotCohort(record, null, "cohort-1", "pba-1", "startup")).toBe(false);
    expect(approvedPilotCohort(record, { actorUserId: "preparer" }, "cohort-1", "pba-1", "startup")).toBe(false);
    expect(approvedPilotCohort(record, { actorUserId: "independent" }, "cohort-2", "pba-1", "startup")).toBe(false);
  });
});
