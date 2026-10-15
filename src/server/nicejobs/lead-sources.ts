import type { Prisma } from "@prisma/client";
import type { Context } from "@/server/domain/operations-scope";
import { NiceJobsError } from "./input";
export function followupState(f: { status: string; scheduledAt: Date }, now: Date, start: Date) {
  return f.status !== "SCHEDULED" ? f.status : f.scheduledAt < start ? "MISSED" : f.scheduledAt <= now ? "DUE" : "SCHEDULED";
}
export const leadSummarySelect = { id: true, name: true, priority: true, source: true, divisionId: true, currentWorkerAssignmentId: true, revision: true, createdAt: true, updatedAt: true, workflowInstance: { select: { currentState: { select: { key: true, terminal: true } } } } } satisfies Prisma.NiceJobsLeadSelect;
export async function workerLeadSource(db: Prisma.TransactionClient, ctx: Context, a: { id: string; divisionId: string; versionId: string }, now: Date, bounds: { start: Date; end: Date }) {
  const unavailable = (status: "NOT_AUTHORIZED" | "NOT_CONFIGURED") => ({ status, counts: null, highestPriority: null, leads: [], due: [], overdue: [], upcoming: [], activity: [] });
  if (!(await ctx.decide("nicejobs.lead.self.read", { organizationId: a.divisionId })).allowed) return unavailable("NOT_AUTHORIZED");
  const policy = { status: "ACTIVE", divisionId: a.divisionId, definition: { status: "ACTIVE" }, eligibility: { some: { versionId: a.versionId } } };
  if (!await db.niceJobsLeadPolicy.findFirst({ where: policy, select: { id: true } })) return unavailable("NOT_CONFIGURED");
  const where: Prisma.NiceJobsLeadWhereInput = { divisionId: a.divisionId, currentWorkerAssignmentId: a.id, policy };
  const open = { AND: [where, { workflowInstance: { currentState: { terminal: false } } }] };
  const followup = { workerAssignmentId: a.id, status: "SCHEDULED", assignmentHistory: { status: "ACTIVE" }, lead: open };
  const leads = await db.niceJobsLead.findMany({ where: open, select: leadSummarySelect, orderBy: { id: "asc" }, take: 25 });
  let highestPriority: typeof leads[number] | null = null;
  for (const priority of ["CRITICAL", "HIGH", "NORMAL", "LOW"]) { highestPriority = await db.niceJobsLead.findFirst({ where: { AND: [open, { priority }] }, select: leadSummarySelect, orderBy: { id: "asc" } }); if (highestPriority) break; }
  const select = { id: true, leadId: true, scheduledAt: true, type: true, purpose: true, revision: true, lead: { select: { name: true, revision: true } } } satisfies Prisma.NiceJobsLeadFollowupSelect;
  const due = await db.niceJobsLeadFollowup.findMany({ where: { ...followup, scheduledAt: { gte: bounds.start, lt: bounds.end } }, select, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 25 });
  const overdue = await db.niceJobsLeadFollowup.findMany({ where: { ...followup, scheduledAt: { lt: now } }, select, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 25 });
  const upcoming = await db.niceJobsLeadFollowup.findMany({ where: { ...followup, scheduledAt: { gte: bounds.end } }, select, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 25 });
  const activity = await db.niceJobsLeadActivity.findMany({ where: { lead: where, visibility: "WORKER", createdAt: { gte: bounds.start, lt: bounds.end } }, select: { id: true, leadId: true, kind: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25 });
  const counts = { assigned: await db.niceJobsLead.count({ where }), open: await db.niceJobsLead.count({ where: open }), today: await db.niceJobsLeadFollowup.count({ where: { ...followup, scheduledAt: { gte: bounds.start, lt: bounds.end } } }), overdue: await db.niceJobsLeadFollowup.count({ where: { ...followup, scheduledAt: { lt: now } } }) };
  return { status: "AVAILABLE" as const, counts, highestPriority, leads, due, overdue, upcoming, activity };
}
export async function leadReportSnapshot(db: Prisma.TransactionClient, ctx: Context, a: { id: string; divisionId: string; versionId: string }, bounds: { start: Date; end: Date }) {
  if (!(await ctx.decide("nicejobs.lead.self.read", { organizationId: a.divisionId })).allowed) return { status: "NOT_AUTHORIZED" };
  if (!await db.niceJobsLeadPolicy.findFirst({ where: { divisionId: a.divisionId, status: "ACTIVE", definition: { status: "ACTIVE" }, eligibility: { some: { versionId: a.versionId } } }, select: { id: true } })) return { status: "NOT_CONFIGURED" };
  const activity = { workerAssignmentId: a.id, visibility: "WORKER", createdAt: { gte: bounds.start, lt: bounds.end }, lead: { divisionId: a.divisionId } };
  const worked = await db.niceJobsLeadActivity.groupBy({ by: ["leadId"], where: { ...activity, kind: { in: ["CONTACT", "COMPLETE", "NOTE", "TRANSITION", "SCHEDULE"] } }, orderBy: { leadId: "asc" }, take: 1001 });
  if (worked.length > 1000) throw new NiceJobsError("Report exceeds 1000 worked leads; no partial report was stored");
  return { status: "AVAILABLE", leadsWorked: worked.length, contactsRecorded: await db.niceJobsLeadActivity.count({ where: { ...activity, kind: "CONTACT" } }), followupsCompleted: await db.niceJobsLeadActivity.count({ where: { ...activity, kind: "COMPLETE" } }), followupsPending: await db.niceJobsLeadFollowup.count({ where: { workerAssignmentId: a.id, status: "SCHEDULED", lead: { divisionId: a.divisionId, currentWorkerAssignmentId: a.id }, assignmentHistory: { status: "ACTIVE" } } }) };
}
export async function managerLeadCounts(db: Prisma.TransactionClient, ctx: Context, rows: { id: string; divisionId: string }[], now: Date, bounds: { start: Date; end: Date }) {
  const ids = rows.filter(a => ctx.organizationIds("nicejobs.lead.pool.read").includes(a.divisionId)).map(a => a.id);
  const assigned = await db.niceJobsLead.groupBy({ by: ["currentWorkerAssignmentId"], where: { currentWorkerAssignmentId: { in: ids } }, _count: { _all: true }, orderBy: { currentWorkerAssignmentId: "asc" }, take: 100 });
  const followups = await db.niceJobsLeadFollowup.groupBy({ by: ["workerAssignmentId"], where: { workerAssignmentId: { in: ids }, status: "SCHEDULED", assignmentHistory: { status: "ACTIVE" } }, _count: { _all: true }, orderBy: { workerAssignmentId: "asc" }, take: 100 });
  const overdue = await db.niceJobsLeadFollowup.groupBy({ by: ["workerAssignmentId"], where: { workerAssignmentId: { in: ids }, status: "SCHEDULED", assignmentHistory: { status: "ACTIVE" }, scheduledAt: { lt: now } }, _count: { _all: true }, orderBy: { workerAssignmentId: "asc" }, take: 100 });
  const today = await db.niceJobsLeadActivity.groupBy({ by: ["workerAssignmentId"], where: { workerAssignmentId: { in: ids }, kind: "CONTACT", visibility: "WORKER", createdAt: { gte: bounds.start, lt: bounds.end } }, _count: { _all: true }, orderBy: { workerAssignmentId: "asc" }, take: 100 });
  return new Map(rows.map(a => [a.id, !ids.includes(a.id) ? null : { assigned: assigned.find(r => r.currentWorkerAssignmentId === a.id)?._count._all ?? 0, contactsToday: today.find(r => r.workerAssignmentId === a.id)?._count._all ?? 0, pending: followups.find(r => r.workerAssignmentId === a.id)?._count._all ?? 0, overdue: overdue.find(r => r.workerAssignmentId === a.id)?._count._all ?? 0 }]));
}
