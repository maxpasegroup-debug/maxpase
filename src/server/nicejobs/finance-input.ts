import { z } from "zod";
import { currency, minorInput, decimalInput, compareDecimal } from "./money";
import { NiceJobsError } from "./input";
const id = z.string().min(1).max(100), text = z.string().trim().min(1).max(2000), instant = z.string().datetime();
export const incentiveRule = z.discriminatedUnion("type", [
  z.object({ type: z.literal("FIXED_AMOUNT"), amountMinor: minorInput }).strict(),
  z.object({ type: z.literal("PER_UNIT"), rateMinor: minorInput }).strict(),
  z.object({ type: z.literal("PERCENTAGE"), baseMinor: minorInput, basisPoints: z.string().regex(/^(0|[1-9]\d{0,4})$/).refine(v => BigInt(v) <= 10000n) }).strict(),
  z.object({ type: z.literal("THRESHOLD"), minimumActual: decimalInput, amountMinor: minorInput }).strict(),
  z.object({ type: z.literal("TIERED"), tiers: z.array(z.object({ minimumActual: decimalInput, amountMinor: minorInput }).strict()).min(1).max(20).refine(t => t.every((r, i) => !i || compareDecimal(t[i - 1].minimumActual, r.minimumActual) < 0), "Tiers must increase") }).strict(),
  z.object({ type: z.literal("CUSTOM_POLICY"), reference: text }).strict()
]);
export const incentivePolicy = z.object({ name: z.string().trim().min(1).max(200), divisionId: id, jobVersionId: id, frameworkVersionId: id, currency, effectiveAt: instant, expiresAt: instant.optional(), metricKey: z.string().regex(/^[A-Z][A-Z0-9_]{0,49}$/), eligibility: z.object({ requireActive: z.boolean(), minimumActual: decimalInput, allowedStatuses: z.array(z.enum(["ON_TRACK", "ATTENTION", "BELOW_EXPECTATION"])).min(1).max(3), excludedPipStatuses: z.array(z.enum(["DRAFT", "ACTIVE", "UNDER_REVIEW", "COMPLETED", "CANCELLED"])).max(5) }).strict(), rule: incentiveRule, rounding: z.enum(["FLOOR", "CEILING", "HALF_UP"]), approvalControlPointId: id, settlementControlPointId: id, adjustmentControlPointId: id.optional(), settlement: z.object({ minimumMinor: minorInput, allowAdjustments: z.boolean() }).strict() }).strict().refine(p => !p.expiresAt || p.effectiveAt < p.expiresAt, "Invalid effective period").refine(p => !p.settlement.allowAdjustments || !!p.adjustmentControlPointId, "Adjustments require an independent human control");
const base = { confirmed: z.literal(true), idempotencyKey: z.uuid() }, revision = z.number().int().nonnegative();
export const financeCommand = z.discriminatedUnion("operation", [
  z.object({ ...base, operation: z.literal("POLICY_CREATE"), payload: incentivePolicy }).strict(),
  z.object({ ...base, operation: z.literal("POLICY_EDIT"), versionId: id, revision, payload: incentivePolicy }).strict(),
  z.object({ ...base, operation: z.enum(["POLICY_SUBMIT", "POLICY_REVIEW", "POLICY_PUBLISH", "POLICY_ARCHIVE", "POLICY_VERSION"]), versionId: id, revision, reason: text }).strict(),
  z.object({ ...base, operation: z.literal("CALCULATE"), snapshotId: id, policyVersionId: id, reason: text }).strict(),
  z.object({ ...base, operation: z.enum(["EARNING_SUBMIT", "EARNING_POST", "EARNING_VOID"]), earningId: id, revision, reason: text }).strict(),
  z.object({ ...base, operation: z.literal("WALLET_OPEN"), assignmentId: id, policyVersionId: id, reason: text }).strict(),
  z.object({ ...base, operation: z.literal("ADJUSTMENT_CREATE"), walletId: id, policyVersionId: id, direction: z.enum(["CREDIT", "DEBIT"]), amountMinor: minorInput.refine(v => BigInt(v) > 0n), reason: text, description: text, privateNote: text.optional() }).strict(),
  z.object({ ...base, operation: z.enum(["ADJUSTMENT_SUBMIT", "ADJUSTMENT_POST"]), adjustmentId: id, revision, reason: text }).strict(),
  z.object({ ...base, operation: z.literal("REVERSAL_CREATE"), ledgerId: id, policyVersionId: id, reason: text }).strict(),
  z.object({ ...base, operation: z.literal("SETTLEMENT_CREATE"), policyVersionId: id, from: instant, until: instant, reason: text }).strict(),
  z.object({ ...base, operation: z.literal("STATEMENT_GENERATE"), periodId: id, revision, walletId: id, reason: text }).strict(),
  z.object({ ...base, operation: z.enum(["SETTLEMENT_SUBMIT", "SETTLEMENT_POST", "SETTLEMENT_CANCEL", "SETTLEMENT_CLOSE"]), periodId: id, revision, reason: text }).strict(),
  z.object({ ...base, operation: z.literal("DECIDE"), requestId: id, approvalId: id, decision: z.enum(["APPROVED", "REJECTED"]), reason: text }).strict(),
  z.object({ ...base, operation: z.literal("PAYOUT_REQUEST"), statementId: id, reason: text }).strict(),
  z.object({ ...base, operation: z.literal("RECONCILE"), walletId: id, reason: text }).strict()
]);
export const financeKinds = ["policies", "incentives", "adjustments", "settlements", "statements", "payouts", "exceptions"] as const;
export const financeQuery = z.object({ management: z.boolean().default(false), ledgerType: z.enum(["CREDIT", "ADJUSTMENT", "REVERSAL", "SETTLEMENT"]).optional(), companyId: id.optional(), divisionId: id.optional(), assignmentId: id.optional(), policyVersionId: id.optional(), search: z.string().trim().max(200).default(""), status: z.string().max(40).optional(), after: id.optional(), limit: z.number().int().min(1).max(100).default(25) }).strict();
export type IncentivePolicy = z.infer<typeof incentivePolicy>;
export function calculateAmount(p: IncentivePolicy, actual: string): { amountMinor: string | null; reason: string } {
  if (p.rule.type === "CUSTOM_POLICY") return { amountMinor: null, reason: "CUSTOM_POLICY is not implemented; no payable result" };
  const rule = p.rule; let amount: bigint;
  if (rule.type === "FIXED_AMOUNT") amount = BigInt(rule.amountMinor);
  else if (rule.type === "PER_UNIT") { if (!/^(0|[1-9]\d*)$/.test(actual)) return { amountMinor: null, reason: "PER_UNIT requires a canonical integer count, not a rounded percentage" }; amount = BigInt(rule.rateMinor) * BigInt(actual); }
  else if (rule.type === "PERCENTAGE") { const numerator = BigInt(rule.baseMinor) * BigInt(rule.basisPoints), denominator = 10000n, q = numerator / denominator, r = numerator % denominator; amount = q + (p.rounding === "CEILING" && r > 0n || p.rounding === "HALF_UP" && r * 2n >= denominator ? 1n : 0n); }
  else if (rule.type === "THRESHOLD") amount = compareDecimal(actual, rule.minimumActual) >= 0 ? BigInt(rule.amountMinor) : 0n;
  else amount = BigInt(rule.tiers.filter(t => compareDecimal(actual, t.minimumActual) >= 0).at(-1)?.amountMinor ?? "0");
  if (amount > 9_000_000_000_000n) throw new NiceJobsError("Calculation exceeds the technical money bound");
  return { amountMinor: amount.toString(), reason: rule.type + "; explicit published values; " + p.rounding + " rounding; actual " + actual };
}
