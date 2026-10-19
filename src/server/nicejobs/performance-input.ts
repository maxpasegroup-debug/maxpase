import { z } from "zod";
import { isTimezone } from "@/lib/timezone";

const id = z.string().min(1).max(100), text = z.string().trim().min(1).max(2000), date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "Valid calendar date required"), instant = z.string().datetime();
export const metricSource = z.enum(["TASK_COMPLETED", "TASK_OVERDUE", "TASK_BLOCKED", "LEAD_ASSIGNED", "LEAD_CONTACT", "FOLLOWUP_COMPLETED", "FOLLOWUP_MISSED", "LEAD_OUTCOME", "REPORT_SUBMITTED", "REPORT_COMPLETE", "ORIENTATION_COMPLETED", "OJT_COMPLETED", "SOP_ACKNOWLEDGED", "BLOCKER_OPEN"]);
export const metricDefinition = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]{0,49}$/), name: z.string().trim().min(1).max(200), description: text,
  unit: z.string().trim().min(1).max(80), category: z.enum(["ACTIVITY", "QUALITY", "TIMELINESS", "COMPLETION", "FOLLOW_UP", "LEARNING", "COMPLIANCE", "CUSTOM"]),
  direction: z.enum(["HIGHER", "LOWER", "RANGE"]), source: metricSource, method: z.enum(["COUNT", "PERCENTAGE"]),
  visibility: z.enum(["WORKER", "MANAGEMENT"]), active: z.boolean(),
  target: z.object({ min: z.number().finite().nonnegative().optional(), max: z.number().finite().nonnegative().optional(), attentionMin: z.number().finite().nonnegative().optional(), attentionMax: z.number().finite().nonnegative().optional() }).strict().optional(),
  outcome: z.string().trim().min(1).max(100).optional(), effectiveFrom: instant.optional(), effectiveUntil: instant.optional()
}).strict().superRefine((m, ctx) => {
  if (m.target && (m.direction === "HIGHER" && m.target.min === undefined || m.direction === "LOWER" && m.target.max === undefined || m.direction === "RANGE" && (m.target.min === undefined || m.target.max === undefined))) ctx.addIssue({ code: "custom", message: "Explicit direction-compatible targets required" });
  if (m.target?.min !== undefined && m.target.max !== undefined && m.target.min > m.target.max) ctx.addIssue({ code: "custom", message: "Invalid target range" });
  if (m.target?.attentionMin !== undefined && (m.target.min === undefined || m.target.attentionMin > m.target.min) || m.target?.attentionMax !== undefined && (m.target.max === undefined || m.target.attentionMax < m.target.max)) ctx.addIssue({ code: "custom", message: "Attention boundaries must contain the expected range" });
  if (m.source === "LEAD_OUTCOME" && !m.outcome || m.source !== "LEAD_OUTCOME" && m.outcome) ctx.addIssue({ code: "custom", message: "Outcome requires the lead outcome source" });
  if (m.method === "PERCENTAGE" && !["TASK_COMPLETED", "FOLLOWUP_COMPLETED", "REPORT_COMPLETE"].includes(m.source)) ctx.addIssue({ code: "custom", message: "Percentage source needs a defined denominator" });
  if (m.effectiveFrom && m.effectiveUntil && m.effectiveFrom >= m.effectiveUntil) ctx.addIssue({ code: "custom", message: "Invalid metric dates" });
});
export const frameworkPayload = z.object({ name: z.string().trim().min(1).max(200), divisionId: id, jobVersionId: id, period: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]), timezone: z.string().refine(isTimezone), effectiveAt: instant, metrics: z.array(metricDefinition).min(1).max(30) }).strict().refine(p => new Set(p.metrics.map(m => m.key)).size === p.metrics.length, "Metric keys must be unique");
export const evidenceReference = z.object({ type: z.enum(["TASK", "LEAD", "FOLLOWUP", "REPORT", "TRAINING", "SOP_RECEIPT", "BLOCKER", "SOP", "RESOURCE"]), id }).strict();
export const pipObjective = z.object({ key: z.string().regex(/^[A-Z][A-Z0-9_]{0,49}$/), objective: text, baseline: text, expectedImprovement: text, source: metricSource, dueAt: instant, reviewAt: instant, status: z.enum(["PENDING", "IN_PROGRESS", "MET", "NEEDS_SUPPORT"]), notes: z.string().max(2000).optional() }).strict();
export const pipPayload = z.object({ title: z.string().trim().min(1).max(200), managerId: id, reason: text, workerMessage: text, privateNote: z.string().max(2000).optional(), startAt: instant, reviewAt: instant, requiredAck: z.boolean(), objectives: z.array(pipObjective).min(1).max(20), supportActions: z.array(z.object({ description: text, reference: evidenceReference.optional() }).strict()).max(20) }).strict().refine(p => p.startAt < p.reviewAt && new Set(p.objectives.map(o => o.key)).size === p.objectives.length && p.objectives.every(o => o.dueAt >= p.startAt && o.dueAt <= p.reviewAt && o.reviewAt >= o.dueAt && o.reviewAt <= p.reviewAt), "Plan/objective dates and keys must be consistent");
const base = { confirmed: z.literal(true), idempotencyKey: z.uuid() }, version = { versionId: id, revision: z.number().int().nonnegative() }, pip = { pipId: id, revision: z.number().int().nonnegative() };
export const performanceCommand = z.discriminatedUnion("operation", [
  z.object({ ...base, operation: z.literal("FRAMEWORK_CREATE"), payload: frameworkPayload }).strict(),
  z.object({ ...base, ...version, operation: z.literal("FRAMEWORK_EDIT"), payload: frameworkPayload }).strict(),
  z.object({ ...base, ...version, operation: z.enum(["FRAMEWORK_PUBLISH", "FRAMEWORK_ARCHIVE", "FRAMEWORK_VERSION"]), reason: text }).strict(),
  z.object({ ...base, operation: z.literal("SNAPSHOT"), assignmentId: id, frameworkVersionId: id, from: z.union([date, instant]), until: z.union([date, instant]), supersedesId: id.optional(), reason: text.optional() }).strict(),
  z.object({ ...base, operation: z.literal("REVIEW"), snapshotId: id, feedback: text, privateNote: z.string().max(2000).optional(), released: z.boolean(), followup: z.string().max(2000).optional(), supportTaskId: id.optional() }).strict(),
  z.object({ ...base, operation: z.literal("FEEDBACK_ACK"), reviewId: id }).strict(),
  z.object({ ...base, operation: z.literal("FLAG"), snapshotId: id, metricKey: id, reason: text }).strict(),
  z.object({ ...base, operation: z.literal("FLAG_RESOLVE"), flagId: id, revision: z.number().int().nonnegative(), reason: text }).strict(),
  z.object({ ...base, operation: z.literal("PIP_CREATE"), snapshotId: id, payload: pipPayload }).strict(),
  z.object({ ...base, ...pip, operation: z.literal("PIP_EDIT"), payload: pipPayload, reason: text }).strict(),
  z.object({ ...base, ...pip, operation: z.enum(["PIP_ACTIVATE", "PIP_RELEASE", "PIP_COMPLETE", "PIP_CANCEL"]), reason: text, outcome: text.optional() }).strict(),
  z.object({ ...base, ...pip, operation: z.literal("PIP_REVIEW"), progress: z.enum(["PROGRESSING", "NEEDS_MORE_SUPPORT", "MEETS_EXPECTATION", "NOT_MEETING_EXPECTATION"]), comment: text, privateNote: z.string().max(2000).optional(), evidence: z.array(evidenceReference).max(25), nextAction: text, released: z.boolean() }).strict(),
  z.object({ ...base, operation: z.literal("PIP_ACK"), pipId: id }).strict(),
  z.object({ ...base, operation: z.literal("PIP_RESPONSE"), pipId: id, comment: text, evidence: z.array(evidenceReference).max(25) }).strict()
]);
export const performanceQuery = z.object({ management: z.boolean().default(false), divisionId: id.optional(), companyId: id.optional(), jobId: id.optional(), assignmentId: id.optional(), frameworkVersionId: id.optional(), search: z.string().trim().max(200).default(""), status: z.enum(["ON_TRACK", "ATTENTION", "BELOW_EXPECTATION", "NOT_MEASURED"]).optional(), pipStatus: z.enum(["DRAFT", "ACTIVE", "UNDER_REVIEW", "COMPLETED", "CANCELLED"]).optional(), from: date.optional(), until: date.optional(), sort: z.enum(["PERIOD_DESC", "ID_ASC"]).default("PERIOD_DESC"), after: id.optional(), limit: z.number().int().min(1).max(100).default(25) }).strict();
export type MetricDefinition = z.infer<typeof metricDefinition>;
export type EvidenceReference = z.infer<typeof evidenceReference>;
