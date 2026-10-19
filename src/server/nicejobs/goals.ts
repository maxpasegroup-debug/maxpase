import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { createOperationsService } from "@/server/domain/operations-service";
import { operationalEvent } from "@/server/domain/operational-events";
import { toolAuthority } from "@/server/sia/context";
import { createEmployeeService } from "./employee";
import { careerGoalPlan, draftGoalPlan, goalOutcome } from "./goal-plan";
import { incentivePolicy } from "./finance-input";
import { NiceJobsError } from "./input";
import { skillLevels } from "./skill-levels";
import { createExecutionService } from "@/server/domain/execution-service";

const id = z.string().min(1).max(100), base = { confirmed: z.literal(true), idempotencyKey: z.uuid() };
export const goalCommand = z.discriminatedUnion("operation", [
  z.object({ ...base, operation: z.literal("PROPOSE"), outcome: goalOutcome, previousGoalId: id.optional(), policyVersionId: id.optional(), siaId: id.optional() }).strict(),
  z.object({ ...base, operation: z.literal("SUBMIT"), goalId: id, controlPointId: id }).strict(),
  z.object({ ...base, operation: z.literal("DECIDE"), goalId: id, approvalId: id, decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ ...base, operation: z.literal("APPLY"), goalId: id }).strict(),
  z.object({ ...base, operation: z.literal("RESPONSIBILITY"), goalId: id, stageKey: id, title: z.string().trim().min(3).max(200), instruction: z.string().trim().min(3).max(4000), reason: z.string().trim().min(1).max(1000) }).strict(),
]);
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
type DB = Prisma.TransactionClient;
export function createGoalService(client: PrismaClient = prisma, now: () => Date = () => new Date()) {
  const employee = createEmployeeService(client, now), operations = createOperationsService(client);
  async function levels(db: DB, onboardingId: string | null) {
    const e = onboardingId ? await db.niceJobsOnboarding.findUnique({ where: { id: onboardingId }, include: { plan: true, progress: true } }) : null;
    return { planId: e?.planId ?? null, fingerprint: e?.plan.fingerprint ?? null, levels: e ? skillLevels(JSON.parse(e.plan.configuration).ojt, e.progress) : [] };
  }
  async function target(db: DB, userId: string, goalId: string) {
    const b = await employee.internal.boundary(db, userId), g = await db.goal.findUnique({ where: { id: goalId } });
    if (!g) throw new AccessError("Goal unavailable");
    const p = careerGoalPlan.parse(JSON.parse(g.metadata ?? "{}"));
    const a = await db.niceJobsAssignment.findUnique({ where: { id: p.assignmentId }, include: employee.internal.assignmentInclude });
    if (!a || a.divisionId !== g.organizationId || a.profile.personId !== g.ownerPersonId || a.profile.companyId !== b.company.id || a.version.template.productId !== b.product.id) throw new AccessError("Goal scope mismatch");
    await employee.internal.active(db, b, a);
    const own = a.profile.personId === b.personId;
    await b.ctx.requireAccess(own ? "nicejobs.workspace.self" : "nicejobs.workspace.read", { organizationId: a.divisionId });
    if (!own) await b.ctx.requireAccess("person.read", { organizationId: a.divisionId });
    return { b, g, p, a, own };
  }
  async function policy(db: DB, assignmentId: string, policyId: string) {
    const a = await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
    const v = await db.niceJobsIncentiveVersion.findFirst({ where: { id: policyId, status: "PUBLISHED", publishedAt: { not: null }, reviewedAt: { not: null }, effectiveAt: { lte: now() }, OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }], policy: { divisionId: a.divisionId, jobVersionId: a.versionId } } });
    if (!v) throw new NiceJobsError("Applicable reviewed incentive rule required");
    const p = incentivePolicy.parse(JSON.parse(v.definition));
    if (p.rule.type === "CUSTOM_POLICY") throw new NiceJobsError("Unsupported incentive rule");
    return v;
  }
  async function mutate(userId: string, raw: unknown) {
    const c = goalCommand.parse(raw), fingerprint = hash({ userId, c }), reference = `nicejobs-goal:${userId}:${c.idempotencyKey}`;
    return client.$transaction(async db => {
      const b = await employee.internal.boundary(db, userId);
      const t = c.operation === "PROPOSE" ? null : await target(db, userId, c.goalId);
      const a = t?.a ?? await employee.internal.own(db, b);
      if (c.operation === "PROPOSE" || c.operation === "SUBMIT") {
        if (a.profile.personId !== b.personId) throw new AccessError("Only the participant may propose and submit");
      } else {
        if (a.managerId !== b.personId || a.profile.personId === b.personId) throw new AccessError("Assigned independent manager required");
        await b.ctx.requireAccess("nicejobs.work.manage", { organizationId: a.divisionId });
        for (const key of ["goal.read", "approval.read", "approval.decide", "control.read"]) await b.ctx.requireAccess(key, { organizationId: a.divisionId });
      }
      if (c.operation === "RESPONSIBILITY") for (const key of ["nicejobs.onboarding.read", "task.manage", "task.read"]) await b.ctx.requireAccess(key, { organizationId: a.divisionId });
      if (c.operation === "PROPOSE" && c.policyVersionId) await b.ctx.requireAccess("nicejobs.finance.self.read", { organizationId: a.divisionId });
      if (t?.p.policyVersionId && ["DECIDE", "APPLY"].includes(c.operation)) {
        await b.ctx.requireAccess("nicejobs.finance.policy.read", { organizationId: a.divisionId });
        if (c.operation !== "DECIDE" || c.decision === "APPROVED") {
          const source = await policy(db, a.id, t.p.policyVersionId);
          if (hash(source.definition) !== t.p.policy) throw new NiceJobsError("Incentive source changed; prepare a newly reviewed proposal");
        }
      }
      let sourceTasks: string[] = [];
      if (c.operation === "PROPOSE" && c.siaId) {
        const selection = { siaId: c.siaId, organizationId: a.divisionId };
        await toolAuthority(db, userId, selection, "get_worker_day");
        const agentBoundary = await employee.internal.boundary(db, userId, selection);
        const agentAssignment = await employee.internal.own(db, agentBoundary);
        const tasks = await db.task.findMany({ where: { AND: [employee.internal.taskWhere(agentBoundary, agentAssignment), { status: { in: ["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED"] } }] }, select: { id: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 5 });
        sourceTasks = tasks.map(task => task.id);
      }
      const prior = await db.operationalEvent.findUnique({ where: { reference } });
      if (prior) {
        if (JSON.parse(prior.metadata ?? "{}").fingerprint !== fingerprint) throw new NiceJobsError("Goal replay mismatch");
        return { id: prior.entityId };
      }
      let goalId = t?.g.id ?? "";
      if (c.operation === "PROPOSE") {
        const previous = c.previousGoalId ? await target(db, userId, c.previousGoalId) : null;
        if (previous && (previous.a.id !== a.id || previous.g.status !== "ACTIVE")) throw new NiceJobsError("Current approved goal required for a target change");
        if (c.policyVersionId) await b.ctx.requireAccess("nicejobs.finance.self.read", { organizationId: a.divisionId });
        const p = c.policyVersionId ? await policy(db, a.id, c.policyVersionId) : null;
        const plan = careerGoalPlan.parse({ kind: "NICE_JOBS_30_DAY", assignmentId: a.id, outcome: c.outcome, start: now().toISOString(), provider: c.siaId ? "DETERMINISTIC_DOMAIN_EVIDENCE" : "HUMAN_TEMPLATE", siaId: c.siaId ?? null, policyVersionId: p?.id ?? null, policy: p ? hash(p.definition) : null, previousGoalId: previous?.g.id ?? null, requestId: null, ...draftGoalPlan(c.outcome), sourceTasks });
        const g = await db.goal.create({ data: { organizationId: a.divisionId, ownerPersonId: b.personId, accountablePersonId: a.managerId, title: c.outcome.outcome, description: `${c.outcome.target} ${c.outcome.unit}; proposed 30-day outcome, not guaranteed earnings`, status: "DRAFT", progressMode: "TASKS", startDate: now(), targetDate: new Date(now().getTime() + 30 * 86400000), metadata: JSON.stringify(plan) } });
        goalId = g.id;
      } else if (c.operation === "SUBMIT") {
        if (t!.g.status !== "DRAFT" || t!.p.requestId) throw new NiceJobsError("This proposal has already been submitted");
        const point = await db.controlPoint.findFirst({ where: { id: c.controlPointId, organizationId: a.divisionId, projectId: null, status: "ACTIVE", allowSelfApproval: false, requiredPermission: "nicejobs.work.manage", kind: { in: ["APPROVAL", "HUMAN_DECISION"] } }, include: { rules: { include: { approver: true } } } });
        if (!a.managerId || !point || point.rules.length !== 1 || point.rules[0].approver.personId !== a.managerId || point.rules[0].requiredPermission !== "nicejobs.work.manage") throw new NiceJobsError("Configure a scoped independent approval for the assigned manager");
        // Only this owned proposal and this prevalidated control gain request preparation authority.
        const narrow = async (actor: string, transaction: DB = db) => {
          const ctx = await createAccessContext(actor, transaction);
          return { ...ctx, requireAccess: async (key: string, scope: { organizationId: string; projectId?: string | null }) => {
            if (actor === userId && ["request.manage", "control.read"].includes(key) && scope.organizationId === a.divisionId && !scope.projectId) return ctx.requireAccess("nicejobs.workspace.self", scope);
            return ctx.requireAccess(key, scope);
          } };
        };
        const ownOperations = createOperationsService(client, narrow);
        const r = await ownOperations.createRequest(userId, { organizationId: a.divisionId, resourceType: "GOAL", resourceId: goalId, controlPointId: point.id, title: t!.g.title, description: "Review participant outcome, checkpoints and linked incentive rule", idempotencyKey: c.idempotencyKey }, undefined, db);
        const updated = { ...t!.p, requestId: r.id };
        await db.goal.update({ where: { id: goalId }, data: { metadata: JSON.stringify(updated) } });
        await db.operationalRequest.update({ where: { id: r.id }, data: { type: "NICE_JOBS_GOAL", payload: JSON.stringify({ goalFingerprint: hash(updated), assignmentId: a.id }) } });
        await ownOperations.submitRequest(userId, r.id, db);
      } else if (c.operation === "DECIDE") {
        if (!t!.p.requestId) throw new NiceJobsError("Submit the proposal first");
        const approval = await db.siaApproval.findUnique({ where: { id: c.approvalId } });
        if (approval?.requestId !== t!.p.requestId) throw new AccessError("Approval binding mismatch");
        await operations.decide(userId, { approvalId: c.approvalId, decision: c.decision, comment: c.reason }, db);
      } else if (c.operation === "RESPONSIBILITY") {
        await b.ctx.requireAccess("nicejobs.onboarding.read", { organizationId: a.divisionId });
        for (const key of ["task.manage", "task.read"]) await b.ctx.requireAccess(key, { organizationId: a.divisionId });
        if (t!.g.status !== "ACTIVE" || !t!.p.requestId || !await operations.approvedAuthority(db, t!.p.requestId)) throw new NiceJobsError("An approved active goal is required");
        const learning = await levels(db, a.onboardingId), level = learning.levels.find(l => l.key === c.stageKey);
        if (!level?.unlocked) throw new NiceJobsError("Complete the required reviewed skill level first");
        const task = await createExecutionService(client).save(userId, "tasks", { organizationId: a.divisionId, title: c.title, description: c.instruction, assigneePersonId: a.profile.personId, goalId, status: "TODO", metadata: { careerGoalId: goalId, requestId: t!.p.requestId, trainingPlanId: learning.planId, trainingFingerprint: learning.fingerprint, stageKey: level.key, progressIds: level.progressIds, managerReason: c.reason } }, undefined, db);
        await db.task.update({ where: { id: task.id }, data: { niceJobsAssignmentId: a.id, evidenceRequired: true } });
        await operationalEvent(db, { actorUserId: userId, actorPersonId: b.personId, organizationId: a.divisionId, action: "nicejobs.goal.responsibility_assigned", entityType: "Task", entityId: task.id, result: "SUCCESS", metadata: { goalId, trainingPlanId: learning.planId, stageKey: level.key } });
      } else {
        if (t!.g.targetDate && t!.g.targetDate <= now()) throw new NiceJobsError("This planning window has ended; prepare a new proposal");
        if (t!.g.status !== "DRAFT" || !t!.p.requestId || !await operations.approvedAuthority(db, t!.p.requestId)) throw new NiceJobsError("Current human approval is required before activating a plan");
        if (t!.p.policyVersionId) await policy(db, a.id, t!.p.policyVersionId);
        const previous = t!.p.previousGoalId ? await target(db, userId, t!.p.previousGoalId) : null;
        if (previous && previous.g.status !== "ACTIVE") throw new NiceJobsError("The previous target has changed; prepare a new proposal");
        const active = await db.goal.findMany({ where: { organizationId: a.divisionId, ownerPersonId: a.profile.personId, status: "ACTIVE", metadata: { contains: '"kind":"NICE_JOBS_30_DAY"' } }, take: 2 });
        if (active.some(g => g.id !== previous?.g.id)) throw new NiceJobsError("Replace the current goal through a reviewed target-change proposal");
        if (previous) await db.goal.update({ where: { id: previous.g.id }, data: { status: "ARCHIVED" } });
        await db.goal.update({ where: { id: goalId }, data: { status: "ACTIVE" } });
      }
      await operationalEvent(db, { actorUserId: userId, actorPersonId: b.personId, organizationId: a.divisionId, action: "nicejobs.goal." + c.operation.toLowerCase(), entityType: "Goal", entityId: goalId, result: "SUCCESS", reference, metadata: { fingerprint, assignmentId: a.id } });
      return { id: goalId };
    });
  }
  async function list(userId: string, assignmentId?: string) {
    return client.$transaction(async db => {
      const b = await employee.internal.boundary(db, userId);
      const a = assignmentId ? await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: assignmentId }, include: employee.internal.assignmentInclude }) : await employee.internal.own(db, b);
      await employee.internal.active(db, b, a);
      const own = a.profile.personId === b.personId;
      await b.ctx.requireAccess(own ? "nicejobs.workspace.self" : "nicejobs.workspace.read", { organizationId: a.divisionId });
      if (!own) await b.ctx.requireAccess("person.read", { organizationId: a.divisionId });
      const where: Prisma.GoalWhereInput = { organizationId: a.divisionId, ownerPersonId: a.profile.personId, AND: [{ metadata: { contains: '"kind":"NICE_JOBS_30_DAY"' } }, { metadata: { contains: '"assignmentId":"' + a.id + '"' } }] };
      const recent = await db.goal.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 26 });
      const active = await db.goal.findMany({ where: { ...where, status: "ACTIVE" }, take: 2 });
      if (active.length > 1) throw new NiceJobsError("Multiple active goals require authorized reconciliation");
      const goals = [...active, ...recent.filter(g => !active.some(current => current.id === g.id))];
      const canReadPolicy = (await b.ctx.decide(own ? "nicejobs.finance.self.read" : "nicejobs.finance.policy.read", { organizationId: a.divisionId })).allowed;
      const records = [];
      for (const g of goals.slice(0, 25)) {
        const t = await target(db, userId, g.id);
        if (t.a.id !== a.id) continue;
        const request = t.p.requestId ? await db.operationalRequest.findUnique({ where: { id: t.p.requestId }, include: { approvals: { orderBy: { stageIndex: "asc" } } } }) : null;
        let rule: z.infer<typeof incentivePolicy>["rule"] | null = null;
        if (canReadPolicy && t.p.policyVersionId) {
          const source = await db.niceJobsIncentiveVersion.findFirst({ where: { id: t.p.policyVersionId, publishedAt: { not: null }, policy: { companyId: b.company.id, divisionId: a.divisionId, jobVersionId: a.versionId } }, select: { definition: true } });
          if (source && hash(source.definition) === t.p.policy) rule = incentivePolicy.parse(JSON.parse(source.definition)).rule;
        }
        records.push({ id: g.id, status: g.status, plan: t.p, rule, requestStatus: request?.status ?? "NOT_SUBMITTED", approvals: request?.approvals.map(r => ({ id: r.id, status: r.status, comment: r.comment, decidedAt: r.decidedAt, canDecide: !own && a.managerId === b.personId && r.approverUserId === userId && r.status === "PENDING" && request.status === "SUBMITTED" } )) ?? [] });
      }
      const points = await db.controlPoint.findMany({ where: { organizationId: a.divisionId, projectId: null, status: "ACTIVE", allowSelfApproval: false, requiredPermission: "nicejobs.work.manage", kind: { in: ["APPROVAL", "HUMAN_DECISION"] }, rules: { some: { approver: { personId: a.managerId ?? "__none__" }, requiredPermission: "nicejobs.work.manage" } } }, select: { id: true, name: true }, take: 25 });
      const policies = canReadPolicy ? await db.niceJobsIncentiveVersion.findMany({ where: { status: "PUBLISHED", publishedAt: { not: null }, reviewedAt: { not: null }, effectiveAt: { lte: now() }, OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }], policy: { companyId: b.company.id, divisionId: a.divisionId, jobVersionId: a.versionId } }, select: { id: true, number: true, policy: { select: { name: true } } }, take: 25 }) : [];
      const canReadLevels = (await b.ctx.decide(own ? "nicejobs.onboarding.self" : "nicejobs.onboarding.read", { organizationId: own ? b.product.divisionId! : a.divisionId })).allowed;
      const learning = canReadLevels ? await levels(db, a.onboardingId) : null;
      let siaId: string | null = null;
      let siaStatus: "AVAILABLE" | "NOT_CONFIGURED" | "NOT_AUTHORIZED" = "NOT_CONFIGURED";
      if (own) {
        const identity = await db.siaIdentity.findFirst({ where: { status: "ACTIVE" }, select: { id: true }, orderBy: { id: "asc" } });
        if (identity) {
          const tool = await db.siaTool.findUnique({ where: { siaId_key: { siaId: identity.id, key: "get_worker_day" } }, select: { enabled: true } });
          if (tool?.enabled) try { await toolAuthority(db, userId, { siaId: identity.id, organizationId: a.divisionId }, "get_worker_day"); siaId = identity.id; siaStatus = "AVAILABLE"; } catch (e) { if (!(e instanceof AccessError)) throw e; siaStatus = "NOT_AUTHORIZED"; }
        }
      }
      const canManage = !own && a.managerId === b.personId && (await b.ctx.decide("nicejobs.work.manage", { organizationId: a.divisionId })).allowed;
      const canAssign = canManage && ["task.manage", "task.read", "nicejobs.onboarding.read", "goal.read", "approval.read", "approval.decide", "control.read"].every(key => b.ctx.organizationIds(key).includes(a.divisionId));
      return { records, truncated: goals.length > 25, points, policies, siaId, siaStatus, own, learning, asOf: now(), canManage, canAssign, assignmentId: a.id };
    });
  }
  return { mutate, list };
}
export const goalService = createGoalService();
