import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { createAutomationService } from "@/server/communications/automation";
import { ruleInput, jobInput } from "@/server/communications/input";
import { operationalEvent } from "@/server/domain/operational-events";
import { createEmployeeService } from "./employee";
import { createWorkforceExceptions } from "./workforce-exceptions";
import { automationProvenance } from "./automation-provenance";

type DB = Prisma.TransactionClient;
const id = z.string().min(1).max(200);
const reason = z.string().trim().min(3).max(500);
const definition = ruleInput.safeExtend({ enabled: z.literal(false), description: z.string().trim().max(500).default("") }).strict();
const mutation = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("DRAFT"), definition, ruleId: id.optional(), expectedVersion: z.number().int().min(0).optional(), idempotencyKey: z.uuid(), reason }).strict(),
  z.object({ operation: z.enum(["SUBMIT", "PUBLISH", "PAUSE", "RESUME", "ARCHIVE"]), ruleId: id, expectedVersion: z.number().int().min(0), reason }).strict(),
  z.object({ operation: z.literal("SCHEDULE"), ruleId: id, job: jobInput, reason }).strict(),
  z.object({ operation: z.literal("PROCESS_EVENT"), ruleId: id, eventId: id }).strict(),
  z.object({ operation: z.literal("PROCESS_DUE"), limit: z.number().int().min(1).max(25).default(25) }).strict(),
  z.object({ operation: z.literal("PAUSE_JOB"), jobId: id, expectedVersion: z.number().int().min(0), reason }).strict()
]);
type Command = z.infer<typeof mutation>;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createNiceJobsAutomationControl(client: PrismaClient = prisma, now: () => Date = () => new Date()) {
  const employee = createEmployeeService(client, now).internal;
  const automation = createAutomationService(client, now);
  const exceptions = createWorkforceExceptions(client, now);
  async function boundary(db: DB, userId: string, orgId: string, permission: string) {
    const b = await employee.boundary(db, userId);
    const division = await db.organization.findFirst({ where: { id: orgId, parentId: b.company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true } });
    if (!division) throw new AccessError("Automation scope unavailable");
    await b.ctx.requireAccess(permission, { organizationId: orgId });
    await b.ctx.requireAccess("automation." + (permission.endsWith("process") ? "process" : permission.endsWith("read") ? "read" : "manage"), { organizationId: orgId });
    return b;
  }
  async function ownedRule(db: DB, userId: string, ruleId: string, permission: string) {
    const rule = await db.automationRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.lifecycle === "LEGACY" || rule.divisionId !== rule.organizationId) throw new AccessError("Workflow unavailable");
    const b = await boundary(db, userId, rule.organizationId, permission);
    return { rule, b };
  }
  async function event(db: DB, userId: string, orgId: string, action: string, type: string, entityId: string, detail: Record<string, string> = {}) {
    return operationalEvent(db, { actorUserId: userId, organizationId: orgId, action: "nicejobs.automation." + action, entityType: type, entityId, result: "SUCCESS", reference: "nicejobs-automation:" + randomUUID(), metadata: detail });
  }
  async function draft(userId: string, c: Extract<Command, { operation: "DRAFT" }>) {
    return client.$transaction(async db => {
      const d = c.definition, b = await boundary(db, userId, d.organizationId, "nicejobs.automation.manage");
      await b.ctx.requireAccess("nicejobs.automation.read", { organizationId: d.organizationId });
      const recipient = await createAccessContext(d.condition.recipientUserId, db);
      await recipient.requireAccess("notification.read", { organizationId: d.organizationId });
      if (!recipient.user?.personId) throw new AccessError("Recipient unavailable");
      let rule;
      if (c.ruleId) {
        const prior = await ownedRule(db, userId, c.ruleId, "nicejobs.automation.manage");
        if (prior.rule.organizationId !== d.organizationId || prior.rule.ownerUserId !== userId || prior.rule.ownerPersonId !== b.personId || prior.rule.version !== c.expectedVersion || prior.rule.lifecycle === "ARCHIVED") throw new AccessError("Workflow changed or owner unavailable");
        if (await db.niceJobsAutomationVersion.count({ where: { ruleId: c.ruleId, status: { in: ["DRAFT", "REVIEW"] } } })) throw new AccessError("Finish the current draft before creating another");
        rule = prior.rule;
      } else {
        const stableId = "njauto_" + createHash("sha256").update(userId + ":" + c.idempotencyKey).digest("hex").slice(0, 32);
        const replay = await db.automationRule.findUnique({ where: { id: stableId }, include: { versions: { orderBy: { number: "asc" }, take: 1 } } });
        if (replay) {
          if (replay.organizationId !== d.organizationId || replay.ownerUserId !== userId || replay.ownerPersonId !== b.personId || replay.versions[0]?.definition !== JSON.stringify(d)) throw new AccessError("Draft replay mismatch");
          return { id: replay.id, versionId: replay.versions[0].id, version: replay.version };
        }
        rule = await db.automationRule.create({ data: { id: stableId, organizationId: d.organizationId, divisionId: d.organizationId, ownerUserId: userId, ownerPersonId: b.personId, name: d.name, description: d.description, trigger: d.trigger, action: d.action, condition: JSON.stringify(d.condition), enabled: false, lifecycle: "DRAFT" } });
      }
      const number = (await db.niceJobsAutomationVersion.aggregate({ where: { ruleId: rule.id }, _max: { number: true } }))._max.number ?? 0;
      const version = await db.niceJobsAutomationVersion.create({ data: { ruleId: rule.id, number: number + 1, definition: JSON.stringify(d), status: "DRAFT" } });
      if (c.ruleId) await db.automationRule.update({ where: { id: rule.id, version: c.expectedVersion }, data: { version: { increment: 1 } } });
      await event(db, userId, d.organizationId, "draft", "NiceJobsAutomationVersion", version.id, { reason: c.reason, fingerprint: digest(d) });
      return { id: rule.id, versionId: version.id, version: rule.version + (c.ruleId ? 1 : 0) };
    });
  }
  async function transition(userId: string, c: Extract<Command, { operation: "SUBMIT" | "PUBLISH" | "PAUSE" | "RESUME" | "ARCHIVE" }>) {
    return client.$transaction(async db => {
      const { rule, b } = await ownedRule(db, userId, c.ruleId, c.operation === "PUBLISH" ? "nicejobs.automation.review" : "nicejobs.automation.manage");
      if (rule.version !== c.expectedVersion) throw new AccessError("Workflow changed; refresh");
      const latest = await db.niceJobsAutomationVersion.findFirst({ where: { ruleId: rule.id }, orderBy: { number: "desc" } });
      if (!latest) throw new AccessError("Workflow definition unavailable");
      const scope = { organizationId: rule.organizationId };
      if (c.operation === "SUBMIT") {
        if (rule.ownerUserId !== userId || latest.status !== "DRAFT") throw new AccessError("Draft unavailable");
        await db.niceJobsAutomationVersion.update({ where: { id: latest.id }, data: { status: "REVIEW" } });
      } else if (c.operation === "PUBLISH") {
        if (latest.status !== "REVIEW" || b.personId === rule.ownerPersonId || rule.lifecycle === "ARCHIVED") throw new AccessError("Independent review required");
        await b.ctx.requireAccess("automation.manage", scope);
        const owner = await createAccessContext(rule.ownerUserId, db);
        if (owner.user?.personId !== rule.ownerPersonId) throw new AccessError("Workflow owner identity changed");
        await owner.requireAccess("automation.manage", scope);
        await owner.requireAccess("nicejobs.automation.manage", scope);
        const d = definition.parse(JSON.parse(latest.definition));
        const recipient = await createAccessContext(d.condition.recipientUserId, db);
        await recipient.requireAccess("notification.read", scope);
        if (!recipient.user?.personId) throw new AccessError("Recipient unavailable");
        await db.niceJobsAutomationVersion.updateMany({ where: { ruleId: rule.id, status: "PUBLISHED" }, data: { status: "ARCHIVED" } });
        await db.niceJobsAutomationVersion.update({ where: { id: latest.id }, data: { status: "PUBLISHED", reviewedByUserId: userId, reviewedByPersonId: b.personId, reviewedAt: now(), publishedAt: now() } });
        await db.automationRule.update({ where: { id: rule.id }, data: { name: d.name, description: d.description, trigger: d.trigger, action: d.action, condition: JSON.stringify(d.condition), lifecycle: "PUBLISHED", enabled: true, version: { increment: 1 } } });
      } else {
        if (c.operation === "PAUSE" && rule.lifecycle !== "PUBLISHED" || c.operation === "RESUME" && rule.lifecycle !== "PAUSED" || c.operation === "ARCHIVE" && rule.lifecycle === "ARCHIVED") throw new AccessError("Workflow transition unavailable");
        if (c.operation === "RESUME" && !await db.niceJobsAutomationVersion.findFirst({ where: { ruleId: rule.id, status: "PUBLISHED" } })) throw new AccessError("Published workflow unavailable");
        await db.automationRule.update({ where: { id: rule.id }, data: { lifecycle: c.operation === "ARCHIVE" ? "ARCHIVED" : c.operation === "PAUSE" ? "PAUSED" : "PUBLISHED", enabled: c.operation === "RESUME", version: { increment: 1 } } });
      }
      if (c.operation === "SUBMIT") await db.automationRule.update({ where: { id: rule.id }, data: { version: { increment: 1 } } });
      await event(db, userId, rule.organizationId, c.operation.toLowerCase(), "AutomationRule", rule.id, { reason: c.reason, versionId: latest.id });
      return { id: rule.id };
    });
  }
  async function mutate(userId: string, raw: unknown) {
    const c = mutation.parse(raw);
    if (c.operation === "DRAFT") return draft(userId, c);
    if (c.operation === "SUBMIT" || c.operation === "PUBLISH" || c.operation === "PAUSE" || c.operation === "RESUME" || c.operation === "ARCHIVE") return transition(userId, c);
    if (c.operation === "PROCESS_DUE") {
      const b = await employee.boundary(client, userId);
      const ids = b.ctx.organizationIds("nicejobs.automation.process").filter(id => b.ctx.nodes.some(n => n.id === id && n.parentId === b.company.id));
      if (!ids.length) throw new AccessError("Automation processing unavailable");
      const results = await automation.processDue(userId, c.limit, ids);
      const failed = await client.$queryRaw<{ id: string }[]>`
        SELECT job.id FROM ScheduledJob AS job
        JOIN AutomationRule AS rule ON rule.id = job.ruleId
        WHERE job.organizationId IN (${Prisma.join(ids)})
          AND job.status = 'FAILED' AND rule.lifecycle != 'LEGACY'
          AND rule.divisionId = job.organizationId
          AND NOT EXISTS (
            SELECT 1 FROM NiceJobsOperationalException AS exception
            WHERE exception.companyId = ${b.company.id}
              AND exception.sourceKey = 'automation-job:' || job.id
          )
        ORDER BY job.id ASC LIMIT ${c.limit}`;
      for (const job of failed) await client.$transaction(db => exceptions.recordFailedJob(db, userId, job.id));
      return results;
    }
    if (c.operation === "PAUSE_JOB") {
      const job = await client.scheduledJob.findUnique({ where: { id: c.jobId } });
      if (!job) throw new AccessError("Job unavailable");
      await ownedRule(client, userId, job.ruleId, "nicejobs.automation.manage");
      await automation.pauseJob(userId, job.id, c.expectedVersion);
      return { id: job.id };
    }
    if (c.operation !== "SCHEDULE" && c.operation !== "PROCESS_EVENT") throw new AccessError("Unsupported automation command");
    const ruleId = c.ruleId;
    const { rule, b } = await ownedRule(client, userId, ruleId, "nicejobs.automation.process");
    if (rule.lifecycle !== "PUBLISHED") throw new AccessError("Published workflow required");
    if (c.operation === "SCHEDULE") {
      await b.ctx.requireAccess("nicejobs.automation.manage", { organizationId: rule.organizationId });
      if (c.job.ruleId !== rule.id) throw new AccessError("Job workflow mismatch");
      return automation.schedule(userId, c.job);
    }
    return automation.processEvent(userId, rule.id, c.eventId);
  }
  async function list(userId: string, raw: unknown = {}) {
    const q = z.object({ divisionId: id.optional(), status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "PAUSED", "ARCHIVED"]).optional(), after: id.optional(), limit: z.number().int().min(1).max(100).default(25) }).strict().parse(raw);
    const b = await employee.boundary(client, userId);
    const ids = b.ctx.organizationIds("nicejobs.automation.read").filter(org => b.ctx.organizationIds("automation.read").includes(org) && b.ctx.nodes.some(n => n.id === org && n.parentId === b.company.id) && (!q.divisionId || q.divisionId === org));
    if (q.divisionId && !ids.includes(q.divisionId)) throw new AccessError("Division unavailable");
    const rows = ids.length ? await client.automationRule.findMany({ where: { organizationId: { in: ids }, divisionId: { not: null }, lifecycle: q.status ?? { not: "LEGACY" }, ...(q.after ? { id: { gt: q.after } } : {}) }, include: { versions: { orderBy: { number: "desc" }, take: 1 } }, orderBy: { id: "asc" }, take: q.limit + 1 }) : [];
    const divisions = ids.length ? await client.organization.findMany({ where: { id: { in: ids }, parentId: b.company.id }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 50 }) : [];
    return { records: rows.slice(0, q.limit).map(r => ({ id: r.id, name: r.name, description: r.description, divisionId: r.organizationId, trigger: r.trigger, action: r.action, status: r.lifecycle, version: r.version, latest: r.versions[0] ? { id: r.versions[0].id, number: r.versions[0].number, status: r.versions[0].status } : null, ownerUserId: r.ownerUserId, canManage: b.ctx.organizationIds("nicejobs.automation.manage").includes(r.organizationId), canReview: b.ctx.organizationIds("nicejobs.automation.review").includes(r.organizationId) && b.personId !== r.ownerPersonId })), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null, divisions };
  }
  async function detail(userId: string, ruleId: string, after?: string) {
    const { rule, b } = await ownedRule(client, userId, ruleId, "nicejobs.automation.read");
    const versions = await client.niceJobsAutomationVersion.findMany({ where: { ruleId }, orderBy: { number: "desc" }, take: 25 });
    const runRows = await client.automationRun.findMany({ where: { ruleId, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: 26, select: { id: true, reference: true, status: true, failureCode: true, failureClass: true, attempts: true, nextRetryAt: true, createdAt: true, finishedAt: true, resultId: true, correlationId: true, sourceEventId: true, evidence: true, workflowVersionId: true } });
    const audits = b.ctx.organizationIds("audit.read").includes(rule.organizationId) ? await client.auditEvent.findMany({ where: { organizationId: rule.organizationId, entityType: "AutomationRun", entityId: { in: runRows.slice(0, 25).map(r => r.id) }, action: "automation.executed" }, select: { id: true, entityId: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 }) : null;
    const runs = runRows.map(({ evidence, workflowVersionId, ...r }) => ({ ...r, authority: automationProvenance(evidence, r.resultId, workflowVersionId, b.ctx.organizationIds("user.read").includes(rule.organizationId)), audit: audits === null ? null : audits.filter(a => a.entityId === r.id).map(a => ({ id: a.id, createdAt: a.createdAt })) }));
    const jobs = await client.scheduledJob.findMany({ where: { ruleId }, orderBy: { id: "asc" }, take: 25, select: { id: true, status: true, enabled: true, nextRunAt: true, lastRunAt: true, attempts: true, maxAttempts: true, failureCode: true, version: true } });
    const eventType = rule.trigger === "TASK_OVERDUE" ? "Task" : rule.trigger === "PROJECT_BLOCKED" ? "Project" : "SiaApproval";
    const sourceCap = rule.trigger === "TASK_OVERDUE" ? "task.read" : rule.trigger === "PROJECT_BLOCKED" ? "project.read" : "approval.read";
    const recentEvents = b.ctx.organizationIds("nicejobs.automation.process").includes(rule.organizationId) && b.ctx.organizationIds("event.read").includes(rule.organizationId) && b.ctx.organizationIds(sourceCap).includes(rule.organizationId) ? await client.operationalEvent.findMany({ where: { organizationId: rule.organizationId, entityType: eventType, status: "SUCCEEDED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, select: { id: true, eventType: true, createdAt: true } }) : [];
    return { rule: { id: rule.id, name: rule.name, description: rule.description, divisionId: rule.organizationId, status: rule.lifecycle, trigger: rule.trigger, action: rule.action, version: rule.version, ownerUserId: rule.ownerUserId }, versions: versions.map(v => ({ id: v.id, number: v.number, status: v.status, definition: v.status === "DRAFT" || v.status === "REVIEW" ? definition.parse(JSON.parse(v.definition)) : null, reviewedAt: v.reviewedAt, publishedAt: v.publishedAt })), runs: runs.slice(0, 25), nextCursor: runs.length > 25 ? runs[24].id : null, jobs, recentEvents, canProcess: b.ctx.organizationIds("nicejobs.automation.process").includes(rule.organizationId), canManage: b.ctx.organizationIds("nicejobs.automation.manage").includes(rule.organizationId) && rule.ownerUserId === userId, canSchedule: b.ctx.organizationIds("nicejobs.automation.manage").includes(rule.organizationId) && b.ctx.organizationIds("nicejobs.automation.process").includes(rule.organizationId) && rule.ownerUserId === userId, canReview: b.ctx.organizationIds("nicejobs.automation.review").includes(rule.organizationId) && b.personId !== rule.ownerPersonId };
  }
  async function options(userId: string, divisionId?: string) {
    const b = await employee.boundary(client, userId);
    const divisions = await client.organization.findMany({ where: { parentId: b.company.id, id: { in: b.ctx.organizationIds("nicejobs.automation.manage").filter(id => b.ctx.organizationIds("automation.manage").includes(id)) }, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { id: "asc" }, take: 50 });
    if (divisionId && !divisions.some(d => d.id === divisionId)) {
      if (b.ctx.organizationIds("nicejobs.automation.read").includes(divisionId) && b.ctx.organizationIds("automation.read").includes(divisionId) && b.ctx.nodes.some(n => n.id === divisionId && n.parentId === b.company.id)) return { divisions: [], recipients: [], truncated: false };
      throw new AccessError("Division unavailable");
    }
    const candidates = divisionId ? await client.user.findMany({ where: { status: "ACTIVE", person: { status: "ACTIVE", memberships: { some: { organizationId: divisionId, status: "ACTIVE" } } } }, select: { id: true, person: { select: { displayName: true } } }, orderBy: { id: "asc" }, take: 51 }) : [];
    const recipients = [];
    for (const user of candidates.slice(0, 50)) {
      const ctx = await createAccessContext(user.id, client);
      if ((await ctx.decide("notification.read", { organizationId: divisionId! })).allowed) recipients.push({ id: user.id, name: user.person?.displayName ?? "Account" });
    }
    return { divisions, recipients, truncated: candidates.length > 50 || divisions.length === 50 };
  }
  async function executions(userId: string, raw: unknown = {}) {
    const q = z.object({ divisionId: id.optional(), status: z.enum(["PROCESSING", "SUCCEEDED", "FAILED", "RETRY_PENDING", "DEAD_LETTER"]).optional(), after: id.optional(), limit: z.number().int().min(1).max(100).default(25) }).strict().parse(raw);
    const b = await employee.boundary(client, userId), ids = b.ctx.organizationIds("nicejobs.automation.read").filter(org => b.ctx.organizationIds("automation.read").includes(org) && b.ctx.nodes.some(n => n.id === org && n.parentId === b.company.id) && (!q.divisionId || q.divisionId === org));
    if (q.divisionId && !ids.includes(q.divisionId)) throw new AccessError("Execution scope unavailable");
    const where = { rule: { organizationId: { in: ids }, lifecycle: { not: "LEGACY" } }, ...(q.status ? { status: q.status } : {}) };
    const rows = ids.length ? await client.automationRun.findMany({ where: { ...where, ...(q.after ? { id: { gt: q.after } } : {}) }, include: { rule: { select: { name: true, organizationId: true } } }, orderBy: { id: "asc" }, take: q.limit + 1 }) : [];
    const counts = ids.length ? await client.automationRun.groupBy({ by: ["status"], where, _count: { id: true } }) : [];
    const pendingJobs = ids.length ? await client.scheduledJob.findFirst({ where: { organizationId: { in: ids }, rule: { lifecycle: { not: "LEGACY" } }, status: "PENDING" }, orderBy: [{ nextRunAt: "asc" }, { id: "asc" }], select: { nextRunAt: true } }) : null;
    const lastSuccess = ids.length ? await client.automationRun.findFirst({ where: { rule: { organizationId: { in: ids }, lifecycle: { not: "LEGACY" } }, status: "SUCCEEDED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { finishedAt: true, createdAt: true } }) : null;
    const failedJobs = ids.length ? await client.scheduledJob.count({ where: { organizationId: { in: ids }, rule: { lifecycle: { not: "LEGACY" } }, status: "FAILED" } }) : 0;
    return { records: rows.slice(0, q.limit).map(r => ({ id: r.id, ruleId: r.ruleId, ruleName: r.rule.name, divisionId: r.rule.organizationId, status: r.status, failureCode: r.failureCode, failureClass: r.failureClass, attempts: r.attempts, nextRetryAt: r.nextRetryAt, createdAt: r.createdAt, finishedAt: r.finishedAt, correlationId: r.correlationId, resultId: r.resultId })), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null, counts: Object.fromEntries(counts.map(c => [c.status, c._count.id])), failedJobs, oldestPendingAt: pendingJobs?.nextRunAt ?? null, lastSucceededAt: lastSuccess?.finishedAt ?? lastSuccess?.createdAt ?? null, canProcess: ids.some(org => b.ctx.organizationIds("nicejobs.automation.process").includes(org) && b.ctx.organizationIds("automation.process").includes(org)), scheduler: "NOT_CONFIGURED" as const };
  }
  return { mutate, list, detail, options, executions };
}
export const niceJobsAutomationControl = createNiceJobsAutomationControl();
