import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { createAccessContext as defaultAccessContext, AccessError, type ResourceScope } from "@/server/authorization/engine";
import { activeMembershipWhere, ancestry } from "@/server/authorization/business-scope";
import * as input from "./execution-input";
import { createWorkforceService } from "./workforce-service";
import { operationalEvent, notify } from "./operational-events";
import { READ_BUDGET, databasePage, checkRows, boundedRead, resultPage, sortedResultPage, type PageInput } from "./query-bounds";

type DB = Prisma.TransactionClient;
type Context = Awaited<ReturnType<typeof defaultAccessContext>>;
type Kind = "projects" | "milestones" | "tasks" | "goals";
const domains = { projects: "project", milestones: "milestone", tasks: "task", goals: "goal", dependencies: "dependency", blockers: "blocker", members: "membership", responsibilities: "responsibility" };
const terminal = (status: string) => ["COMPLETED", "CANCELLED", "ARCHIVED", "ACHIEVED", "MISSED"].includes(status);
export const completionProgress = (tasks: { status: string }[]) => {
  const relevant = tasks.filter(t => t.status !== "CANCELLED");
  return relevant.length ? relevant.filter(t => t.status === "COMPLETED").length / relevant.length * 100 : null;
};
export type ExecutionQuery = { recordId?: string; organizationId?: string; projectId?: string; search?: string; status?: string; ownerPersonId?: string; assigneePersonId?: string; priority?: string; dueBefore?: string; overdue?: string; sort?: string; page?: PageInput };

