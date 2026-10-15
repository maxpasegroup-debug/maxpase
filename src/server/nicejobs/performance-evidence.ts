import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Context } from "@/server/domain/operations-scope";
import { workerKnowledgeWhere, type KnowledgeWorker } from "./knowledge-access";
import { metricDefinition, evidenceReference, type MetricDefinition, type EvidenceReference } from "./performance-input";

export type PerformanceWorker = KnowledgeWorker & { profile: { personId: string }; onboardingId: string | null };
const open: Prisma.TaskWhereInput["status"] = { in: ["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED"] };
const has = (ctx: Context, key: string, a: PerformanceWorker) => ctx.organizationIds(key).includes(a.divisionId);
const own = (ctx: Context, a: PerformanceWorker) => ctx.user?.personId === a.profile.personId;
export function sourceAuthorized(ctx: Context, a: PerformanceWorker, source: MetricDefinition["source"]) {
  if (source.startsWith("TASK")) return has(ctx, "task.read", a) || own(ctx, a) && has(ctx, "nicejobs.work.read", a);
  if (source.startsWith("LEAD") || source.startsWith("FOLLOWUP")) return has(ctx, own(ctx, a) ? "nicejobs.lead.self.read" : "nicejobs.lead.pool.read", a);
  if (source.startsWith("REPORT")) return has(ctx, own(ctx, a) ? "nicejobs.report.self" : "nicejobs.report.read", a);
  if (source === "SOP_ACKNOWLEDGED") return has(ctx, "nicejobs.sop.read", a);
  if (source === "BLOCKER_OPEN") return has(ctx, own(ctx, a) ? "nicejobs.blocker.self" : "nicejobs.blocker.manage", a);
  return has(ctx, own(ctx, a) ? "nicejobs.onboarding.self" : "nicejobs.onboarding.read", a);
}
export const metricResult = z.object({ metric: metricDefinition, actual: z.number().finite().nullable(), denominator: z.number().int().nullable(), variance: z.number().finite().nullable(), status: z.enum(["ON_TRACK", "ATTENTION", "BELOW_EXPECTATION", "NOT_MEASURED"]), coverage: z.string(), calculation: z.string(), evidence: z.array(evidenceReference).max(25), evidenceCount: z.number().int().nonnegative(), sampled: z.boolean() }).strict();
export type MetricResult = z.infer<typeof metricResult>;
export function calculateMetric(metric: MetricDefinition, actual: number | null) {
  if (!metric.active || actual === null || !metric.target) return { status: "NOT_MEASURED" as const, variance: null };
  const t = metric.target, low = t.min, high = t.max;
  const variance = metric.direction === "HIGHER" ? actual - low! : metric.direction === "LOWER" ? high! - actual : actual < low! ? actual - low! : actual > high! ? high! - actual : 0;
  const expected = metric.direction === "HIGHER" ? actual >= low! : metric.direction === "LOWER" ? actual <= high! : actual >= low! && actual <= high!;
  const attention = metric.direction === "HIGHER" ? t.attentionMin !== undefined && actual >= t.attentionMin : metric.direction === "LOWER" ? t.attentionMax !== undefined && actual <= t.attentionMax : (actual < low! ? t.attentionMin !== undefined && actual >= t.attentionMin : t.attentionMax !== undefined && actual <= t.attentionMax);
  return { status: expected ? "ON_TRACK" as const : attention ? "ATTENTION" as const : "BELOW_EXPECTATION" as const, variance };
}
export function overallStatus(results: Pick<MetricResult, "status">[]) {
  if (results.some(r => r.status === "BELOW_EXPECTATION")) return "BELOW_EXPECTATION";
  if (results.some(r => r.status === "ATTENTION")) return "ATTENTION";
  return results.length && results.every(r => r.status === "ON_TRACK") ? "ON_TRACK" : "NOT_MEASURED";
}
export function metricTrend(metric: MetricDefinition, values: (number | null)[]) {
  if (values.length < 3 || values.some(v => v === null) || metric.direction === "RANGE") return "INSUFFICIENT_DATA";
  const changes = values.slice(1).map((v, i) => (v! - values[i]!) * (metric.direction === "LOWER" ? -1 : 1));
  if (changes.every(v => v === 0)) return "STABLE";
  if (changes.every(v => v >= 0)) return "IMPROVING";
  if (changes.every(v => v <= 0)) return "DECLINING";
  return "INSUFFICIENT_DATA";
}
export async function measureMetric(db: Prisma.TransactionClient, ctx: Context, a: PerformanceWorker, companyId: string, metric: MetricDefinition, start: Date, end: Date, now: Date): Promise<MetricResult> {
  const base = { metric, actual: null, denominator: null, variance: null, status: "NOT_MEASURED" as const, coverage: "NOT_CONFIGURED", calculation: metric.source + " / " + metric.method, evidence: [] as EvidenceReference[], evidenceCount: 0, sampled: false };
  if (!sourceAuthorized(ctx, a, metric.source)) return { ...base, coverage: "NOT_AUTHORIZED" };
  if (!metric.active || metric.effectiveFrom && new Date(metric.effectiveFrom) > start || metric.effectiveUntil && new Date(metric.effectiveUntil) < end) return { ...base, coverage: "INACTIVE_OR_OUTSIDE_EFFECTIVE_PERIOD" };
  const period = { gte: start, lt: end };
  let count = 0, denominator: number | null = null, refs: EvidenceReference[] = [], calculation = base.calculation;
  if (metric.source.startsWith("TASK")) {
    const cohort: Prisma.TaskWhereInput = { niceJobsAssignmentId: a.id, assigneePersonId: a.profile.personId, organizationId: a.divisionId };
    const where: Prisma.TaskWhereInput = { ...cohort, ...(metric.source === "TASK_COMPLETED" ? { status: "COMPLETED", ...(metric.method === "PERCENTAGE" ? { createdAt: period, completionDate: { lt: end } } : { completionDate: period }) } : metric.source === "TASK_BLOCKED" ? { status: "BLOCKED", createdAt: { lt: end } } : { status: open, dueDate: period }) };
    count = await db.task.count({ where }); refs = (await db.task.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: 25 })).map(r => ({ type: "TASK", id: r.id }));
    if (metric.method === "PERCENTAGE") denominator = await db.task.count({ where: { ...cohort, createdAt: period } });
    calculation = metric.method === "PERCENTAGE" ? "Tasks created in the period and completed before its end / all tasks created in the period x 100" : metric.source === "TASK_COMPLETED" ? "Recorded completions in [start, end)" : metric.source === "TASK_BLOCKED" ? "Tasks created before period end and currently blocked at generation" : "Tasks due in [start, end) and still open at generation";
  } else if (metric.source.startsWith("LEAD") || metric.source.startsWith("FOLLOWUP")) {
    const policy = { divisionId: a.divisionId, status: "ACTIVE", definition: { status: "ACTIVE" }, eligibility: { some: { versionId: a.versionId } } };
    if (!await db.niceJobsLeadPolicy.findFirst({ where: policy, select: { id: true } })) return base;
    const lead = { companyId, divisionId: a.divisionId, currentWorkerAssignmentId: a.id, policy };
    if (metric.source === "LEAD_ASSIGNED") {
      const where = { workerAssignmentId: a.id, assignedAt: period, lead };
      count = await db.niceJobsLeadAssignment.count({ where }); refs = (await db.niceJobsLeadAssignment.findMany({ where, select: { leadId: true }, orderBy: { id: "asc" }, take: 25 })).map(r => ({ type: "LEAD", id: r.leadId })); calculation = "Assignment history rows recorded in period for currently owned leads; reassignment rows are separate events";
    } else if (metric.source === "LEAD_CONTACT") {
      const where = { workerAssignmentId: a.id, kind: "CONTACT", visibility: "WORKER", createdAt: period, lead };
      count = await db.niceJobsLeadActivity.count({ where }); refs = (await db.niceJobsLeadActivity.findMany({ where, select: { leadId: true }, orderBy: { id: "asc" }, take: 25 })).map(r => ({ type: "LEAD", id: r.leadId })); calculation = "Human-recorded CONTACT events in period for currently owned leads; not provider delivery evidence";
    } else if (metric.source === "LEAD_OUTCOME") {
      const where = { ...lead, updatedAt: period, workflowInstance: { currentState: { key: metric.outcome } } };
      count = await db.niceJobsLead.count({ where }); refs = (await db.niceJobsLead.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: 25 })).map(r => ({ type: "LEAD", id: r.id })); calculation = "Currently owned leads updated in period whose current configured workflow state is " + metric.outcome;
    } else {
      const cohort = { workerAssignmentId: a.id, lead, scheduledAt: period };
      const where = { ...cohort, ...(metric.source === "FOLLOWUP_COMPLETED" ? metric.method === "PERCENTAGE" ? { status: "COMPLETED", completedAt: { lt: end } } : { status: "COMPLETED", completedAt: period } : { status: "SCHEDULED" }) };
      count = await db.niceJobsLeadFollowup.count({ where }); refs = (await db.niceJobsLeadFollowup.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: 25 })).map(r => ({ type: "FOLLOWUP", id: r.id }));
      if (metric.method === "PERCENTAGE") denominator = await db.niceJobsLeadFollowup.count({ where: { ...cohort, status: { not: "CANCELLED" } } });
      calculation = metric.source === "FOLLOWUP_MISSED" ? "Follow-ups scheduled in the closed period and still scheduled at generation" : "Follow-ups scheduled in period and recorded completed by its end" + (denominator !== null ? " / all non-cancelled scheduled cohort x 100" : "");
    }
  } else if (metric.source.startsWith("REPORT")) {
    if (metric.source === "REPORT_COMPLETE") return { ...base, calculation: "Report completeness policy is not configured; submission is not inferred completeness" };
    const where = { assignmentId: a.id, submittedAt: period, correction: null };
    count = await db.niceJobsDailyReport.count({ where }); refs = (await db.niceJobsDailyReport.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: 25 })).map(r => ({ type: "REPORT", id: r.id })); calculation = "Latest correction heads submitted during period; original reports are not double-counted";
  } else if (metric.source === "SOP_ACKNOWLEDGED") {
    const where = { assignmentId: a.id, acknowledgedAt: period, version: workerKnowledgeWhere(ctx, a, companyId, "SOP", now, false) };
    count = await db.niceJobsKnowledgeReceipt.count({ where }); refs = (await db.niceJobsKnowledgeReceipt.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: 25 })).map(r => ({ type: "SOP_RECEIPT", id: r.id })); calculation = "Explicit exact-version SOP acknowledgements in period, not competence or certification";
  } else if (metric.source === "BLOCKER_OPEN") {
    const where = { niceJobsAssignmentId: a.id, organizationId: a.divisionId, status: "OPEN", createdAt: { lt: end } };
    count = await db.executionBlocker.count({ where }); refs = (await db.executionBlocker.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: 25 })).map(r => ({ type: "BLOCKER", id: r.id })); calculation = "Blockers created before period end and unresolved at generation; not misconduct";
  } else {
    const where = { onboardingId: a.onboardingId ?? "", phase: metric.source === "ORIENTATION_COMPLETED" ? "ORIENTATION" : "OJT", status: { in: ["COMPLETED", "APPROVED"] }, completedAt: period };
    count = await db.niceJobsTrainingProgress.count({ where }); refs = (await db.niceJobsTrainingProgress.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: 25 })).map(r => ({ type: "TRAINING", id: r.id })); calculation = "Canonical completed/approved training progress records with completion timestamp in period";
  }
  const actual = metric.method === "PERCENTAGE" ? denominator ? count / denominator * 100 : null : count;
  return { ...base, actual, denominator, ...calculateMetric(metric, actual), coverage: actual === null ? "NO_DENOMINATOR" : "RECORDED_EVIDENCE", calculation, evidence: refs, evidenceCount: count, sampled: count > refs.length };
}

