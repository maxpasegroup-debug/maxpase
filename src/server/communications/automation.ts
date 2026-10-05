import { z } from "zod";
import type { PrismaClient, AutomationRule } from "@prisma/client";
import { prisma } from "@/server/db";
import { createAccessContext, AccessError } from "@/server/authorization/engine";
import { boundResource, validRecipient, type DB, type Resource } from "@/server/domain/operations-scope";
import { notify } from "@/server/domain/operational-events";
import { createOperationsService } from "@/server/domain/operations-service";
import { ruleInput, jobInput } from "./input";
import { communicationAudit, rateLimit, fingerprint } from "./service";

export const automationActions = Object.freeze([
  Object.freeze({ key: "NOTIFY_OWNER", permission: "notification.generate", risk: "LOW_RISK_WRITE", external: false }),
  Object.freeze({ key: "REMIND_APPROVER", permission: "reminder.manage", risk: "LOW_RISK_WRITE", external: false }),
  Object.freeze({ key: "FLAG_ATTENTION", permission: "notification.generate", risk: "LOW_RISK_WRITE", external: false })
]);
export function createAutomationService(client: PrismaClient = prisma, clock: () => Date = () => new Date()) {
  const ops = createOperationsService(client);
  async function authority(db: DB, userId: string, row: { organizationId: string; ownerUserId?: string; ownerPersonId?: string }, permission: string) {
    const ctx = await createAccessContext(userId, db); await ctx.requireAccess(permission, row);
    if (!ctx.user?.personId || row.ownerUserId && row.ownerUserId === userId && row.ownerPersonId !== ctx.user.personId) throw new AccessError("Automation owner identity changed"); return ctx;
  }
  async function saveRule(userId: string, raw: unknown, id?: string, version?: number) {
    const v = ruleInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await authority(db, userId, v, "automation.manage");
      await ctx.requireAccess(automationActions.find(a => a.key === v.action)!.permission, v);
      await validRecipient(db, v.condition.recipientUserId, { organizationId: v.organizationId, resourceType: "ORGANIZATION", resourceId: v.organizationId });
      const prior = id ? await db.automationRule.findUnique({ where: { id } }) : null;
      if (id && (!prior || prior.organizationId !== v.organizationId || prior.ownerUserId !== userId || prior.ownerPersonId !== ctx.user!.personId || version === undefined)) throw new AccessError("Rule unavailable");
      const data = { ...v, condition: JSON.stringify(v.condition) };
      const row = prior ? await db.automationRule.update({ where: { id, version }, data: { ...data, version: { increment: 1 } } }) : await db.automationRule.create({ data: { ...data, ownerUserId: userId, ownerPersonId: ctx.user!.personId! } });
      await communicationAudit(db, ctx, v, prior ? "automation.rule_changed" : "automation.rule_created", "AutomationRule", row.id); return row;
    });
  }
  async function schedule(userId: string, raw: unknown) {
    const v = jobInput.parse(raw);
    return client.$transaction(async db => {
      const rule = await db.automationRule.findUniqueOrThrow({ where: { id: v.ruleId } });
      const ctx = await authority(db, userId, rule, "automation.manage");
      if (rule.ownerUserId !== userId) throw new AccessError("Only the rule owner can schedule it");
      const row = await db.scheduledJob.create({ data: { ...v, organizationId: rule.organizationId } });
      await communicationAudit(db, ctx, rule, "automation.job_created", "ScheduledJob", row.id); return row;
    });
  }
  async function apply(db: DB, rule: AutomationRule, resource: Resource, reference: string) {
    const ctx = await authority(db, rule.ownerUserId, rule, "automation.manage");
    const action = automationActions.find(a => a.key === rule.action);
    if (!rule.enabled || !action || rule.ownerPersonId !== ctx.user!.personId || resource.organizationId !== rule.organizationId) throw new AccessError("Automation authority unavailable");
    const scope = await boundResource(db, ctx, resource, action.permission);
    const config = z.object({ minimumAgeMinutes: z.number().int().min(0), recipientUserId: z.string() }).strict().parse(JSON.parse(rule.condition));
    const age = clock().getTime() - config.minimumAgeMinutes * 60000;
    let matches = false;
    if (rule.trigger === "TASK_OVERDUE" && scope.resourceType === "TASK") {
      const task = await db.task.findUniqueOrThrow({ where: { id: scope.resourceId } });
      const recipient = await db.user.findUnique({ where: { id: config.recipientUserId } });
      matches = !!task.dueDate && task.dueDate.getTime() < age && !["COMPLETED", "CANCELLED"].includes(task.status) && !!recipient?.personId && [task.assigneePersonId, task.ownerPersonId].includes(recipient.personId);
    } else if (rule.trigger === "APPROVAL_PENDING" && scope.resourceType === "APPROVAL") {
      const approval = await db.siaApproval.findUniqueOrThrow({ where: { id: scope.resourceId }, include: { request: true } });
      matches = approval.status === "PENDING" && approval.request?.status === "SUBMITTED" && approval.createdAt.getTime() < age && approval.approverUserId === config.recipientUserId;
    } else if (rule.trigger === "PROJECT_BLOCKED" && scope.resourceType === "PROJECT") {
      const project = await db.project.findUniqueOrThrow({ where: { id: scope.resourceId } }); matches = project.status === "BLOCKED" && project.updatedAt.getTime() < age;
    }
    if (!matches) return null;
    const hash = fingerprint({ ruleId: rule.id, version: rule.version, resource, reference });
    const prior = await db.automationRun.findUnique({ where: { reference } });
    if (prior) { if (prior.fingerprint !== hash) throw new AccessError("Automation replay mismatch"); return prior; }
    await validRecipient(db, config.recipientUserId, scope);
    await rateLimit(db, rule.organizationId, "automation", 25, 60000, clock());
    const run = await db.automationRun.create({ data: { ruleId: rule.id, reference, fingerprint: hash, status: "PROCESSING" } });
    const result = action.key === "REMIND_APPROVER"
      ? await ops.saveReminder(rule.ownerUserId, { ...scope, recipientUserId: config.recipientUserId, remindAt: clock(), reason: "Pending approval requires human review", reference: "automation:" + run.id }, db)
      : await notify(db, rule.ownerUserId, config.recipientUserId, scope, action.key === "FLAG_ATTENTION" ? "PROJECT_BLOCKED" : "TASK_OVERDUE", action.key === "FLAG_ATTENTION" ? "Blocked project requires attention" : "Overdue task", "An explicit operational condition requires review", "automation:" + run.id, "HIGH");
    await communicationAudit(db, ctx, scope, "automation.executed", "AutomationRun", run.id);
    return db.automationRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", resultId: result?.id } });
  }
  async function processEvent(userId: string, ruleId: string, eventId: string) {
    return client.$transaction(async db => {
      const rule = await db.automationRule.findUniqueOrThrow({ where: { id: ruleId } });
      await authority(db, userId, rule, "automation.process");
      const event = await db.operationalEvent.findUniqueOrThrow({ where: { id: eventId } });
      const ctx = await authority(db, userId, rule, "event.read");
      if (event.organizationId !== rule.organizationId || event.status !== "SUCCEEDED" || JSON.parse(event.metadata ?? "{}").origin === "USER_REPORTED") throw new AccessError("Only actual scoped domain events may trigger automation");
      const map: Record<string, string> = { Task: "TASK", task: "TASK", tasks: "TASK", Project: "PROJECT", project: "PROJECT", projects: "PROJECT", SiaApproval: "APPROVAL", Approval: "APPROVAL" };
      if (!map[event.entityType]) throw new AccessError("Unsupported automation source");
      const resource = { organizationId: event.organizationId, projectId: event.projectId, resourceType: map[event.entityType], resourceId: event.entityId };
      await boundResource(db, ctx, resource, "automation.process");
      return apply(db, rule, resource, "automation:event:" + rule.id + ":" + event.id);
    });
  }
  async function processDue(userId: string, limit = 25) {
    z.number().int().min(1).max(100).parse(limit);
    const ctx = await createAccessContext(userId, client), ids = ctx.organizationIds("automation.process");
    if (!ids.length) throw new AccessError("Access denied");
    const jobs = await client.scheduledJob.findMany({ where: { organizationId: { in: ids }, enabled: true, status: "PENDING", nextRunAt: { lte: clock() } }, take: limit, orderBy: [{ nextRunAt: "asc" }, { id: "asc" }] });
    const results = [];
    for (const job of jobs) {
      try {
        const result = await client.$transaction(async db => {
          const current = await db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
          const processor = await authority(db, userId, current, "automation.process");
          if (current.version !== job.version) return { id: job.id, processed: 0, skipped: 0, status: "SKIPPED" };
          const rule = await db.automationRule.findUniqueOrThrow({ where: { id: current.ruleId } });
          if (!current.enabled || current.runs >= current.maxRuns || current.status !== "PENDING" || current.nextRunAt > clock()) throw new AccessError("Job not due");
          if ((await db.scheduledJob.updateMany({ where: { id: current.id, version: current.version, status: "PENDING" }, data: { status: "PROCESSING", version: { increment: 1 } } })).count !== 1) throw new AccessError("Job claimed");
          const owner = await authority(db, rule.ownerUserId, rule, "automation.manage");
          if (!rule.enabled || rule.ownerPersonId !== owner.user!.personId) throw new AccessError("Rule disabled or owner revoked");
          if (current.scanRuleVersion !== null && current.scanRuleVersion !== rule.version) throw new AccessError("Rule changed during a scan; replace the job");
          const startedAt = current.scanStartedAt ?? clock();
          const page = { id: { gt: current.scanCursor ?? "" }, createdAt: { lte: startedAt } };
          const resources: Resource[] = [];
          if (rule.trigger === "TASK_OVERDUE") for (const task of await db.task.findMany({ where: { ...page, organizationId: rule.organizationId, dueDate: { lt: startedAt }, status: { notIn: ["COMPLETED", "CANCELLED"] } }, orderBy: { id: "asc" }, take: 26, select: { id: true, organizationId: true, projectId: true } })) resources.push({ organizationId: task.organizationId, projectId: task.projectId, resourceType: "TASK", resourceId: task.id });
          if (rule.trigger === "PROJECT_BLOCKED") for (const project of await db.project.findMany({ where: { ...page, organizationId: rule.organizationId, status: "BLOCKED" }, orderBy: { id: "asc" }, take: 26, select: { id: true, organizationId: true } })) resources.push({ organizationId: project.organizationId, projectId: project.id, resourceType: "PROJECT", resourceId: project.id });
          if (rule.trigger === "APPROVAL_PENDING") for (const approval of await db.siaApproval.findMany({ where: { ...page, status: "PENDING", request: { organizationId: rule.organizationId, status: "SUBMITTED" } }, include: { request: true }, orderBy: { id: "asc" }, take: 26 })) resources.push({ organizationId: rule.organizationId, projectId: approval.request!.projectId, resourceType: "APPROVAL", resourceId: approval.id });
          let processed = 0, skipped = 0;
          const batch = resources.slice(0, 25), more = resources.length > 25;
          for (const resource of batch) {
            // An unreadable/ineligible head must not prevent later authorized work being scanned.
            try {
              await boundResource(db, processor, resource, "automation.process");
              await boundResource(db, owner, resource, automationActions.find(a => a.key === rule.action)!.permission);
              await validRecipient(db, JSON.parse(rule.condition).recipientUserId, resource);
            } catch (error) { if (!(error instanceof AccessError)) throw error; skipped++; continue; }
            if (await apply(db, rule, resource, "automation:job:" + job.id + ":" + startedAt.toISOString() + ":" + resource.resourceId)) processed++;
            else skipped++;
          }
          const runs = current.runs + (more ? 0 : 1), status = !more && runs >= current.maxRuns ? "SUCCEEDED" : "PENDING";
          await db.scheduledJob.update({ where: { id: job.id }, data: { status, enabled: status === "PENDING", runs, attempts: 0, lastRunAt: clock(), nextRunAt: more ? clock() : new Date(Math.max(current.nextRunAt.getTime(), clock().getTime()) + current.intervalMinutes * 60000), scanCursor: more ? batch.at(-1)!.resourceId : null, scanStartedAt: more ? startedAt : null, scanRuleVersion: more ? rule.version : null, failureCode: null, version: { increment: 1 } } });
          await communicationAudit(db, processor, current, more ? "automation.job_progressed" : "automation.job_executed", "ScheduledJob", job.id);
          return { id: job.id, processed, skipped, status: more ? "PENDING" : "SUCCEEDED" };
        }); results.push(result);
      } catch {
        const failed = await client.$transaction(async db => {
          const row = await db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
          const processor = await authority(db, userId, row, "automation.process");
          if (row.version !== job.version || row.status !== "PENDING") return false;
          const attempts = row.attempts + 1;
          await db.scheduledJob.update({ where: { id: row.id, version: row.version }, data: { attempts, status: attempts >= row.maxAttempts ? "FAILED" : "PENDING", enabled: attempts < row.maxAttempts, nextRunAt: new Date(clock().getTime() + 60000 * 2 ** attempts), failureCode: "AUTOMATION_FAILED", version: { increment: 1 } } });
          await communicationAudit(db, processor, row, "automation.failed", "ScheduledJob", row.id, true);
          return true;
        }); results.push({ id: job.id, processed: 0, status: failed ? "FAILED" : "SKIPPED" });
      }
    }
    return results;
  }
  async function pauseJob(userId: string, id: string, version: number) {
    return client.$transaction(async db => {
      const row = await db.scheduledJob.findUniqueOrThrow({ where: { id } }); const ctx = await authority(db, userId, row, "automation.manage");
      if ((await db.scheduledJob.updateMany({ where: { id, version, status: "PENDING" }, data: { status: "CANCELLED", enabled: false, version: { increment: 1 } } })).count !== 1) throw new AccessError("Stale job");
      await communicationAudit(db, ctx, row, "automation.job_cancelled", "ScheduledJob", id);
    });
  }
  return { saveRule, schedule, processEvent, processDue, pauseJob };
}
export const automationService = createAutomationService();
