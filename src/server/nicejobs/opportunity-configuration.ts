import { z } from "zod";

const text = z.string().trim().min(1).max(4000);
const id = z.string().min(1).max(200);
const terms = z.object({ status: z.enum(["PENDING", "CONFIRMED", "NOT_APPLICABLE"]), text: text.nullable().default(null) }).strict();

export const opportunityConfiguration = z.object({
  legalEmployer: z.object({ organizationId: id.nullable(), label: z.string().trim().min(1).max(200), legalName: z.string().trim().min(1).max(200).nullable(), status: z.enum(["PENDING_VERIFICATION", "CONFIRMED"]), evidence: z.string().trim().min(1).max(1000).nullable() }).strict(),
  brandId: id.nullable().default(null),
  brandLabel: z.string().trim().min(1).max(200).nullable().default(null),
  divisionLabel: z.string().trim().min(1).max(200),
  divisionStatus: z.enum(["PENDING", "CONFIRMED"]),
  employmentType: z.enum(["PENDING", "EMPLOYEE", "CONTRACTOR", "INTERN", "INDEPENDENT_PARTNER"]),
  partnerAgreement: z.object({ status: z.enum(["PENDING", "CONFIRMED"]), version: z.string().trim().min(1).max(120).nullable(), evidence: z.string().trim().min(1).max(1000).nullable(), text: text.nullable() }).strict().optional(),
  referral: z.object({ status: z.enum(["PENDING", "CONFIRMED"]), destination: z.url().max(1000).refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.hash && !url.searchParams.has("ref"); }), evidence: z.string().trim().min(1).max(1000).nullable() }).strict().optional(),
  programme: z.object({ id: id, commercialRecordId: id, feeMinor: z.number().int().min(0).max(1_000_000_000), currency: z.string().regex(/^[A-Z]{3}$/), taxBasisPoints: z.number().int().min(0).max(10000), paymentConditions: text, refundRules: text }).strict().optional(),
  capacity: z.object({ admissionLimit: z.number().int().min(1).max(1000000), participantLimit: z.number().int().min(1).max(1000000), qualifyingPaymentMinor: z.string().regex(/^[1-9]\d{0,12}$/), currency: z.string().regex(/^[A-Z]{3}$/), evidence: z.string().trim().min(1).max(1000) }).strict().optional(),
  eligibility: text,
  compensation: terms,
  incentives: terms,
  location: z.object({ status: z.enum(["PENDING", "CONFIRMED"]), text: text.nullable().default(null) }).strict(),
  workArrangement: z.enum(["PENDING", "REMOTE", "ONSITE", "HYBRID"]),
  reportingManager: z.object({ personId: id.nullable(), roleLabel: z.string().trim().min(1).max(200).nullable() }).strict()
}).strict();
export type OpportunityConfiguration = z.infer<typeof opportunityConfiguration>;

export function opportunityProfile(raw: string | null) {
  if (!raw) return null;
  try {
    const result = opportunityConfiguration.safeParse(JSON.parse(raw).opportunity);
    return result.success ? result.data : null;
  } catch { return null; }
}

export function publicationIssues(profile: OpportunityConfiguration | null, description: string | null, engagement: string) {
  if (!profile) return ["Opportunity details are required before public publication."];
  const issues: string[] = [];
  if (!description?.trim()) issues.push("Job description is required.");
  if (profile.legalEmployer.status !== "CONFIRMED" || !profile.legalEmployer.organizationId || !profile.legalEmployer.legalName || !profile.legalEmployer.evidence) issues.push("Legal employer and verification evidence must be confirmed.");
  if (profile.divisionStatus !== "CONFIRMED") issues.push("Business division must be confirmed.");
  if (profile.brandLabel && !profile.brandId) issues.push("Brand must be linked to a verified company brand.");
  if (profile.employmentType === "PENDING" || engagement === "NOT_CONFIRMED") issues.push("Employment type and engagement must be confirmed.");
  if (engagement === "INTERNSHIP" && profile.employmentType !== "INTERN" || engagement !== "INTERNSHIP" && profile.employmentType === "INTERN") issues.push("Internship category must match the employment type.");
  if (engagement === "INDEPENDENT_PARTNER" && profile.employmentType !== "INDEPENDENT_PARTNER" || engagement !== "INDEPENDENT_PARTNER" && profile.employmentType === "INDEPENDENT_PARTNER") issues.push("Independent partner missions must use the partner engagement type.");
  if (engagement === "INDEPENDENT_PARTNER" && (profile.partnerAgreement?.status !== "CONFIRMED" || !profile.partnerAgreement.version || !profile.partnerAgreement.evidence || !profile.partnerAgreement.text)) issues.push("A verified, versioned independent partner agreement is required.");
  if (engagement === "INDEPENDENT_PARTNER" && (profile.referral?.status !== "CONFIRMED" || !profile.referral.evidence)) issues.push("The destination admission platform and referral capture need approval.");
  if (engagement === "INDEPENDENT_PARTNER" && !profile.capacity) issues.push("Admission capacity, participant capacity and the qualifying payment rule need approval.");
  if (engagement === "INDEPENDENT_PARTNER" && !profile.programme) issues.push("A recorded programme and independently approved commercial terms are required.");
  if (profile.compensation.status !== "CONFIRMED" || !profile.compensation.text) issues.push("Compensation terms must be confirmed and disclosed.");
  if (profile.incentives.status === "PENDING" || profile.incentives.status === "CONFIRMED" && !profile.incentives.text) issues.push("Incentive terms must be confirmed or explicitly not applicable.");
  if (profile.location.status !== "CONFIRMED" || !profile.location.text) issues.push("Location must be confirmed.");
  if (profile.workArrangement === "PENDING") issues.push("Work arrangement must be confirmed.");
  if (!profile.reportingManager.personId) issues.push("A responsible reporting manager must be assigned.");
  return issues;
}
