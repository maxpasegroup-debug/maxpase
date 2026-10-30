import { describe, expect, it } from "vitest";
import { canDecideCommercial, parseCommercialTerms, termsMatchProgram } from "@/server/group/startup-commercial";

const now = new Date("2026-10-29T00:00:00.000Z");
const program = { id: "pba-program", updatedAt: now, metadata: JSON.stringify({ startupProgramDraft: { deliveryFormat: null, curriculum: null, learningOutcomes: null, eligibility: null, intendedAudience: null, tierProposal: null, writtenTermsReference: "terms-v1-approved-reference", deliveryArrangements: null } }), priceMinor: 3500000, currency: "INR" };
const proposal = { programId: "pba-program", programUpdatedAt: now.toISOString(), termsReference: "terms-v1-approved-reference", feeMinor: 3500000, currency: "INR" };

describe("Startup commercial boundary", () => {
  it("requires an exact current programme and proposed terms snapshot", () => {
    expect(termsMatchProgram(program, proposal)).toBe(true);
    expect(termsMatchProgram({ ...program, updatedAt: new Date(now.getTime() + 1) }, proposal)).toBe(false);
    expect(termsMatchProgram(program, { ...proposal, programId: "other" })).toBe(false);
    expect(termsMatchProgram(program, { ...proposal, termsReference: "different-reference" })).toBe(false);
    expect(termsMatchProgram(program, { ...proposal, feeMinor: 6500000 })).toBe(false);
    expect(termsMatchProgram(program, { ...proposal, currency: "USD" })).toBe(false);
  });
  it("allows only an independent current review and rejects malformed commercial payloads", () => {
    const row = { status: "PENDING", version: 1, ownerPersonId: "preparer" };
    expect(canDecideCommercial(row, "reviewer", 1)).toBe(true);
    expect(canDecideCommercial(row, "preparer", 1)).toBe(false);
    expect(canDecideCommercial(row, "reviewer", 0)).toBe(false);
    expect(canDecideCommercial({ ...row, status: "APPROVED" }, "reviewer", 1)).toBe(false);
    expect(() => parseCommercialTerms(JSON.stringify({ ...proposal, brandId: "brand", issuerCompanyId: "aira", taxBasisPoints: 0, preparedByUserId: "preparer", schemaVersion: 1 }))).not.toThrow();
    expect(() => parseCommercialTerms(JSON.stringify({ ...proposal, brandId: "brand", issuerCompanyId: "aira", taxBasisPoints: -1, preparedByUserId: "preparer", schemaVersion: 1 }))).toThrow();
  });
});
