import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { createExecutionService } from "@/server/domain/execution-service";
import { requireSkillCityTaskReviews } from "@/server/domain/task-review";
import { requirePortalAccess } from "@/server/portals/policy";
import { accountPortalRealm } from "@/server/auth/account-realm";

type DB = Prisma.TransactionClient;
const developerNames = ["Software Developer", "Full Stack Developer", "Junior Developer"];
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const assignmentInput = z.object({ projectId: z.string().min(1), taskId: z.string().min(1).optional(), developerUserId: z.string().min(1), title: z.string().trim().min(3).max(200).optional(), dueDate: z.iso.datetime().optional(), reference: z.uuid() }).strict();
const dutyInput = z.object({ taskId: z.string().min(1), reviewerUserId: z.string().min(1), duty: z.enum(["CODE_REVIEW", "TESTING"]), reference: z.uuid() }).strict();
const contributionInput = z.object({ taskId: z.string().min(1), detail: z.string().trim().min(10).max(4000), reference: z.uuid() }).strict();
const updateInput = z.object({ taskId: z.string().min(1), revision: z.number().int().min(0), status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED"]), description: z.string().trim().max(4000), reference: z.uuid() }).strict();
const reviewInput = z.object({ taskId: z.string().min(1), duty: z.enum(["CODE_REVIEW", "TESTING"]), verdict: z.enum(["APPROVED", "REWORK"]), comment: z.string().trim().min(10).max(4000), reference: z.uuid() }).strict();
const completionInput = z.object({ taskId: z.string().min(1), revision: z.number().int().min(0), reason: z.string().trim().min(10).max(2000), reference: z.uuid() }).strict();

export function createSkillCityDeveloperDesk(client: PrismaClient = prisma, now = () => new Date()) {
  const execution = createExecutionService(client);
  async function labs(db: DB, userId: string) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { person: { select: { metadata: true } } } });
    const gateway = await requirePortalAccess(db, userId, accountPortalRealm(user?.person?.metadata) === "labs" ? "labs" : "skillcity");
    const division = await db.organization.findUnique({ where: { slug: "aira-labs" }, select: { id: true, parentId: true, status: true } });
    if (!division || division.parentId !== gateway.companyId || division.status !== "ACTIVE") throw new AccessError("Labs workspace unavailable");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId: division.id });
    await ctx.requireAccess("organization.read", { organizationId: division.id });
    return { ctx, organizationId: division.id, companyId: gateway.companyId };
  }
  async function developer(db: DB, userId: string, organizationId: string, companyId: string) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { personId: true, status: true, emailVerifiedAt: true, person: { select: { status: true } } } });
    if (!user?.personId || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || !user.emailVerifiedAt) throw new AccessError("Verified developer required");
    const appointment = await db.membership.findFirst({ where: { personId: user.personId, status: "ACTIVE", OR: [{ organizationId }, { organizationId: companyId, scope: "DESCENDANTS" }], roles: { some: { role: { status: "ACTIVE", principalType: "HUMAN", name: { in: developerNames } } } } } });
    if (!appointment) throw new AccessError("Developer appointment required");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId });
    await ctx.requireAccess("labs.delivery.assignee", { organizationId });
    await ctx.requireAccess("project.read", { organizationId });
    await ctx.requireAccess("task.read", { organizationId });
    return { user, ctx };
  }
  async function project(db: DB, projectId: string, organizationId: string) {
    const row = await db.project.findUnique({ where: { id: projectId } });
    let metadata: { kind?: string };
    try { metadata = JSON.parse(row?.metadata ?? "{}"); } catch { throw new AccessError("Project unavailable"); }
    if (!row || row.organizationId !== organizationId || metadata.kind !== "AIRALABS_PROJECT" || ["COMPLETED", "CANCELLED", "ARCHIVED"].includes(row.status)) throw new AccessError("Active Labs project required");
    return row;
  }
  async function member(db: DB, projectId: string, personId: string, organizationId: string) {
    return db.membership.findFirst({ where: { projectId, personId, organizationId, status: "ACTIVE", OR: [{ startDate: null }, { startDate: { lte: now() } }], AND: [{ OR: [{ endDate: null }, { endDate: { gte: now() } }] }] } });
  }
  async function legacyOwner(db: DB, projectId: string, personId: string, organizationId: string) {
    const row = await db.project.findUnique({ where: { id: projectId }, select: { ownerPersonId: true } });
    if (row?.ownerPersonId !== personId) return false;
    const explicit = await db.membership.findUnique({ where: { personId_organizationId_scopeKey: { personId, organizationId, scopeKey: "project:" + projectId } } });
    return !explicit;
  }
  async function ownTask(db: DB, userId: string, taskId: string) {
    const { ctx, organizationId, companyId } = await labs(db, userId);
    const actor = await developer(db, userId, organizationId, companyId);
    const task = await db.task.findUnique({ where: { id: taskId } });
    if (!task?.projectId || task.organizationId !== organizationId || task.assigneePersonId !== actor.user.personId) throw new AccessError("Assigned task unavailable");
    const assignedProject = await project(db, task.projectId, organizationId);
    if (!await member(db, task.projectId, actor.user.personId!, organizationId) && !await legacyOwner(db, assignedProject.id, actor.user.personId!, organizationId)) throw new AccessError("Project assignment unavailable");
    await ctx.requireAccess("task.read", { organizationId, projectId: task.projectId });
    return { ctx, task, organizationId };
  }
  async function replay(db: DB, userId: string, key: string, raw: unknown) {
    const reference = "skillcity:developer:" + digest([userId, key, (raw as { reference: string }).reference]);
    const fingerprint = digest(raw), previous = await db.operationalEvent.findUnique({ where: { reference } });
    if (previous && JSON.parse(previous.metadata ?? "{}").fingerprint !== fingerprint) throw new AccessError("Developer action replay mismatch");
    return { reference, fingerprint, previous };
  }
  async function ensureMember(db: DB, personId: string, organizationId: string, projectId: string) {
    const existing = await db.membership.findUnique({ where: { personId_organizationId_scopeKey: { personId, organizationId, scopeKey: "project:" + projectId } } });
    if (existing && existing.projectId !== projectId) throw new AccessError("Project membership conflict");
    if (existing?.status === "ACTIVE" && (!existing.startDate || existing.startDate <= now()) && (!existing.endDate || existing.endDate >= now())) return;
    if (existing) throw new AccessError("Project membership requires a separate access review");
    await db.membership.create({ data: { personId, organizationId, projectId, scopeKey: "project:" + projectId, status: "ACTIVE" } });
  }
  async function assignTask(userId: string, raw: unknown) {
    const input = assignmentInput.parse(raw);
    if (!input.taskId && (!input.title || !input.dueDate)) throw new AccessError("Task title and due date required");
    return client.$transaction(async db => {
      const { ctx, organizationId, companyId } = await labs(db, userId);
      const p = await project(db, input.projectId, organizationId);
      for (const key of ["membership.manage", "task.manage", "person.read"]) await ctx.requireAccess(key, { organizationId, projectId: p.id });
      const target = await developer(db, input.developerUserId, organizationId, companyId);
      const token = await replay(db, userId, "assign-task", input);
      if (token.previous) return { id: token.previous.entityId, replay: true };
      await ensureMember(db, target.user.personId!, organizationId, p.id);
      const prior = input.taskId ? await db.task.findUnique({ where: { id: input.taskId } }) : null;
      if (input.taskId && (!prior || prior.projectId !== p.id || prior.organizationId !== organizationId || ["COMPLETED", "CANCELLED"].includes(prior.status))) throw new AccessError("Open project task required");
      const task = await execution.save(userId, "tasks", { organizationId, projectId: p.id, title: prior?.title ?? input.title!, status: prior?.status ?? "TODO", description: prior?.description ?? "", ownerPersonId: prior?.ownerPersonId ?? null, assigneePersonId: target.user.personId, dueDate: prior?.dueDate ?? input.dueDate, priority: prior?.priority ?? "NORMAL", startDate: prior?.startDate ?? null, goalId: prior?.goalId ?? null, milestoneId: prior?.milestoneId ?? null, metadata: { ...(prior?.metadata ? JSON.parse(prior.metadata) : {}), skillCityDeveloperReviewRequired: true } }, prior?.id, db);
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId, projectId: p.id, action: "staff.developer_task_assigned", entityType: "Task", entityId: task.id, reference: token.reference, result: "SUCCESS", metadata: { fingerprint: token.fingerprint, assigneePersonId: target.user.personId } });
      return { id: task.id, replay: false };
    });
  }
  async function assignDuty(userId: string, raw: unknown) {
    const input = dutyInput.parse(raw);
    return client.$transaction(async db => {
      const { ctx, organizationId, companyId } = await labs(db, userId);
      const task = await db.task.findUnique({ where: { id: input.taskId } });
      if (!task?.projectId || task.organizationId !== organizationId || !task.assigneePersonId) throw new AccessError("Assigned Labs task required");
      await project(db, task.projectId, organizationId);
      for (const key of ["membership.manage", "responsibility.manage", "task.read", "person.read"]) await ctx.requireAccess(key, { organizationId, projectId: task.projectId });
      const reviewer = await developer(db, input.reviewerUserId, organizationId, companyId);
      if (reviewer.user.personId === task.assigneePersonId) throw new AccessError("Independent reviewer required");
      const token = await replay(db, userId, "assign-duty", input);
      if (token.previous) return { id: token.previous.entityId, replay: true };
      await ensureMember(db, reviewer.user.personId!, organizationId, task.projectId);
      const existing = await db.responsibility.findMany({ where: { organizationId, taskId: task.id, kind: "ACCOUNTABLE", status: "ACTIVE" }, select: { id: true, metadata: true }, take: 20 });
      for (const row of existing) {
        try { if (JSON.parse(row.metadata ?? "{}").skillCityDuty === input.duty) await db.responsibility.update({ where: { id: row.id }, data: { status: "ARCHIVED" } }); }
        catch { throw new AccessError("Existing duty requires review"); }
      }
      const saved = await db.responsibility.create({ data: { organizationId, personId: reviewer.user.personId!, taskId: task.id, kind: "ACCOUNTABLE", title: input.duty === "CODE_REVIEW" ? "Code review" : "Testing", metadata: JSON.stringify({ skillCityDuty: input.duty, assignedByUserId: userId }) } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId, projectId: task.projectId, action: "staff.developer_duty_assigned", entityType: "Responsibility", entityId: saved.id, reference: token.reference, result: "SUCCESS", metadata: { fingerprint: token.fingerprint, taskId: task.id, reviewerPersonId: reviewer.user.personId, duty: input.duty } });
      return { id: saved.id, replay: false };
    });
  }
  async function contribute(userId: string, raw: unknown) {
    const input = contributionInput.parse(raw);
    return client.$transaction(async db => {
      const { ctx, task, organizationId } = await ownTask(db, userId, input.taskId);
      if (["COMPLETED", "CANCELLED"].includes(task.status)) throw new AccessError("Closed task is read-only");
      const token = await replay(db, userId, "contribution", input);
      if (token.previous) return { id: token.previous.entityId, replay: true };
      const evidence = await db.taskEvidence.create({ data: { taskId: task.id, actorUserId: userId, actorPersonId: ctx.user!.personId!, data: JSON.stringify({ kind: "SKILLCITY_CONTRIBUTION", detail: input.detail }) } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId, projectId: task.projectId, action: "staff.developer_contribution_recorded", entityType: "TaskEvidence", entityId: evidence.id, reference: token.reference, result: "SUCCESS", metadata: { fingerprint: token.fingerprint, taskId: task.id } });
      return { id: evidence.id, replay: false };
    });
  }
  async function updateOwnTask(userId: string, raw: unknown) {
    const input = updateInput.parse(raw);
    return client.$transaction(async db => {
      const { ctx, task, organizationId } = await ownTask(db, userId, input.taskId);
      await ctx.requireAccess("task.manage", { organizationId, projectId: task.projectId });
      const token = await replay(db, userId, "task-progress", input);
      if (token.previous) return { id: task.id, replay: true };
      if (task.revision !== input.revision || ["COMPLETED", "CANCELLED"].includes(task.status)) throw new AccessError("Task changed; refresh before updating");
      await execution.save(userId, "tasks", { organizationId, projectId: task.projectId, title: task.title, status: input.status, description: input.description, ownerPersonId: task.ownerPersonId, assigneePersonId: task.assigneePersonId, dueDate: task.dueDate, startDate: task.startDate, goalId: task.goalId, milestoneId: task.milestoneId, priority: task.priority, metadata: task.metadata ? JSON.parse(task.metadata) : null }, task.id, db);
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId, projectId: task.projectId, action: "staff.developer_task_progressed", entityType: "Task", entityId: task.id, reference: token.reference, result: "SUCCESS", metadata: { fingerprint: token.fingerprint, from: task.status, to: input.status } });
      return { id: task.id, replay: false };
    });
  }
  async function review(userId: string, raw: unknown) {
    const input = reviewInput.parse(raw);
    return client.$transaction(async db => {
      const { ctx, organizationId, companyId } = await labs(db, userId);
      const actor = await developer(db, userId, organizationId, companyId);
      const task = await db.task.findUnique({ where: { id: input.taskId } });
      if (!task?.projectId || task.organizationId !== organizationId || !task.assigneePersonId || task.assigneePersonId === actor.user.personId || ["COMPLETED", "CANCELLED"].includes(task.status)) throw new AccessError("Open task and independent review required");
      await project(db, task.projectId, organizationId);
      if (!await member(db, task.projectId, actor.user.personId!, organizationId)) throw new AccessError("Project assignment unavailable");
      await ctx.requireAccess("task.read", { organizationId, projectId: task.projectId });
      const duties = await db.responsibility.findMany({ where: { organizationId, taskId: task.id, personId: actor.user.personId!, kind: "ACCOUNTABLE", status: "ACTIVE" }, take: 20 });
      const duty = duties.find(row => { try { return JSON.parse(row.metadata ?? "{}").skillCityDuty === input.duty; } catch { return false; } });
      if (!duty) throw new AccessError("Review duty unavailable");
      const token = await replay(db, userId, "review", input);
      if (token.previous) return { id: token.previous.entityId, replay: true };
      const evidence = await db.taskEvidence.create({ data: { taskId: task.id, actorUserId: userId, actorPersonId: actor.user.personId!, data: JSON.stringify({ kind: "SKILLCITY_REVIEW", duty: input.duty, verdict: input.verdict, comment: input.comment, responsibilityId: duty.id }) } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor.user.personId, organizationId, projectId: task.projectId, action: "staff.developer_review_recorded", entityType: "TaskEvidence", entityId: evidence.id, reference: token.reference, result: "SUCCESS", metadata: { fingerprint: token.fingerprint, taskId: task.id, duty: input.duty, verdict: input.verdict, executesAcceptance: false } });
      return { id: evidence.id, replay: false };
    });
  }
  async function completeReviewedTask(userId: string, raw: unknown) {
    const input = completionInput.parse(raw);
    return client.$transaction(async db => {
      const { ctx, organizationId } = await labs(db, userId);
      const task = await db.task.findUnique({ where: { id: input.taskId } });
      if (!task?.projectId || task.organizationId !== organizationId || !task.assigneePersonId || task.assigneePersonId === ctx.user!.personId) throw new AccessError("Independent task decision required");
      const p = await db.project.findUnique({ where: { id: task.projectId } });
      let kind: string | undefined;
      try { kind = JSON.parse(p?.metadata ?? "{}").kind; } catch { throw new AccessError("Labs project unavailable"); }
      if (!p || p.organizationId !== organizationId || kind !== "AIRALABS_PROJECT") throw new AccessError("Labs project unavailable");
      for (const key of ["task.read", "task.manage", "responsibility.read", "decision.decide"]) await ctx.requireAccess(key, { organizationId, projectId: p.id });
      const token = await replay(db, userId, "reviewed-completion", input);
      if (token.previous) return { id: task.id, replay: true };
      if (["COMPLETED", "CANCELLED"].includes(task.status) || ["COMPLETED", "CANCELLED", "ARCHIVED"].includes(p.status) || task.revision !== input.revision) throw new AccessError("Task changed; refresh before deciding");
      const approvals = await requireSkillCityTaskReviews(db, task, true);
      if (!approvals) throw new AccessError("Independent review and testing approval required");
      await execution.save(userId, "tasks", { organizationId, projectId: task.projectId, title: task.title, status: "COMPLETED", description: task.description, ownerPersonId: task.ownerPersonId, assigneePersonId: task.assigneePersonId, dueDate: task.dueDate, startDate: task.startDate, goalId: task.goalId, milestoneId: task.milestoneId, priority: task.priority, metadata: task.metadata ? JSON.parse(task.metadata) : null }, task.id, db);
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId, projectId: task.projectId, action: "staff.developer_task_reviewed_complete", entityType: "Task", entityId: task.id, reference: token.reference, result: "SUCCESS", metadata: { fingerprint: token.fingerprint, reason: input.reason, codeReviewResponsibilityId: approvals.CODE_REVIEW, testingResponsibilityId: approvals.TESTING } });
      return { id: task.id, replay: false };
    });
  }
  async function workspace(userId: string) {
    const { ctx, organizationId, companyId } = await labs(client, userId);
    const actor = await developer(client, userId, organizationId, companyId);
    const memberships = await client.membership.findMany({ where: { personId: actor.user.personId!, organizationId, projectId: { not: null }, status: "ACTIVE", OR: [{ startDate: null }, { startDate: { lte: now() } }], AND: [{ OR: [{ endDate: null }, { endDate: { gte: now() } }] }] }, select: { projectId: true }, take: 30 });
    const legacyOwned = await client.project.findMany({ where: { organizationId, ownerPersonId: actor.user.personId }, select: { id: true }, take: 30 });
    const legacyIds = [];
    for (const row of legacyOwned) if (await legacyOwner(client, row.id, actor.user.personId!, organizationId)) legacyIds.push(row.id);
    const ids = [...new Set([...memberships.map(row => row.projectId!).filter(Boolean), ...legacyIds])];
    const rows = await client.project.findMany({ where: { id: { in: ids }, organizationId }, select: { id: true, name: true, status: true, description: true, targetDate: true, metadata: true }, orderBy: [{ targetDate: "asc" }, { id: "asc" }], take: 30 });
    const projects = [];
    for (const row of rows) {
      if (!(await ctx.decide("project.read", { organizationId, projectId: row.id })).allowed || !(await ctx.decide("task.read", { organizationId, projectId: row.id })).allowed) continue;
      let metadata: { kind?: string };
      try { metadata = JSON.parse(row.metadata ?? "{}"); } catch { continue; }
      if (metadata.kind !== "AIRALABS_PROJECT") continue;
      const tasks = await client.task.findMany({ where: { projectId: row.id, organizationId, OR: [{ assigneePersonId: actor.user.personId }, { responsibilities: { some: { personId: actor.user.personId!, kind: "ACCOUNTABLE", status: "ACTIVE" } } }] }, select: { id: true, title: true, description: true, status: true, dueDate: true, revision: true, assigneePersonId: true, responsibilities: { where: { personId: actor.user.personId!, kind: "ACCOUNTABLE", status: "ACTIVE" }, select: { metadata: true } }, evidence: { select: { id: true, actorPersonId: true, data: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 30 });
      const visible = tasks.map(task => ({ id: task.id, title: task.title, description: task.description, status: task.status, dueDate: task.dueDate, revision: task.revision, own: task.assigneePersonId === actor.user.personId, canUpdate: task.assigneePersonId === actor.user.personId && !["COMPLETED", "CANCELLED"].includes(task.status) && !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(row.status) && ctx.organizationIds("task.manage").includes(organizationId), duties: task.responsibilities.flatMap(item => { try { const duty = JSON.parse(item.metadata ?? "{}").skillCityDuty; return duty === "CODE_REVIEW" || duty === "TESTING" ? [duty as "CODE_REVIEW" | "TESTING"] : []; } catch { return []; } }), history: task.evidence.flatMap(item => { try { const data = JSON.parse(item.data); return [data.kind === "SKILLCITY_CONTRIBUTION" ? { id: item.id, kind: "Contribution", detail: String(data.detail), createdAt: item.createdAt, actorPersonId: item.actorPersonId } : data.kind === "SKILLCITY_REVIEW" ? { id: item.id, kind: data.duty === "TESTING" ? "Testing" : "Code review", detail: `${data.verdict}: ${data.comment}`, createdAt: item.createdAt, actorPersonId: item.actorPersonId } : null]; } catch { return []; } }).filter((item): item is NonNullable<typeof item> => item !== null) })).filter(task => task.own || task.duties.length);
      if (visible.length) projects.push({ id: row.id, name: row.name, status: row.status, specification: row.description, targetDate: row.targetDate, tasks: visible });
    }
    return { projects };
  }
  async function management(userId: string) {
    const { ctx, organizationId, companyId } = await labs(client, userId);
    for (const key of ["project.read", "task.read", "task.manage", "membership.manage", "person.read"]) await ctx.requireAccess(key, { organizationId });
    const canAssignDuty = (await ctx.decide("responsibility.manage", { organizationId })).allowed;
    const canComplete = (await ctx.decide("responsibility.read", { organizationId })).allowed && (await ctx.decide("decision.decide", { organizationId })).allowed;
    const people = await client.user.findMany({ where: { status: "ACTIVE", emailVerifiedAt: { not: null }, personId: { not: null }, person: { status: "ACTIVE", memberships: { some: { status: "ACTIVE", OR: [{ organizationId }, { organizationId: companyId, scope: "DESCENDANTS" }], roles: { some: { role: { status: "ACTIVE", principalType: "HUMAN", name: { in: developerNames } } } } } } } }, select: { id: true, personId: true, person: { select: { displayName: true } } }, take: 50 });
    const developers = [];
    for (const row of people) {
      try { await developer(client, row.id, organizationId, companyId); developers.push({ id: row.id, personId: row.personId!, name: row.person?.displayName ?? "Developer" }); } catch (error) { if (!(error instanceof AccessError)) throw error; }
    }
    const rows = await client.project.findMany({ where: { organizationId, status: { in: ["PLANNED", "ACTIVE", "BLOCKED"] } }, select: { id: true, name: true, metadata: true, tasks: { select: { id: true, title: true, status: true, assigneePersonId: true, revision: true }, take: 30, orderBy: { createdAt: "desc" } } }, take: 30, orderBy: { createdAt: "desc" } });
    const projects = [];
    for (const row of rows) {
      let kind: string | undefined;
      try { kind = JSON.parse(row.metadata ?? "{}").kind; } catch { continue; }
      if (kind !== "AIRALABS_PROJECT" || !(await ctx.decide("project.read", { organizationId, projectId: row.id })).allowed || !(await ctx.decide("task.read", { organizationId, projectId: row.id })).allowed || !(await ctx.decide("task.manage", { organizationId, projectId: row.id })).allowed) continue;
      projects.push({ id: row.id, name: row.name, tasks: row.tasks.filter(task => !["COMPLETED", "CANCELLED"].includes(task.status)) });
    }
    return { developers, projects, canAssignDuty, canComplete };
  }
  return { assignTask, assignDuty, contribute, updateOwnTask, review, completeReviewedTask, workspace, management };
}

export const skillCityDeveloperDesk = createSkillCityDeveloperDesk();
