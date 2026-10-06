import { boundedRead, groupRows, resultPage, sortedResultPage, type PageInput } from "./query-bounds";
import { createHash } from "node:crypto";
import { z } from "zod";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext as defaultAccessContext } from "@/server/authorization/engine";
import { foundationalSiaTools } from "@/server/sia/contracts";
import { inspectSiaToolAccess } from "@/server/sia/access";
import { createExecutionService } from "./execution-service";
import { boundResource, validRecipient, type DB, type Context, type Resource } from "./operations-scope";
import { operationalEvent, notify } from "./operational-events";
import * as input from "./operations-input";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const humanApproval = (kind: string) => ["APPROVAL", "HUMAN_DECISION"].includes(kind);
export function recurrenceDate(start: Date, frequency: string, interval: number, index: number) {
  const date = new Date(start);
  if (frequency === "MONTHLY") {
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + interval * index);
    const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(start.getUTCDate(), days));
  } else date.setUTCDate(date.getUTCDate() + interval * index * (frequency === "WEEKLY" ? 7 : 1));
  return date;
}
export type OperationsQuery = { recordId?: string; organizationId?: string; projectId?: string; search?: string; status?: string; requesterUserId?: string; approverUserId?: string; actorUserId?: string; entityId?: string; type?: string; priority?: string; read?: string; from?: string; until?: string; assigneePersonId?: string; dueBefore?: string };
const keys: Record<input.OperationsKind, string> = { "my-tasks": "task.read", workflows: "workflow.read", instances: "workflow.read", approvals: "approval.read", requests: "request.read", notifications: "notification.read", activity: "activity.read", events: "event.read", reminders: "reminder.read", recurring: "recurrence.read", escalations: "escalation.read", controls: "control.read", preferences: "notification.read", sia: "request.read" };
export function createOperationsService(client: PrismaClient = prisma, createAccessContext = defaultAccessContext) {
  async function context(db: DB, userId: string) {
    const ctx = await createAccessContext(userId, db);
    if (!ctx.active || !ctx.user?.personId) throw new AccessError("Access denied");
    return ctx;
  }
  async function event(db: DB, ctx: Context, scope: { organizationId: string; projectId?: string | null }, action: string, type: string, id: string, metadata?: Prisma.InputJsonObject, result: "SUCCESS" | "FAILURE" = "SUCCESS") {
    return operationalEvent(db, { actorUserId: ctx.user!.id, actorPersonId: ctx.user!.personId, organizationId: scope.organizationId, projectId: scope.projectId, action, entityType: type, entityId: id, result, metadata });
  }
  async function capability(db: DB, ctx: Context, key: string, scope: { organizationId: string; projectId?: string | null }) {
    const permission = await db.permission.findUnique({ where: { key } });
    if (!permission) throw new AccessError("Unknown capability");
    await ctx.requireDelegation(permission, scope);
  }
  async function point(db: DB, ctx: Context, id: string, scope: { organizationId: string; projectId?: string | null }) {
    const p = await db.controlPoint.findUnique({ where: { id }, include: { rules: true } });
    if (!p || p.status !== "ACTIVE" || p.organizationId !== scope.organizationId || (p.projectId ?? null) !== (scope.projectId ?? null)) throw new AccessError("Control policy scope mismatch");
    await ctx.requireAccess("control.read", p);
    return p;
  }
  async function approvedAuthority(db: DB, requestId: string) {
    const r = await db.operationalRequest.findUniqueOrThrow({ where: { id: requestId }, include: { controlPoint: true, approvals: true, workflowInstance: true } });
    if (r.status !== "APPROVED" || r.controlPoint.status !== "ACTIVE" || !r.approvals.length || r.expiresAt && r.expiresAt <= new Date()) return false;
    if (r.workflowInstance && (r.workflowInstance.status !== "PENDING" || r.workflowInstance.version !== r.instanceVersion)) return false;
    for (const a of r.approvals) {
      if (a.status !== "APPROVED" || !a.decidedByUserId || a.decidedByUserId !== a.approverUserId) return false;
      try {
        const approver = await requestRecipient(db, r, a.decidedByUserId, a.requiredPermission, r.type === "SIA_PROPOSAL" ? false : r.controlPoint.allowSelfApproval);
        const decision = await db.auditEvent.findFirst({ where: { action: "approval.approved", entityId: a.id, actorUserId: a.decidedByUserId }, select: { actorPersonId: true }, orderBy: { createdAt: "desc" } });
        const assignedPersonId = JSON.parse(a.metadata ?? "{}").approverPersonId;
        if (decision?.actorPersonId !== approver.user!.personId || assignedPersonId && assignedPersonId !== approver.user!.personId) return false;
        await approver.requireAccess(r.controlPoint.requiredPermission, r);
      } catch (error) { if (!(error instanceof AccessError)) throw error; return false; }
    }
    return true;
  }
  async function saveControl(userId: string, raw: unknown) {
    const parsed = input.controlInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      await ctx.requireAccess("control.manage", parsed);
      await capability(db, ctx, parsed.requiredPermission, parsed);
      const seen = new Set<string>();
      for (const stage of parsed.stages) for (const rule of stage) {
        const approver = await context(db, rule.approverUserId);
        if (seen.has(approver.user!.personId!)) throw new AccessError("A human approver may appear only once in a chain");
        seen.add(approver.user!.personId!);
        await approver.requireAccess("approval.decide", parsed);
        await approver.requireAccess(rule.requiredPermission, parsed);
        await capability(db, ctx, rule.requiredPermission, parsed);
      }
      const { stages, ...data } = parsed;
      const row = await db.controlPoint.create({ data: { ...data, projectId: data.projectId ?? null, rules: { create: stages.flatMap((stage, stageIndex) => stage.map(r => ({ ...r, stageIndex }))) } } });
      await event(db, ctx, row, "control.created", "ControlPoint", row.id);
      return row;
    });
  }
  async function saveWorkflow(userId: string, raw: unknown, id?: string) {
    const data = input.workflowInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      await ctx.requireAccess("workflow.manage", data);
      if (new Set(data.states.map(s => s.key)).size !== data.states.length || new Set(data.transitions.map(t => t.key)).size !== data.transitions.length) throw new AccessError("State and transition keys must be unique");
      if (data.states.filter(s => s.initial).length !== 1 || !data.states.some(s => s.terminal)) throw new AccessError("Exactly one initial state and at least one terminal state are required");
      const reachable = new Set([data.states.find(s => s.initial)!.key]);
      for (const t of data.transitions) {
        const from = data.states.find(s => s.key === t.from); const to = data.states.find(s => s.key === t.to);
        if (!from || !to || from.terminal || from.key === to.key) throw new AccessError("Invalid transition endpoints");
        await capability(db, ctx, t.requiredPermission, data);
        if (t.controlPointId) await point(db, ctx, t.controlPointId, data);
      }
      for (let i = 0; i < data.states.length; i++) for (const t of data.transitions) if (reachable.has(t.from)) reachable.add(t.to);
      if (reachable.size !== data.states.length || data.states.some(s => !s.terminal && !data.transitions.some(t => t.from === s.key))) throw new AccessError("Every state must be reachable; nonterminal states need transitions");
      if (id) {
        const previous = await db.workflowDefinition.findUniqueOrThrow({ where: { id } });
        await ctx.requireAccess("workflow.manage", previous);
        if (previous.status !== "DRAFT" || previous.organizationId !== data.organizationId || previous.projectId !== (data.projectId ?? null) || previous.key !== data.key || previous.version !== data.version) throw new AccessError("Published workflows and version identity are immutable");
        await db.workflowTransition.deleteMany({ where: { definitionId: id } });
        await db.workflowState.deleteMany({ where: { definitionId: id } });
      }
      const { states, transitions, ...definition } = data;
      const values = { ...definition, projectId: data.projectId ?? null, scopeKey: data.projectId ? "project:" + data.projectId : "organization" };
      const row = id ? await db.workflowDefinition.update({ where: { id }, data: values }) : await db.workflowDefinition.create({ data: values });
      const records = [];
      for (const state of states) records.push(await db.workflowState.create({ data: { ...state, definitionId: row.id } }));
      for (const t of transitions) await db.workflowTransition.create({ data: { definitionId: row.id, key: t.key, fromStateId: records.find(s => s.key === t.from)!.id, toStateId: records.find(s => s.key === t.to)!.id, requiredPermission: t.requiredPermission, requireReason: t.requireReason, controlPointId: t.controlPointId } });
      await event(db, ctx, row, id ? "workflow.changed" : "workflow.created", "WorkflowDefinition", row.id);
      return row;
    });
  }
  async function publishWorkflow(userId: string, id: string) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const row = await db.workflowDefinition.findUniqueOrThrow({ where: { id } });
      await ctx.requireAccess("workflow.manage", row);
      if (row.status !== "DRAFT") throw new AccessError("Only a draft can be published");
      await db.workflowDefinition.update({ where: { id }, data: { status: "ACTIVE" } });
      await event(db, ctx, row, "workflow.published", "WorkflowDefinition", id);
    });
  }
  async function startInTransaction(db: DB, ctx: Context, raw: unknown) {
    const parsed = input.instanceInput.parse(raw);
    const scope = await boundResource(db, ctx, parsed, "workflow.transition");
    const definition = await db.workflowDefinition.findUniqueOrThrow({ where: { id: parsed.definitionId }, include: { states: true } });
    await ctx.requireAccess("workflow.read", definition);
    if (definition.status !== "ACTIVE" || definition.organizationId !== scope.organizationId || definition.projectId !== scope.projectId) throw new AccessError("Workflow definition scope mismatch or not published");
    const fingerprint = hash(parsed);
    const existing = await db.workflowInstance.findUnique({ where: { creatorUserId_idempotencyKey: { creatorUserId: ctx.user!.id, idempotencyKey: parsed.idempotencyKey } } });
    if (existing) { if (existing.fingerprint !== fingerprint) throw new AccessError("Idempotency key was used for different input"); return existing; }
    const row = await db.workflowInstance.create({ data: { ...scope, definitionId: definition.id, creatorUserId: ctx.user!.id, title: parsed.title, currentStateId: definition.states.find(s => s.initial)!.id, fingerprint, idempotencyKey: parsed.idempotencyKey } });
    await event(db, ctx, row, "workflow.started", "WorkflowInstance", row.id);
    return row;
  }
  async function startWorkflow(userId: string, raw: unknown) { return client.$transaction(async db => startInTransaction(db, await context(db, userId), raw)); }
  async function transition(userId: string, raw: unknown) {
    const data = input.transitionInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const instance = await db.workflowInstance.findUniqueOrThrow({ where: { id: data.instanceId }, include: { currentState: true, definition: true } });
      await boundResource(db, ctx, instance, "workflow.transition");
      const t = await db.workflowTransition.findUniqueOrThrow({ where: { id: data.transitionId }, include: { toState: true, controlPoint: true } });
      if (t.definitionId !== instance.definitionId) throw new AccessError("Transition belongs to another definition");
      await ctx.requireAccess(t.requiredPermission, instance);
      const previous = await db.workflowHistory.findUnique({ where: { instanceId_idempotencyKey: { instanceId: instance.id, idempotencyKey: data.idempotencyKey } } });
      const fingerprint = hash({ ...data, actorUserId: userId });
      if (previous) { if (previous.fingerprint !== fingerprint || previous.actorUserId !== userId) throw new AccessError("Transition replay mismatch"); return previous; }
      if (instance.definition.status !== "ACTIVE" || instance.currentState.terminal || instance.status !== "PENDING" || instance.version !== data.expectedVersion || t.fromStateId !== instance.currentStateId) throw new AccessError("State changed; refresh before acting");
      if (t.requireReason && !data.reason?.trim()) throw new AccessError("A reason is required");
      if (t.controlPoint) {
        await point(db, ctx, t.controlPoint.id, instance);
        if (humanApproval(t.controlPoint.kind)) {
          const approved = await db.operationalRequest.findFirst({ where: { workflowInstanceId: instance.id, instanceVersion: instance.version, controlPointId: t.controlPoint.id, status: "APPROVED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
          if (!approved || !await approvedAuthority(db, approved.id)) throw new AccessError("Current human approval authority is required for this state version");
        } else {
          const checked = await db.controlCheck.findFirst({ where: { instanceId: instance.id, instanceVersion: instance.version, controlPointId: t.controlPoint.id, status: "PASSED" } });
          if (!checked) throw new AccessError("Control verification is required");
          const verifier = await context(db, checked.actorUserId);
          await boundResource(db, verifier, instance, "control.evaluate");
          await verifier.requireAccess(t.controlPoint.requiredPermission, instance);
        }
      }
      const changed = await db.workflowInstance.updateMany({ where: { id: instance.id, version: instance.version, currentStateId: t.fromStateId }, data: { currentStateId: t.toStateId, version: { increment: 1 }, status: t.toState.terminal ? "SUCCEEDED" : "PENDING" } });
      if (changed.count !== 1) throw new AccessError("Concurrent transition; refresh before acting");
      const row = await db.workflowHistory.create({ data: { instanceId: instance.id, transitionId: t.id, actorUserId: userId, fromState: instance.currentState.key, toState: t.toState.key, instanceVersion: instance.version, reason: data.reason, idempotencyKey: data.idempotencyKey, fingerprint } });
      await event(db, ctx, instance, "workflow.transitioned", "WorkflowInstance", instance.id, { from: row.fromState, to: row.toState, version: instance.version });
      return row;
    });
  }
  async function checkControl(userId: string, instanceId: string, controlPointId: string, passed: boolean, reason: string) {
    if (!reason.trim() || reason.length > 4000) throw new AccessError("A verification reason is required");
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const instance = await db.workflowInstance.findUniqueOrThrow({ where: { id: instanceId } });
      await boundResource(db, ctx, instance, "control.evaluate");
      const policy = await point(db, ctx, controlPointId, instance);
      await ctx.requireAccess(policy.requiredPermission, instance);
      if (humanApproval(policy.kind) || instance.status !== "PENDING") throw new AccessError("Approval decisions cannot be replaced by verification");
      if (!await db.workflowTransition.findFirst({ where: { definitionId: instance.definitionId, fromStateId: instance.currentStateId, controlPointId } })) throw new AccessError("Control is not required in this state");
      const previous = await db.controlCheck.findUnique({ where: { controlPointId_instanceId_instanceVersion: { controlPointId, instanceId, instanceVersion: instance.version } } });
      if (previous?.status === "PASSED") throw new AccessError("This control version already passed");
      const values = { actorUserId: userId, reason, status: passed ? "PASSED" : "FAILED" };
      if (previous) {
        const changed = await db.controlCheck.updateMany({ where: { id: previous.id, status: "FAILED" }, data: values });
        if (changed.count !== 1) throw new AccessError("Control changed; refresh before acting");
      }
      const row = previous ? await db.controlCheck.findUniqueOrThrow({ where: { id: previous.id } }) : await db.controlCheck.create({ data: { controlPointId, instanceId, instanceVersion: instance.version, ...values } });
      await event(db, ctx, instance, passed ? "control.passed" : "control.failed", "ControlCheck", row.id, { previousStatus: previous?.status ?? null, reason }, passed ? "SUCCESS" : "FAILURE");
      return row;
    });
  }
  async function createRequest(userId: string, raw: unknown, sia?: { siaId: string; toolKey: string; payload?: Record<string, unknown> }, transaction?: DB) {
    const parsed = input.requestInput.parse(raw);
    if (sia) sia = input.proposalInput.parse(sia);
    const run = async (db: DB) => {
      const ctx = await context(db, userId); const scope = await boundResource(db, ctx, parsed, "request.manage");
      const policy = await point(db, ctx, parsed.controlPointId, scope);
      if (!humanApproval(policy.kind)) throw new AccessError("Requests require a human approval policy");
      if (parsed.expiresAt && parsed.expiresAt <= new Date()) throw new AccessError("Expiry must be in the future");
      let instanceVersion: number | null = null;
      if (parsed.workflowInstanceId) {
        const instance = await db.workflowInstance.findUniqueOrThrow({ where: { id: parsed.workflowInstanceId } });
        await boundResource(db, ctx, instance, "workflow.read");
        if (instance.resourceType !== scope.resourceType || instance.resourceId !== scope.resourceId || instance.status !== "PENDING" || !await db.workflowTransition.findFirst({ where: { definitionId: instance.definitionId, fromStateId: instance.currentStateId, controlPointId: policy.id } })) throw new AccessError("Request does not match a control at the current workflow state");
        instanceVersion = instance.version;
      }
      if (sia) {
        await ctx.requireAccess("sia.propose", scope);
        const identity = await db.siaIdentity.findUnique({ where: { id: sia.siaId } });
        const contract = foundationalSiaTools.find(t => t.key === sia.toolKey);
        if (!identity || identity.status !== "ACTIVE" || !contract || policy.allowSelfApproval) throw new AccessError("SIA proposals require a registered tool and independent human approval");
        await ctx.requireAccess(contract.requiredPermission, scope);
      }
      const fingerprint = hash({ ...parsed, sia: sia ?? null });
      const existing = await db.operationalRequest.findUnique({ where: { requesterUserId_idempotencyKey: { requesterUserId: userId, idempotencyKey: parsed.idempotencyKey } } });
      if (existing) { if (existing.fingerprint !== fingerprint) throw new AccessError("Request replay mismatch"); return existing; }
      const row = await db.operationalRequest.create({ data: { ...scope, title: parsed.title, description: parsed.description, requesterUserId: userId, controlPointId: policy.id, workflowInstanceId: parsed.workflowInstanceId, instanceVersion, expiresAt: parsed.expiresAt, fingerprint, idempotencyKey: parsed.idempotencyKey, type: sia ? "SIA_PROPOSAL" : "GENERAL", siaId: sia?.siaId, toolKey: sia?.toolKey, payload: sia?.payload ? JSON.stringify(sia.payload) : null } });
      await event(db, ctx, scope, sia ? "sia.action_proposed" : "request.created", "OperationalRequest", row.id);
      return row;
    };
    return transaction ? run(transaction) : client.$transaction(run);
  }
  async function updateRequest(userId: string, id: string, title: string, description: string) {
    if (!title.trim() || title.length > 200 || description.length > 4000) throw new AccessError("Invalid request content");
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const r = await db.operationalRequest.findUniqueOrThrow({ where: { id } });
      await boundResource(db, ctx, r, "request.manage");
      if (r.status !== "DRAFT" || r.requesterUserId !== userId) throw new AccessError("Only the requester can edit an unsubmitted draft");
      if (await db.siaAction.findUnique({ where: { requestId: id }, select: { id: true } })) throw new AccessError("SIA action proposals are immutable; prepare a new proposal");
      if (await db.communicationMessage.findUnique({ where: { requestId: id }, select: { id: true } })) throw new AccessError("Communication proposals are immutable; prepare a new preview");
      const row = await db.operationalRequest.update({ where: { id }, data: { title, description, fingerprint: hash({ edited: true, id, title, description }) } });
      await event(db, ctx, r, "request.updated", "OperationalRequest", id);
      return row;
    });
  }
  async function requestRecipient(db: DB, r: Resource & { id: string; type: string; requesterUserId: string }, userId: string, requiredPermission: string, allowSelf: boolean) {
    const approver = await validRecipient(db, userId, r, "approval.decide");
    if (!allowSelf || r.type === "SIA_PROPOSAL") {
      const requester = await db.user.findUniqueOrThrow({ where: { id: r.requesterUserId }, select: { personId: true } });
      const created = await db.auditEvent.findFirst({ where: { entityId: r.id, entityType: "OperationalRequest", actorUserId: r.requesterUserId, action: { in: ["request.created", "sia.action_proposed"] } }, select: { actorPersonId: true }, orderBy: { createdAt: "asc" } });
      if (!created?.actorPersonId || requester.personId !== created.actorPersonId) throw new AccessError("Requester human identity changed; create a new request");
      if (r.requesterUserId === userId || created.actorPersonId === approver.user!.personId) throw new AccessError("Self approval is prohibited by policy");
    }
    await approver.requireAccess("approval.read", r); await approver.requireAccess(requiredPermission, r);
    if (await db.communicationMessage.findUnique({ where: { requestId: r.id }, select: { id: true } })) {
      await approver.requireAccess("communication.read", r);
      await approver.requireAccess("person.read", r);
    }
    if (r.type === "SIA_PROPOSAL") await approver.requireAccess("sia.approve_action", r);
    return approver;
  }
  async function approvalNotifications(db: DB, ctx: Context, r: Resource & { id: string; title: string; expiresAt: Date | null }, stageIndex: number) {
    const approvals = await boundedRead(take => db.siaApproval.findMany({ take, where: { requestId: r.id, stageIndex, status: "PENDING" } }));
    for (const a of approvals) await notify(db, ctx.user!.id, a.approverUserId!, r, "APPROVAL_REQUIRED", "Approval required", r.title, "approval:" + a.id, "HIGH", r.expiresAt);
  }
  async function expireApprovalAlerts(db: DB, ctx: Context, r: Resource & { id: string }, approvalIds?: string[]) {
    const ids = approvalIds ?? (await boundedRead(take => db.siaApproval.findMany({ take, where: { requestId: r.id }, select: { id: true } }))).map(a => a.id);
    const now = new Date();
    const notifications = await boundedRead(take => db.notification.findMany({ take, where: { organizationId: r.organizationId, projectId: r.projectId, reference: { in: ids.map(id => "approval:" + id) }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }));
    for (const n of notifications) {
      await db.notification.update({ where: { id: n.id }, data: { expiresAt: now } });
      await event(db, ctx, r, "notification.expired", "Notification", n.id, { requestId: r.id });
    }
  }
  async function submitRequest(userId: string, id: string) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const r = await db.operationalRequest.findUniqueOrThrow({ where: { id } });
      await boundResource(db, ctx, r, "request.manage");
      if (r.requesterUserId !== userId || r.status !== "DRAFT") throw new AccessError("Only the requester may submit a draft once");
      if (r.expiresAt && r.expiresAt <= new Date()) throw new AccessError("Request expired");
      const policy = await point(db, ctx, r.controlPointId, r);
      if (!policy.rules.length) throw new AccessError("No approvers configured");
      if (r.workflowInstanceId) {
        const instance = await db.workflowInstance.findUniqueOrThrow({ where: { id: r.workflowInstanceId } });
        if (instance.version !== r.instanceVersion || instance.status !== "PENDING") throw new AccessError("Workflow state changed before submission");
      }
      const humans = new Set<string>();
      for (const rule of policy.rules) {
        const approver = await requestRecipient(db, r, rule.approverUserId, rule.requiredPermission, policy.allowSelfApproval);
        if (humans.has(approver.user!.personId!)) throw new AccessError("A human approver may appear only once in a chain");
        humans.add(approver.user!.personId!);
        await db.siaApproval.create({ data: { requestId: id, stageIndex: rule.stageIndex, approverUserId: rule.approverUserId, requiredPermission: rule.requiredPermission, requestedByUserId: userId, siaId: r.siaId, action: r.title, metadata: JSON.stringify({ approverPersonId: approver.user!.personId }) } });
      }
      const changed = await db.operationalRequest.updateMany({ where: { id, status: "DRAFT" }, data: { status: "SUBMITTED" } });
      if (changed.count !== 1) throw new AccessError("Request was already submitted");
      await event(db, ctx, r, "approval.requested", "OperationalRequest", id);
      await approvalNotifications(db, ctx, r, Math.min(...policy.rules.map(a => a.stageIndex)));
    });
  }
  async function decide(userId: string, raw: unknown) {
    const data = input.decisionInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const approval = await db.siaApproval.findUniqueOrThrow({ where: { id: data.approvalId }, include: { request: { include: { controlPoint: true } } } });
      const r = approval.request;
      if (!r || approval.approverUserId !== userId) throw new AccessError("Approval is not assigned to this actor");
      await boundResource(db, ctx, r, "approval.decide");
      await requestRecipient(db, r, userId, approval.requiredPermission, r.controlPoint.allowSelfApproval);
      const identity = JSON.parse(approval.metadata ?? "{}");
      if (identity.approverPersonId && identity.approverPersonId !== ctx.user!.personId) throw new AccessError("Approval is assigned to a different human identity");
      await ctx.requireAccess(r.controlPoint.requiredPermission, r);
      if (r.controlPoint.status !== "ACTIVE" || approval.status !== "PENDING" || r.status !== "SUBMITTED" || r.expiresAt && r.expiresAt <= new Date()) throw new AccessError("Approval is not pending or has expired");
      if (r.workflowInstanceId && (await db.workflowInstance.findUniqueOrThrow({ where: { id: r.workflowInstanceId } })).version !== r.instanceVersion) throw new AccessError("Approval no longer matches workflow state");
      const earlier = await db.siaApproval.count({ where: { requestId: r.id, stageIndex: { lt: approval.stageIndex }, status: { not: "APPROVED" } } });
      if (earlier) throw new AccessError("Earlier approval stages must complete first");
      const changed = await db.siaApproval.updateMany({ where: { id: approval.id, status: "PENDING" }, data: { status: data.decision, comment: data.comment, decidedAt: new Date(), decidedByUserId: userId } });
      if (changed.count !== 1) throw new AccessError("Approval decision was already recorded");
      await expireApprovalAlerts(db, ctx, r, [approval.id]);
      await event(db, ctx, r, "approval." + data.decision.toLowerCase(), "SiaApproval", approval.id);
      if (r.type === "SIA_PROPOSAL") await event(db, ctx, r, "sia.action_" + data.decision.toLowerCase(), "OperationalRequest", r.id);
      const pending = await boundedRead(take => db.siaApproval.findMany({ take, where: { requestId: r.id, status: "PENDING" }, orderBy: { stageIndex: "asc" } }));
      if (data.decision === "REJECTED" || !pending.length) {
        await db.operationalRequest.update({ where: { id: r.id }, data: { status: data.decision, decidedAt: new Date() } });
        if (data.decision === "REJECTED") await db.siaApproval.updateMany({ where: { requestId: r.id, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
        await expireApprovalAlerts(db, ctx, r);
        await notify(db, userId, r.requesterUserId, r, "APPROVAL_COMPLETED", "Approval " + data.decision.toLowerCase(), r.title, "request-decision:" + r.id, "NORMAL", r.expiresAt);
      } else if (!pending.some(a => a.stageIndex === approval.stageIndex)) await approvalNotifications(db, ctx, r, pending[0].stageIndex);
      return { status: data.decision, executionEnabled: false };
    });
  }
  async function cancelRequest(userId: string, id: string) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const r = await db.operationalRequest.findUniqueOrThrow({ where: { id } });
      await boundResource(db, ctx, r, "request.manage");
      if (!["DRAFT", "SUBMITTED"].includes(r.status)) throw new AccessError("Request is already decided");
      await db.operationalRequest.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date() } });
      await db.siaApproval.updateMany({ where: { requestId: id, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
      await expireApprovalAlerts(db, ctx, r);
      await event(db, ctx, r, "request.cancelled", "OperationalRequest", id);
    });
  }
  async function siaBoundary(userId: string, id: string, transaction?: DB) {
    const run = async (db: DB) => {
      const ctx = await context(db, userId); const r = await db.operationalRequest.findUniqueOrThrow({ where: { id } });
      await boundResource(db, ctx, r, "request.read");
      if (r.type !== "SIA_PROPOSAL" || !r.siaId || !r.toolKey) throw new AccessError("Not a SIA proposal");
      const access = await inspectSiaToolAccess(r.siaId, r.toolKey, r.organizationId, db);
      const approvals = await boundedRead(take => db.siaApproval.findMany({ take, where: { requestId: id } }));
      let humanApprovalValid = await approvedAuthority(db, r.id);
      for (const a of approvals) {
        if (a.status !== "APPROVED" || !a.decidedByUserId || a.decidedByUserId !== a.approverUserId) { humanApprovalValid = false; break; }
        try { await requestRecipient(db, r, a.decidedByUserId, a.requiredPermission, false); } catch (e) { if (!(e instanceof AccessError)) throw e; humanApprovalValid = false; }
      }
      return { ...access, toolApprovalRequired: access.approvalRequired, approvalRequired: true, humanApprovalValid, proposedAction: r.toolKey, verificationStatus: "NOT_RUN", executionEnabled: false, reason: "Phase 05 permits preparation and human decisions only; no tool executor is installed" };
    };
    return transaction ? run(transaction) : client.$transaction(run);
  }
  async function registerEvent(userId: string, raw: unknown) {
    const parsed = input.eventInput.parse(raw);
    if (/^(integration|communication|automation|webhook)\./.test(parsed.eventType)) throw new AccessError("Lifecycle events can only be emitted by their domain mutation");
    if (/^(task|project|goal|milestone|workflow|approval|request|notification|reminder|recurrence|escalation|control|sia|person|user|membership|role|permission|responsibility|reporting|program|batch|location|participant|company|organization|executive|attention|decision|kpi|risk|opportunity|organizations|companies|departments|teams|groups|people|users|memberships|roles|permissions|responsibilities|brands|products|relationships|ownership)\./.test(parsed.eventType)) throw new AccessError("Lifecycle events can only be emitted by their domain mutation");
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const scope = await boundResource(db, ctx, parsed, "event.manage");
      const reference = scope.organizationId + ":" + parsed.reference;
      const fingerprint = hash(parsed);
      const previous = await db.operationalEvent.findUnique({ where: { reference } });
      if (previous) { if (previous.actorUserId !== userId || JSON.parse(previous.metadata ?? "{}").fingerprint !== fingerprint) throw new AccessError("Event replay mismatch"); return previous; }
      if (JSON.stringify(parsed.metadata ?? {}).length > 16000) throw new AccessError("Event metadata is too large");
      return operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, ...scope, action: parsed.eventType, entityType: scope.resourceType, entityId: scope.resourceId, reference, correlationId: parsed.correlationId ?? undefined, eventStatus: parsed.status, result: parsed.status === "FAILED" ? "FAILURE" : "SUCCESS", metadata: { fingerprint, origin: "USER_REPORTED", details: (parsed.metadata ?? {}) as Prisma.InputJsonObject } });
    });
  }
  async function preference(userId: string, raw: unknown) {
    const data = input.preferenceInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const row = await db.notificationPreference.upsert({ where: { userId_type_channel: { userId, type: data.type, channel: data.channel } }, create: { ...data, userId }, update: { enabled: data.enabled } });
      await db.auditEvent.create({ data: { actorUserId: userId, actorPersonId: ctx.user!.personId, action: "notification.preference_changed", entityType: "NotificationPreference", entityId: row.id, result: "SUCCESS" } });
      return row;
    });
  }
  async function markRead(userId: string, id: string, read = true) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const n = await db.notification.findUniqueOrThrow({ where: { id } });
      if (n.recipientUserId !== userId || n.expiresAt && n.expiresAt <= new Date()) throw new AccessError("Notification unavailable");
      await boundResource(db, ctx, n, "notification.read");
      await db.notification.update({ where: { id }, data: { readAt: read ? new Date() : null } });
      await event(db, ctx, n, read ? "notification.read" : "notification.unread", "Notification", id);
    });
  }
  async function generateNotification(userId: string, raw: unknown) {
    const data = input.reminderInput.omit({ remindAt: true }).parse(raw);
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const scope = await boundResource(db, ctx, data, "notification.generate");
      return notify(db, userId, data.recipientUserId, scope, "SYSTEM_EVENT", "Operational notice", data.reason, scope.organizationId + ":manual:" + data.reference);
    });
  }
  async function saveReminder(userId: string, raw: unknown, transaction?: DB) {
    const parsed = input.reminderInput.parse(raw);
    const run = async (db: DB) => {
      const ctx = await context(db, userId); const scope = await boundResource(db, ctx, parsed, "reminder.manage");
      await validRecipient(db, parsed.recipientUserId, scope);
      const existing = await db.reminder.findUnique({ where: { organizationId_reference: { organizationId: scope.organizationId, reference: parsed.reference } } });
      if (existing) {
        if (existing.recipientUserId !== parsed.recipientUserId || existing.resourceId !== scope.resourceId || existing.resourceType !== scope.resourceType || existing.remindAt.getTime() !== parsed.remindAt.getTime() || existing.reason !== parsed.reason) throw new AccessError("Reminder replay mismatch");
        return existing;
      }
      const row = await db.reminder.create({ data: { ...scope, recipientUserId: parsed.recipientUserId, remindAt: parsed.remindAt, reason: parsed.reason, reference: parsed.reference } });
      await event(db, ctx, row, "reminder.created", "Reminder", row.id);
      return row;
    };
    return transaction ? run(transaction) : client.$transaction(run);
  }
  async function saveRecurring(userId: string, raw: unknown) {
    const parsed = input.recurrenceInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const scope = await boundResource(db, ctx, parsed, "recurrence.manage");
      if (!["ORGANIZATION", "PROJECT"].includes(scope.resourceType)) throw new AccessError("Recurring work must anchor to an organization or project");
      await ctx.requireAccess(parsed.kind === "TASK" ? "task.manage" : "workflow.transition", scope);
      if (scope.projectId && ["COMPLETED", "CANCELLED", "ARCHIVED"].includes((await db.project.findUniqueOrThrow({ where: { id: scope.projectId } })).status)) throw new AccessError("Closed project cannot accept recurring work");
      if (parsed.definitionId) {
        const d = await db.workflowDefinition.findUniqueOrThrow({ where: { id: parsed.definitionId } });
        await ctx.requireAccess("workflow.read", d);
        if (d.status !== "ACTIVE" || d.organizationId !== scope.organizationId || d.projectId !== scope.projectId) throw new AccessError("Recurrence workflow scope mismatch");
      }
      const { template, ...data } = parsed;
      const row = await db.recurringWork.create({ data: { ...data, ...scope, ownerUserId: userId, nextRunAt: data.startAt, template: template ? JSON.stringify(template) : null } });
      await event(db, ctx, row, "recurrence.created", "RecurringWork", row.id);
      return row;
    });
  }
  async function escalate(userId: string, raw: unknown) {
    const data = input.escalationInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const scope = await boundResource(db, ctx, data, "escalation.manage");
      await validRecipient(db, data.responsibleUserId, scope, "escalation.read");
      const now = new Date();
      let valid = data.trigger === "REQUIRED_ACTION";
      if (data.trigger === "OVERDUE_TASK" && data.resourceType === "TASK") { const t = await db.task.findUniqueOrThrow({ where: { id: data.resourceId } }); valid = !!t.dueDate && t.dueDate < now && !["COMPLETED", "CANCELLED"].includes(t.status); }
      if (data.trigger === "BLOCKED_PROJECT" && data.resourceType === "PROJECT") valid = (await db.project.findUniqueOrThrow({ where: { id: data.resourceId } })).status === "BLOCKED";
      if (data.trigger === "AT_RISK_GOAL" && data.resourceType === "GOAL") valid = (await db.goal.findUniqueOrThrow({ where: { id: data.resourceId } })).status === "AT_RISK";
      if (data.trigger === "PENDING_APPROVAL" && data.resourceType === "APPROVAL") {
        const approval = await db.siaApproval.findUniqueOrThrow({ where: { id: data.resourceId }, include: { request: true } });
        valid = approval.status === "PENDING" && approval.request?.status === "SUBMITTED" && (!approval.request.expiresAt || approval.request.expiresAt > now);
      }
      if (data.trigger === "PENDING_APPROVAL" && data.resourceType === "REQUEST") {
        const request = await db.operationalRequest.findUniqueOrThrow({ where: { id: data.resourceId } });
        valid = request.status === "SUBMITTED" && (!request.expiresAt || request.expiresAt > now) && await db.siaApproval.count({ where: { requestId: request.id, status: "PENDING" } }) > 0;
      }
      if (!valid) throw new AccessError("Escalation trigger is not true for this resource");
      const previous = await db.escalation.findUnique({ where: { organizationId_reference: { organizationId: scope.organizationId, reference: data.reference } } });
      if (previous) {
        if (previous.resourceId !== scope.resourceId || previous.resourceType !== scope.resourceType || previous.level !== data.level || previous.responsibleUserId !== data.responsibleUserId || previous.trigger !== data.trigger || previous.reason !== data.reason) throw new AccessError("Escalation replay mismatch");
        return previous;
      }
      const row = await db.escalation.create({ data: { ...data, ...scope } });
      await event(db, ctx, row, "escalation.triggered", "Escalation", row.id);
      await notify(db, userId, data.responsibleUserId, scope, "ESCALATION", "Action escalated", data.reason, "escalation:" + row.id, "HIGH");
      return row;
    });
  }
  async function changeStatus(userId: string, kind: "reminder" | "recurrence" | "escalation" | "control" | "workflow", id: string, status: string) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const row = kind === "reminder" ? await db.reminder.findUniqueOrThrow({ where: { id } }) : kind === "recurrence" ? await db.recurringWork.findUniqueOrThrow({ where: { id } }) : kind === "escalation" ? await db.escalation.findUniqueOrThrow({ where: { id } }) : kind === "control" ? await db.controlPoint.findUniqueOrThrow({ where: { id } }) : await db.workflowDefinition.findUniqueOrThrow({ where: { id } });
      await ctx.requireAccess(kind + ".manage", row);
      if ("resourceType" in row) await boundResource(db, ctx, row, kind + ".manage");
      const allowed: Record<string, string[]> = { reminder: ["CANCELLED"], recurrence: ["PAUSED", "ACTIVE", "CANCELLED"], escalation: ["RESOLVED"], control: ["ARCHIVED"], workflow: ["ARCHIVED"] };
      if (!allowed[kind].includes(status) || ["CANCELLED", "COMPLETED", "RESOLVED", "ARCHIVED"].includes(row.status)) throw new AccessError("Invalid state transition");
      if (kind === "reminder") await db.reminder.update({ where: { id }, data: { status } });
      else if (kind === "recurrence") await db.recurringWork.update({ where: { id }, data: { status, failureCode: null } });
      else if (kind === "escalation") await db.escalation.update({ where: { id }, data: { status, resolvedAt: new Date() } });
      else if (kind === "control") await db.controlPoint.update({ where: { id }, data: { status } });
      else await db.workflowDefinition.update({ where: { id }, data: { status } });
      await event(db, ctx, row, kind + "." + status.toLowerCase(), kind, id);
    });
  }
  async function processDue(userId: string, limit = 25) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AccessError("Processing batch must be between 1 and 100");
    const ctx = await context(client, userId); const now = new Date();
    if (!ctx.organizationIds("operations.process").length && !ctx.grants.some(g => g.key === "operations.process" && g.projectId)) throw new AccessError("Access denied");
    const scopes = { OR: [{ organizationId: { in: ctx.organizationIds("operations.process") } }, { projectId: { in: ctx.grants.filter(g => g.key === "operations.process" && g.projectId).map(g => g.projectId!) } }] };
    const reminders = await client.reminder.findMany({ where: { ...scopes, status: "PENDING", remindAt: { lte: now } }, take: limit, orderBy: { remindAt: "asc" } });
    const recurrences = await client.recurringWork.findMany({ where: { ...scopes, status: "ACTIVE", nextRunAt: { lte: now } }, take: Math.max(0, limit - reminders.length), orderBy: { nextRunAt: "asc" } });
    const requests = await client.operationalRequest.findMany({ where: { ...scopes, status: { in: ["DRAFT", "SUBMITTED"] }, expiresAt: { lte: now } }, take: Math.max(0, limit - reminders.length - recurrences.length) });
    let succeeded = 0; const failures: { id: string; code: string }[] = [];
    for (const candidate of [...reminders.map(r => ({ id: r.id, kind: "reminder" as const })), ...recurrences.map(r => ({ id: r.id, kind: "recurrence" as const, scheduledAt: r.nextRunAt, occurrences: r.occurrences })), ...requests.map(r => ({ id: r.id, kind: "request" as const }))]) {
      try {
        const processed = await client.$transaction(async db => {
          const actor = await context(db, userId);
          if (candidate.kind === "reminder") {
            const r = await db.reminder.findUniqueOrThrow({ where: { id: candidate.id } });
            await boundResource(db, actor, r, "operations.process");
            if (r.status !== "PENDING" || r.remindAt > now) return false;
            const claim = await db.reminder.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "PROCESSING" } });
            if (!claim.count) return false;
            await notify(db, userId, r.recipientUserId, r, "REMINDER", "Reminder", r.reason, "reminder:" + r.id);
            await db.reminder.update({ where: { id: r.id }, data: { status: "SUCCEEDED", completedAt: now } });
            await event(db, actor, r, "reminder.completed", "Reminder", r.id);
          } else if (candidate.kind === "recurrence") {
            const r = await db.recurringWork.findUniqueOrThrow({ where: { id: candidate.id } });
            await boundResource(db, actor, r, "operations.process");
            if (r.status !== "ACTIVE" || r.nextRunAt > now || r.nextRunAt.getTime() !== candidate.scheduledAt.getTime() || r.occurrences !== candidate.occurrences) return false;
            if (r.until && r.nextRunAt > r.until || r.occurrences >= r.maxOccurrences) { await db.recurringWork.update({ where: { id: r.id }, data: { status: "COMPLETED" } }); await event(db, actor, r, "recurrence.completed", "RecurringWork", r.id); return true; }
            const owner = await context(db, r.ownerUserId);
            await boundResource(db, owner, r, "recurrence.manage");
            const occurrence = await db.recurringOccurrence.findUnique({ where: { recurringWorkId_scheduledAt: { recurringWorkId: r.id, scheduledAt: r.nextRunAt } } });
            if (occurrence?.status === "SUCCEEDED") return false;
            const claim = await db.recurringWork.updateMany({ where: { id: r.id, status: "ACTIVE", occurrences: r.occurrences }, data: { status: "PROCESSING" } });
            if (!claim.count) return false;
            const result = r.kind === "TASK"
              ? await createExecutionService(client, createAccessContext).save(r.ownerUserId, "tasks", { ...JSON.parse(r.template!), organizationId: r.organizationId, projectId: r.projectId, status: "TODO", metadata: { recurrenceId: r.id, scheduledAt: r.nextRunAt.toISOString() } }, undefined, db)
              : await startInTransaction(db, owner, { ...r, title: r.title, definitionId: r.definitionId, idempotencyKey: "recurrence:" + r.id + ":" + r.nextRunAt.toISOString() });
            await db.recurringOccurrence.upsert({ where: { recurringWorkId_scheduledAt: { recurringWorkId: r.id, scheduledAt: r.nextRunAt } }, create: { recurringWorkId: r.id, scheduledAt: r.nextRunAt, status: "SUCCEEDED", resultResourceId: result.id }, update: { status: "SUCCEEDED", resultResourceId: result.id } });
            const next = recurrenceDate(r.startAt, r.frequency, r.interval, r.occurrences + 1);
            await db.recurringWork.update({ where: { id: r.id }, data: { occurrences: { increment: 1 }, nextRunAt: next, status: r.occurrences + 1 >= r.maxOccurrences || r.until && next > r.until ? "COMPLETED" : "ACTIVE" } });
            await event(db, actor, r, "recurrence.generated", "RecurringWork", r.id, { resultResourceId: result.id, scheduledAt: r.nextRunAt.toISOString() });
          } else {
            const r = await db.operationalRequest.findUniqueOrThrow({ where: { id: candidate.id } });
            await boundResource(db, actor, r, "operations.process");
            if (!["DRAFT", "SUBMITTED"].includes(r.status) || !r.expiresAt || r.expiresAt > now) return false;
            await db.operationalRequest.update({ where: { id: r.id }, data: { status: "EXPIRED", decidedAt: now } });
            await db.siaApproval.updateMany({ where: { requestId: r.id, status: "PENDING" }, data: { status: "EXPIRED", decidedAt: now } });
            await expireApprovalAlerts(db, actor, r);
            await event(db, actor, r, "request.expired", "OperationalRequest", r.id);
          }
          return true;
        });
        if (processed) succeeded++;
      } catch {
        failures.push({ id: candidate.id, code: "PROCESSING_FAILED" });
        // Persist safe failure state separately after the failed item transaction rolls back.
        await client.$transaction(async db => {
          const actor = await context(db, userId);
          if (candidate.kind === "request") throw new AccessError("Request expiry could not be recorded");
          const row = candidate.kind === "reminder" ? await db.reminder.findUniqueOrThrow({ where: { id: candidate.id } }) : await db.recurringWork.findUniqueOrThrow({ where: { id: candidate.id } });
          await boundResource(db, actor, row, "operations.process");
          if (candidate.kind === "reminder") { if (row.status !== "PENDING") return; await db.reminder.update({ where: { id: row.id }, data: { status: "FAILED", failureCode: "PROCESSING_FAILED" } }); }
          else {
            if (candidate.kind !== "recurrence" || !("nextRunAt" in row) || row.status !== "ACTIVE" || row.nextRunAt.getTime() !== candidate.scheduledAt.getTime() || row.occurrences !== candidate.occurrences) return;
            await db.recurringWork.update({ where: { id: row.id }, data: { status: "FAILED", failureCode: "PROCESSING_FAILED" } });
          }
          await event(db, actor, row, candidate.kind + ".failed", candidate.kind, row.id, { code: "PROCESSING_FAILED" }, "FAILURE");
        });
      }
    }
    return { succeeded, failures, considered: reminders.length + recurrences.length + requests.length };
  }
  async function list(userId: string, kind: input.OperationsKind, query: OperationsQuery = {}) {
    if (kind === "my-tasks") {
      const ctx = await context(client, userId);
      return createExecutionService(client, createAccessContext).list(userId, "tasks", { ...query, assigneePersonId: ctx.user!.personId! });
    }
    return client.$transaction(async db => {
      const ctx = await context(db, userId); const key = keys[kind];
      if (query.organizationId) await ctx.requireAccess(key, { organizationId: query.organizationId, projectId: query.projectId });
      if (query.projectId) { const p = await db.project.findUniqueOrThrow({ where: { id: query.projectId } }); await ctx.requireAccess(key, { organizationId: p.organizationId, projectId: p.id }); }
      const from = query.from ? input.reminderInput.shape.remindAt.parse(query.from) : undefined;
      const until = query.until ? input.reminderInput.shape.remindAt.parse(query.until) : undefined;
      if (until && /^\d{4}-\d{2}-\d{2}$/.test(query.until!)) { until.setUTCDate(until.getUTCDate() + 1); until.setUTCMilliseconds(-1); }
      if (from && until && from > until) throw new AccessError("Invalid date filter");
      const dates = { ...(from || until ? { createdAt: { gte: from, lte: until } } : {}) };
      const scope = { OR: [{ organizationId: { in: ctx.organizationIds(key) } }, { projectId: { in: ctx.grants.filter(g => g.key === key && g.projectId).map(g => g.projectId!) } }], ...(query.organizationId ? { organizationId: query.organizationId } : {}), ...(query.projectId ? { projectId: query.projectId } : {}) };
      const search = query.search?.trim().slice(0, 200) ?? "";
      const exact = query.recordId ? { id: z.string().min(1).max(200).parse(query.recordId) } : {};
      const status = { ...exact, ...(query.status ? { status: query.status.slice(0, 64) } : {}) };
      let rows: Record<string, unknown>[];
      switch (kind) {
        case "workflows": return boundedRead(take => db.workflowDefinition.findMany({ take, where: { ...scope, ...status, name: { contains: search } }, include: { states: true, transitions: { include: { fromState: true, toState: true } } }, orderBy: { createdAt: "desc" } }));
        case "controls": return boundedRead(take => db.controlPoint.findMany({ take, where: { ...scope, ...status, name: { contains: search } }, include: { rules: true } }));
        case "preferences": return boundedRead(take => db.notificationPreference.findMany({ take, where: { userId }, orderBy: { type: "asc" } }));
        case "requests": case "sia": {
          const requests = await boundedRead(take => db.operationalRequest.findMany({ take, where: { ...scope, ...status, ...dates, title: { contains: search }, ...(kind === "sia" ? { type: "SIA_PROPOSAL" } : {}), ...(query.requesterUserId ? { requesterUserId: query.requesterUserId } : {}) }, select: { id: true, organizationId: true, projectId: true, resourceType: true, resourceId: true, title: true, description: true, requesterUserId: true, status: true, type: true, controlPointId: true, workflowInstanceId: true, instanceVersion: true, expiresAt: true, createdAt: true, toolKey: true } }));
          const approvals = groupRows(await boundedRead(take => db.siaApproval.findMany({ take, where: { requestId: { in: requests.map(r => r.id) } }, select: { requestId: true, id: true, stageIndex: true, approverUserId: true, status: true, comment: true, decidedAt: true }, orderBy: { id: "asc" } })), a => a.requestId!);
          rows = requests.map(r => ({ ...r, approvals: (approvals.get(r.id) ?? []).map(({ requestId: _parent, ...a }) => { void _parent; return a; }) })); break;
        }
        case "approvals": rows = (await boundedRead(take => db.siaApproval.findMany({ take, where: { ...status, ...dates, approverUserId: query.approverUserId ?? userId, request: { ...scope, ...(query.requesterUserId ? { requesterUserId: query.requesterUserId } : {}) } }, select: { id: true, status: true, stageIndex: true, approverUserId: true, comment: true, decidedAt: true, createdAt: true, request: { select: { id: true, title: true, status: true, requesterUserId: true, organizationId: true, projectId: true, resourceType: true, resourceId: true, expiresAt: true } } } }))).map(a => ({ ...a, ...a.request, id: a.id, status: a.status, requestId: a.request!.id })); break;
        case "instances": {
          const instances = await boundedRead(take => db.workflowInstance.findMany({ take, where: { ...scope, ...status, title: { contains: search } }, include: { currentState: true, definition: true } }));
          const transitions = groupRows(await boundedRead(take => db.workflowTransition.findMany({ take, where: { definitionId: { in: [...new Set(instances.map(r => r.definitionId))] } }, include: { fromState: true, toState: true }, orderBy: { id: "asc" } })), t => t.definitionId);
          const history = groupRows(await boundedRead(take => db.workflowHistory.findMany({ take, where: { instanceId: { in: instances.map(r => r.id) } }, select: { instanceId: true, id: true, fromState: true, toState: true, actorUserId: true, reason: true, createdAt: true } })), row => row.instanceId);
          rows = instances.map(row => ({ ...row, definition: { ...row.definition, transitions: transitions.get(row.definitionId) ?? [] }, history: (history.get(row.id) ?? []).map(({ instanceId: _parent, ...entry }) => { void _parent; return entry; }) })); break;
        }
        case "notifications": rows = await boundedRead(take => db.notification.findMany({ take, where: { ...scope, ...dates, recipientUserId: userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], AND: [scope], title: { contains: search }, ...(query.read === "unread" ? { readAt: null } : query.read === "read" ? { readAt: { not: null } } : {}), ...(query.type ? { type: query.type } : {}), ...(query.priority ? { priority: query.priority } : {}) }, orderBy: { createdAt: "desc" } })); break;
        case "reminders": rows = await boundedRead(take => db.reminder.findMany({ take, where: { ...scope, ...status, reason: { contains: search } } })); break;
        case "recurring": {
          const recurring = await boundedRead(take => db.recurringWork.findMany({ take, where: { ...scope, ...status, title: { contains: search } } }));
          const runs = groupRows(await boundedRead(take => db.recurringOccurrence.findMany({ take, where: { recurringWorkId: { in: recurring.map(r => r.id) } } })), row => row.recurringWorkId);
          rows = recurring.map(row => ({ ...row, runs: runs.get(row.id) ?? [] })); break;
        }
        case "escalations": rows = await boundedRead(take => db.escalation.findMany({ take, where: { ...scope, ...status, reason: { contains: search } } })); break;
        case "events": return (await boundedRead(take => db.operationalEvent.findMany({ where: { ...scope, ...status, ...dates, eventType: { contains: query.type ?? search }, ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}), ...(query.entityId ? { entityId: query.entityId } : {}) }, select: { id: true, eventType: true, actorUserId: true, organizationId: true, projectId: true, entityType: true, entityId: true, status: true, correlationId: true, reference: true, createdAt: true, metadata: true }, orderBy: { createdAt: "desc" }, take }))).map(({ metadata, ...row }) => ({ ...row, origin: JSON.parse(metadata ?? "{}").origin === "USER_REPORTED" ? "USER_REPORTED" : "DOMAIN_MUTATION" }));
        case "activity": {
          const candidates = await boundedRead(take => db.auditEvent.findMany({ where: { organizationId: { in: [...ctx.organizationIds(key), ...ctx.grants.filter(g => g.key === key && g.projectId).map(g => g.organizationId!)] }, ...dates, action: { contains: search }, ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}), ...(query.entityId ? { entityId: query.entityId } : {}) }, orderBy: { createdAt: "desc" }, take }));
          const linkedEvents = await boundedRead(take => db.operationalEvent.findMany({ take, where: { auditId: { in: candidates.map(a => a.id) } }, select: { auditId: true, projectId: true } }));
          const eventProjects = new Map(linkedEvents.map(e => [e.auditId, e.projectId]));
          const visible = [];
          for (const a of candidates) {
            const metadata = a.metadata ? JSON.parse(a.metadata) : {};
            const projectId = eventProjects.get(a.id) ?? (typeof metadata.projectId === "string" ? metadata.projectId : null);
            if (query.organizationId && a.organizationId !== query.organizationId || query.projectId && projectId !== query.projectId) continue;
            if (a.organizationId && (await ctx.decide(key, { organizationId: a.organizationId, projectId })).allowed) visible.push({ id: a.id, actorUserId: a.actorUserId, organizationId: a.organizationId, projectId, title: a.action.replaceAll(".", " ").replaceAll("_", " "), entityType: a.entityType, entityId: a.entityId, status: a.result, createdAt: a.createdAt });
          }
          return visible;
        }
      }
      const visible = [];
      for (const row of rows) {
        try {
          await boundResource(db, ctx, row as Resource, key);
          if (kind === "approvals") {
            const request = await db.operationalRequest.findUniqueOrThrow({ where: { id: String(row.requestId) }, include: { controlPoint: true, workflowInstance: true } });
            if (search && !request.title.toLowerCase().includes(search.toLowerCase()) && !request.description?.toLowerCase().includes(search.toLowerCase())) continue;
            row.description = request.description;
            row.requestType = request.type;
            row.actionable = row.status === "PENDING" && request.status === "SUBMITTED" && request.controlPoint.status === "ACTIVE" && (!request.expiresAt || request.expiresAt > new Date()) && (!request.workflowInstance || request.workflowInstance.status === "PENDING" && request.workflowInstance.version === request.instanceVersion) && await db.siaApproval.count({ where: { requestId: request.id, stageIndex: { lt: Number(row.stageIndex) }, status: { not: "APPROVED" } } }) === 0;
            if (row.actionable) {
              const assigned = await db.siaApproval.findUniqueOrThrow({ where: { id: String(row.id) } });
              try {
                const approver = await requestRecipient(db, request, assigned.approverUserId!, assigned.requiredPermission, request.controlPoint.allowSelfApproval);
                const expectedPersonId = JSON.parse(assigned.metadata ?? "{}").approverPersonId;
                if (expectedPersonId && expectedPersonId !== approver.user!.personId) row.actionable = false;
                await approver.requireAccess(request.controlPoint.requiredPermission, request);
              } catch (e) { if (!(e instanceof AccessError)) throw e; row.actionable = false; }
            }
          }
          if (["approvals", "requests", "sia"].includes(kind)) {
            const communication = await db.communicationMessage.findUnique({ where: { requestId: String(kind === "approvals" ? row.requestId : row.id) }, select: { id: true, organizationId: true, projectId: true, sender: true, recipient: true, channel: true, subject: true, content: true, purpose: true } });
            if (communication && (await ctx.decide("communication.read", communication)).allowed && (await ctx.decide("person.read", communication)).allowed) row.communicationPreview = communication;
          }
          if (kind === "approvals") row.nextStep = row.status !== "PENDING" ? "Decision recorded. Review the history below." : row.expiresAt && new Date(String(row.expiresAt)) <= new Date() ? "Request expired. The requester must prepare a new request." : row.actionable ? row.approverUserId === userId ? "Review the evidence, record a reason and approve or reject." : "Waiting for the assigned approver." : "Waiting for an earlier stage or current policy authority. No decision is permitted yet.";
          visible.push(row);
        } catch (e) { if (!(e instanceof AccessError)) throw e; }
      }
      return visible;
    });
  }
  async function overview(userId: string) {
    const approvals = await list(userId, "approvals", { status: "PENDING" });
    const ctx = await context(client, userId);
    const failedEvents = await client.operationalEvent.count({ where: { status: "FAILED", OR: [{ organizationId: { in: ctx.organizationIds("event.read") } }, { projectId: { in: ctx.grants.filter(g => g.key === "event.read" && g.projectId).map(g => g.projectId!) } }] } });
    const escalations = await list(userId, "escalations", { status: "OPEN" });
    const notifications = (await list(userId, "notifications", { read: "unread" })).filter(n => "priority" in n && ["HIGH", "CRITICAL"].includes(String(n.priority)));
    const execution = await createExecutionService(client, createAccessContext).overview(userId);
    return { pendingApprovals: approvals.filter(a => "request" in a && a.request && (a.request as { status: string; expiresAt: Date | null }).status === "SUBMITTED" && (!(a.request as { expiresAt: Date | null }).expiresAt || (a.request as { expiresAt: Date }).expiresAt > new Date())).length, overdueTasks: execution.metrics.overdueTasks, blockedProjects: execution.metrics.blockedProjects, unresolvedEscalations: escalations.length, importantNotifications: notifications.length, failedEvents };
  }
  async function workspace(userId: string) {
    const execution = await createExecutionService(client, createAccessContext).workspace(userId);
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const all = ["workflow.manage", "workflow.transition", "request.manage", "approval.decide", "notification.generate", "reminder.manage", "recurrence.manage", "escalation.manage", "control.manage", "control.evaluate", "event.manage", "operations.process", "sia.propose"];
      const scopes = Object.fromEntries(all.map(k => [k, { organizations: ctx.organizationIds(k), projects: ctx.grants.filter(g => g.key === k && g.projectId).map(g => g.projectId!) }]));
      const users = await boundedRead(take => db.user.findMany({ take, where: { status: "ACTIVE", personId: { in: execution.people.map(p => p.id) } }, select: { id: true, person: { select: { displayName: true } } } }));
      const scoped = (key: string) => ({ OR: [{ organizationId: { in: ctx.organizationIds(key) } }, { projectId: { in: ctx.grants.filter(g => g.key === key && g.projectId).map(g => g.projectId!) } }] });
      const policies = await boundedRead(take => db.controlPoint.findMany({ take, where: { status: "ACTIVE", ...scoped("control.read") }, select: { id: true, name: true, kind: true, organizationId: true, projectId: true } }));
      const definitions = await boundedRead(take => db.workflowDefinition.findMany({ take, where: { status: "ACTIVE", ...scoped("workflow.read") }, select: { id: true, name: true, organizationId: true, projectId: true } }));
      const permissions = await boundedRead(take => db.permission.findMany({ take, where: { key: { in: [...new Set(ctx.grants.map(g => g.key))] } }, select: { key: true } }));
      const identities = ctx.organizationIds("sia.access.read").length ? await boundedRead(take => db.siaIdentity.findMany({ take, where: { status: "ACTIVE" }, select: { id: true, name: true } })) : [];
      const programs = await boundedRead(take => db.program.findMany({ take, where: { organizationId: { in: ctx.organizationIds("program.read") } }, select: { id: true, name: true, organizationId: true } }));
      const batches = await boundedRead(take => db.batch.findMany({ take, where: { program: { organizationId: { in: ctx.organizationIds("batch.read") } } }, select: { id: true, name: true, program: { select: { organizationId: true } } } }));
      const locations = await boundedRead(take => db.location.findMany({ take, where: { organizationId: { in: ctx.organizationIds("location.read") } }, select: { id: true, name: true, organizationId: true } }));
      const companyTargets = [...programs.map(p => ({ ...p, projectId: null, resourceType: "PROGRAM" })), ...batches.map(b => ({ id: b.id, name: b.name, organizationId: b.program.organizationId, projectId: null, resourceType: "BATCH" })), ...locations.map(l => ({ ...l, projectId: null, resourceType: "LOCATION" }))];
      return { ...execution, scopes, users: users.map(u => ({ id: u.id, name: u.person!.displayName })), policies, definitions, permissions: permissions.map(p => ({ id: p.key, name: p.key })), identities, userId, companyTargets };
    });
  }
  async function requireApprovedRequest(userId: string, id: string, transaction: DB) {
    const ctx = await context(transaction, userId);
    const request = await transaction.operationalRequest.findUniqueOrThrow({ where: { id }, include: { controlPoint: true } });
    await boundResource(transaction, ctx, request, "request.read");
    if (request.requesterUserId !== userId || request.controlPoint.allowSelfApproval || !await approvedAuthority(transaction, id)) throw new AccessError("Current independent human approval required");
    return request;
  }
  async function inboxDetails(userId: string, page: { records: (Record<string, unknown> & { id: string })[]; nextCursor: string | null }) {
    if (!page.records.length) return page;
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const requests = await boundedRead(take => db.operationalRequest.findMany({ take, where: { id: { in: page.records.map(r => String(r.requestId)) } }, include: { controlPoint: true, workflowInstance: true } }));
      const visible: typeof requests = [];
      for (const request of requests) {
        try { await boundResource(db, ctx, request, "approval.read"); visible.push(request); }
        catch (error) { if (!(error instanceof AccessError)) throw error; }
      }
      // Expand history only for the authorized visible page, never executive counters.
      const history = groupRows(await boundedRead(take => db.siaApproval.findMany({ take, where: { requestId: { in: visible.map(r => r.id) } }, select: { requestId: true, id: true, stageIndex: true, approverUserId: true, status: true, comment: true, decidedAt: true }, orderBy: [{ stageIndex: "asc" }, { id: "asc" }] })), r => r.requestId!);
      const records: typeof page.records = [];
      for (const row of page.records) {
        const request = visible.find(r => r.id === row.requestId);
        if (!request) continue;
        records.push({ ...row, workflowInstanceId: request.workflowInstanceId, instanceVersion: request.instanceVersion,
          canOpenRequest: (await ctx.decide("request.read", request)).allowed,
          canOpenWorkflow: !!request.workflowInstance && (await ctx.decide("workflow.read", request.workflowInstance)).allowed,
          policyName: (await ctx.decide("control.read", request.controlPoint)).allowed ? request.controlPoint.name : "Policy details not authorized",
          approvals: (history.get(request.id) ?? []).map(({ requestId: _parent, ...entry }) => { void _parent; return entry; }) });
      }
      return { ...page, records };
    });
  }
  async function listPage(userId: string, kind: input.OperationsKind, query: OperationsQuery & { recordId?: string } = {}, page: PageInput = {}) {
    const recordId = query.recordId ? z.string().min(1).max(200).parse(query.recordId) : undefined;
    if (kind === "my-tasks") {
      const ctx = await context(client, userId);
      return createExecutionService(client, createAccessContext).listPage(userId, "tasks", { ...query, assigneePersonId: ctx.user!.personId! }, page);
    }
    const rows = await list(userId, kind, query) as (Record<string, unknown> & { id: string })[];
    const sort = (query as OperationsQuery & { sort?: string }).sort;
    const result = sort && sort !== "reference" && !recordId ? sortedResultPage(rows, sort, page) : resultPage(rows.filter(r => !recordId || r.id === recordId), recordId ? {} : page);
    return kind === "approvals" ? inboxDetails(userId, result) : result;
  }
  return { listPage, requireApprovedRequest, saveControl, saveWorkflow, publishWorkflow, startWorkflow, transition, checkControl, createRequest, updateRequest, submitRequest, decide, cancelRequest, siaBoundary, registerEvent, preference, markRead, generateNotification, saveReminder, saveRecurring, escalate, changeStatus, processDue, list, overview, workspace };
}
export const operationsService = createOperationsService();