export function createExecutionService(client: PrismaClient = prisma, createAccessContext = defaultAccessContext) {
  async function audit(db: DB, ctx: Context, scope: ResourceScope, action: string, entityId: string, changes: Prisma.InputJsonObject = {}) {
    const recorded = await operationalEvent(db, { actorUserId: ctx.user!.id, actorPersonId: ctx.user!.personId, organizationId: scope.organizationId, projectId: scope.projectId, entityType: action.split(".")[0], entityId, action, result: "SUCCESS", metadata: { projectId: scope.projectId ?? null, ...changes } });
    if (action === "task.assigned" && typeof changes.assigneePersonId === "string") {
      const assigneePersonId = changes.assigneePersonId;
      const recipients = await boundedRead(take => db.user.findMany({ take, where: { personId: assigneePersonId, status: "ACTIVE" } }));
      for (const recipient of recipients) {
        try { await notify(db, ctx.user!.id, recipient.id, { ...scope, resourceType: "TASK", resourceId: entityId }, "TASK_ASSIGNED", "Task assigned", "A task has been assigned to you", "event:" + recorded.id); }
        catch (error) { if (!(error instanceof AccessError)) throw error; }
      }
    }
  }
  async function person(db: DB, ctx: Context, id: string | null | undefined, scope: ResourceScope) {
    if (!id) return;
    const path = ancestry(ctx.nodes, scope.organizationId).map(n => n.id);
    const member = await db.membership.findFirst({ where: { ...activeMembershipWhere(), personId: id, OR: [
      { organizationId: scope.organizationId, projectId: null, scopeKey: "organization" },
      { organizationId: { in: path }, projectId: null, scopeKey: "organization", scope: "DESCENDANTS" },
      ...(scope.projectId ? [{ organizationId: scope.organizationId, projectId: scope.projectId, scopeKey: "project:" + scope.projectId }] : [])
    ] } });
    if (!member) throw new AccessError("Person must have an active membership in this scope");
  }
  async function project(db: DB, ctx: Context, id: string, key: string, work = false) {
    const row = await db.project.findUnique({ where: { id } });
    if (!row) throw new AccessError("Access denied");
    await ctx.requireAccess(key, { organizationId: row.organizationId, projectId: id });
    if (work && terminal(row.status)) throw new AccessError("Closed project must be explicitly reopened before changing work");
    return row;
  }
  async function target(db: DB, ctx: Context, kind: Kind, id: string, key: string) {
    if (kind === "projects") return project(db, ctx, id, key);
    if (kind === "milestones") {
      const row = await db.milestone.findUnique({ where: { id } });
      if (!row) throw new AccessError("Access denied");
      const parent = await project(db, ctx, row.projectId, key);
      return { ...row, organizationId: parent.organizationId };
    }
    const row = kind === "tasks" ? await db.task.findUnique({ where: { id } }) : await db.goal.findUnique({ where: { id } });
    if (!row) throw new AccessError("Access denied");
    await ctx.requireAccess(key, row);
    return row;
  }
  async function linked(db: DB, ctx: Context, type: "product" | "brand", id: string | null | undefined, scope: ResourceScope, unchanged = false) {
    if (!id) return null;
    const row = type === "product" ? await db.product.findUnique({ where: { id } }) : await db.brand.findUnique({ where: { id } });
    if (!row || row.organizationId !== scope.organizationId) throw new AccessError("Related resource belongs to a different organization");
    if (!unchanged) await ctx.requireAccess(type + ".read", { organizationId: scope.organizationId });
    return row;
  }
  async function transition(db: DB, ctx: Context, domain: string, scope: ResourceScope, previous: { status: string; completionDate: Date | null } | null, status: string, reopen: boolean, start?: Date | null) {
    if (previous && terminal(previous.status) && previous.status !== status) {
      if (!reopen || terminal(status)) throw new AccessError("Closed work requires an explicit reopen transition to a non-terminal state");
      await ctx.requireAccess(domain + ".reopen", scope);
    } else if (previous && terminal(previous.status)) throw new AccessError("Closed work is read-only until explicitly reopened");
    const completionDate = ["COMPLETED", "ACHIEVED"].includes(status) ? new Date() : null;
    if (completionDate && start && start > completionDate) throw new AccessError("Completion cannot precede the start date");
    return completionDate;
  }
  async function derived(db: DB, kind: Kind, row: { id: string; projectId?: string | null; progress?: number; progressMode?: string }) {
    if (kind === "tasks") return null;
    if (kind === "goals" && row.progressMode === "MANUAL") return row.progress ?? 0;
    if (kind === "projects" || kind === "goals" && row.progressMode === "MILESTONES") {
      const milestones = await boundedRead(take => db.milestone.findMany({ take, where: { projectId: kind === "projects" ? row.id : row.projectId ?? "", status: { not: "CANCELLED" } }, select: { id: true, status: true } }));
      const groups = checkRows(await db.task.groupBy({ by: ["milestoneId", "status"], where: { milestoneId: { in: milestones.map(m => m.id) }, status: { not: "CANCELLED" } }, _count: { _all: true }, take: READ_BUDGET + 1, orderBy: { status: "asc" } }));
      const counts = new Map<string, { total: number; completed: number }>();
      for (const group of groups) {
        const count = counts.get(group.milestoneId!) ?? { total: 0, completed: 0 };
        count.total += group._count._all; if (group.status === "COMPLETED") count.completed += group._count._all;
        counts.set(group.milestoneId!, count);
      }
      const values = milestones.map(m => { const count = counts.get(m.id); return m.status === "COMPLETED" ? 100 : count?.total ? count.completed / count.total * 100 : null; }).filter((v): v is number => v !== null);
      if (milestones.length) return values.length === milestones.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      if (kind === "goals") return null;
    }
    const where = kind === "milestones" ? { milestoneId: row.id } : kind === "projects" ? { projectId: row.id } : { goalId: row.id };
    const total = await db.task.count({ where: { ...where, status: { not: "CANCELLED" } } });
    return total ? await db.task.count({ where: { ...where, status: "COMPLETED" } }) / total * 100 : null;
  }
  async function progressBatch(db: DB, ctx: Context, kind: Kind, rows: { id: string; organizationId: string; projectId?: string | null; progress?: number; progressMode?: string; status: string }[]) {
    const result = new Map<string, number | null>(), readable = [];
    for (const row of rows) {
      if (kind === "goals" && row.progressMode === "MANUAL") { result.set(row.id, row.progress ?? 0); continue; }
      if (kind === "milestones" && row.status === "COMPLETED") { result.set(row.id, 100); continue; }
      const scope = { organizationId: row.organizationId, projectId: kind === "projects" ? row.id : row.projectId };
      result.set(row.id, null);
      if (!(await ctx.decide("task.read", scope)).allowed || (kind === "projects" || row.progressMode === "MILESTONES") && !(await ctx.decide("milestone.read", scope)).allowed) continue;
      readable.push(row);
    }
    const projectIds = [...new Set(readable.filter(r => kind === "projects" || r.progressMode === "MILESTONES").map(r => kind === "projects" ? r.id : r.projectId ?? ""))];
    const milestones = projectIds.length ? await boundedRead(take => db.milestone.findMany({ take, where: { projectId: { in: projectIds }, status: { not: "CANCELLED" } }, select: { id: true, projectId: true, status: true } })) : [];
    const counts = async (field: "projectId" | "milestoneId" | "goalId", ids: string[]) => {
      const values = new Map<string, { total: number; completed: number }>();
      if (!ids.length) return values;
      const groups = checkRows(await db.task.groupBy({ by: [field, "status"], where: { [field]: { in: ids }, status: { not: "CANCELLED" } }, _count: { _all: true }, take: READ_BUDGET + 1, orderBy: { status: "asc" } }));
      for (const group of groups) {
        const id = group[field]!;
        const value = values.get(id) ?? { total: 0, completed: 0 };
        value.total += group._count._all;
        if (group.status === "COMPLETED") value.completed += group._count._all;
        values.set(id, value);
      }
      return values;
    };
    const projectCounts = kind === "projects" ? await counts("projectId", projectIds) : new Map<string, { total: number; completed: number }>();
    const milestoneCounts = await counts("milestoneId", kind === "milestones" ? readable.map(r => r.id) : milestones.map(m => m.id));
    const goalCounts = kind === "goals" ? await counts("goalId", readable.filter(r => r.progressMode !== "MILESTONES").map(r => r.id)) : new Map<string, { total: number; completed: number }>();
    const percent = (value?: { total: number; completed: number }) => value?.total ? value.completed / value.total * 100 : null;
    const byProject = new Map<string, typeof milestones>();
    for (const milestone of milestones) { const group = byProject.get(milestone.projectId) ?? []; group.push(milestone); byProject.set(milestone.projectId, group); }
    for (const row of readable) {
      if (kind === "milestones") { result.set(row.id, percent(milestoneCounts.get(row.id))); continue; }
      if (kind === "goals" && row.progressMode !== "MILESTONES") { result.set(row.id, percent(goalCounts.get(row.id))); continue; }
      const children = byProject.get(kind === "projects" ? row.id : row.projectId ?? "") ?? [];
      const values = children.map(m => m.status === "COMPLETED" ? 100 : percent(milestoneCounts.get(m.id)));
      result.set(row.id, children.length ? values.every((v): v is number => v !== null) ? values.reduce((sum, v) => sum + v, 0) / values.length : null : kind === "projects" ? percent(projectCounts.get(row.id)) : null);
    }
    return result;
  }
  async function save(userId: string, kind: Kind, raw: unknown, recordId?: string, transaction?: DB) {
    const operation = async (db: DB) => {
      const ctx = await createAccessContext(userId, db);
      const domain = domains[kind];
      const previous = recordId ? await target(db, ctx, kind, recordId, domain + ".manage") : null;
      let row: { id: string; organizationId?: string; projectId?: string | null; status: string };
      const parsed = kind === "projects" ? input.projectInput.parse(raw) : kind === "milestones" ? input.milestoneInput.parse(raw) : kind === "tasks" ? input.taskInput.parse(raw) : input.goalInput.parse(raw);
      const scope: ResourceScope = { organizationId: parsed.organizationId, projectId: kind === "projects" ? recordId : "projectId" in parsed ? parsed.projectId : null };
      await ctx.requireAccess(domain + ".manage", scope);
      if ("programId" in parsed && parsed.programId) {
        const program = await db.program.findUnique({ where: { id: parsed.programId } });
        if (!program || program.organizationId !== scope.organizationId || ["RETIRED", "ARCHIVED"].includes(program.status)) throw new AccessError("Program belongs to another scope or is closed");
        await ctx.requireAccess("program.read", program);
      }
      if (previous && (previous.organizationId !== scope.organizationId || kind !== "projects" && "projectId" in previous && (previous.projectId ?? null) !== (scope.projectId ?? null))) throw new AccessError("Resource scope cannot be changed");
      if (scope.projectId && kind !== "projects") {
        const parent = await project(db, ctx, scope.projectId, domain + ".manage", true);
        if (parent.organizationId !== scope.organizationId) throw new AccessError("Project belongs to a different organization");
      }
      await person(db, ctx, parsed.ownerPersonId, scope);
      const completionDate = await transition(db, ctx, domain, scope, previous, parsed.status, parsed.reopen, "startDate" in parsed ? parsed.startDate : null);
      if (["COMPLETED", "ACHIEVED"].includes(parsed.status)) {
        const blockers = await db.executionBlocker.count({ where: { status: "OPEN", ...(kind === "projects" ? { OR: [{ projectId: recordId ?? "" }, { task: { projectId: recordId ?? "" } }, { goal: { projectId: recordId ?? "" } }] } : kind === "tasks" ? { taskId: recordId ?? "" } : kind === "goals" ? { goalId: recordId ?? "" } : { task: { milestoneId: recordId ?? "" } }) } });
        if (blockers) throw new AccessError("Resolve open blockers before completing work");
        if (kind === "projects" && recordId && (await db.task.count({ where: { projectId: recordId, status: { notIn: ["COMPLETED", "CANCELLED"] } } }) || await db.milestone.count({ where: { projectId: recordId, status: { notIn: ["COMPLETED", "CANCELLED", "ARCHIVED"] } } }))) throw new AccessError("Project has incomplete work");
      }
      switch (kind) {
        case "projects": {
          const { reopen: _reopen, ...data } = input.projectInput.parse(raw); void _reopen;
          await person(db, ctx, data.accountablePersonId, scope);
          const old = recordId ? await db.project.findUniqueOrThrow({ where: { id: recordId } }) : null;
          const product = await linked(db, ctx, "product", data.productId, scope, old?.productId === data.productId);
          await linked(db, ctx, "brand", data.brandId, scope, old?.brandId === data.brandId);
          if (product && "brandId" in product && data.brandId && product.brandId !== data.brandId) throw new AccessError("Project brand conflicts with product brand");
          if (recordId && await db.goal.count({ where: { projectId: recordId, productId: { not: null, ...(data.productId ? { notIn: [data.productId] } : {}) } } })) throw new AccessError("Product conflicts with a linked goal");
          const effectiveProgramId = data.programId === undefined ? old?.programId : data.programId;
          if (recordId && await db.goal.count({ where: { projectId: recordId, programId: { not: null, ...(effectiveProgramId ? { notIn: [effectiveProgramId] } : {}) } } })) throw new AccessError("Program conflicts with a linked goal");
          row = recordId ? await db.project.update({ where: { id: recordId }, data: { ...data, completionDate } }) : await db.project.create({ data: { ...data, completionDate } });
          scope.projectId = row.id;
          break;
        }
        case "milestones": {
          const { organizationId: _org, reopen: _reopen, ...data } = input.milestoneInput.parse(raw); void _org; void _reopen;
          if (data.status === "COMPLETED" && await db.task.count({ where: { milestoneId: recordId ?? "", status: { notIn: ["COMPLETED", "CANCELLED"] } } })) throw new AccessError("Milestone has incomplete tasks");
          row = recordId ? await db.milestone.update({ where: { id: recordId }, data: { ...data, completionDate } }) : await db.milestone.create({ data: { ...data, completionDate } });
          break;
        }
        case "tasks": {
          const { reopen: _reopen, ...data } = input.taskInput.parse(raw); void _reopen;
          await person(db, ctx, data.assigneePersonId, scope);
          if (previous?.status === "COMPLETED" && parsed.reopen && recordId && await db.taskDependency.count({ where: { prerequisiteId: recordId, task: { status: { in: ["IN_PROGRESS", "COMPLETED"] } } } })) throw new AccessError("Cannot reopen a prerequisite of started or completed work");
          if (data.milestoneId) {
            const milestone = await target(db, ctx, "milestones", data.milestoneId, "milestone.read");
            if (!("projectId" in milestone) || milestone.projectId !== data.projectId || milestone.organizationId !== data.organizationId) throw new AccessError("Milestone belongs to a different project");
            if (terminal(milestone.status)) throw new AccessError("Closed milestone cannot accept changed tasks");
          }
          if (data.goalId) {
            const goal = await target(db, ctx, "goals", data.goalId, "goal.read");
            if (goal.organizationId !== data.organizationId || !("projectId" in goal) || (goal.projectId ?? null) !== (data.projectId ?? null)) throw new AccessError("Goal belongs to a different scope");
            if (terminal(goal.status)) throw new AccessError("Closed goal cannot accept changed tasks");
          }
          if (recordId && ["IN_PROGRESS", "COMPLETED"].includes(data.status) && await db.taskDependency.count({ where: { taskId: recordId, prerequisite: { status: { not: "COMPLETED" } } } })) throw new AccessError("Unresolved prerequisites prevent starting or completing this task");
          row = recordId ? await db.task.update({ where: { id: recordId }, data: { ...data, completionDate } }) : await db.task.create({ data: { ...data, completionDate, creatorPersonId: ctx.user?.personId } });
          break;
        }
        case "goals": {
          const { reopen: _reopen, progress, progressReason, ...data } = input.goalInput.parse(raw); void _reopen;
          await person(db, ctx, data.accountablePersonId, scope);
          await linked(db, ctx, "product", data.productId, scope);
          if (data.projectId && data.productId) {
            const p = await db.project.findUniqueOrThrow({ where: { id: data.projectId } });
            if (p.productId !== data.productId) throw new AccessError("Goal product conflicts with project product");
          }
          if (data.projectId && data.programId && (await db.project.findUniqueOrThrow({ where: { id: data.projectId } })).programId !== data.programId) throw new AccessError("Goal program conflicts with project program");
          if (data.progressMode === "MILESTONES" && !data.projectId) throw new AccessError("Milestone-derived goals require a project");
          if (data.status === "ACHIEVED" && data.progressMode !== "MANUAL" && (!recordId || await derived(db, "goals", { id: recordId, projectId: data.projectId, progressMode: data.progressMode }) !== 100)) throw new AccessError("Derived goal achievement requires complete measurable work");
          if (data.parentGoalId) {
            let parentId: string | null = data.parentGoalId;
            const visited = new Set<string>();
            while (parentId) {
              if (parentId === recordId || visited.has(parentId)) throw new AccessError("Goal parent would create a cycle");
              visited.add(parentId);
              const parent: { organizationId: string; projectId: string | null; parentGoalId: string | null } | null = await db.goal.findUnique({ where: { id: parentId } });
              if (!parent) throw new AccessError("Access denied");
              await ctx.requireAccess("goal.read", parent);
              if (!ancestry(ctx.nodes, data.organizationId).some(n => n.id === parent.organizationId)) throw new AccessError("Parent goal must share this organization branch");
              if (terminal((await db.goal.findUniqueOrThrow({ where: { id: parentId } })).status)) throw new AccessError("Closed parent goal cannot accept child changes");
              parentId = parent.parentGoalId;
            }
          }
          row = recordId ? await db.goal.update({ where: { id: recordId }, data: { ...data, completionDate } }) : await db.goal.create({ data: { ...data, completionDate } });
          if (progress !== undefined) {
            const current = await db.goal.findUniqueOrThrow({ where: { id: row.id } });
            if (previous && terminal(current.status)) throw new AccessError("Record progress before completing the goal");
            await recordProgress(db, ctx, row.id, progress, progressReason);
          }
          break;
        }
      }
      await audit(db, ctx, scope, domain + (recordId ? ".updated" : ".created"), row.id, { previousStatus: previous?.status ?? null, status: row.status });
      if (previous && previous.status !== row.status) await audit(db, ctx, scope, domain + (parsed.reopen ? ".reopened" : ".status_changed"), row.id, { from: previous.status, to: row.status });
      if (previous && "ownerPersonId" in previous && previous.ownerPersonId !== parsed.ownerPersonId && parsed.ownerPersonId !== undefined) await audit(db, ctx, scope, domain + ".owner_changed", row.id, { ownerPersonId: parsed.ownerPersonId ?? null });
      if ("accountablePersonId" in parsed && previous && "accountablePersonId" in previous && parsed.accountablePersonId !== undefined && previous.accountablePersonId !== parsed.accountablePersonId) await audit(db, ctx, scope, domain + ".accountable_changed", row.id, { accountablePersonId: parsed.accountablePersonId ?? null });
      if (kind === "tasks") {
        const t = await db.task.findUniqueOrThrow({ where: { id: row.id } });
        if ((!previous && t.assigneePersonId !== null) || previous && "assigneePersonId" in previous && previous.assigneePersonId !== t.assigneePersonId) await audit(db, ctx, scope, "task.assigned", row.id, { assigneePersonId: t.assigneePersonId });
      }
      return row;
    };
    return transaction ? operation(transaction) : client.$transaction(operation);
  }
  async function recordProgress(db: DB, ctx: Context, goalId: string, value: number, reason?: string | null) {
    const goal = await db.goal.findUniqueOrThrow({ where: { id: goalId } });
    await ctx.requireAccess("goal.progress", goal);
    if (goal.projectId) await project(db, ctx, goal.projectId, "goal.progress", true);
    if (goal.progressMode !== "MANUAL" || !ctx.user?.personId) throw new AccessError("Only a human may record manual goal progress");
    await db.progressUpdate.create({ data: { goalId, value, reason, actorPersonId: ctx.user.personId } });
    await db.goal.update({ where: { id: goalId }, data: { progress: value } });
    await audit(db, ctx, goal, "goal.progress_changed", goalId, { value, source: "MANUAL" });
  }
  async function progress(userId: string, goalId: string, value: number, reason?: string) {
    if (!Number.isFinite(value) || value < 0 || value > 100 || (reason?.length ?? 0) > 4000) throw new AccessError("Invalid progress");
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db);
      const goal = await target(db, ctx, "goals", goalId, "goal.progress");
      if (terminal(goal.status)) throw new AccessError("Closed goal is read-only");
      await recordProgress(db, ctx, goalId, value, reason);
    });
  }
  async function dependency(userId: string, raw: unknown, enabled = true) {
    const parsed = input.dependencyInput.parse(raw);
    const taskId = parsed.relationship === "BLOCKS" ? parsed.prerequisiteId : parsed.taskId;
    const prerequisiteId = parsed.relationship === "BLOCKS" ? parsed.taskId : parsed.prerequisiteId;
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db);
      const task = await target(db, ctx, "tasks", taskId, "dependency.manage");
      const prerequisite = await target(db, ctx, "tasks", prerequisiteId, "dependency.manage");
      if (taskId === prerequisiteId) throw new AccessError("Task cannot depend on itself");
      if (task.organizationId !== prerequisite.organizationId || !("projectId" in task) || !("projectId" in prerequisite) || task.projectId !== prerequisite.projectId) throw new AccessError("Dependencies must share the same organization and project");
      if (terminal(task.status)) throw new AccessError("Closed task cannot change dependencies");
      if (task.projectId) await project(db, ctx, task.projectId, "dependency.manage", true);
      if (enabled) {
        if (["IN_PROGRESS", "COMPLETED"].includes(task.status) && prerequisite.status !== "COMPLETED") throw new AccessError("Cannot add an unresolved dependency to started work");
        const edges = await boundedRead(take => db.taskDependency.findMany({ take, where: { task: { organizationId: task.organizationId, projectId: task.projectId } } }));
        const queue = [prerequisiteId]; const seen = new Set<string>();
        while (queue.length) {
          const id = queue.pop()!;
          if (id === taskId) throw new AccessError("Dependency would create a cycle");
          if (seen.has(id)) continue; seen.add(id);
          queue.push(...edges.filter(e => e.taskId === id).map(e => e.prerequisiteId));
        }
        await db.taskDependency.upsert({ where: { taskId_prerequisiteId: { taskId, prerequisiteId } }, create: { taskId, prerequisiteId }, update: {} });
      } else await db.taskDependency.deleteMany({ where: { taskId, prerequisiteId } });
      await audit(db, ctx, task, enabled ? "dependency.created" : "dependency.removed", taskId, { prerequisiteId });
    });
  }
  async function blocker(userId: string, raw: unknown, recordId?: string) {
    const data = input.blockerInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db);
      const resource = await target(db, ctx, data.taskId ? "tasks" : data.goalId ? "goals" : "projects", data.taskId ?? data.goalId ?? data.projectId!, "blocker.manage");
      const scope = { organizationId: resource.organizationId, projectId: data.projectId ?? ("projectId" in resource ? resource.projectId : null) };
      if (scope.organizationId !== data.organizationId) throw new AccessError("Blocker target belongs to a different organization");
      if (scope.projectId) await project(db, ctx, scope.projectId, "blocker.manage", true);
      if (terminal(resource.status)) throw new AccessError("Closed work cannot accept blocker changes");
      await person(db, ctx, data.ownerPersonId, scope);
      if (data.dependencyTaskId) {
        const t = await target(db, ctx, "tasks", data.dependencyTaskId, "task.read");
        if (t.organizationId !== scope.organizationId || !("projectId" in t) || (t.projectId ?? null) !== (scope.projectId ?? null) || t.id === data.taskId) throw new AccessError("Blocker dependency belongs to a different scope or references itself");
      }
      const previous = recordId ? await db.executionBlocker.findUnique({ where: { id: recordId } }) : null;
      if (recordId && (!previous || previous.organizationId !== data.organizationId || previous.projectId !== (data.projectId ?? null) || previous.taskId !== (data.taskId ?? null) || previous.goalId !== (data.goalId ?? null))) throw new AccessError("Blocker target cannot be changed");
      if (previous?.status === "RESOLVED") throw new AccessError("Resolved blocker is immutable; create a new blocker");
      const changes = { ...data, resolvedAt: data.status === "RESOLVED" ? new Date() : null };
      const row = recordId ? await db.executionBlocker.update({ where: { id: recordId }, data: changes }) : await db.executionBlocker.create({ data: changes });
      await audit(db, ctx, scope, data.status === "RESOLVED" ? "blocker.resolved" : recordId ? "blocker.updated" : "blocker.created", row.id);
      return row;
    });
  }
  async function list(userId: string, kind: input.ExecutionKind, query: ExecutionQuery = {}) {
    if (kind === "responsibilities") return createWorkforceService(client, createAccessContext).list(userId, "responsibilities", query);
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db);
      if (!ctx.active) throw new AccessError("Access denied");
      const key = domains[kind] + ".read";
      if (query.projectId) {
        const p = await project(db, ctx, query.projectId, key);
        if (query.organizationId && query.organizationId !== p.organizationId) throw new AccessError("Access denied");
      } else if (query.organizationId) await ctx.requireAccess(key, { organizationId: query.organizationId });
      const ids = ctx.organizationIds(key).filter(id => !query.organizationId || ancestry(ctx.nodes, id).some(n => n.id === query.organizationId));
      const projectIds = ctx.grants.filter(g => g.key === key && g.projectId).map(g => g.projectId!);
      const scope = { OR: [{ organizationId: { in: ids } }, { projectId: { in: projectIds }, ...(query.organizationId ? { organizationId: query.organizationId } : {}) }], ...(query.projectId ? { projectId: query.projectId } : {}) };
      const search = query.search?.trim().slice(0, 200) ?? "";
      const priority = query.priority ? { priority: input.projectInput.shape.priority.parse(query.priority) } : {};
      const owner = query.ownerPersonId ? { ownerPersonId: query.ownerPersonId } : {};
      const { take, after: cursor } = databasePage(query.page);
      const after = query.recordId ? { id: z.string().min(1).max(200).parse(query.recordId) } : cursor;
      switch (kind) {
        case "projects": {
          const rows = checkRows(await db.project.findMany({ take, where: { ...after, OR: [{ organizationId: { in: ids } }, { id: { in: projectIds }, ...(query.organizationId ? { organizationId: query.organizationId } : {}) }], ...(query.projectId ? { id: query.projectId } : {}), name: { contains: search }, ...priority, ...owner, ...(query.status ? { status: input.projectInput.shape.status.parse(query.status) } : {}) }, orderBy: query.page ? { id: "asc" } : [{ updatedAt: "desc" }, { id: "asc" }] }));
          const progress = await progressBatch(db, ctx, "projects", rows);
          return rows.map(r => ({ ...r, calculatedProgress: progress.get(r.id) ?? null }));
        }
        case "tasks": return checkRows(await db.task.findMany({ take, where: { ...scope, ...after, title: { contains: search }, ...priority, ...owner, ...(query.assigneePersonId ? { assigneePersonId: query.assigneePersonId } : {}), ...(query.status ? { status: input.taskInput.shape.status.parse(query.status) } : {}), ...(query.dueBefore ? { dueDate: { lte: input.taskInput.shape.dueDate.parse(query.dueBefore)! } } : {}), ...(query.overdue === "true" ? { AND: [{ status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { lt: new Date() } }] } : {}) }, orderBy: query.page ? { id: "asc" } : [{ dueDate: "asc" }, { id: "asc" }] }));
        case "goals": {
          const rows = checkRows(await db.goal.findMany({ take, where: { ...scope, ...after, title: { contains: search }, ...priority, ...owner, ...(query.status ? { status: input.goalInput.shape.status.parse(query.status) } : {}) }, orderBy: query.page ? { id: "asc" } : [{ updatedAt: "desc" }, { id: "asc" }] }));
          const progress = await progressBatch(db, ctx, "goals", rows);
          return rows.map(r => ({ ...r, calculatedProgress: progress.get(r.id) ?? null }));
        }
        case "milestones": {
          const rows = checkRows(await db.milestone.findMany({ take, where: { ...after, project: { OR: [{ organizationId: { in: ids } }, { id: { in: projectIds }, ...(query.organizationId ? { organizationId: query.organizationId } : {}) }] }, ...(query.projectId ? { projectId: query.projectId } : {}), name: { contains: search }, ...priority, ...owner, ...(query.status ? { status: input.milestoneInput.shape.status.parse(query.status) } : {}) }, include: { project: { select: { organizationId: true } } }, orderBy: query.page ? { id: "asc" } : [{ sequence: "asc" }, { id: "asc" }] }));
          const progress = await progressBatch(db, ctx, "milestones", rows.map(r => ({ ...r, organizationId: r.project.organizationId })));
          return rows.map(r => ({ ...r, organizationId: r.project.organizationId, calculatedProgress: progress.get(r.id) ?? null }));
        }
        case "members": return checkRows(await db.membership.findMany({ take, where: { ...scope, ...after, projectId: query.projectId ?? { not: null }, ...(query.status ? { status: inputMembershipStatus(query.status) } : {}), person: { displayName: { contains: search } } }, include: { person: { select: { displayName: true } }, roles: { take: READ_BUDGET + 1, include: { role: { select: { name: true } } } } }, orderBy: { id: "asc" } }));
        case "dependencies": {
          const readableTasks = { OR: [{ organizationId: { in: ctx.organizationIds("task.read") } }, { projectId: { in: ctx.grants.filter(g => g.key === "task.read" && g.projectId).map(g => g.projectId!) } }] };
          const rows = checkRows(await db.taskDependency.findMany({ take, where: { ...after, task: { AND: [scope, readableTasks], title: { contains: search } }, prerequisite: { AND: [scope, readableTasks] } }, include: { task: { select: { title: true, organizationId: true, projectId: true } }, prerequisite: { select: { title: true, status: true } } }, orderBy: { id: "asc" } }));
          return rows.map(r => ({ ...r, organizationId: r.task.organizationId, projectId: r.task.projectId }));
        }
        case "blockers": {
          const rows = await boundedRead(take => db.executionBlocker.findMany({ take, where: { ...after, OR: [{ organizationId: { in: ids } }, { projectId: { in: projectIds } }, { task: { projectId: { in: projectIds } } }, { goal: { projectId: { in: projectIds } } }], description: { contains: search }, ...(query.status ? { status: query.status === "OPEN" ? "OPEN" : "RESOLVED" } : {}) }, include: { task: { select: { projectId: true } }, goal: { select: { projectId: true } } } }));
          const visible = [];
          for (const r of rows) {
            const projectId = r.projectId ?? r.task?.projectId ?? r.goal?.projectId;
            if (query.projectId && projectId !== query.projectId || query.organizationId && !ancestry(ctx.nodes, r.organizationId).some(n => n.id === query.organizationId)) continue;
            if ((await ctx.decide(key, { organizationId: r.organizationId, projectId })).allowed) visible.push({ ...r, scopeProjectId: projectId });
          }
          return visible;
        }
      }
    });
  }
  async function detail(userId: string, projectId: string) {
    const projects = await list(userId, "projects", { projectId });
    if (!projects.length) throw new AccessError("Access denied");
    // Each section retains its own capability; project.read does not grant task.read.
    const sections: Record<string, Awaited<ReturnType<typeof list>>> = {};
    for (const kind of ["milestones", "tasks", "goals", "members", "dependencies", "blockers", "responsibilities"] as const) {
      try { sections[kind] = await list(userId, kind, { projectId }); } catch (e) { if (!(e instanceof AccessError)) throw e; }
    }
    return { project: projects[0], sections };
  }
  async function history(userId: string, goalId: string) {
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db);
      await target(db, ctx, "goals", goalId, "goal.read");
      return boundedRead(take => db.progressUpdate.findMany({ take, where: { goalId }, orderBy: { createdAt: "desc" }, include: { actor: { select: { displayName: true } } } }));
    });
  }
  async function assignmentPeople(db: DB, ctx: Context) {
    const people = await boundedRead(take => db.person.findMany({ take, where: { status: "ACTIVE", memberships: { some: { ...activeMembershipWhere(), OR: [{ organizationId: { in: ctx.organizationIds("person.read") } }, { projectId: { in: ctx.grants.filter(g => g.key === "person.read" && g.projectId).map(g => g.projectId!) } }] } } }, select: { id: true, displayName: true } }));
    return people.map(p => ({ id: p.id, name: p.displayName }));
  }
  async function peopleOptions(userId: string) {
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db);
      if (!ctx.active) throw new AccessError("Access denied");
      return assignmentPeople(db, ctx);
    });
  }
  async function workspace(userId: string) {
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db);
      if (!ctx.active) throw new AccessError("Access denied");
      const capabilities = [...["project", "milestone", "task", "goal", "dependency", "blocker", "membership", "responsibility"].flatMap(d => [d + ".read", d + ".manage", d + ".reopen"]), "reminder.manage", "escalation.manage", "activity.read"];
      capabilities.push("goal.progress");
      const scopes = Object.fromEntries(capabilities.map(key => [key, { organizations: ctx.organizationIds(key), projects: ctx.grants.filter(g => g.key === key && g.projectId).map(g => g.projectId!) }]));
      const projectRows = await boundedRead(take => db.project.findMany({ take, where: { OR: [{ organizationId: { in: ctx.organizationIds("project.read") } }, { id: { in: scopes["project.read"].projects } }] }, select: { id: true, name: true, organizationId: true } }));
      const orgRows = await boundedRead(take => db.organization.findMany({ take, where: { id: { in: [...ctx.organizationIds("organization.read"), ...projectRows.map(p => p.organizationId)] } }, select: { id: true, name: true, parentId: true } }));
      // Only contact labels, never accounts or credentials, enter assignment options.
      const people = await assignmentPeople(db, ctx);
      const products = await boundedRead(take => db.product.findMany({ take, where: { organizationId: { in: ctx.organizationIds("product.read") } }, select: { id: true, name: true, organizationId: true } }));
      const brands = await boundedRead(take => db.brand.findMany({ take, where: { organizationId: { in: ctx.organizationIds("brand.read") } }, select: { id: true, name: true, organizationId: true } }));
      return { scopes, organizations: orgRows, projects: projectRows, people, products, brands };
    });
  }
  async function overview(userId: string, now = new Date()) {
    const projects = await list(userId, "projects");
    const tasks = await list(userId, "tasks");
    const goals = await list(userId, "goals");
    const blockers = await list(userId, "blockers");
    const dependencies = await list(userId, "dependencies");
    const horizon = new Date(now.getTime() + 7 * 86400000);
    const attention: { id: string; kind: string; title: string; date: Date | null; projectId: string | null }[] = [];
    for (const r of [...projects, ...tasks, ...goals]) {
      if (!("status" in r) || terminal(r.status)) continue;
      const date = "dueDate" in r ? r.dueDate : "targetDate" in r ? r.targetDate : null;
      const title = ("title" in r ? r.title : "name" in r ? r.name : "") ?? "";
      const projectId = "projectId" in r ? r.projectId : projects.some(p => p.id === r.id) ? r.id : null;
      if (date && date < now) attention.push({ id: r.id, kind: "OVERDUE", title, date, projectId });
      else if (date && date <= horizon) attention.push({ id: r.id, kind: "APPROACHING", title, date, projectId });
      if (["BLOCKED", "AT_RISK"].includes(r.status)) attention.push({ id: r.id, kind: r.status, title, date, projectId });
    }
    for (const g of goals) if ("status" in g && g.status === "MISSED" && "title" in g) attention.push({ id: g.id, kind: "MISSED_GOAL", title: g.title, date: null, projectId: "projectId" in g ? g.projectId : null });
    for (const b of blockers) if ("description" in b && "status" in b && b.status === "OPEN") attention.push({ id: b.id, kind: "OPEN_BLOCKER", title: b.description ?? "", date: "expectedResolution" in b ? b.expectedResolution : null, projectId: "scopeProjectId" in b ? b.scopeProjectId ?? null : null });
    for (const d of dependencies) if ("prerequisite" in d && "task" in d && d.prerequisite.status !== "COMPLETED") attention.push({ id: d.id, kind: "UNRESOLVED_DEPENDENCY", title: d.task.title + " depends on " + d.prerequisite.title, date: null, projectId: d.projectId });
    const completed = [...projects, ...tasks, ...goals].filter(r => "completionDate" in r && r.completionDate && r.completionDate <= now && r.completionDate.getTime() >= now.getTime() - 7 * 86400000);
    return { metrics: { activeProjects: projects.filter(r => "status" in r && r.status === "ACTIVE").length, blockedProjects: projects.filter(r => "status" in r && r.status === "BLOCKED").length, overdueTasks: tasks.filter(r => "dueDate" in r && r.dueDate && r.dueDate < now && !terminal(r.status)).length, upcomingDeadlines: attention.filter(r => r.kind === "APPROACHING").length, activeGoals: goals.filter(r => "status" in r && r.status === "ACTIVE").length, atRiskGoals: goals.filter(r => "status" in r && r.status === "AT_RISK").length, recentlyCompleted: completed.length }, attention, completed, asOf: now };
  }
  async function listPage(userId: string, kind: input.ExecutionKind, query: ExecutionQuery & { recordId?: string } = {}, page: PageInput = {}) {
    const recordId = query.recordId ? z.string().min(1).max(200).parse(query.recordId) : undefined;
    const sorted = query.sort;
    const databasePaged = !recordId && (!sorted || sorted === "reference") && !["blockers", "responsibilities"].includes(kind);
    const rows = await list(userId, kind, { ...query, page: databasePaged ? page : undefined }) as (Record<string, unknown> & { id: string })[];
    if (sorted && sorted !== "reference" && !recordId) return sortedResultPage(rows, sorted, page);
    return resultPage(rows.filter(r => !recordId || r.id === recordId), recordId ? {} : page, databasePaged);
  }
  return { save, list, listPage, detail, progress, history, dependency, blocker, overview, workspace, peopleOptions };
}
function inputMembershipStatus(value: string): "ACTIVE" | "INACTIVE" | "INVITED" | "SUSPENDED" | "ENDED" {
  if (!["ACTIVE", "INACTIVE", "INVITED", "SUSPENDED", "ENDED"].includes(value)) throw new AccessError("Invalid membership status");
  return value as "ACTIVE";
}
export const executionService = createExecutionService();
