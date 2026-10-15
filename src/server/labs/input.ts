import { z } from "zod";
import { AccessError } from "@/server/authorization/engine";
export const leadStates = ["NEW", "CONTACTED", "QUALIFIED", "AUDIT", "QUOTATION_READY", "WON", "LOST"] as const;
export const leadInput = z.object({ company: z.string().trim().min(1).max(160), name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), phone: z.string().trim().max(30).default(""), need: z.string().trim().min(10).max(3000), source: z.enum(["WEBSITE", "MANUAL", "REFERRAL"]).default("MANUAL"), consent: z.literal(true) }).strict();
export const leadPayload = leadInput.extend({ ownerUserId: z.string(), nextFollowUp: z.string().datetime().nullable(), lastContact: z.string().datetime().nullable(), outcome: z.string().max(3000), qualification: z.string().max(3000), quoteId: z.string().nullable(), acceptance: z.string().max(3000), projectId: z.string().nullable() });
const money = z.string().regex(/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/);
const computedMoney=z.string().regex(/^(0|[1-9][0-9]{0,19})\.[0-9]{2}$/);
export const quoteInput = z.object({ leadId: z.string().min(1).max(200), currency: z.enum(["INR", "USD", "EUR"]), items: z.array(z.object({ description: z.string().trim().min(1).max(200), quantity: z.string().regex(/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,3})?$/), rate: money })).min(1).max(20), discount: money.default("0"), taxBasisPoints: z.number().int().min(0).max(10000), expiresAt: z.string().datetime() }).strict();
function scaled(value: string, places: number) { const [whole, part = ""] = value.split("."); return BigInt(whole) * 10n ** BigInt(places) + BigInt(part.padEnd(places, "0")); }
export function quoteTotals(raw: unknown) {
  const data = quoteInput.parse(raw);
  let subtotal = 0n;
  for (const item of data.items) { const quantity = scaled(item.quantity, 3); if (!quantity) throw new AccessError("Quantity must be positive"); subtotal += (quantity * scaled(item.rate, 2) + 500n) / 1000n; }
  const discount = scaled(data.discount, 2); if (discount > subtotal) throw new AccessError("Discount exceeds subtotal");
  const tax = ((subtotal - discount) * BigInt(data.taxBasisPoints) + 5000n) / 10000n;
  const format = (amount: bigint) => (amount / 100n).toString() + "." + (amount % 100n).toString().padStart(2, "0");
  return { subtotal: format(subtotal), discount: format(discount), tax: format(tax), total: format(subtotal - discount + tax) };
}
export const quotePayload = z.object({ input: quoteInput, totals: z.object({ subtotal: computedMoney, discount: computedMoney, tax: computedMoney, total: computedMoney }), requestId: z.string().nullable(), issuer: z.object({ legalName: z.string(), address: z.string(), taxRegistration: z.string(), verificationEvidence: z.string() }).nullable(), issuedAt: z.string().datetime().nullable(), acceptance: z.string().max(3000) });
export const billingConfig = z.object({ companyId: z.string(), legalName: z.string().trim().min(1).max(200), address: z.string().trim().min(10).max(1000), taxRegistration: z.string().trim().min(1).max(200), verificationEvidence: z.string().trim().min(10).max(1000), authorizedByUserId: z.string(), allowedTaxBasisPoints: z.array(z.number().int().min(0).max(10000)).min(1).max(20) }).strict();