// Batch by source type: historical evidence is reauthorized before any reference is projected.
export async function authorizedEvidence(db: Prisma.TransactionClient, ctx: Context, a: PerformanceWorker, companyId: string, refs: EvidenceReference[], now: Date) {
  const allowed = new Set<string>();
  for (const type of [...new Set(refs.map(r => r.type))]) {
    const ids = [...new Set(refs.filter(r => r.type === type).map(r => r.id))];
    let rows: { id: string }[] = [];
    if (type === "TASK" && sourceAuthorized(ctx, a, "TASK_COMPLETED")) rows = await db.task.findMany({ where: { id: { in: ids }, niceJobsAssignmentId: a.id, assigneePersonId: a.profile.personId, organizationId: a.divisionId }, select: { id: true }, take: ids.length });
    if (type === "LEAD" && sourceAuthorized(ctx, a, "LEAD_CONTACT")) rows = await db.niceJobsLead.findMany({ where: { id: { in: ids }, companyId, divisionId: a.divisionId, currentWorkerAssignmentId: a.id }, select: { id: true }, take: ids.length });
    if (type === "FOLLOWUP" && sourceAuthorized(ctx, a, "FOLLOWUP_COMPLETED")) rows = await db.niceJobsLeadFollowup.findMany({ where: { id: { in: ids }, workerAssignmentId: a.id, lead: { companyId, divisionId: a.divisionId, currentWorkerAssignmentId: a.id } }, select: { id: true }, take: ids.length });
    if (type === "REPORT" && sourceAuthorized(ctx, a, "REPORT_SUBMITTED")) rows = await db.niceJobsDailyReport.findMany({ where: { id: { in: ids }, assignmentId: a.id }, select: { id: true }, take: ids.length });
    if (type === "TRAINING" && sourceAuthorized(ctx, a, "OJT_COMPLETED")) rows = await db.niceJobsTrainingProgress.findMany({ where: { id: { in: ids }, onboardingId: a.onboardingId ?? "" }, select: { id: true }, take: ids.length });
    if (type === "BLOCKER" && sourceAuthorized(ctx, a, "BLOCKER_OPEN")) rows = await db.executionBlocker.findMany({ where: { id: { in: ids }, niceJobsAssignmentId: a.id, organizationId: a.divisionId }, select: { id: true }, take: ids.length });
    if (type === "SOP_RECEIPT" && sourceAuthorized(ctx, a, "SOP_ACKNOWLEDGED")) rows = await db.niceJobsKnowledgeReceipt.findMany({ where: { id: { in: ids }, assignmentId: a.id, version: workerKnowledgeWhere(ctx, a, companyId, "SOP", now, false) }, select: { id: true }, take: ids.length });
    if (type === "SOP" || type === "RESOURCE") rows = await db.niceJobsKnowledgeVersion.findMany({ where: { AND: [workerKnowledgeWhere(ctx, a, companyId, type, now, false), { id: { in: ids } }] }, select: { id: true }, take: ids.length });
    for (const r of rows) allowed.add(type + ":" + r.id);
  }
  return refs.filter(r => allowed.has(r.type + ":" + r.id));
}
