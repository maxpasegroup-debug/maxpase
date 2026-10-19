import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { createOperationsService } from "@/server/domain/operations-service";
import { resolveResource, type DB } from "@/server/domain/operations-scope";
import { notify, operationalEvent } from "@/server/domain/operational-events";
import { createEmployeeService, localDay, dayBounds } from "./employee";
import { candidate, leadCommand, leadQuery, schedule } from "./lead-input";
import { leadSummarySelect, followupState } from "./lead-sources";
import { NiceJobsError } from "./input";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const include = { division: { select: { name: true } }, policy: { include: { definition: true, eligibility: true } }, workflowInstance: { include: { currentState: true } }, currentWorkerAssignment: { include: { profile: { include: { person: { select: { displayName: true } } } } } } } satisfies Prisma.NiceJobsLeadInclude;
type Lead = Prisma.NiceJobsLeadGetPayload<{ include: typeof include }>;
export class LeadDuplicateError extends NiceJobsError {
  constructor(public matches: { id: string; name: string }[], public token: string) { super("A matching contact exists. Review before creating a separate lead."); }
}
export function createLeadService(client: PrismaClient = prisma, now: () => Date = () => new Date()) {
  const employee = createEmployeeService(client, now).internal;
  type Boundary = Awaited<ReturnType<typeof employee.boundary>>;
  async function policy(db: DB, b: Boundary, id: string) {
    const p = await db.niceJobsLeadPolicy.findUnique({ where: { id }, include: { definition: { include: { states: true } }, eligibility: true, division: true } });
    if (!p || p.companyId !== b.company.id || p.division.parentId !== b.company.id || p.division.status !== "ACTIVE" || p.definition.organizationId !== p.divisionId || p.definition.projectId || p.status !== "ACTIVE" || p.definition.status !== "ACTIVE") throw new AccessError("Lead policy unavailable");
    return p;
  }
  async function eligible(db: DB, b: Boundary, p: { divisionId: string; eligibility: { versionId: string }[] }, id: string) {
    const a = await db.niceJobsAssignment.findUnique({ where: { id }, include: employee.assignmentInclude });
    if (!a || a.divisionId !== p.divisionId || !p.eligibility.some(e => e.versionId === a.versionId)) throw new AccessError("Worker is not eligible for this policy");
    await employee.active(db, b, a);
    return a;
  }
  async function load(db: DB, b: Boundary, id: string, write = false) {
    const l = await db.niceJobsLead.findUnique({ where: { id }, include });
    if (!l || l.companyId !== b.company.id || !l.workflowInstance || l.workflowInstance.resourceType !== "NICE_JOBS_LEAD" || l.workflowInstance.resourceId !== l.id || l.workflowInstance.definitionId !== l.policy.definitionId || l.workflowInstance.organizationId !== l.divisionId) throw new AccessError("Lead unavailable");
    await resolveResource(db, b.ctx, "NICE_JOBS_LEAD", id);
    const own = l.currentWorkerAssignment?.profile.personId === b.personId;
    if (own) { const a = await employee.own(db, b); if (a.id !== l.currentWorkerAssignmentId) throw new AccessError("Lead owner changed"); await eligible(db, b, l.policy, a.id); }
    if (write) {
      await policy(db, b, l.policyId);
      await b.ctx.requireAccess(own ? "nicejobs.lead.perform" : "nicejobs.lead.manage", { organizationId: l.divisionId });
      if (l.workflowInstance.currentState.terminal) throw new NiceJobsError("This lead is closed");
    }
    return { l, own };
  }
  async function duplicates(db: DB, b: Boundary, p: { divisionId: string }, c: ReturnType<typeof candidate.parse>) {
    return db.niceJobsLead.findMany({ where: { companyId: b.company.id, divisionId: p.divisionId, OR: [{ phone: c.phone }, ...(c.email ? [{ email: c.email }] : [])] }, select: { id: true, name: true, revision: true }, orderBy: { id: "asc" }, take: 26 });
  }
  function review(b: Boundary, c: ReturnType<typeof candidate.parse>, matches: unknown, timestamp: string) {
    const { duplicateDecision: _decision, ...data } = c; void _decision;
    return createHmac("sha256", config.AUTH_SECRET).update(JSON.stringify({ boundary: "nicejobs-lead-duplicate-v1", actor: b.userId, person: b.personId, data, matches, timestamp })).digest("hex");
  }
  async function event(db: DB, b: Boundary, l: Pick<Lead, "id" | "divisionId" | "currentWorkerAssignmentId">, kind: string, reference: string, metadata: Prisma.InputJsonObject, visibility = "WORKER") {
    const e = await operationalEvent(db, { actorUserId: b.userId, actorPersonId: b.personId, organizationId: l.divisionId, action: "nicejobs.lead." + kind.toLowerCase(), entityType: "NiceJobsLead", entityId: l.id, result: "SUCCESS", reference, metadata });
    const owner = l.currentWorkerAssignmentId && await db.niceJobsAssignment.findUnique({ where: { id: l.currentWorkerAssignmentId }, select: { profile: { select: { personId: true } } } });
    await db.niceJobsLeadActivity.create({ data: { leadId: l.id, eventId: e.id, kind, visibility, workerAssignmentId: owner && owner.profile.personId === b.personId ? l.currentWorkerAssignmentId : null, createdAt: now() } });
    return e;
  }
  async function notice(db: DB, b: Boundary, l: Lead, title: string, reference: string, personId?: string | null) {
    const recipient = personId ?? l.currentWorkerAssignment?.profile.personId;
    if (!recipient) return;
    const accounts = await db.user.findMany({ where: { personId: recipient, status: "ACTIVE" }, select: { id: true }, take: 26 });
    if (accounts.length > 25) throw new NiceJobsError("Notification recipient limit exceeded");
    for (const u of accounts) {
      const ctx = await createAccessContext(u.id, db, undefined, { organizationId: b.company.id });
      if (!(await ctx.decide("notification.read", { organizationId: l.divisionId })).allowed) continue;
      try { await resolveResource(db, ctx, "NICE_JOBS_LEAD", l.id); } catch (e) { if (e instanceof AccessError) continue; throw e; }
      await notify(db, b.userId, u.id, { organizationId: l.divisionId, resourceType: "NICE_JOBS_LEAD", resourceId: l.id }, "NICE_JOBS_LEAD", title, l.name, reference + ":" + u.id);
    }
  }
  async function cancelAll(db: DB, b: Boundary, l: Lead, reference: string, reason: string) {
    const rows = await db.niceJobsLeadFollowup.findMany({ where: { leadId: l.id, status: "SCHEDULED" }, select: { id: true }, orderBy: { id: "asc" }, take: 101 });
    if (rows.length > 100) throw new NiceJobsError("Too many scheduled follow-ups; cancel them in bounded batches first");
    for (const f of rows) { await db.niceJobsLeadFollowup.update({ where: { id: f.id }, data: { status: "CANCELLED", revision: { increment: 1 } } }); await event(db, b, l, "CANCEL", reference + ":cancel:" + f.id, { followupId: f.id, reason }); }
  }
  async function assign(db: DB, b: Boundary, l: Lead, workerId: string | null, reason: string, reference: string, claim = false) {
    if (workerId === l.currentWorkerAssignmentId) throw new NiceJobsError("This worker already owns the lead");
    if (!claim) { await b.ctx.requireAccess("nicejobs.lead.assign", { organizationId: l.divisionId }); await b.ctx.requireAccess("nicejobs.workspace.read", { organizationId: l.divisionId }); await b.ctx.requireAccess("person.read", { organizationId: l.divisionId }); }
    const a = workerId ? await eligible(db, b, l.policy, workerId) : null;
    if (!claim && a?.profile.personId === b.personId) throw new AccessError("Self-assignment requires the configured claim boundary");
    if (!workerId && !l.policy.unassignAllowed) throw new AccessError("Unassignment is not configured");
    if (l.currentWorkerAssignmentId) await cancelAll(db, b, l, reference, "Ownership changed: " + reason);
    await db.niceJobsLeadAssignment.updateMany({ where: { leadId: l.id, status: "ACTIVE" }, data: { status: "ENDED", unassignedAt: now() } });
    if (workerId) await db.niceJobsLeadAssignment.create({ data: { leadId: l.id, workerAssignmentId: workerId, assignedByUserId: b.userId, reason, assignedAt: now() } });
    return db.niceJobsLead.update({ where: { id: l.id }, data: { currentWorkerAssignmentId: workerId }, include });
  }
  function workflow(db: DB, b: Boundary, l: Lead) {
    // Only these two workflow capabilities are delegated for this validated lead and transaction.
    return createOperationsService(client, async (user, transaction = db) => {
      if (user !== b.userId || transaction !== db) throw new AccessError("Lead transaction context mismatch");
      return { ...b.ctx, requireAccess: async (key, scope) => ["workflow.read", "workflow.transition"].includes(key) && scope.organizationId === l.divisionId && !scope.projectId ? b.ctx.requireAccess(l.currentWorkerAssignment?.profile.personId === b.personId ? "nicejobs.lead.perform" : "nicejobs.lead.manage", scope) : b.ctx.requireAccess(key, scope) };
    });
  }
  async function scheduleFollowup(db: DB, l: Lead, s: ReturnType<typeof schedule.parse>) {
    if (!l.currentWorkerAssignmentId) throw new NiceJobsError("Assign an eligible worker before scheduling");
    const histories = await db.niceJobsLeadAssignment.findMany({ where: { leadId: l.id, workerAssignmentId: l.currentWorkerAssignmentId, status: "ACTIVE" }, take: 2 });
    if (histories.length !== 1) throw new NiceJobsError("Lead ownership requires reconciliation");
    if (s.scheduledAt <= now()) throw new NiceJobsError("Choose a future follow-up time");
    return db.niceJobsLeadFollowup.create({ data: { scheduledAt: s.scheduledAt, type: s.type, purpose: s.purpose, notes: s.notes, leadId: l.id, workerAssignmentId: l.currentWorkerAssignmentId, assignmentHistoryId: histories[0].id } });
  }
  async function mutate(userId: string, raw: unknown) {
    const c = leadCommand.parse(raw), fingerprint = hash({ userId, c }), reference = `nicejobs-lead:${userId}:${c.idempotencyKey}`;
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId);
      const prior = await db.operationalEvent.findUnique({ where: { reference }, include: { audit: true } });
      const replay = () => { if (prior && (prior.audit?.actorPersonId !== b.personId || JSON.parse(prior.metadata ?? "{}").fingerprint !== fingerprint)) throw new NiceJobsError("Replay mismatch"); return prior; };
      if (c.operation === "POLICY") {
        const scope = { organizationId: c.divisionId }; await b.ctx.requireAccess("nicejobs.lead.policy.manage", scope); await b.ctx.requireAccess("workflow.read", scope); await b.ctx.requireAccess("nicejobs.job.read", scope);
        const division = await db.organization.findFirst({ where: { id: c.divisionId, parentId: b.company.id, type: "DIVISION", status: "ACTIVE" } });
        const definition = await db.workflowDefinition.findFirst({ where: { id: c.definitionId, organizationId: c.divisionId, projectId: null, status: "ACTIVE" }, include: { states: true } });
        if (!division || !definition || c.followupRequiredStates.some(key => !definition.states.some(s => s.key === key && !s.terminal && !s.initial))) throw new NiceJobsError("Choose a published workflow and noninitial, nonterminal follow-up states");
        const versions = await db.niceJobsVersion.findMany({ where: { id: { in: c.versionIds }, publishedAt: { not: null }, template: { companyId: b.company.id, productId: b.product.id }, areas: { some: { divisionId: c.divisionId } } }, select: { id: true }, take: 50 });
        if (versions.length !== new Set(c.versionIds).size) throw new NiceJobsError("Published job eligibility is not configured for this area");
        if (replay()) return { id: prior!.entityId };
        const p = await db.niceJobsLeadPolicy.create({ data: { companyId: b.company.id, divisionId: c.divisionId, name: c.name, definitionId: c.definitionId, allowedSources: JSON.stringify(c.allowedSources), followupRequiredStates: JSON.stringify(c.followupRequiredStates), claimAllowed: c.claimAllowed, unassignAllowed: c.unassignAllowed, createdByUserId: userId, eligibility: { create: versions.map(v => ({ versionId: v.id })) } } });
        await operationalEvent(db, { actorUserId: userId, actorPersonId: b.personId, organizationId: c.divisionId, action: "nicejobs.lead.policy", entityType: "NiceJobsLeadPolicy", entityId: p.id, result: "SUCCESS", reference, metadata: { fingerprint } });
        return { id: p.id };
      }
      if (c.operation === "CREATE") {
        const p = await policy(db, b, c.policyId); await b.ctx.requireAccess("nicejobs.lead.manage", { organizationId: p.divisionId }); await b.ctx.requireAccess("nicejobs.lead.pool.read", { organizationId: p.divisionId });
        if (!(JSON.parse(p.allowedSources) as string[]).includes(c.source)) throw new AccessError("Lead source is not configured");
        if (c.workerAssignmentId) { await b.ctx.requireAccess("nicejobs.lead.assign", { organizationId: p.divisionId }); const a = await eligible(db, b, p, c.workerAssignmentId); if (a.profile.personId === b.personId) throw new AccessError("Use the claim boundary for self-assignment"); }
        if (replay()) { await load(db, b, prior!.entityId); return { id: prior!.entityId }; }
        const { confirmed: _confirmed, idempotencyKey: _key, operation: _operation, ...input } = c; void _confirmed; void _key; void _operation;
        const matches = await duplicates(db, b, p, input);
        if (matches.length > 25) throw new NiceJobsError("Duplicate review exceeds 25 contacts; management reconciliation required");
        if (matches.length) {
          const [stamp, digest = ""] = c.duplicateDecision?.token.split(".") ?? [], age = now().getTime() - Number(stamp);
          const expected = review(b, input, matches, stamp ?? "");
          if (!stamp || age < 0 || age > 600000 || digest.length !== expected.length || !timingSafeEqual(Buffer.from(digest), Buffer.from(expected))) { const timestamp = String(now().getTime()); throw new LeadDuplicateError(matches.map(m => ({ id: m.id, name: m.name })), timestamp + "." + review(b, input, matches, timestamp)); }
        }
        let l = await db.niceJobsLead.create({ data: { companyId: b.company.id, divisionId: p.divisionId, policyId: p.id, name: c.name, phone: c.phone, email: c.email, source: c.source, priority: c.priority, location: c.location, externalReference: c.externalReference }, include });
        const instance = await workflow(db, b, l).startWorkflow(userId, { organizationId: l.divisionId, resourceType: "NICE_JOBS_LEAD", resourceId: l.id, definitionId: p.definitionId, title: c.name, idempotencyKey: c.idempotencyKey }, db);
        l = await db.niceJobsLead.update({ where: { id: l.id }, data: { workflowInstanceId: instance.id }, include });
        if (c.workerAssignmentId) l = await assign(db, b, l, c.workerAssignmentId, "Assigned on creation", reference);
        await event(db, b, l, "CREATE", reference, { fingerprint, ...(c.notes ? { notes: c.notes } : {}), ...(c.duplicateDecision ? { duplicateDecision: c.duplicateDecision.reason } : {}) });
        if (c.workerAssignmentId) { await event(db, b, l, "ASSIGN", reference + ":assigned", { workerAssignmentId: c.workerAssignmentId }); await notice(db, b, l, "New lead assigned", reference); }
        return { id: l.id };
      }
      let l: Lead, own = false;
      if (c.operation === "CLAIM") {
        l = await db.niceJobsLead.findUniqueOrThrow({ where: { id: c.leadId }, include }); const p = await policy(db, b, l.policyId), a = await employee.own(db, b);
        await b.ctx.requireAccess("nicejobs.lead.claim", { organizationId: p.divisionId }); await b.ctx.requireAccess("nicejobs.lead.self.read", { organizationId: p.divisionId }); await b.ctx.requireAccess("nicejobs.lead.perform", { organizationId: p.divisionId });
        if (!p.claimAllowed || a.divisionId !== p.divisionId || l.companyId !== b.company.id || l.divisionId !== p.divisionId || l.workflowInstance?.currentState.terminal || !l.workflowInstance || l.workflowInstance.definitionId !== p.definitionId || l.workflowInstance.resourceId !== l.id) throw new AccessError("Claim is not configured or lead is unavailable");
        await eligible(db, b, p, a.id);
        if (replay()) { if (l.currentWorkerAssignmentId !== a.id) throw new AccessError("Ownership changed"); return { id: l.id }; }
        if (l.currentWorkerAssignmentId) throw new NiceJobsError("Lead is already assigned");
      } else { ({ l, own } = await load(db, b, c.leadId, true)); }
      const scope = { organizationId: l.divisionId };
      if (["ASSIGN", "UNASSIGN"].includes(c.operation)) { if (own) throw new AccessError("Independent management required"); await b.ctx.requireAccess("nicejobs.lead.assign", scope); }
      if (c.operation === "NOTE" && c.visibility === "MANAGEMENT") { if (own) throw new AccessError("Private management notes require independent management"); await b.ctx.requireAccess("nicejobs.lead.manage", scope); }
      if (c.operation === "REMIND") await b.ctx.requireAccess("reminder.manage", scope);
      if (c.operation === "ASSIST") { if (!own) throw new AccessError("Worker assistance is owner-only"); await b.ctx.requireAccess("nicejobs.blocker.self", scope); }
      if (replay()) return { id: l.id };
      if ((await db.niceJobsLead.updateMany({ where: { id: l.id, revision: c.revision }, data: { revision: { increment: 1 } } })).count !== 1) throw new NiceJobsError("Lead changed; refresh before acting");
      let metadata: Prisma.InputJsonObject = { fingerprint }, visibility = "WORKER";
      if (c.operation === "ASSIGN" || c.operation === "UNASSIGN" || c.operation === "CLAIM") {
        const requiresNext = JSON.parse(l.policy.followupRequiredStates).includes(l.workflowInstance!.currentState.key);
        if (requiresNext && (c.operation !== "ASSIGN" || !c.nextFollowup)) throw new NiceJobsError("This state requires a next follow-up. Move to an allowed state first, or provide the new owner's follow-up with reassignment.");
        const worker = c.operation === "UNASSIGN" ? null : c.operation === "CLAIM" ? (await employee.own(db, b)).id : c.workerAssignmentId;
        l = await assign(db, b, l, worker, c.reason, reference, c.operation === "CLAIM"); metadata = { fingerprint, workerAssignmentId: worker, reason: c.reason };
        if (c.operation === "ASSIGN" && c.nextFollowup) { const f = await scheduleFollowup(db, l, c.nextFollowup); await event(db, b, l, "SCHEDULE", reference + ":schedule", { followupId: f.id, scheduledAt: f.scheduledAt.toISOString() }); }
        await notice(db, b, l, "Lead ownership updated", reference);
      } else if (c.operation === "CONTACT" || c.operation === "NOTE") {
        metadata = { fingerprint, notes: c.notes ?? "", ...(c.operation === "CONTACT" ? { type: c.type, outcome: c.outcome, nextAction: c.nextAction, delivery: "HUMAN_RECORDED_NOT_PROVIDER_EVIDENCE" } : {}) };
        if (c.operation === "NOTE") visibility = c.visibility;
        if (c.operation === "CONTACT" && c.nextFollowup) { const f = await scheduleFollowup(db, l, c.nextFollowup); await event(db, b, l, "SCHEDULE", reference + ":schedule", { followupId: f.id, scheduledAt: f.scheduledAt.toISOString() }); }
      } else if (c.operation === "SCHEDULE") {
        if (l.currentWorkerAssignmentId) await eligible(db, b, l.policy, l.currentWorkerAssignmentId);
        const f = await scheduleFollowup(db, l, c); metadata = { fingerprint, followupId: f.id, scheduledAt: f.scheduledAt.toISOString(), purpose: f.purpose };
      } else if (c.operation === "COMPLETE" || c.operation === "CANCEL" || c.operation === "REMIND") {
        const f = await db.niceJobsLeadFollowup.findFirst({ where: { id: c.followupId, leadId: l.id, workerAssignmentId: l.currentWorkerAssignmentId ?? "", assignmentHistory: { status: "ACTIVE" }, status: "SCHEDULED" } });
        if (!f) throw new AccessError("Current follow-up unavailable");
        await eligible(db, b, l.policy, f.workerAssignmentId);
        if (c.operation === "REMIND") { if (f.scheduledAt > now()) throw new NiceJobsError("Follow-up is not due"); await notice(db, b, l, "Follow-up overdue", reference); metadata = { fingerprint, followupId: f.id }; }
        else {
          if ((await db.niceJobsLeadFollowup.updateMany({ where: { id: f.id, revision: c.followupRevision, status: "SCHEDULED" }, data: { revision: { increment: 1 }, status: c.operation === "COMPLETE" ? "COMPLETED" : "CANCELLED", ...(c.operation === "COMPLETE" ? { outcome: c.outcome, nextAction: c.nextAction, completedAt: now() } : {}) } })).count !== 1) throw new NiceJobsError("Follow-up changed; refresh before acting");
          metadata = { fingerprint, followupId: f.id, ...(c.operation === "COMPLETE" ? { outcome: c.outcome, nextAction: c.nextAction } : { reason: c.reason }) };
          if (c.operation === "COMPLETE" && c.nextFollowup) { const next = await scheduleFollowup(db, l, c.nextFollowup); await event(db, b, l, "SCHEDULE", reference + ":schedule", { followupId: next.id, scheduledAt: next.scheduledAt.toISOString() }); }
          if (JSON.parse(l.policy.followupRequiredStates).includes(l.workflowInstance!.currentState.key) && !await db.niceJobsLeadFollowup.findFirst({ where: { leadId: l.id, status: "SCHEDULED", workerAssignmentId: l.currentWorkerAssignmentId! }, select: { id: true } })) throw new NiceJobsError("This state requires a next follow-up; schedule one before completing or cancelling the last follow-up");
        }
      } else if (c.operation === "TRANSITION") {
        const t = await db.workflowTransition.findFirst({ where: { id: c.transitionId, definitionId: l.policy.definitionId, fromStateId: l.workflowInstance!.currentStateId }, include: { toState: true } });
        if (!t) throw new AccessError("Transition unavailable");
        await b.ctx.requireAccess(t.requiredPermission, scope);
        if (JSON.parse(l.policy.followupRequiredStates).includes(t.toState.key) && !await db.niceJobsLeadFollowup.findFirst({ where: { leadId: l.id, status: "SCHEDULED", workerAssignmentId: l.currentWorkerAssignmentId ?? "", assignmentHistory: { status: "ACTIVE" } }, select: { id: true } })) throw new NiceJobsError("Schedule the next follow-up before entering this state");
        if (t.toState.terminal && await db.niceJobsLeadFollowup.findFirst({ where: { leadId: l.id, status: "SCHEDULED" }, select: { id: true } })) { if (!c.cancelScheduled) throw new NiceJobsError("Explicitly confirm cancellation of scheduled follow-ups before closing"); await cancelAll(db, b, l, reference, c.reason); }
        await workflow(db, b, l).transition(userId, { instanceId: l.workflowInstanceId, transitionId: t.id, expectedVersion: l.workflowInstance!.version, reason: c.reason, idempotencyKey: c.idempotencyKey }, db);
        metadata = { fingerprint, from: l.workflowInstance!.currentState.key, to: t.toState.key, reason: c.reason };
      } else if (c.operation === "ASSIST") {
        const blocker = await db.executionBlocker.create({ data: { organizationId: l.divisionId, niceJobsAssignmentId: l.currentWorkerAssignmentId, niceJobsLeadId: l.id, reason: c.reason, description: c.description, reporterUserId: userId } });
        metadata = { fingerprint, blockerId: blocker.id, reason: c.reason };
        const a = await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: l.currentWorkerAssignmentId! } }); await notice(db, b, l, "Lead assistance requested", reference, a.managerId);
      }
      await event(db, b, l, c.operation, reference, metadata, visibility);
      return { id: l.id };
    });
  }
  async function list(userId: string, raw: unknown = {}, own = false) {
    const q = leadQuery.parse(raw);
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), a = own ? await employee.own(db, b) : null;
      const divisions = own ? [a!.divisionId] : b.ctx.organizationIds("nicejobs.lead.pool.read");
      if (!divisions.length || q.companyId && q.companyId !== b.company.id || q.divisionId && !divisions.includes(q.divisionId) || own && q.workerAssignmentId && q.workerAssignmentId !== a!.id) throw new AccessError("Lead scope unavailable");
      if (own) await b.ctx.requireAccess("nicejobs.lead.self.read", { organizationId: a!.divisionId });
      const bounds = dayBounds(localDay(now(), b.timezone), b.timezone);
      let where: Prisma.NiceJobsLeadWhereInput = { companyId: b.company.id, divisionId: q.divisionId ?? { in: divisions }, ...(q.policyId ? { policyId: q.policyId } : {}), ...(q.source ? { source: q.source } : {}), ...(q.priority ? { priority: q.priority } : {}), name: { contains: q.search }, ...(q.after ? { id: { gt: q.after } } : {}), ...(q.from || q.until ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.until ? { lt: new Date(q.until) } : {}) } } : {}), ...(q.status ? { workflowInstance: { currentState: { key: q.status } } } : {}), ...(q.ownership ? { currentWorkerAssignmentId: q.ownership === "unassigned" ? null : { not: null } } : {}), ...(q.workerAssignmentId ? { currentWorkerAssignmentId: q.workerAssignmentId } : {}) };
      const baseWhere = where;
      if (own) where = { AND: [where, { currentWorkerAssignmentId: a!.id, policy: { status: "ACTIVE", definition: { status: "ACTIVE" }, eligibility: { some: { versionId: a!.versionId } } } }] };
      if (q.queue === "available") { if (!a) throw new AccessError("Claim queue requires an active worker"); await b.ctx.requireAccess("nicejobs.lead.claim", { organizationId: a.divisionId }); where = { companyId: b.company.id, divisionId: a.divisionId, currentWorkerAssignmentId: null, policy: { claimAllowed: true, status: "ACTIVE", definition: { status: "ACTIVE" }, eligibility: { some: { versionId: a.versionId } } }, workflowInstance: { currentState: { terminal: false } }, ...(q.after ? { id: { gt: q.after } } : {}) }; }
      else if (q.queue !== "all") where = { AND: [where, q.queue === "priority" ? { priority: { in: ["CRITICAL", "HIGH"] }, workflowInstance: { currentState: { terminal: false } } } : q.queue === "today" ? { followups: { some: { status: "SCHEDULED", scheduledAt: { gte: bounds.start, lt: bounds.end } } } } : q.queue === "new" ? { assignments: { some: { status: "ACTIVE", assignedAt: { gte: bounds.start, lt: bounds.end } } } } : q.queue === "recent" ? { activities: { some: { kind: "CONTACT", visibility: "WORKER", createdAt: { gte: bounds.start, lt: bounds.end } } } } : { workflowInstance: { currentState: { terminal: false } } }] };
      if (q.queue === "available") where = { AND: [baseWhere, where] };
      const rows = await db.niceJobsLead.findMany({ where, select: leadSummarySelect, orderBy: { id: "asc" }, take: q.limit + 1 });
      return { records: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null, companyId: b.company.id, timezone: b.timezone };
    });
  }
  async function detail(userId: string, id: string, after?: string, followupAfter?: string, historyAfter?: string) {
    const q = leadQuery.parse({ after });
    leadQuery.parse({ after: followupAfter }); leadQuery.parse({ after: historyAfter });
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), { l, own } = await load(db, b, id);
      const latest = await db.niceJobsLeadActivity.findFirst({ where: { leadId: id, ...(own ? { visibility: "WORKER" } : {}) }, select: { kind: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const action = await db.niceJobsLeadActivity.findFirst({ where: { leadId: id, visibility: "WORKER", kind: { in: ["CONTACT", "COMPLETE"] } }, select: { event: { select: { metadata: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const nextFollowup = await db.niceJobsLeadFollowup.findFirst({ where: { leadId: id, workerAssignmentId: l.currentWorkerAssignmentId ?? "", assignmentHistory: { status: "ACTIVE" }, status: "SCHEDULED" }, select: { id: true, purpose: true, scheduledAt: true }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }] });
      const activity = await db.niceJobsLeadActivity.findMany({ where: { leadId: id, ...(own ? { visibility: "WORKER" } : {}), ...(q.after ? { id: { gt: q.after } } : {}) }, select: { id: true, kind: true, visibility: true, createdAt: true, event: { select: { metadata: true } } }, orderBy: { id: "asc" }, take: 26 });
      const followups = await db.niceJobsLeadFollowup.findMany({ where: { leadId: id, ...(followupAfter ? { id: { gt: followupAfter } } : {}), ...(own ? { workerAssignmentId: l.currentWorkerAssignmentId!, assignmentHistory: { status: "ACTIVE" } } : {}) }, orderBy: { id: "asc" }, take: 26 });
      const history = await db.niceJobsLeadAssignment.findMany({ where: { leadId: id, ...(historyAfter ? { id: { gt: historyAfter } } : {}) }, select: { id: true, assignedAt: true, unassignedAt: true, reason: true, status: true }, orderBy: { id: "asc" }, take: 26 });
      const transitions = l.workflowInstance!.currentState.terminal ? [] : await db.workflowTransition.findMany({ where: { definitionId: l.policy.definitionId, fromStateId: l.workflowInstance!.currentStateId, requiredPermission: { in: [...new Set(b.ctx.grants.map(g => g.key))].filter(key => b.ctx.organizationIds(key).includes(l.divisionId)) } }, include: { toState: { select: { key: true } } }, take: 30 });
      const bounds = dayBounds(localDay(now(), b.timezone), b.timezone);
      return { latestActivity: latest, nextAction: action ? JSON.parse(action.event.metadata ?? "{}").nextAction ?? null : null, nextFollowup, lead: { companyName: b.company.name, divisionName: l.division.name, id: l.id, name: l.name, phone: l.phone, email: l.email, location: l.location, source: l.source, priority: l.priority, revision: l.revision, companyId: l.companyId, divisionId: l.divisionId, policyId: l.policyId, ownerName: own || b.ctx.organizationIds("person.read").includes(l.divisionId) ? l.currentWorkerAssignment?.profile.person.displayName ?? null : null, ownerAssignmentId: l.currentWorkerAssignmentId, status: l.workflowInstance!.currentState.key, terminal: l.workflowInstance!.currentState.terminal, assigned: !!l.currentWorkerAssignmentId }, history: history.slice(0, 25), historyNextCursor: history.length > 25 ? history[24].id : null, followupNextCursor: followups.length > 25 ? followups[24].id : null, activity: activity.slice(0, 25).map(r => { const metadata = JSON.parse(r.event.metadata ?? "{}"); delete metadata.fingerprint; return { id: r.id, kind: r.kind, visibility: r.visibility, createdAt: r.createdAt, metadata }; }), nextCursor: activity.length > 25 ? activity[24].id : null, followups: followups.slice(0, 25).map(f => ({ ...f, state: followupState(f, now(), bounds.start) })), transitions, own, timezone: b.timezone, canPerform: l.policy.status === "ACTIVE" && !l.workflowInstance!.currentState.terminal && (await b.ctx.decide(own ? "nicejobs.lead.perform" : "nicejobs.lead.manage", { organizationId: l.divisionId })).allowed, canAssign: !own && (await b.ctx.decide("nicejobs.lead.assign", { organizationId: l.divisionId })).allowed, canUnassign: l.policy.unassignAllowed, canAssist: own && (await b.ctx.decide("nicejobs.blocker.self", { organizationId: l.divisionId })).allowed, canRemind: (await b.ctx.decide("reminder.manage", { organizationId: l.divisionId })).allowed };
    });
  }
  async function followups(userId: string, raw: unknown = {}) {
    const q = leadQuery.parse(raw);
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), a = await employee.own(db, b); await b.ctx.requireAccess("nicejobs.lead.self.read", { organizationId: a.divisionId });
      if (q.companyId && q.companyId !== b.company.id || q.divisionId && q.divisionId !== a.divisionId || q.workerAssignmentId && q.workerAssignmentId !== a.id) throw new AccessError("Follow-up scope unavailable");
      const bounds = dayBounds(localDay(now(), b.timezone), b.timezone);
      const where: Prisma.NiceJobsLeadFollowupWhereInput = { workerAssignmentId: a.id, status: q.status === "COMPLETED" || q.status === "CANCELLED" ? q.status : "SCHEDULED", assignmentHistory: { status: "ACTIVE" }, lead: { companyId: b.company.id, divisionId: a.divisionId, currentWorkerAssignmentId: a.id, name: { contains: q.search }, policy: { status: "ACTIVE", definition: { status: "ACTIVE" }, eligibility: { some: { versionId: a.versionId } } } }, ...(q.after ? { id: { gt: q.after } } : {}), ...(q.queue === "today" ? { scheduledAt: { gte: bounds.start, lt: bounds.end } } : q.queue === "attention" ? { scheduledAt: { lt: now() } } : q.from || q.until ? { scheduledAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.until ? { lt: new Date(q.until) } : {}) } } : {}) };
      const rows = await db.niceJobsLeadFollowup.findMany({ where, select: { id: true, leadId: true, scheduledAt: true, type: true, purpose: true, status: true, outcome: true, nextAction: true, lead: { select: { name: true } } }, orderBy: { id: "asc" }, take: q.limit + 1 });
      return { records: rows.slice(0, q.limit).map(f => ({ ...f, state: followupState(f, now(), bounds.start) })), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null, timezone: b.timezone };
    });
  }
  async function configuration(userId: string, divisionId?: string) {
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), ids = b.ctx.organizationIds("nicejobs.lead.pool.read");
      if (!ids.length || divisionId && !ids.includes(divisionId)) throw new AccessError("Lead configuration scope unavailable");
      const divisions = await db.organization.findMany({ where: { id: { in: ids }, parentId: b.company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true, name: true }, take: 30 });
      const policies = await db.niceJobsLeadPolicy.findMany({ where: { companyId: b.company.id, divisionId: divisionId ?? { in: ids }, status: "ACTIVE", definition: { status: "ACTIVE" } }, select: { id: true, name: true, divisionId: true, allowedSources: true, claimAllowed: true, unassignAllowed: true, eligibility: { select: { versionId: true } } }, orderBy: { id: "asc" }, take: 51 });
      const workerDivisions = b.ctx.organizationIds("nicejobs.workspace.read").filter(id => ids.includes(id) && b.ctx.organizationIds("person.read").includes(id));
      const workerRows = await db.niceJobsAssignment.findMany({ where: { divisionId: divisionId && workerDivisions.includes(divisionId) ? divisionId : { in: workerDivisions }, status: "ACTIVE", lifecycle: "ACTIVE", activatedAt: { not: null }, onboarding: { status: "READY" }, readinessReview: { kind: "READINESS", outcome: "READY" }, profile: { companyId: b.company.id, person: { status: "ACTIVE" } } }, select: { id: true, divisionId: true, versionId: true, profile: { select: { person: { select: { displayName: true } } } } }, orderBy: { id: "asc" }, take: 51 });
      const workflows = await db.workflowDefinition.findMany({ where: { organizationId: { in: b.ctx.organizationIds("nicejobs.lead.policy.manage").filter(id => ids.includes(id) && b.ctx.organizationIds("workflow.read").includes(id)) }, status: "ACTIVE", projectId: null }, select: { id: true, name: true, organizationId: true }, take: 50 });
      const versions = await db.niceJobsVersion.findMany({ where: { publishedAt: { not: null }, template: { companyId: b.company.id, productId: b.product.id }, areas: { some: { divisionId: { in: b.ctx.organizationIds("nicejobs.job.read").filter(id => ids.includes(id)) } } } }, select: { id: true, title: true, number: true }, take: 50 });
      return { company: { id: b.company.id, name: b.company.name }, divisions, workers: workerRows.slice(0, 50).map(a => ({ id: a.id, name: a.profile.person.displayName, divisionId: a.divisionId, versionId: a.versionId })), workersTruncated: workerRows.length > 50, policies: policies.slice(0, 50), workflows, versions, truncated: policies.length > 50, canCreate: b.ctx.organizationIds("nicejobs.lead.manage"), canConfigure: b.ctx.organizationIds("nicejobs.lead.policy.manage") };
    });
  }
  async function workers(userId: string, policyId: string, search = "", after?: string) {
    const q = leadQuery.parse({ search, after });
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), p = await policy(db, b, policyId), scope = { organizationId: p.divisionId };
      for (const cap of ["nicejobs.lead.assign", "nicejobs.workspace.read", "person.read"]) await b.ctx.requireAccess(cap, scope);
      const rows = await db.niceJobsAssignment.findMany({ where: { divisionId: p.divisionId, versionId: { in: p.eligibility.map(e => e.versionId) }, status: "ACTIVE", lifecycle: "ACTIVE", activatedAt: { not: null }, onboarding: { status: "READY" }, readinessReview: { kind: "READINESS", outcome: "READY" }, startDate: { lte: now() }, OR: [{ endDate: null }, { endDate: { gt: now() } }], profile: { companyId: b.company.id, personId: { not: b.personId }, person: { status: "ACTIVE", displayName: { contains: q.search } } }, ...(q.after ? { id: { gt: q.after } } : {}) }, select: { id: true, profile: { select: { person: { select: { displayName: true } } } } }, orderBy: { id: "asc" }, take: 26 });
      return { records: rows.slice(0, 25).map(a => ({ id: a.id, name: a.profile.person.displayName })), nextCursor: rows.length > 25 ? rows[24].id : null };
    });
  }
  async function previewImport(userId: string, raw: unknown) {
    const input = z.object({ policyId: z.string().min(1), records: z.array(candidate.omit({ policyId: true, duplicateDecision: true, workerAssignmentId: true })).max(100) }).strict().parse(raw);
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), p = await policy(db, b, input.policyId); await b.ctx.requireAccess("nicejobs.lead.manage", { organizationId: p.divisionId }); await b.ctx.requireAccess("nicejobs.lead.pool.read", { organizationId: p.divisionId });
      if (!JSON.parse(p.allowedSources).includes("IMPORT") || input.records.some(r => r.source !== "IMPORT")) throw new AccessError("Import source is not configured");
      const matches = await db.niceJobsLead.findMany({ where: { companyId: b.company.id, divisionId: p.divisionId, OR: [{ phone: { in: input.records.map(r => r.phone) } }, { email: { in: input.records.flatMap(r => r.email ? [r.email] : []) } }] }, select: { id: true, phone: true, email: true }, orderBy: { id: "asc" }, take: 1001 });
      if (matches.length > 1000) throw new NiceJobsError("Duplicate preview requires a smaller batch");
      return { status: "PREVIEW_ONLY", records: input.records.map((r, index) => ({ index, name: r.name, duplicateIds: matches.filter(m => m.phone === r.phone || r.email && m.email === r.email).map(m => m.id), duplicateRows: input.records.flatMap((other, i) => i !== index && (other.phone === r.phone || r.email && other.email === r.email) ? [i] : []) })), writes: 0 };
    });
  }
  async function communicationIntent(userId: string, leadId: string) { const d = await detail(userId, leadId); if (!d.canPerform) throw new AccessError("Communication preparation unavailable"); return { status: "NOT_CONFIGURED", leadId: d.lead.id, organizationId: d.lead.divisionId, providerExecution: false, requiredBoundary: "Existing communication policy, consent, authorization, human confirmation/approval, provider adapter and delivery evidence" }; }
  return { mutate, list, followups, detail, configuration, workers, previewImport, communicationIntent };
}
export const leadService = createLeadService();
