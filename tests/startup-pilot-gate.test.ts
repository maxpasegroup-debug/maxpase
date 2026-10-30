import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { assertStartupPilotEnrollmentReady, isConfirmedStartupAdmission, missingPilotApprovals, pilotRegisterInput } from "../src/server/portals/startup-pilot-register";

const draft = { intakeCode: "KERALA-PBA-01", tier: null, termsVersion: null, termsEvidenceRef: null, termsEffectiveAt: null, termsApprovedAt: null, termsApproverUserId: null, reviewerUserId: null, reviewerEvidenceRef: null, mentorUserId: null, mentorEvidenceRef: null, participants: [] };
const program = { id: "programme", organizationId: "division", productId: "product" };

describe("Kerala pilot readiness", () => {
  it("shows every missing approval without treating a draft as verified", () => {
    expect(pilotRegisterInput.safeParse(draft).success).toBe(true);
    expect(missingPilotApprovals(draft)).toEqual(["Approved PBA tier", "Versioned terms, effective date and approval evidence", "Admissions reviewer and authorization evidence", "Mentor and authorization evidence", "Consenting pilot participants"]);
  });
  it("rejects duplicate participant identities and unapproved tier values", () => {
    expect(pilotRegisterInput.safeParse({ ...draft, tier: "VIP" }).success).toBe(false);
    expect(pilotRegisterInput.safeParse({ ...draft, participants: [{ personId: "one", consentAt: null, consentEvidenceRef: null }, { personId: "one", consentAt: null, consentEvidenceRef: null }] }).success).toBe(false);
  });
  it("fails closed before reading a register if PBA product is not active", async () => {
    const db = { organization: { findUnique: async () => ({ slug: "aira-startup-school" }) }, product: { findUnique: async () => ({ slug: "pba", status: "INACTIVE", divisionId: "division" }) }, executiveRecord: { findUnique: async () => { throw new Error("Register should not be read"); } } } as unknown as Prisma.TransactionClient;
    await expect(assertStartupPilotEnrollmentReady(db, program, "batch", "person")).rejects.toThrow("Approved PBA product required");
  });
  it("fails closed when the product is active but no approved intake exists", async () => {
    const db = { organization: { findUnique: async () => ({ slug: "aira-startup-school" }) }, product: { findUnique: async () => ({ slug: "pba", status: "ACTIVE", divisionId: "division" }) }, executiveRecord: { findUnique: async () => null } } as unknown as Prisma.TransactionClient;
    await expect(assertStartupPilotEnrollmentReady(db, program, "batch", "person")).rejects.toThrow("Kerala intake is not approved");
  });
  it("requires a separately confirmed admission linked to the exact application, programme, batch and person", () => {
    const record = { kind: "STARTUP_ADMISSION", status: "CONFIRMED", organizationId: "division", ownerPersonId: "person", payload: JSON.stringify({ applicationId: "application", programId: "programme", batchId: "batch" }) };
    expect(isConfirmedStartupAdmission(record, "application", "programme", "batch", "division", "person")).toBe(true);
    expect(isConfirmedStartupAdmission(record, "application", "other-programme", "batch", "division", "person")).toBe(false);
    expect(isConfirmedStartupAdmission(record, "application", "programme", "other-batch", "division", "person")).toBe(false);
    expect(isConfirmedStartupAdmission({ ...record, status: "APPROVED" }, "application", "programme", "batch", "division", "person")).toBe(false);
    expect(isConfirmedStartupAdmission({ ...record, payload: "bad-json" }, "application", "programme", "batch", "division", "person")).toBe(false);
    expect(isConfirmedStartupAdmission(null, "application", "programme", "batch", "division", "person")).toBe(false);
  });
});
