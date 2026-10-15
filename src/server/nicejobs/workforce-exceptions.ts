import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { operationalEvent, notify } from "@/server/domain/operational-events";
import { createEmployeeService } from "./employee";

type DB = Prisma.TransactionClient;
const id = z.string().min(1).max(200);
const command = z.object({ id, operation: z.enum(["ASSIGN", "ACKNOWLEDGE", "START", "RESOLVE", "REOPEN"]), revision: z.number().int().min(0), ownerUserId: id.optional(), reason: z.string().trim().min(3).max(500) }).strict();
const filter = z.object({ divisionId: id.optional(), status: z.enum(["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"]).optional(), after: id.optional(), limit: z.number().int().min(1).max(100).default(25) }).strict();

export function createWorkforceExceptions(client: PrismaClient = prisma, now: () => Date = () => new Date()) {
  const employee = createEmployeeService(client, now).internal;
  async function recordFailedJob(db: DB, processorUserId: string, jobId: string) {
    const job = await db.scheduledJob.findUnique({ where: { id: jobId }, include: { rule: true } });
    if (!job || job.status !== "FAILED" || job.rule.lifecycle === "LEGACY" || job.rule.divisionId !== job.organizationId) throw new AccessError("Failed workforce job unavailable");
    const b = await employee.boundary(db, processorUserId);
    if (!b.ctx.nodes.some(n => n.id === job.organizationId && n.parentId === b.company.id)) throw new AccessError("Job scope unavailable");
    await b.ctx.requireAccess("nicejobs.automation.process", { organizationId: job.organizationId });
    const sourceKey = "automation-job:" + job.id;
    const prior = await db.niceJobsOperationalException.findUnique({ where: { companyId_sourceKey: { companyId: b.company.id, sourceKey } } });
    if (prior) return prior;
    const row = await db.niceJobsOperationalException.create({ data: { companyId: b.company.id, divisionId: job.organizationId, kind: "AUTOMATION_FAILED", severity: "HIGH", sourceType: "ScheduledJob", sourceId: job.id, sourceKey, nextAction: "Review the job failure and current workflow authority before retrying" } });
    await operationalEvent(db, { actorUserId: processorUserId, organizationId: job.organizationId, action: "nicejobs.exception.detected", entityType: "NiceJobsOperationalException", entityId: row.id, result: "FAILURE", reference: "nicejobs-exception:" + row.id, metadata: { sourceType: row.sourceType, sourceId: row.sourceId } });
    return row;
  }
  async function mutate(userId: string, raw: unknown) {
    const c = command.parse(raw);
    return client.$transaction(async db => {
      const row = await db.niceJobsOperationalException.findUnique({ where: { id: c.id } });
      if (!row) throw new AccessError("Exception unavailable");
      const b = await employee.boundary(db, userId);
      if (row.companyId !== b.company.id || !b.ctx.nodes.some(n => n.id === row.divisionId && n.parentId === b.company.id)) throw new AccessError("Exception scope unavailable");
      await b.ctx.requireAccess("nicejobs.exception.manage", { organizationId: row.divisionId });
      if (row.revision !== c.revision) throw new AccessError("Exception changed; refresh");
      let status = row.status, ownerUserId = row.ownerUserId, resolutionEvidence = row.resolutionEvidence;
      if (c.operation === "ASSIGN") {
        if (["RESOLVED", "DISMISSED"].includes(status) || !c.ownerUserId) throw new AccessError("Assignment unavailable");
        const owner = await createAccessContext(c.ownerUserId, db);
        await owner.requireAccess("nicejobs.exception.read", { organizationId: row.divisionId });
        await owner.requireAccess("notification.read", { organizationId: row.divisionId });
        await owner.requireAccess("organization.read", { organizationId: row.divisionId });
        if (!owner.user?.personId) throw new AccessError("Owner unavailable");
        ownerUserId = c.ownerUserId;
      } else if (c.operation === "ACKNOWLEDGE") {
        if (status !== "OPEN") throw new AccessError("Exception cannot be acknowledged");
        status = "ACKNOWLEDGED";
      } else if (c.operation === "START") {
        if (!["OPEN", "ACKNOWLEDGED"].includes(status)) throw new AccessError("Exception cannot be started");
        status = "IN_PROGRESS";
      } else if (c.operation === "RESOLVE") {
        if (!["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"].includes(status)) throw new AccessError("Exception cannot be resolved");
        status = "RESOLVED"; resolutionEvidence = c.reason;
      } else {
        if (status !== "RESOLVED") throw new AccessError("Only resolved exceptions may reopen");
        status = "OPEN"; resolutionEvidence = null;
      }
      const changed = await db.niceJobsOperationalException.updateMany({ where: { id: row.id, revision: row.revision, status: row.status }, data: { status, ownerUserId, resolutionEvidence, revision: { increment: 1 }, ...(c.operation === "ACKNOWLEDGE" ? { acknowledgedByUserId: userId, acknowledgedAt: now() } : {}), ...(c.operation === "RESOLVE" ? { resolvedByUserId: userId, resolvedAt: now() } : {}), ...(c.operation === "REOPEN" ? { resolvedByUserId: null, resolvedAt: null } : {}) } });
      if (changed.count !== 1) throw new AccessError("Exception changed; refresh");
      if (c.operation === "ASSIGN" && ownerUserId) await notify(db, userId, ownerUserId, { organizationId: row.divisionId, resourceType: "ORGANIZATION", resourceId: row.divisionId }, "NICE_JOBS_EXCEPTION", "Operational exception assigned", "A workforce automation failure needs review", "nicejobs-exception-assigned:" + row.id + ":" + (row.revision + 1), "HIGH");
      await operationalEvent(db, { actorUserId: userId, organizationId: row.divisionId, action: "nicejobs.exception." + c.operation.toLowerCase(), entityType: "NiceJobsOperationalException", entityId: row.id, result: "SUCCESS", reference: "nicejobs-exception-action:" + randomUUID(), metadata: { reason: c.reason, previous: row.status, next: status, ownerUserId } });
      return { id: row.id, status, revision: row.revision + 1 };
    });
  }
  async function list(userId: string, raw: unknown = {}) {
    const q = filter.parse(raw), b = await employee.boundary(client, userId);
    const ids = b.ctx.organizationIds("nicejobs.exception.read").filter(id => b.ctx.nodes.some(n => n.id === id && n.parentId === b.company.id) && (!q.divisionId || q.divisionId === id));
    if (q.divisionId && !ids.includes(q.divisionId)) throw new AccessError("Exception scope unavailable");
    const rows = ids.length ? await client.niceJobsOperationalException.findMany({ where: { companyId: b.company.id, divisionId: { in: ids }, ...(q.status ? { status: q.status } : {}), ...(q.after ? { id: { gt: q.after } } : {}) }, orderBy: { id: "asc" }, take: q.limit + 1 }) : [];
    const jobs = await client.scheduledJob.findMany({ where: { id: { in: rows.slice(0, q.limit).filter(r => r.sourceType === "ScheduledJob").map(r => r.sourceId) } }, select: { id: true, ruleId: true } });
    const jobRule = new Map(jobs.map(j => [j.id, j.ruleId]));
    return { records: rows.slice(0, q.limit).map(r => ({ id: r.id, divisionId: r.divisionId, kind: r.kind, severity: r.severity, status: r.status, sourceType: r.sourceType, sourceId: r.sourceId, sourceRuleId: jobRule.get(r.sourceId) ?? null, ownerUserId: r.ownerUserId, nextAction: r.nextAction, detectedAt: r.detectedAt, revision: r.revision, resolutionEvidence: r.resolutionEvidence, canManage: b.ctx.organizationIds("nicejobs.exception.manage").includes(r.divisionId) })), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null };
  }
  async function detail(userId: string, exceptionId: string) {
    const b = await employee.boundary(client, userId), row = await client.niceJobsOperationalException.findUnique({ where: { id: id.parse(exceptionId) } });
    if (!row || row.companyId !== b.company.id || !b.ctx.nodes.some(n => n.id === row.divisionId && n.parentId === b.company.id)) throw new AccessError("Exception unavailable");
    await b.ctx.requireAccess("nicejobs.exception.read", { organizationId: row.divisionId });
    const history = await client.operationalEvent.findMany({ where: { organizationId: row.divisionId, entityType: "NiceJobsOperationalException", entityId: row.id }, select: { id: true, eventType: true, actorUserId: true, createdAt: true, status: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25 });
    const candidates = await client.user.findMany({ where: { status: "ACTIVE", person: { status: "ACTIVE", memberships: { some: { organizationId: row.divisionId, status: "ACTIVE" } } } }, select: { id: true, person: { select: { displayName: true } } }, orderBy: { id: "asc" }, take: 26 });
    const owners = [];
    if (b.ctx.organizationIds("nicejobs.exception.manage").includes(row.divisionId)) for (const user of candidates.slice(0, 25)) { const ctx = await createAccessContext(user.id, client); if ((await ctx.decide("nicejobs.exception.read", { organizationId: row.divisionId })).allowed && (await ctx.decide("notification.read", { organizationId: row.divisionId })).allowed && (await ctx.decide("organization.read", { organizationId: row.divisionId })).allowed) owners.push({ id: user.id, name: user.person?.displayName ?? "Account" }); }
    return { row, history, owners, canManage: b.ctx.organizationIds("nicejobs.exception.manage").includes(row.divisionId) };
  }
  return { recordFailedJob, mutate, list, detail };
}
export const workforceExceptions = createWorkforceExceptions();
