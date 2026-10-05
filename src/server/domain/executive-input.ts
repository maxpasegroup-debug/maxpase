import { z } from "zod";
import { requiredUtcDate } from "./execution-input";
export const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const attentionStates = ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "DISMISSED"] as const;
export const decisionStates = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "DEFERRED", "CANCELLED", "COMPLETED"] as const;
export const riskStates = ["IDENTIFIED", "MONITORING", "MITIGATING", "REALIZED", "CLOSED", "ACCEPTED"] as const;
export const opportunityStates = ["IDENTIFIED", "EVALUATING", "PURSUING", "REALIZED", "CLOSED"] as const;
const id = z.string().min(1).max(200), text = z.string().trim().min(1).max(200), note = z.string().trim().min(1).max(4000);
export const executiveInput = z.object({
  kind: z.enum(["DECISION", "KPI", "RISK", "OPPORTUNITY"]), organizationId: id, projectId: id.nullable().optional(), ownerPersonId: id,
  title: text, description: note, dueAt: requiredUtcDate.nullable().optional(), reference: z.string().min(8).max(120),
  impact: note.optional(), options: z.array(text).max(10).default([]), recommendedAction: note.optional(),
  target: z.number().finite().optional(), unit: text.optional(), direction: z.enum(["HIGHER", "LOWER"]).optional(),
  periodStart: requiredUtcDate.optional(), periodEnd: requiredUtcDate.optional(), source: note.optional(),
  severity: z.enum(severities).optional(), probability: z.number().min(0).max(1).nullable().optional(), mitigation: note.optional(), nextAction: note.optional()
}).strict().superRefine((v, c) => {
  if (v.kind === "KPI" && (v.target === undefined || !v.unit || !v.direction || !v.periodStart || !v.periodEnd || !v.source || v.periodEnd < v.periodStart)) c.addIssue({ code: "custom", message: "KPI requires target, unit, direction, valid period and attested source" });
  if (v.kind === "DECISION" && !v.impact) c.addIssue({ code: "custom", message: "Decision requires impact" });
  if (v.kind === "RISK" && !v.severity) c.addIssue({ code: "custom", message: "Risk requires severity" });
  if (v.kind === "OPPORTUNITY" && (!v.impact || !v.nextAction)) c.addIssue({ code: "custom", message: "Opportunity requires impact and next action" });
});
export const executiveTransition = z.object({ id, expectedVersion: z.number().int().min(0), status: text, reason: note, observation: z.number().finite().optional() }).strict();
export const executiveRevision = z.object({ id, expectedVersion: z.number().int().min(0), reason: note, title: text, description: note, impact: note.optional(), mitigation: note.optional(), nextAction: note.optional(), severity: z.enum(severities).optional(), probability: z.number().min(0).max(1).nullable().optional() }).strict();
export const executiveFilter = z.object({ organizationId: id.optional(), projectId: id.optional(), productId: id.optional(),
  from: requiredUtcDate.optional(), until: requiredUtcDate.optional(), severity: z.enum(severities).optional(), status: z.enum([...attentionStates, ...decisionStates, ...riskStates, ...opportunityStates, "ON_TRACK", "AT_RISK", "OFF_TRACK", "NO_DATA"]).optional()
}).strict().refine(v => !v.from || !v.until || v.from <= v.until, "Invalid period");
export function kpiStatus(actual: number | null, target: number, direction: "HIGHER" | "LOWER") {
  if (actual === null) return "NO_DATA";
  const delta = direction === "HIGHER" ? actual - target : target - actual;
  return delta >= 0 ? "ON_TRACK" : -delta <= Math.max(Math.abs(target) * 0.1, Number.EPSILON) ? "AT_RISK" : "OFF_TRACK";
}
export function trend(values: number[], direction: "HIGHER" | "LOWER" = "HIGHER") {
  if (values.length < 3) return "INSUFFICIENT_DATA";
  const diffs = values.slice(1).map((v, i) => v - values[i]);
  if (diffs.every(d => d === 0)) return "STABLE";
  if (diffs.some(d => d > 0) && diffs.some(d => d < 0)) return "VOLATILE";
  return (values.at(-1)! > values[0]) === (direction === "HIGHER") ? "IMPROVING" : "DECLINING";
}
