import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { createEmployeeService } from "./employee";
import type { AgentConstraint } from "@/server/authorization/engine";

const query = z.object({ divisionId: z.string().min(1).max(200).optional() }).strict();
type Metric = { key: string; label: string; state: "AVAILABLE" | "NOT_AUTHORIZED" | "NOT_CONFIGURED"; value: number | null; href: string };
type Item = { id: string; kind: string; title: string; detail: string; href: string; dueAt: Date | null };

export function createWorkforceCommandCenter(client: PrismaClient = prisma, now: () => Date = () => new Date()) {
  const employee = createEmployeeService(client, now).internal;
  async function overview(userId: string, raw: unknown = {}, constraint?: AgentConstraint) {
    const q = query.parse(raw), b = await employee.boundary(client, userId, constraint);
    const commandIds = b.ctx.organizationIds("nicejobs.command.read").filter(id => b.ctx.nodes.some(n => n.id === id && n.parentId === b.company.id));
    if (!commandIds.length || q.divisionId && !commandIds.includes(q.divisionId)) throw new AccessError("Workforce command scope unavailable");
    const scoped = (permission: string) => commandIds.filter(id => (!q.divisionId || q.divisionId === id) && b.ctx.organizationIds(permission).includes(id));
    const metrics: Metric[] = [], items: Item[] = [], clock = now();
    async function measure(key: string, label: string, permission: string, href: string, count: (ids: string[]) => Promise<number>, configured?: (ids: string[]) => Promise<boolean>) {
      const ids = scoped(permission);
      if (!ids.length) { metrics.push({ key, label, state: "NOT_AUTHORIZED", value: null, href }); return; }
      if (configured && !await configured(ids)) { metrics.push({ key, label, state: "NOT_CONFIGURED", value: null, href }); return; }
      metrics.push({ key, label, state: "AVAILABLE", value: await count(ids), href });
    }
    const link = (view: string, more = "") => `/app/nicejobs?view=${view}${q.divisionId ? `&divisionId=${encodeURIComponent(q.divisionId)}` : ""}${more}`;
    await measure("workers", "Workers", "nicejobs.workspace.read", link("active-workforce"), ids => client.niceJobsAssignment.count({ where: { divisionId: { in: ids }, profile: { companyId: b.company.id }, version: { template: { productId: b.product.id } } } }));
    await measure("active", "Active workers", "nicejobs.workspace.read", link("active-workforce", "&status=ACTIVE"), ids => client.niceJobsAssignment.count({ where: { divisionId: { in: ids }, profile: { companyId: b.company.id }, version: { template: { productId: b.product.id } }, status: "ACTIVE", lifecycle: "ACTIVE", activatedAt: { not: null } } }));
    await measure("ready", "Ready for activation", "nicejobs.onboarding.read", link("activation"), ids => client.niceJobsOnboarding.count({ where: { application: { companyId: b.company.id, divisionId: { in: ids } }, status: "READY", readinessStatus: "READY" } }));
    await measure("submittedApplications", "Submitted applications", "nicejobs.application.read", link("applications", "&status=SUBMITTED"), ids => client.niceJobsApplication.count({ where: { companyId: b.company.id, divisionId: { in: ids }, area: { version: { template: { productId: b.product.id } } }, status: "SUBMITTED" } }));
    await measure("screeningApplications", "Applications in screening", "nicejobs.application.read", link("applications", "&status=SCREENING"), ids => client.niceJobsApplication.count({ where: { companyId: b.company.id, divisionId: { in: ids }, area: { version: { template: { productId: b.product.id } } }, status: "SCREENING" } }));
    await measure("recruitment", "Recruitment reviews", "nicejobs.management.review", link("applications"), ids => client.operationalRequest.count({ where: { organizationId: { in: ids }, resourceType: "NICE_JOBS_RECRUITMENT", status: "SUBMITTED" } }));
    await measure("tasks", "Overdue tasks", "task.read", link("active-workforce", "&attention=OVERDUE"), ids => client.task.count({ where: { organizationId: { in: ids }, niceJobsAssignment: { profile: { companyId: b.company.id }, version: { template: { productId: b.product.id } } }, dueDate: { lt: clock }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }));
    await measure("followups", "Overdue follow-ups", "nicejobs.lead.pool.read", link("lead-pool"), ids => client.niceJobsLeadFollowup.count({ where: { workerAssignment: { divisionId: { in: ids }, profile: { companyId: b.company.id } }, status: "SCHEDULED", scheduledAt: { lt: clock } } }), ids => client.niceJobsLeadPolicy.count({ where: { companyId: b.company.id, divisionId: { in: ids }, status: "ACTIVE" } }).then(n => n > 0));
    await measure("dueFollowups", "Due in 24 hours", "nicejobs.lead.pool.read", link("lead-pool"), ids => client.niceJobsLeadFollowup.count({ where: { workerAssignment: { divisionId: { in: ids }, profile: { companyId: b.company.id } }, status: "SCHEDULED", scheduledAt: { gte: clock, lt: new Date(clock.getTime() + 86400000) } } }), ids => client.niceJobsLeadPolicy.count({ where: { companyId: b.company.id, divisionId: { in: ids }, status: "ACTIVE" } }).then(n => n > 0));
    await measure("blockers", "Open blockers", "nicejobs.blocker.manage", link("active-workforce", "&attention=BLOCKED"), ids => client.executionBlocker.count({ where: { organizationId: { in: ids }, niceJobsAssignment: { isNot: null }, status: "OPEN" } }));
    metrics.push({ key: "missingReports", label: "Missing required reports", state: "NOT_CONFIGURED", value: null, href: link("active-workforce") });
    await measure("attention", "Performance attention", "nicejobs.performance.read", link("performance"), ids => client.niceJobsPerformanceAttention.count({ where: { snapshot: { assignment: { divisionId: { in: ids }, profile: { companyId: b.company.id } } }, status: { not: "RESOLVED" } } }));
    await measure("pipReviews", "PIP reviews due", "nicejobs.pip.read", link("pips"), ids => client.niceJobsPip.count({ where: { assignment: { divisionId: { in: ids }, profile: { companyId: b.company.id } }, status: { notIn: ["DRAFT", "COMPLETED", "CANCELLED"] }, reviewAt: { lte: clock } } }));
    await measure("incentives", "Incentives awaiting approval", "nicejobs.finance.incentive.read", link("finance-incentives", "&status=UNDER_REVIEW"), ids => client.niceJobsIncentiveEarning.count({ where: { assignment: { divisionId: { in: ids }, profile: { companyId: b.company.id } }, status: "UNDER_REVIEW" } }), ids => client.niceJobsIncentivePolicy.count({ where: { companyId: b.company.id, divisionId: { in: ids } } }).then(n => n > 0));
    await measure("settlements", "Settlement reviews", "nicejobs.finance.settlement.read", link("finance-settlements", "&status=REVIEW"), ids => client.niceJobsSettlementPeriod.count({ where: { policy: { companyId: b.company.id, divisionId: { in: ids } }, status: "REVIEW" } }), ids => client.niceJobsIncentivePolicy.count({ where: { companyId: b.company.id, divisionId: { in: ids } } }).then(n => n > 0));
    await measure("financeExceptions", "Financial exceptions", "nicejobs.finance.reconcile", link("finance-exceptions"), ids => client.niceJobsFinanceException.count({ where: { companyId: b.company.id, divisionId: { in: ids } } }));
    await measure("automationFailures", "Failed automation", "nicejobs.automation.read", link("automation-runs"), async ids => (await client.automationRun.count({ where: { rule: { organizationId: { in: ids }, lifecycle: { not: "LEGACY" } }, status: { in: ["FAILED", "DEAD_LETTER"] } } })) + (await client.scheduledJob.count({ where: { organizationId: { in: ids }, rule: { lifecycle: { not: "LEGACY" } }, status: "FAILED" } })));
    await measure("pausedWorkflows", "Paused workflows", "nicejobs.automation.read", link("automation-workflows", "&status=PAUSED"), ids => client.automationRule.count({ where: { organizationId: { in: ids }, lifecycle: "PAUSED" } }));
    await measure("exceptions", "Operational exceptions", "nicejobs.exception.read", link("workforce-exceptions"), ids => client.niceJobsOperationalException.count({ where: { companyId: b.company.id, divisionId: { in: ids }, status: { notIn: ["RESOLVED", "DISMISSED"] } } }));
    const detailIds = scoped("nicejobs.workspace.read").filter(id => scoped("person.read").includes(id));
    const taskIds = scoped("task.read").filter(id => detailIds.includes(id));
    if (taskIds.length) for (const t of await client.task.findMany({ where: { organizationId: { in: taskIds }, niceJobsAssignment: { profile: { companyId: b.company.id }, version: { template: { productId: b.product.id } } }, dueDate: { lt: clock }, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, title: true, dueDate: true, niceJobsAssignmentId: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 6 })) items.push({ id: t.id, kind: "TASK", title: t.title, detail: "Overdue task", dueAt: t.dueDate, href: link("worker-detail", `&assignmentId=${encodeURIComponent(t.niceJobsAssignmentId!)}`) });
    const blockerIds = scoped("nicejobs.blocker.manage").filter(id => detailIds.includes(id));
    if (blockerIds.length) for (const r of await client.executionBlocker.findMany({ where: { organizationId: { in: blockerIds }, niceJobsAssignment: { profile: { companyId: b.company.id }, version: { template: { productId: b.product.id } } }, status: "OPEN" }, select: { id: true, reason: true, createdAt: true, niceJobsAssignmentId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 6 })) items.push({ id: r.id, kind: "BLOCKER", title: r.reason ?? "Worker blocker", detail: "Needs review", dueAt: null, href: link("worker-detail", `&assignmentId=${encodeURIComponent(r.niceJobsAssignmentId!)}#my-blockers`) });
    const followIds = scoped("nicejobs.lead.pool.read");
    if (followIds.length) for (const f of await client.niceJobsLeadFollowup.findMany({ where: { workerAssignment: { divisionId: { in: followIds }, profile: { companyId: b.company.id } }, status: "SCHEDULED", scheduledAt: { lt: clock } }, select: { id: true, leadId: true, purpose: true, scheduledAt: true }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 6 })) items.push({ id: f.id, kind: "FOLLOWUP", title: f.purpose, detail: "Overdue follow-up", dueAt: f.scheduledAt, href: link("lead-detail", `&leadId=${encodeURIComponent(f.leadId)}`) });
    items.sort((a, c) => (a.dueAt?.getTime() ?? 0) - (c.dueAt?.getTime() ?? 0));
    const divisions = await client.organization.findMany({ where: { id: { in: commandIds }, parentId: b.company.id }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 50 });
    const applicationIds = scoped("nicejobs.application.read");
    const screening = applicationIds.length ? await client.niceJobsApplication.findMany({ where: { companyId: b.company.id, divisionId: { in: applicationIds }, status: { in: ["SUBMITTED", "ELIGIBILITY", "SCREENING", "MANAGEMENT_REVIEW"] }, area: { version: { template: { productId: b.product.id } } } }, select: { reference: true, status: true, eligibilityStatus: true, screeningStatus: true, updatedAt: true, area: { select: { version: { select: { title: true } } } } }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 11 }) : null;
    return { company: b.company.name, companyId: b.company.id, divisionId: q.divisionId ?? null, divisions, metrics, items: items.slice(0, 12), screening: screening?.slice(0, 10).map(a => ({ reference: a.reference, title: a.area.version.title, status: a.status, eligibility: a.eligibilityStatus, screening: a.screeningStatus, updatedAt: a.updatedAt, href: link("applications", "&reference=" + encodeURIComponent(a.reference)) })) ?? null, screeningTruncated: !!screening && screening.length > 10, scheduler: "NOT_CONFIGURED" as const, payoutProvider: "NOT_CONFIGURED" as const, asOf: clock };
  }
  return { overview };
}
export const workforceCommandCenter = createWorkforceCommandCenter();
