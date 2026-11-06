import type { Prisma, PrismaClient } from "@prisma/client";
import { parseCommercialTerms, termsMatchProgram } from "@/server/group/startup-commercial-terms";
import type { OpportunityConfiguration } from "./opportunity-configuration";

type DB = Prisma.TransactionClient | PrismaClient;

// The Startup School approval record is the commercial source of truth for PBA.
// Other programme types remain unavailable until their own approval workflow exists.
export async function partnerProgrammeIssues(db: DB, companyId: string, profile: OpportunityConfiguration | null): Promise<string[]> {
  if (!profile?.programme) return ["Select a programme and its approved commercial terms."];
  const { id, commercialRecordId, feeMinor, currency, taxBasisPoints, paymentConditions, refundRules } = profile.programme;
  const program = await db.program.findFirst({ where: { id, companyOrganizationId: companyId }, select: { id: true, status: true, brandId: true, organizationId: true, updatedAt: true, metadata: true, priceMinor: true, currency: true, capacity: true } });
  if (!program || program.status !== "ACTIVE" || !program.brandId || program.brandId !== profile.brandId) return ["Programme is not active under the selected company and brand."];
  if (!program.capacity || !profile.capacity || profile.capacity.admissionLimit > program.capacity) return ["Set programme admission capacity and an opportunity limit no larger than it."];
  const record = await db.executiveRecord.findFirst({ where: { id: commercialRecordId, kind: "STARTUP_COMMERCIAL_TERMS", status: "APPROVED", organizationId: program.organizationId }, select: { payload: true } });
  if (!record) return ["Independently approved programme commercial terms are missing."];
  try {
    const terms = parseCommercialTerms(record.payload);
    if (terms.issuerCompanyId !== companyId || terms.brandId !== program.brandId || !termsMatchProgram(program, terms)) return ["Approved terms no longer match this programme version."];
    if (terms.feeMinor !== feeMinor || terms.currency !== currency || terms.taxBasisPoints !== taxBasisPoints || !terms.paymentConditions || !terms.refundRules || terms.paymentConditions !== paymentConditions || terms.refundRules !== refundRules) return ["Fee, tax basis, payment and refund conditions must exactly match independently approved commercial terms."];
  } catch { return ["Approved programme terms cannot be verified."]; }
  return [];
}
