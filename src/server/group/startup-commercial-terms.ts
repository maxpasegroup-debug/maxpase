import { z } from "zod";
import { AccessError } from "@/server/authorization/engine";

const id = z.string().min(1).max(200);
const reference = z.string().trim().min(8).max(300);
export const startupTerms = z.object({ brandId: id, programId: id, issuerCompanyId: id, termsReference: reference, feeMinor: z.number().int().min(0).max(1_000_000_000), currency: z.string().regex(/^[A-Z]{3}$/), taxBasisPoints: z.number().int().min(0).max(10000), paymentConditions: z.string().trim().min(1).max(4000).optional(), refundRules: z.string().trim().min(1).max(4000).optional(), preparedByUserId: id, programUpdatedAt: z.iso.datetime({ offset: true }), schemaVersion: z.literal(1) }).strict();

export function parseCommercialTerms(raw: string) {
  try { return startupTerms.parse(JSON.parse(raw)); } catch { throw new AccessError("Commercial terms record unavailable"); }
}
export function termsMatchProgram(program: { id: string; updatedAt: Date; metadata: string | null; priceMinor: number | null; currency: string | null }, value: { programId: string; programUpdatedAt: string; termsReference: string; feeMinor: number; currency: string }) {
  let reference: string | null = null;
  try { const metadata = JSON.parse(program.metadata ?? "null"); if (typeof metadata?.startupProgramDraft?.writtenTermsReference === "string") reference = metadata.startupProgramDraft.writtenTermsReference; } catch { /* malformed historical metadata cannot prove approval */ }
  return program.id === value.programId && program.updatedAt.toISOString() === value.programUpdatedAt && reference === value.termsReference && (program.priceMinor == null || program.priceMinor === value.feeMinor) && (!program.currency || program.currency === value.currency);
}
