import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { requirePortalAccess } from "@/server/portals/policy";
import { createExecutionService } from "@/server/domain/execution-service";

const focusInput = z.object({
  organizationId: z.string().min(1), personId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  startsOn: z.iso.date(), endsOn: z.iso.date(),
  decisionReference: z.string().trim().min(8).max(200),
  reference: z.uuid()
}).strict();
const focusTitle = "Skill City focus: ";
const focusKind = "SKILLCITY_FOCUS";
const taskControlInput = z.object({ taskId: z.string().min(1), revision: z.number().int().min(0), status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED"]), deadlineMode: z.enum(["KEEP", "SET", "CLEAR"]), dueDate: z.iso.datetime().nullable(), reason: z.string().trim().min(10).max(2000), reference: z.uuid() }).strict();
const blockerControlInput = z.object({ taskId: z.string().min(1), blockerId: z.string().min(1).optional(), description: z.string().trim().min(10).max(2000).optional(), expectedResolution: z.iso.date().nullable().optional(), reason: z.string().trim().min(10).max(2000), reference: z.uuid() }).strict();
const endFocusInput = z.object({ focusId: z.string().min(1), reason: z.string().trim().min(10).max(2000), reference: z.uuid() }).strict();
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const todayIst = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export function createSkillCityManagerDesk(client: PrismaClient = prisma, now = () => new Date()) {
  const execution = createExecutionService(client);
  async function scopes(userId: string, db: Prisma.TransactionClient = client) {
    const gateway = await requirePortalAccess(db, userId, "skillcity");
    const ctx = await createAccessContext(userId, db);
    if (!ctx.user?.personId) throw new AccessError("Manager identity unavailable");
    const divisions = await db.organization.findMany({ where: { parentId: gateway.companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true }, take: 30 });
    const allowed = [gateway.companyId, ...divisions.map(row => row.id)].filter(id => ctx.organizationIds("reporting.read").includes(id) && ctx.organizationIds("person.read").includes(id));
    return { ctx, allowed, companyId: gateway.companyId };
  }
  async function list(userId: string) {
    const { ctx, allowed, companyId } = await scopes(userId);
    const capabilities = await Promise.all(allowed.map(async organizationId => ({
      organizationId,
      focus: (await ctx.decide("responsibility.read", { organizationId })).allowed,
      canSetFocus: (await ctx.decide("responsibility.read", { organizationId })).allowed && (await ctx.decide("responsibility.manage", { organizationId })).allowed && (await ctx.decide("decision.decide", { organizationId })).allowed,
      tasks: (await ctx.decide("task.read", { organizationId })).allowed,
      taskManage: (await ctx.decide("task.manage", { organizationId })).allowed,
      blockerManage: (await ctx.decide("blocker.manage", { organizationId })).allowed,
      labs: (await ctx.decide("labs.sales.read", { organizationId })).allowed,
      crm: (await ctx.decide("aira.crm.manage", { organizationId })).allowed
    })));
    const relationships = allowed.length ? await client.reportingRelationship.findMany({
      where: { organizationId: { in: allowed }, managerPersonId: ctx.user!.personId!, status: "ACTIVE", AND: [{ OR: [{ startDate: null }, { startDate: { lte: now() } }] }, { OR: [{ endDate: null }, { endDate: { gte: now() } }] }], person: { status: "ACTIVE", memberships: { some: { status: "ACTIVE", organizationId: { in: allowed.concat(companyId) } } } } },
      select: { personId: true, organizationId: true, person: { select: { displayName: true, memberships: { where: { status: "ACTIVE", organizationId: { in: allowed.concat(companyId) } }, select: { organizationId: true, scope: true } } } }, organization: { select: { name: true } } },
      orderBy: [{ organizationId: "asc" }, { personId: "asc" }], take: 501
    }) : [];
    const people = [];
    const currentDay = todayIst(now());
    const covered = relationships.slice(0, 500).filter(row => row.person.memberships.some(member => member.organizationId === row.organizationId || member.organizationId === companyId && member.scope === "DESCENDANTS"));
    for (const row of covered.slice(0, 50)) {
      if (!row.person.memberships.some(member => member.organizationId === row.organizationId || member.organizationId === companyId && member.scope === "DESCENDANTS")) continue;
      const grant = capabilities.find(item => item.organizationId === row.organizationId)!;
      const history = grant.focus ? await client.responsibility.findMany({ where: { organizationId: row.organizationId, personId: row.personId, kind: "OPERATIONS", title: { startsWith: focusTitle } }, select: { id: true, title: true, status: true, metadata: true }, orderBy: { createdAt: "desc" }, take: 20 }) : [];
      const focus = history.flatMap(item => {
        try { const meta = JSON.parse(item.metadata ?? "{}"); return meta.kind === focusKind ? [{ id: item.id, title: item.title.slice(focusTitle.length), status: item.status, startsOn: String(meta.startsOn), endsOn: String(meta.endsOn) }] : []; }
        catch { return []; }
      });
      const taskRows = grant.tasks ? await client.task.findMany({ where: { organizationId: row.organizationId, assigneePersonId: row.personId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, title: true, status: true, dueDate: true, revision: true, projectId: true, blockers: { where: { status: "OPEN" }, select: { id: true, description: true, expectedResolution: true }, take: 10 } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 10 }) : [];
      const tasks = await Promise.all(taskRows.map(async task => ({ ...task, blockers: (await ctx.decide("blocker.read", { organizationId: row.organizationId, projectId: task.projectId })).allowed ? task.blockers : [], canManage: grant.taskManage && (await ctx.decide("task.manage", { organizationId: row.organizationId, projectId: task.projectId })).allowed, canManageBlockers: grant.blockerManage && (await ctx.decide("blocker.manage", { organizationId: row.organizationId, projectId: task.projectId })).allowed })));
      const followUps = grant.labs || grant.crm ? await client.executiveRecord.findMany({ where: { organizationId: row.organizationId, ownerPersonId: row.personId, kind: { in: [grant.labs ? "LABS_LEAD" : "", grant.crm ? "AIRA_CRM_LEAD" : ""] }, status: { notIn: ["WON", "LOST"] }, dueAt: { not: null } }, select: { id: true, title: true, status: true, dueAt: true }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 10 }) : [];
      people.push({ personId: row.personId, organizationId: row.organizationId, name: row.person.displayName, scopeName: row.organization.name, currentFocus: focus.find(item => item.status === "ACTIVE" && item.startsOn <= currentDay && item.endsOn >= currentDay) ?? null, focusHistory: focus, focusReadable: grant.focus, tasks, tasksReadable: grant.tasks, followUps, followUpsReadable: grant.labs || grant.crm, canSetFocus: grant.canSetFocus });
    }
    const truncated = relationships.length > 500;
    const totals = { openTasks: 0, overdueTasks: 0, openBlockers: 0, dueFollowUps: 0 };
    let taskReadable = true, blockerReadable = true, followUpsReadable = true;
    for (const grant of capabilities) {
      const personIds = [...new Set(covered.filter(row => row.organizationId === grant.organizationId).map(row => row.personId))];
      if (!personIds.length) continue;
      const work: Prisma.TaskWhereInput = { organizationId: grant.organizationId, assigneePersonId: { in: personIds }, status: { notIn: ["COMPLETED", "CANCELLED"] } };
      if (grant.tasks) {
        totals.openTasks += await client.task.count({ where: work });
        totals.overdueTasks += await client.task.count({ where: { ...work, dueDate: { lt: now() } } });
      } else taskReadable = false;
      if ((await ctx.decide("blocker.read", { organizationId: grant.organizationId })).allowed) {
        totals.openBlockers += await client.executionBlocker.count({ where: { organizationId: grant.organizationId, status: "OPEN", task: work } });
      } else blockerReadable = false;
      if (grant.labs || grant.crm) {
        totals.dueFollowUps += await client.executiveRecord.count({ where: { organizationId: grant.organizationId, ownerPersonId: { in: personIds }, kind: { in: [grant.labs ? "LABS_LEAD" : "", grant.crm ? "AIRA_CRM_LEAD" : ""] }, status: { notIn: ["WON", "LOST"] }, dueAt: { lt: now() } } });
      } else followUpsReadable = false;
    }
    const decisionScopes = [];
    for (const organizationId of allowed) if ((await ctx.decide("approval.read", { organizationId })).allowed && (await ctx.decide("approval.decide", { organizationId })).allowed) decisionScopes.push(organizationId);
    const approvalRows = decisionScopes.length && decisionScopes.length === allowed.length ? await client.siaApproval.findMany({
      where: { approverUserId: userId, status: "PENDING", request: { organizationId: { in: decisionScopes }, status: "SUBMITTED", OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }] } },
      select: { requiredPermission: true, request: { select: { organizationId: true, projectId: true } } },
      take: 501,
    }) : null;
    let pendingDecisions: number | null = approvalRows && approvalRows.length <= 500 ? 0 : null;
    if (pendingDecisions !== null) for (const row of approvalRows!) if (row.request && (await ctx.decide(row.requiredPermission, { organizationId: row.request.organizationId, projectId: row.request.projectId })).allowed) pendingDecisions++;
    const summary = {
      directReports: truncated ? null : new Set(covered.map(row => row.personId)).size,
      openTasks: !truncated && taskReadable ? totals.openTasks : null,
      overdueTasks: !truncated && taskReadable ? totals.overdueTasks : null,
      openBlockers: !truncated && blockerReadable ? totals.openBlockers : null,
      dueFollowUps: !truncated && followUpsReadable ? totals.dueFollowUps : null,
      pendingDecisions,
      truncated, previewLimited: covered.length > 50,
    };
    return { permitted: allowed.length > 0, people, summary };
  }
  async function setFocus(userId: string, raw: unknown) {
    const input = focusInput.parse(raw);
    const start = Date.parse(input.startsOn + "T00:00:00Z"), end = Date.parse(input.endsOn + "T00:00:00Z");
    if (input.startsOn < todayIst(now()) || end < start || end - start > 90 * 86400000) throw new AccessError("Choose a current or future focus period of at most 90 days");
    return client.$transaction(async db => {
      const { ctx, allowed } = await scopes(userId, db);
      if (!allowed.includes(input.organizationId)) throw new AccessError("Manager scope unavailable");
      await ctx.requireAccess("responsibility.read", { organizationId: input.organizationId });
      await ctx.requireAccess("responsibility.manage", { organizationId: input.organizationId });
      await ctx.requireAccess("decision.decide", { organizationId: input.organizationId });
      if (input.personId === ctx.user!.personId) throw new AccessError("A manager cannot approve their own focus");
      const relationship = await db.reportingRelationship.findFirst({ where: { organizationId: input.organizationId, personId: input.personId, managerPersonId: ctx.user!.personId!, status: "ACTIVE", AND: [{ OR: [{ startDate: null }, { startDate: { lte: now() } }] }, { OR: [{ endDate: null }, { endDate: { gte: now() } }] }], person: { status: "ACTIVE", memberships: { some: { status: "ACTIVE", OR: [{ organizationId: input.organizationId }, { organizationId: (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" }, select: { id: true } })).id, scope: "DESCENDANTS" }] } } } } });
      if (!relationship) throw new AccessError("Current direct report required");
      const reference = "skillcity:focus:" + fingerprint([userId, input.reference]);
      const prior = await db.operationalEvent.findUnique({ where: { reference } });
      const digest = fingerprint(input);
      if (prior) {
        if (JSON.parse(prior.metadata ?? "{}").fingerprint !== digest) throw new AccessError("Focus replay mismatch");
        return { id: prior.entityId, replay: true };
      }
      const current = await db.responsibility.findMany({ where: { organizationId: input.organizationId, personId: input.personId, kind: "OPERATIONS", status: "ACTIVE", title: { startsWith: focusTitle } }, select: { id: true, metadata: true }, take: 50 });
      for (const item of current) {
        let metadata: { kind?: string };
        try { metadata = JSON.parse(item.metadata ?? "{}"); } catch { continue; }
        if (metadata.kind === focusKind) await db.responsibility.update({ where: { id: item.id }, data: { status: "ARCHIVED" } });
      }
      const saved = await db.responsibility.create({ data: { organizationId: input.organizationId, personId: input.personId, kind: "OPERATIONS", title: focusTitle + input.title, metadata: JSON.stringify({ kind: focusKind, startsOn: input.startsOn, endsOn: input.endsOn, decisionReference: input.decisionReference, approvedByUserId: userId }) } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.organizationId, action: "staff.focus_approved", entityType: "Responsibility", entityId: saved.id, result: "SUCCESS", reference, metadata: { fingerprint: digest, personId: input.personId, decisionReference: input.decisionReference, startsOn: input.startsOn, endsOn: input.endsOn, grantsAccess: false } });
      return { id: saved.id, replay: false };
    });
  }
  async function report(db: Prisma.TransactionClient, userId: string, organizationId: string, personId: string) {
    const { ctx, allowed } = await scopes(userId, db);
    if (!allowed.includes(organizationId) || personId === ctx.user!.personId) throw new AccessError("Direct report unavailable");
    const companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" }, select: { id: true } })).id;
    const relationship = await db.reportingRelationship.findFirst({ where: { organizationId, personId, managerPersonId: ctx.user!.personId!, status: "ACTIVE", AND: [{ OR: [{ startDate: null }, { startDate: { lte: now() } }] }, { OR: [{ endDate: null }, { endDate: { gte: now() } }] }], person: { status: "ACTIVE", memberships: { some: { status: "ACTIVE", OR: [{ organizationId }, { organizationId: companyId, scope: "DESCENDANTS" }] } } } } });
    if (!relationship) throw new AccessError("Current direct report required");
    return ctx;
  }
  async function replay(db: Prisma.TransactionClient, userId: string, kind: string, input: { reference: string }) {
    const reference = `skillcity:${kind}:` + fingerprint([userId, input.reference]);
    const digest = fingerprint(input);
    const prior = await db.operationalEvent.findUnique({ where: { reference } });
    if (prior && JSON.parse(prior.metadata ?? "{}").fingerprint !== digest) throw new AccessError("Action replay mismatch");
    return { reference, digest, prior };
  }
  async function changeTask(userId: string, raw: unknown) {
    const input = taskControlInput.parse(raw);
    return client.$transaction(async db => {
      const task = await db.task.findUnique({ where: { id: input.taskId } });
      if (!task?.assigneePersonId || ["COMPLETED", "CANCELLED"].includes(task.status)) throw new AccessError("Open assigned task required");
      const ctx = await report(db, userId, task.organizationId, task.assigneePersonId);
      const scope = { organizationId: task.organizationId, projectId: task.projectId };
      await ctx.requireAccess("task.read", scope);
      await ctx.requireAccess("task.manage", scope);
      const token = await replay(db, userId, "task-control", input);
      if (token.prior) return { id: token.prior.entityId, replay: true };
      if (task.revision !== input.revision) throw new AccessError("Task changed; refresh before updating");
      if (input.deadlineMode === "SET" && (!input.dueDate || new Date(input.dueDate) < now())) throw new AccessError("Choose a future deadline");
      const dueDate = input.deadlineMode === "KEEP" ? task.dueDate : input.deadlineMode === "CLEAR" ? null : input.dueDate;
      const saved = await execution.save(userId, "tasks", { organizationId: task.organizationId, projectId: task.projectId, title: task.title, status: input.status, description: task.description, ownerPersonId: task.ownerPersonId, assigneePersonId: task.assigneePersonId, dueDate, startDate: task.startDate, goalId: task.goalId, milestoneId: task.milestoneId, priority: task.priority, metadata: task.metadata ? JSON.parse(task.metadata) : null }, task.id, db);
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: task.organizationId, projectId: task.projectId, action: "staff.task_controlled", entityType: "Task", entityId: saved.id, reference: token.reference, result: "SUCCESS", metadata: { fingerprint: token.digest, fromStatus: task.status, toStatus: input.status, priorDueDate: task.dueDate, dueDate, reason: input.reason } });
      return { id: saved.id, replay: false };
    });
  }
  async function setBlocker(userId: string, raw: unknown) {
    const input = blockerControlInput.parse(raw);
    if (!input.blockerId && !input.description) throw new AccessError("Blocker description required");
    return client.$transaction(async db => {
      const task = await db.task.findUnique({ where: { id: input.taskId } });
      if (!task?.assigneePersonId || ["COMPLETED", "CANCELLED"].includes(task.status)) throw new AccessError("Open assigned task required");
      const ctx = await report(db, userId, task.organizationId, task.assigneePersonId);
      const scope = { organizationId: task.organizationId, projectId: task.projectId };
      await ctx.requireAccess("task.read", scope);
      await ctx.requireAccess("blocker.manage", scope);
      const token = await replay(db, userId, "task-blocker", input);
      if (token.prior) return { id: token.prior.entityId, replay: true };
      const prior = input.blockerId ? await db.executionBlocker.findFirst({ where: { id: input.blockerId, organizationId: task.organizationId, taskId: task.id, status: "OPEN" } }) : null;
      if (input.blockerId && !prior) throw new AccessError("Open blocker unavailable");
      const saved = await execution.blocker(userId, { organizationId: task.organizationId, taskId: task.id, description: prior?.description ?? input.description!, ownerPersonId: prior?.ownerPersonId ?? task.assigneePersonId, dependencyTaskId: prior?.dependencyTaskId ?? null, expectedResolution: prior?.expectedResolution ?? input.expectedResolution ?? null, status: prior ? "RESOLVED" : "OPEN" }, prior?.id, db);
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: task.organizationId, projectId: task.projectId, action: prior ? "staff.task_blocker_resolved" : "staff.task_blocker_opened", entityType: "ExecutionBlocker", entityId: saved.id, reference: token.reference, result: "SUCCESS", metadata: { fingerprint: token.digest, taskId: task.id, reason: input.reason } });
      return { id: saved.id, replay: false };
    });
  }
  async function endFocus(userId: string, raw: unknown) {
    const input = endFocusInput.parse(raw);
    return client.$transaction(async db => {
      const focus = await db.responsibility.findUnique({ where: { id: input.focusId } });
      if (!focus || focus.kind !== "OPERATIONS") throw new AccessError("Focus unavailable");
      let metadata: { kind?: string };
      try { metadata = JSON.parse(focus.metadata ?? "{}"); } catch { throw new AccessError("Focus metadata unavailable"); }
      if (metadata.kind !== focusKind) throw new AccessError("Skill City focus required");
      const ctx = await report(db, userId, focus.organizationId, focus.personId);
      for (const key of ["responsibility.read", "responsibility.manage", "decision.decide"]) await ctx.requireAccess(key, { organizationId: focus.organizationId });
      const token = await replay(db, userId, "focus-end", input);
      if (token.prior) return { id: focus.id, replay: true };
      if (focus.status !== "ACTIVE") throw new AccessError("Active focus unavailable");
      await db.responsibility.update({ where: { id: focus.id }, data: { status: "ARCHIVED" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: focus.organizationId, action: "staff.focus_ended", entityType: "Responsibility", entityId: focus.id, reference: token.reference, result: "SUCCESS", metadata: { fingerprint: token.digest, personId: focus.personId, reason: input.reason, grantsAccess: false } });
      return { id: focus.id, replay: false };
    });
  }
  return { list, setFocus, changeTask, setBlocker, endFocus };
}

export const skillCityManagerDesk = createSkillCityManagerDesk();
