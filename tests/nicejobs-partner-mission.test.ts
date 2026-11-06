import { describe, expect, it } from "vitest";
import { newNiceJobsId } from "@/server/nicejobs/participant-id";
import { linkUrl } from "@/server/nicejobs/referrals";
import { opportunityConfiguration, publicationIssues } from "@/server/nicejobs/opportunity-configuration";
import { companyEvent, verifyCompanySignature } from "@/server/nicejobs/source-events";
import { createHmac } from "node:crypto";
import { admissionAmount } from "@/server/nicejobs/marginal-milestone";
import { allowedStartupChange } from "@/server/group/startup-program-lifecycle";

const partner = {
  legalEmployer: { organizationId: "company-1", label: "Recorded company", legalName: "Recorded company", status: "CONFIRMED", evidence: "company-review-1" },
  brandId: null, brandLabel: null, divisionLabel: "Recorded division", divisionStatus: "CONFIRMED",
  employmentType: "INDEPENDENT_PARTNER", eligibility: "Approved eligibility", compensation: { status: "CONFIRMED", text: "See approved partner terms" }, incentives: { status: "CONFIRMED", text: "Only verified admissions qualify" },
  location: { status: "CONFIRMED", text: "Remote" }, workArrangement: "REMOTE", reportingManager: { personId: "person-1", roleLabel: "Authorized contact" },
  partnerAgreement: { status: "CONFIRMED", version: "v1", evidence: "agreement-review-1", text: "Versioned independent partner agreement" },
  referral: { status: "CONFIRMED", destination: "https://example.org/apply?campaign=one", evidence: "capture-review-1" },
  programme: { id: "program-1", commercialRecordId: "terms-1", feeMinor: 10000, currency: "INR", taxBasisPoints: 1800, paymentConditions: "Approved payment terms", refundRules: "Approved refund terms" },
  capacity: { admissionLimit: 10, participantLimit: 20, qualifyingPaymentMinor: "100", currency: "INR", evidence: "capacity-review-1" }
} as const;

describe("Nice Jobs independent partner controls", () => {
  it("keeps partner missions closed when agreement or destination evidence is missing", () => {
    const ready = opportunityConfiguration.parse(partner);
    expect(publicationIssues(ready, "Approved mission description", "INDEPENDENT_PARTNER")).toEqual([]);
    expect(publicationIssues({ ...ready, partnerAgreement: { ...ready.partnerAgreement!, evidence: null } }, "Approved mission description", "INDEPENDENT_PARTNER")).toContain("A verified, versioned independent partner agreement is required.");
    expect(publicationIssues({ ...ready, referral: { ...ready.referral!, status: "PENDING" } }, "Approved mission description", "INDEPENDENT_PARTNER")).toContain("The destination admission platform and referral capture need approval.");
    expect(publicationIssues({ ...ready, capacity: undefined }, "Approved mission description", "INDEPENDENT_PARTNER")).toContain("Admission capacity, participant capacity and the qualifying payment rule need approval.");
    expect(publicationIssues({ ...ready, programme: undefined }, "Approved mission description", "INDEPENDENT_PARTNER")).toContain("A recorded programme and independently approved commercial terms are required.");
    expect(publicationIssues(ready, "Approved mission description", "FULL_TIME")).toContain("Independent partner missions must use the partner engagement type.");
  });

  it("requires explicit positive capacity and payment rules", () => {
    expect(opportunityConfiguration.safeParse({ ...partner, capacity: { ...partner.capacity, admissionLimit: 0 } }).success).toBe(false);
    expect(opportunityConfiguration.safeParse({ ...partner, capacity: { ...partner.capacity, qualifyingPaymentMinor: "0" } }).success).toBe(false);
  });

  it("authenticates event signatures and rejects replayed timestamps", () => {
    const secret = "s".repeat(40), body = JSON.stringify({ eventId: "evt-1" }), at = 1793970000000, timestamp = String(Math.floor(at / 1000));
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    expect(verifyCompanySignature(body, timestamp, signature, secret, at)).toBe(true);
    expect(verifyCompanySignature(body + "x", timestamp, signature, secret, at)).toBe(false);
    expect(verifyCompanySignature(body, timestamp, signature, secret, at + 301000)).toBe(false);
  });

  it("requires transaction evidence only for payment events", () => {
    const event = { eventId: "evt-1", companyId: "co-1", opportunityId: "v-1", type: "PAYMENT_RECEIVED", occurredAt: "2026-11-06T10:00:00.000Z", externalAdmissionId: "a-1" };
    expect(companyEvent.safeParse(event).success).toBe(false);
    expect(companyEvent.safeParse({ ...event, externalTransactionId: "tx-1", amountMinor: "100", currency: "INR" }).success).toBe(true);
    expect(companyEvent.safeParse({ ...event, type: "ADMISSION_APPROVED", externalTransactionId: "tx-1", amountMinor: "100", currency: "INR" }).success).toBe(false);
  });

  it("accepts only an HTTPS destination without a pre-existing referral token", () => {
    expect(opportunityConfiguration.safeParse({ ...partner, referral: { ...partner.referral, destination: "http://example.org/apply" } }).success).toBe(false);
    expect(opportunityConfiguration.safeParse({ ...partner, referral: { ...partner.referral, destination: "https://example.org/apply?ref=forged" } }).success).toBe(false);
    expect(linkUrl("https://example.org/apply?campaign=one", "token-1")).toBe("https://example.org/apply?campaign=one&ref=token-1");
  });

  it("issues a stable-format public ID independent of contact details", () => {
    expect(newNiceJobsId(new Date("2026-11-05T00:00:00Z"), () => Buffer.alloc(10, 10))).toBe("NJ-2026-0A0A0A0A0A0A0A0A0A0A");
  });
  it("calculates a fixed admission amount and bonuses only at configured milestones", () => {
    const rule = { type: "ADMISSION_BONUS" as const, perAdmissionMinor: "1000", milestoneEvery: 5, milestoneBonusMinor: "4000" };
    expect(admissionAmount(rule, 4)).toBe("1000");
    expect(admissionAmount(rule, 5)).toBe("5000");
    expect(admissionAmount(rule, 6)).toBe("1000");
    expect(() => admissionAmount(rule, 0)).toThrow();
  });
  it("keeps programme planning and closure separate from publication", () => {
    expect(allowedStartupChange("DRAFT", "PLANNED")).toBe(true);
    expect(allowedStartupChange("PLANNED", "ACTIVE")).toBe(false);
    expect(allowedStartupChange("ACTIVE", "CLOSED")).toBe(true);
    expect(allowedStartupChange("CLOSED", "ACTIVE")).toBe(false);
  });
});
