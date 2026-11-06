import { z } from "zod";

const positiveInteger = z.number().int().min(1).max(1000000);
const minor = z.string().regex(/^(0|[1-9]\d{0,12})$/);
export const marginalRule = z.object({
  type: z.literal("MARGINAL_MILESTONE"),
  baseRateMinor: minor.refine(v => BigInt(v) > 0n),
  milestoneSize: positiveInteger,
  increment: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("PERCENT"), percent: z.number().int().min(0).max(10000) }).strict(),
    z.object({ kind: z.literal("FIXED"), amountMinor: minor }).strict(),
  ]),
  maxTier: positiveInteger.optional(),
}).strict();
export type MarginalRule = z.infer<typeof marginalRule>;

const MAX_MINOR = 9_000_000_000_000n;
export function marginalRate(raw: MarginalRule, tier: number, rounding: "FLOOR" | "CEILING" | "HALF_UP" = "HALF_UP"): string {
  const rule = marginalRule.parse(raw);
  if (!Number.isSafeInteger(tier) || tier < 1) throw new Error("Invalid tier");
  const level = BigInt(Math.min(tier, rule.maxTier ?? tier) - 1), base = BigInt(rule.baseRateMinor);
  const numerator = base * (100n + level * BigInt(rule.increment.kind === "PERCENT" ? rule.increment.percent : 0));
  const amount = rule.increment.kind === "FIXED" ? base + level * BigInt(rule.increment.amountMinor)
    : numerator / 100n + (rounding === "CEILING" && numerator % 100n > 0n || rounding === "HALF_UP" && numerator % 100n >= 50n ? 1n : 0n);
  if (amount > MAX_MINOR) throw new Error("Marginal rate exceeds the technical money bound");
  return amount.toString();
}

export function marginalPreview(raw: MarginalRule, previousEligible: number, newEligible: number, rounding: "FLOOR" | "CEILING" | "HALF_UP" = "HALF_UP") {
  const rule = marginalRule.parse(raw);
  if (![previousEligible, newEligible].every(v => Number.isSafeInteger(v) && v >= 0) || previousEligible > 1000000 || newEligible > 100 || previousEligible + newEligible > 1000000) throw new Error("Invalid eligible admission count");
  const rows: { tier: number; from: number; to: number; count: number; rateMinor: string; amountMinor: string }[] = [];
  let total = 0n, remaining = newEligible, position = previousEligible + 1;
  while (remaining) {
    const tier = Math.floor((position - 1) / rule.milestoneSize) + 1;
    const end = tier * rule.milestoneSize, count = Math.min(remaining, end - position + 1);
    const rateMinor = marginalRate(rule, tier, rounding), amount = BigInt(rateMinor) * BigInt(count);
    total += amount;
    if (total > MAX_MINOR) throw new Error("Marginal total exceeds the technical money bound");
    rows.push({ tier, from: position, to: position + count - 1, count, rateMinor, amountMinor: amount.toString() });
    position += count; remaining -= count;
  }
  return { rows, totalMinor: total.toString(), nextTier: Math.floor((position - 1) / rule.milestoneSize) + 1, nextMilestone: Math.ceil(position / rule.milestoneSize) * rule.milestoneSize };
}

export function admissionAmount(rule: MarginalRule | { type: "ADMISSION_BONUS"; perAdmissionMinor: string; milestoneEvery: number; milestoneBonusMinor: string }, sequence: number, rounding: "FLOOR" | "CEILING" | "HALF_UP" = "HALF_UP") {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 1_000_000) throw new Error("Invalid admission sequence");
  if (rule.type === "MARGINAL_MILESTONE") return marginalRate(rule, Math.floor((sequence - 1) / rule.milestoneSize) + 1, rounding);
  const configured = z.object({ type: z.literal("ADMISSION_BONUS"), perAdmissionMinor: minor, milestoneEvery: positiveInteger, milestoneBonusMinor: minor }).strict().parse(rule);
  const amount = BigInt(configured.perAdmissionMinor) + (sequence % configured.milestoneEvery === 0 ? BigInt(configured.milestoneBonusMinor) : 0n);
  if (amount > MAX_MINOR) throw new Error("Admission amount exceeds the technical money bound");
  return amount.toString();
}
