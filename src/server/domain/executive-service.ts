import { boundedRead, groupRows } from "./query-bounds";
import { PrismaClient, type ExecutiveRecord, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext as defaultAccessContext, type ResourceScope } from "@/server/authorization/engine";
import { activeMembershipWhere, ancestry } from "@/server/authorization/business-scope";
import { createExecutionService } from "./execution-service";
import { createOperationsService } from "./operations-service";
import { resolveResource, boundResource } from "./operations-scope";
import { resourceTypes } from "./operations-input";
import { operationalEvent } from "./operational-events";
import { executiveInput, executiveTransition, executiveRevision, executiveFilter, attentionStates, kpiStatus, trend, type severities } from "./executive-input";

type Context = Awaited<ReturnType<typeof defaultAccessContext>>;
type Payload = z.infer<typeof executiveInput>;
type Severity = typeof severities[number];
type Source = ResourceScope & { id: string; title: string; status: string; dueAt: Date | null; ownerPersonId: string | null; priority: string; createdAt: Date; updatedAt: Date; progress: number | null; productId: string | null; goalId: string | null; relatedTaskId: string | null; prerequisiteId: string | null; type: string; href: string; actionable?: boolean; completionDate: Date | null };
export type Attention = Source & { key: string; severity: Severity; explanation: string; nextAction: string; recordId: string | null; version: number; handlingStatus: string; active: boolean };
export type Metric = { name: string; definition: string; scope: ResourceScope | null; value: number | null; unit: string; period: string; source: string; calculation: string; status: "AVAILABLE" | "NO_DATA"; calculatedAt: Date; lastUpdated: Date | null; coverage: "AUTHORIZED_RECORDS_ONLY"; entities: { id: string; title: string; href: string }[] };
const closed = (s: string) => ["COMPLETED", "CANCELLED", "ARCHIVED", "ACHIEVED", "MISSED", "RESOLVED", "CLOSED", "EXPIRED", "REJECTED", "APPROVED"].includes(s);
const rank: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const domain = (kind: string) => kind.toLowerCase();
const lifecycles: Record<string, Record<string, string[]>> = {
  DECISION: { DRAFT: ["PENDING", "CANCELLED"], PENDING: ["APPROVED", "REJECTED", "DEFERRED", "CANCELLED"], DEFERRED: ["PENDING", "CANCELLED"], APPROVED: ["COMPLETED"] },
  ATTENTION: { NEW: ["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "DISMISSED"], ACKNOWLEDGED: ["IN_PROGRESS", "RESOLVED", "DISMISSED"], IN_PROGRESS: ["RESOLVED", "DISMISSED"], RESOLVED: ["IN_PROGRESS"], DISMISSED: ["IN_PROGRESS"] },
  RISK: { IDENTIFIED: ["MONITORING", "MITIGATING", "REALIZED", "CLOSED", "ACCEPTED"], MONITORING: ["MITIGATING", "REALIZED", "CLOSED", "ACCEPTED"], MITIGATING: ["MONITORING", "REALIZED", "CLOSED", "ACCEPTED"], REALIZED: ["MITIGATING", "CLOSED"], ACCEPTED: ["MONITORING", "CLOSED"], CLOSED: ["MONITORING"] },
  OPPORTUNITY: { IDENTIFIED: ["EVALUATING", "CLOSED"], EVALUATING: ["PURSUING", "CLOSED"], PURSUING: ["REALIZED", "CLOSED"], CLOSED: ["EVALUATING"] }
};
// DTOs from existing services are normalized, not returned wholesale to the executive UI.
function source(raw: unknown, type: string): Source {
  const r = raw as Record<string, unknown>;
  if (type === "DEPENDENCY") { const task = r.task as { title: string }, prerequisite = r.prerequisite as { title: string; status: string }; r.title = `${task.title} depends on ${prerequisite.title}`; r.status = prerequisite.status; }
  if (type === "NOTIFICATION") r.status = r.readAt ? "READ" : "UNREAD";
  return { id: String(r.id), organizationId: String(r.organizationId), projectId: type === "PROJECT" ? String(r.id) : (r.projectId ?? r.scopeProjectId ?? null) as string | null,
    title: String(r.title ?? r.name ?? r.reason ?? r.description ?? r.eventType ?? ""), status: String(r.status), dueAt: (r.dueAt ?? r.dueDate ?? r.targetDate ?? r.expiresAt ?? r.remindAt ?? null) as Date | null,
    ownerPersonId: (r.assigneePersonId ?? r.ownerPersonId ?? null) as string | null, priority: String(r.priority ?? "NORMAL"),
    createdAt: r.createdAt as Date, updatedAt: (r.updatedAt ?? r.readAt ?? r.decidedAt ?? r.createdAt) as Date, progress: (r.calculatedProgress ?? null) as number | null,
    productId: (r.productId ?? null) as string | null, goalId: (r.goalId ?? null) as string | null, relatedTaskId: (r.taskId ?? null) as string | null, prerequisiteId: (r.prerequisiteId ?? null) as string | null, type,
    href: type === "PROJECT" ? `/app/execution/projects/${r.id}` : type === "TASK" ? "/app/execution/tasks" : type === "GOAL" ? "/app/execution/goals" : type === "MILESTONE" ? "/app/execution/milestones" : type === "BLOCKER" ? "/app/execution/blockers" : type === "DEPENDENCY" ? "/app/execution/dependencies" : type === "DECISION" ? "/app/executive/decisions" : `/app/operations/${type === "APPROVAL" ? "approvals" : type === "EVENT" ? "events" : type === "INSTANCE" ? "instances" : type.toLowerCase() + "s"}`,
    actionable: r.actionable === true, completionDate: (r.completionDate ?? r.decidedAt ?? null) as Date | null };
}
export function createExecutiveService(client: PrismaClient = prisma, createAccessContext = defaultAccessContext) {
  const execution = createExecutionService(client, createAccessContext), operations = createOperationsService(client, createAccessContext);
  async function recordAccess(ctx: Context, row: ExecutiveRecord, action = "read") {
    await ctx.requireAccess("executive.read", row);
    await ctx.requireAccess((row.kind === "ATTENTION" && action === "read" ? "executive" : domain(row.kind)) + "." + action, row);
    if (row.projectId) await ctx.requireAccess("project.read", row);
  }
  async function attentionSource(db: Prisma.TransactionClient, ctx: Context, type: string, id: string) {
    if (type === "KPI") { const r = await db.executiveRecord.findUnique({ where: { id } }); if (!r || r.kind !== "KPI") throw new AccessError("Source unavailable"); return recordAccess(ctx, r); }
    if (type === "ESCALATION") { const r = await db.escalation.findUnique({ where: { id } }); if (!r) throw new AccessError("Source unavailable"); return boundResource(db, ctx, r, "escalation.read"); }
    if (type === "EVENT") {
      const r = await db.operationalEvent.findUnique({ where: { id } }); if (!r) throw new AccessError("Source unavailable");
      await ctx.requireAccess("event.read", r);
      return eventSource(db, ctx, r);
    }
    return resolveResource(db, ctx, type as typeof resourceTypes[number], id);
  }
  async function eventSource(db: Prisma.TransactionClient, ctx: Context, event: { entityType: string; entityId: string; organizationId: string; projectId: string | null }) {
    const type = event.entityType.toLowerCase();
    const direct: Record<string, typeof resourceTypes[number]> = { organization: "ORGANIZATION", project: "PROJECT", task: "TASK", goal: "GOAL", milestone: "MILESTONE", program: "PROGRAM", batch: "BATCH", location: "LOCATION", request: "REQUEST", operationalrequest: "REQUEST", approval: "APPROVAL", siaapproval: "APPROVAL", instance: "INSTANCE", workflowinstance: "INSTANCE" };
    let actual: ResourceScope;
    if (direct[type]) actual = await resolveResource(db, ctx, direct[type], event.entityId);
    else if (type === "reminder") { const r = await db.reminder.findUnique({ where: { id: event.entityId } }); if (!r) throw new AccessError("Source unavailable"); actual = await boundResource(db, ctx, r, "reminder.read"); }
    else if (["recurrence", "recurringwork"].includes(type)) { const r = await db.recurringWork.findUnique({ where: { id: event.entityId } }); if (!r) throw new AccessError("Source unavailable"); actual = await boundResource(db, ctx, r, "recurrence.read"); }
    else if (type === "notification") { const r = await db.notification.findUnique({ where: { id: event.entityId } }); if (!r || r.recipientUserId !== ctx.user?.id) throw new AccessError("Source unavailable"); actual = await boundResource(db, ctx, r, "notification.read"); }
    else if (type === "escalation") { const r = await db.escalation.findUnique({ where: { id: event.entityId } }); if (!r) throw new AccessError("Source unavailable"); actual = await boundResource(db, ctx, r, "escalation.read"); }
    else if (type === "controlcheck") { const r = await db.controlCheck.findUnique({ where: { id: event.entityId } }); if (!r) throw new AccessError("Source unavailable"); actual = await resolveResource(db, ctx, "INSTANCE", r.instanceId); await ctx.requireAccess("control.read", actual); }
    else throw new AccessError("Event domain is not an executive source");
    if (actual.organizationId !== event.organizationId || event.projectId && actual.projectId !== event.projectId) throw new AccessError("Event source scope mismatch");
    await ctx.requireAccess("executive.read", actual);
    return actual;
  }
  async function save(userId: string, raw: unknown) {
    const v = executiveInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db); await ctx.requireAccess("executive.read", v); await ctx.requireAccess(domain(v.kind) + ".manage", v);
      if (v.projectId) await ctx.requireAccess("project.read", v);
      const path = ancestry(ctx.nodes, v.organizationId).map(n => n.id);
      await ctx.requireAccess("person.read", v);
      if (!await db.membership.findFirst({ where: { ...activeMembershipWhere(), personId: v.ownerPersonId, OR: [
        { organizationId: v.organizationId, projectId: null, scopeKey: "organization" },
        { organizationId: { in: path }, projectId: null, scope: "DESCENDANTS", scopeKey: "organization" },
        ...(v.projectId ? [{ organizationId: v.organizationId, projectId: v.projectId, scopeKey: "project:" + v.projectId }] : [])
      ] } })) throw new AccessError("Owner must have an active membership in this scope");
      const payload = JSON.stringify(v), sourceKey = `${v.kind}:${v.organizationId}:${v.reference}`;
      const previous = await db.executiveRecord.findUnique({ where: { sourceKey } });
      if (previous) { if (previous.payload !== payload) throw new AccessError("Duplicate reference has a different payload"); return previous; }
      const status = v.kind === "DECISION" ? "DRAFT" : v.kind === "KPI" ? "NO_DATA" : "IDENTIFIED";
      const row = await db.executiveRecord.create({ data: { kind: v.kind, organizationId: v.organizationId, projectId: v.projectId, ownerPersonId: v.ownerPersonId, title: v.title, status, payload, sourceKey, dueAt: v.dueAt } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, toStatus: status, reason: "Created" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: row.organizationId, projectId: row.projectId, entityType: "ExecutiveRecord", entityId: row.id, action: domain(row.kind) + ".created", result: "SUCCESS" });
      return row;
    });
  }
  async function transition(userId: string, raw: unknown) {
    const v = executiveTransition.parse(raw);
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db), row = await db.executiveRecord.findUnique({ where: { id: v.id } });
      if (!row) throw new AccessError("Record unavailable");
      await recordAccess(ctx, row, row.kind === "DECISION" && ["APPROVED", "REJECTED", "DEFERRED"].includes(v.status) ? "decide" : "manage");
      if (row.kind === "DECISION" && ["APPROVED", "REJECTED", "DEFERRED"].includes(v.status) && row.ownerPersonId !== ctx.user?.personId) throw new AccessError("Only the designated human decision maker may decide");
      if (row.kind === "ATTENTION") {
        const p = JSON.parse(row.payload) as { sourceType: typeof resourceTypes[number]; sourceId: string };
        await attentionSource(db, ctx, p.sourceType, p.sourceId);
      }
      let status = v.status;
      if (row.kind === "KPI") {
        const p = executiveInput.parse(JSON.parse(row.payload));
        if (v.observation === undefined || v.status !== "OBSERVE") throw new AccessError("KPI requires an explicit sourced observation");
        const now = new Date();
        if (now < p.periodStart! || now > p.periodEnd!) throw new AccessError("Observation must fall within the KPI period");
        status = kpiStatus(v.observation, p.target!, p.direction!);
      } else {
        if (v.observation !== undefined || !lifecycles[row.kind]?.[row.status]?.includes(status)) throw new AccessError("Invalid lifecycle transition");
      }
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, version: v.expectedVersion }, data: { status, version: { increment: 1 } } })).count !== 1) throw new AccessError("Stale version; refresh before acting");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: status, reason: v.reason, observation: v.observation } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: row.organizationId, projectId: row.projectId, entityType: "ExecutiveRecord", entityId: row.id, action: domain(row.kind) + (row.status !== status ? ".status_changed" : ".observed"), result: "SUCCESS", metadata: { from: row.status, to: status } });
      return db.executiveRecord.findUniqueOrThrow({ where: { id: row.id } });
    });
  }
  async function records(userId: string, now = new Date()) {
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db);
      const records = await boundedRead(take => db.executiveRecord.findMany({ take, where: { OR: [{ organizationId: { in: ctx.organizationIds("executive.read") } }, { projectId: { in: ctx.grants.filter(g => g.key === "executive.read" && g.projectId).map(g => g.projectId!) } }] }, orderBy: { updatedAt: "desc" } }));
      const history = groupRows(await boundedRead(take => db.executiveHistory.findMany({ take, where: { recordId: { in: records.map(r => r.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })), row => row.recordId);
      const candidates = records.map(row => ({ ...row, history: history.get(row.id) ?? [] }));
      const visible = [];
      for (const row of candidates) {
        try {
          await recordAccess(ctx, row);
          if (row.kind === "ATTENTION") { const p = JSON.parse(row.payload); await attentionSource(db, ctx, p.sourceType, p.sourceId); }
          const payload = JSON.parse(row.payload) as Payload;
          const observations = row.history.filter(h => h.observation !== null);
          const actual = observations.at(-1)?.observation ?? null;
          const status = row.kind === "KPI" && (!payload.periodEnd || new Date(payload.periodEnd) < now) ? "NO_DATA" : row.status;
          visible.push({ ...row, status, payload, actual: status === "NO_DATA" ? null : actual, trend: row.kind === "KPI" ? trend(observations.map(h => h.observation!), payload.direction) : "INSUFFICIENT_DATA",
            canManage: (await ctx.decide(domain(row.kind) + ".manage", row)).allowed,
            canDecide: row.ownerPersonId === ctx.user?.personId && (await ctx.decide("decision.decide", row)).allowed });
        } catch (e) { if (!(e instanceof AccessError)) throw e; }
      }
      return visible;
    });
  }
  async function revise(userId: string, raw: unknown) {
    const v = executiveRevision.parse(raw);
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db), row = await db.executiveRecord.findUnique({ where: { id: v.id } });
      if (!row || !["DECISION", "RISK", "OPPORTUNITY"].includes(row.kind) || row.kind === "DECISION" && row.status !== "DRAFT" || ["CLOSED", "REALIZED", "ACCEPTED"].includes(row.status)) throw new AccessError("This record is not editable");
      await recordAccess(ctx, row, "manage");
      const previous = executiveInput.parse(JSON.parse(row.payload));
      const { id: _id, expectedVersion: _version, reason: _reason, ...changes } = v;
      void _id; void _version; void _reason;
      const updated = executiveInput.parse({ ...previous, ...changes });
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, version: v.expectedVersion }, data: { title: updated.title, payload: JSON.stringify(updated), version: { increment: 1 } } })).count !== 1) throw new AccessError("Stale version; refresh before editing");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: row.status, reason: "Configuration updated: " + v.reason } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: row.organizationId, projectId: row.projectId, entityType: "ExecutiveRecord", entityId: row.id, action: domain(row.kind) + ".updated", result: "SUCCESS", metadata: { previous: JSON.parse(row.payload), updated: JSON.parse(JSON.stringify(updated)) } });
      return db.executiveRecord.findUniqueOrThrow({ where: { id: row.id } });
    });
  }
  async function dashboard(userId: string, raw: unknown = {}, now = new Date(), projection: { tasks?: boolean } = {}) {
    const filter = executiveFilter.parse(raw), ctx = await createAccessContext(userId, client);
    if (!ctx.active) throw new AccessError("Access denied");
    if (filter.organizationId) await ctx.requireAccess("executive.read", { organizationId: filter.organizationId, projectId: filter.projectId });
    if (filter.projectId) { const p = await client.project.findUnique({ where: { id: filter.projectId } }); if (!p) throw new AccessError("Access denied"); await ctx.requireAccess("executive.read", { organizationId: p.organizationId, projectId: p.id }); await ctx.requireAccess("project.read", { organizationId: p.organizationId, projectId: p.id }); if (filter.organizationId && !ancestry(ctx.nodes, p.organizationId).some(n => n.id === filter.organizationId)) throw new AccessError("Project is outside selected scope"); }
    if (filter.productId) { const p = await client.product.findUnique({ where: { id: filter.productId } }); if (!p) throw new AccessError("Access denied"); await ctx.requireAccess("product.read", p); await ctx.requireAccess("executive.read", p); if (filter.organizationId && !ancestry(ctx.nodes, p.organizationId).some(n => n.id === filter.organizationId)) throw new AccessError("Product is outside selected scope"); }
    if (!ctx.grants.some(g => g.key === "executive.read")) throw new AccessError("Access denied");
    const from = filter.from ?? new Date(now.getTime() - 7 * 86400000), until = filter.until ?? now;
    if (from > until) throw new AccessError("Invalid period");
    const scopeMatch = (s: ResourceScope) => (!filter.organizationId || ancestry(ctx.nodes, s.organizationId).some(n => n.id === filter.organizationId)) && (!filter.projectId || s.projectId === filter.projectId);
    async function sourceCoverage(permission: string) {
      if (ctx.organizationIds(permission).some(id => scopeMatch({ organizationId: id, projectId: filter.projectId }) && ctx.organizationIds("executive.read").includes(id))) return true;
      for (const g of ctx.grants.filter(g => g.key === permission && g.projectId)) {
        const scope = { organizationId: g.organizationId!, projectId: g.projectId };
        if (scopeMatch(scope) && (await ctx.decide("executive.read", scope)).allowed) return true;
      }
      return false;
    }
    const authorized = async (rows: Source[]) => {
      const result: Source[] = [];
      for (const s of rows) if (scopeMatch(s) && (await ctx.decide("executive.read", s)).allowed) result.push(s);
      return result;
    };
    const sources: Record<string, Source[]> = {};
    const coverage: Record<string, boolean> = {};
    for (const [kind, type, permission] of [["projects", "PROJECT", "project.read"], ["tasks", "TASK", "task.read"], ["goals", "GOAL", "goal.read"], ["milestones", "MILESTONE", "milestone.read"], ["blockers", "BLOCKER", "blocker.read"], ["dependencies", "DEPENDENCY", "dependency.read"]] as const) {
      let rows = await execution.list(userId, kind);
      if (type === "DEPENDENCY") {
        const safe = [];
        for (const row of rows) if ("taskId" in row && "prerequisiteId" in row) {
          try {
            const task = await resolveResource(client, ctx, "TASK", row.taskId), prerequisite = await resolveResource(client, ctx, "TASK", row.prerequisiteId);
            await ctx.requireAccess("executive.read", task); await ctx.requireAccess("executive.read", prerequisite); safe.push(row);
          } catch (e) { if (!(e instanceof AccessError)) throw e; }
        }
        rows = safe;
      }
      sources[type] = await authorized(rows.map(r => source(r, type)));
      coverage[type] = await sourceCoverage(permission);
    }
    if (filter.productId) {
      const projects = new Set(sources.PROJECT.filter(p => p.productId === filter.productId).map(p => p.id));
      for (const type of Object.keys(sources)) sources[type] = sources[type].filter(r => r.productId === filter.productId || !!r.projectId && projects.has(r.projectId));
    }
    for (const [kind, type] of [["approvals", "APPROVAL"], ["escalations", "ESCALATION"], ["requests", "REQUEST"], ["notifications", "NOTIFICATION"], ["reminders", "REMINDER"], ["instances", "INSTANCE"]] as const) {
      const operationRows = await operations.list(userId, kind);
      sources[type] = await authorized(operationRows.map(r => source(r, type)));
      if (type === "APPROVAL" || type === "NOTIFICATION") for (const row of sources[type]) row.ownerPersonId = ctx.user!.personId;
      if (type === "ESCALATION" || type === "REMINDER") {
        const assignments = operationRows as { id: string; responsibleUserId?: string; recipientUserId?: string }[];
        const people = await boundedRead(take => client.user.findMany({ take, where: { id: { in: assignments.map(r => r.responsibleUserId ?? r.recipientUserId ?? "") } }, select: { id: true, personId: true } }));
        for (const row of sources[type]) { const assigned = assignments.find(r => r.id === row.id); row.ownerPersonId = people.find(p => p.id === (assigned?.responsibleUserId ?? assigned?.recipientUserId))?.personId ?? null; }
      }
      if (filter.productId) sources[type] = sources[type].filter(r => sources.PROJECT.some(p => p.id === r.projectId));
      const key = ({ APPROVAL: "approval", INSTANCE: "workflow" } as Record<string, string>)[type] ?? type.toLowerCase();
      coverage[type] = await sourceCoverage(key + ".read");
    }
    const allRecords = await records(userId, now);
    const recordRows = allRecords.filter(r => scopeMatch(r) && (!filter.productId || sources.PROJECT.some(p => p.id === r.projectId)));
    const events = await boundedRead(take => client.operationalEvent.findMany({ take, where: { AND: [{ OR: [{ organizationId: { in: ctx.organizationIds("event.read").filter(id => ctx.organizationIds("executive.read").includes(id)) } }, { projectId: { in: ctx.grants.filter(g => g.key === "event.read" && g.projectId).map(g => g.projectId!) } }] }, { OR: [{ status: "FAILED" }, { createdAt: { gte: from, lte: until }, eventType: { in: ["project.created", "project.status_changed", "project.reopened", "goal.status_changed", "approval.approved", "approval.rejected", "organization.created", "organization.updated", "company.created", "company.updated", "kpi.status_changed"] } }] }] }, orderBy: { createdAt: "desc" } }));
    const visibleEvents = [];
    const typeMap: Record<string, typeof resourceTypes[number]> = { project: "PROJECT", task: "TASK", goal: "GOAL", milestone: "MILESTONE", approval: "APPROVAL", siaapproval: "APPROVAL", request: "REQUEST", operationalrequest: "REQUEST", workflowinstance: "INSTANCE", organization: "ORGANIZATION", program: "PROGRAM", batch: "BATCH", location: "LOCATION" };
    for (const e of events) {
      if (!scopeMatch(e) || !(await ctx.decide("executive.read", e)).allowed || !(await ctx.decide("event.read", e)).allowed || filter.productId && !sources.PROJECT.some(p => p.id === e.projectId)) continue;
      try {
        if (e.entityType === "ExecutiveRecord") { if (!recordRows.some(r => r.id === e.entityId)) continue; }
        else { const actual = await eventSource(client, ctx, e); if (!scopeMatch(actual)) continue; }
        visibleEvents.push(e);
      } catch (e) { if (!(e instanceof AccessError)) throw e; }
    }
    sources.EVENT = visibleEvents.filter(e => e.status === "FAILED").map(e => source(e, "EVENT"));
    coverage.EVENT = await sourceCoverage("event.read");
    const attention: Attention[] = [];
    function add(s: Source, kind: string, severity: Severity, explanation: string, nextAction: string) {
      const key = `${kind}:${s.type}:${s.id}`, saved = recordRows.find(r => r.kind === "ATTENTION" && r.sourceKey === key);
      attention.push({ ...s, key, severity, explanation, nextAction, recordId: saved?.id ?? null, version: saved?.version ?? 0, handlingStatus: saved?.status ?? "NEW", active: true });
    }
    const horizon = new Date(now.getTime() + 7 * 86400000);
    const overdue = (s: Source) => !!s.dueAt && s.dueAt < now && !closed(s.status);
    for (const s of sources.TASK) if (overdue(s) && ["HIGH", "CRITICAL"].includes(s.priority)) add(s, "OVERDUE_TASK", s.priority as Severity, `${s.priority.toLowerCase()} priority task is past its due date`, "Review assignment and agree a recovery date");
    for (const s of sources.PROJECT) if (s.status === "BLOCKED") add(s, "BLOCKED_PROJECT", "HIGH", "Project is explicitly blocked", "Review blockers with the accountable owner");
    for (const s of sources.GOAL) if (["AT_RISK", "MISSED"].includes(s.status)) add(s, "GOAL_CONCERN", s.status === "MISSED" ? "HIGH" : "MEDIUM", "Goal status is " + s.status.toLowerCase().replaceAll("_", " "), "Review target and supporting work");
    for (const s of sources.APPROVAL) if (overdue(s) && s.status === "PENDING") add(s, "OVERDUE_APPROVAL", "HIGH", "Pending approval has reached its expiry; review the request rather than replaying the decision", "Open the original approval policy");
    for (const s of sources.ESCALATION) if (!closed(s.status)) add(s, "ESCALATION", "HIGH", "An explicit escalation remains unresolved", "Contact the designated responsible person");
    for (const s of sources.EVENT) add(s, "OPERATIONAL_FAILURE", "HIGH", "An authorized operational event records a failure", "Inspect the source failure before retrying");
    for (const s of [...sources.TASK, ...sources.MILESTONE, ...sources.PROJECT, ...sources.GOAL]) if (!closed(s.status) && s.dueAt && s.dueAt >= now && s.dueAt <= horizon && (s.type === "MILESTONE" || ["HIGH", "CRITICAL"].includes(s.priority))) add(s, "IMPORTANT_DEADLINE", "MEDIUM", "Important deadline falls within seven days", "Confirm readiness with the owner");
    for (const r of recordRows) if (r.kind === "KPI" && ["AT_RISK", "OFF_TRACK"].includes(r.status)) add({ ...source(r, "KPI"), href: "/app/executive/kpis" }, "KPI_CONCERN", r.status === "OFF_TRACK" ? "HIGH" : "MEDIUM", `Attested actual ${r.actual} ${r.payload.unit} against target ${r.payload.target}; ${r.payload.direction === "LOWER" ? "lower" : "higher"} is preferred`, "Review the attested source and recovery action");
    attention.sort((a, b) => rank[b.severity] - rank[a.severity] || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || a.key.localeCompare(b.key));
    const metricDefinitions: [string, string, string, (s: Source) => boolean][] = [
      ["Active projects", "PROJECT", "Status ACTIVE", s => s.status === "ACTIVE"], ["Blocked projects", "PROJECT", "Status BLOCKED", s => s.status === "BLOCKED"],
      ["Overdue tasks", "TASK", "Non-terminal tasks with due date before calculatedAt", overdue], ["Active goals", "GOAL", "Status ACTIVE", s => s.status === "ACTIVE"],
      ["Goal concerns", "GOAL", "Status AT_RISK or MISSED", s => ["AT_RISK", "MISSED"].includes(s.status)], ["My pending approvals", "APPROVAL", "Current viewer's assigned pending approvals", s => s.status === "PENDING"],
      ["Unresolved escalations", "ESCALATION", "Non-terminal explicit escalations", s => !closed(s.status)], ["Failed events", "EVENT", "Authorized source-backed FAILED operational events", () => true],
      ["Unresolved requests", "REQUEST", "Non-terminal requests", s => !closed(s.status)], ["Pending reminders", "REMINDER", "Status PENDING", s => s.status === "PENDING"],
      ["Workflow failures", "INSTANCE", "Status FAILED", s => s.status === "FAILED"], ["My important notifications", "NOTIFICATION", "Current recipient's unread HIGH or CRITICAL notifications", s => s.status === "UNREAD" && ["HIGH", "CRITICAL"].includes(s.priority)]
    ];
    function metricsFor(scope: ResourceScope | null): Metric[] {
      const match = (s: ResourceScope) => !scope || (scope.projectId ? s.projectId === scope.projectId : ancestry(ctx.nodes, s.organizationId).find(n => n.type === "COMPANY")?.id === scope.organizationId);
      return metricDefinitions.map(([name, type, calculation, predicate]) => {
        const rows = sources[type].filter(s => match(s));
        const key = ({ PROJECT: "project", TASK: "task", GOAL: "goal", APPROVAL: "approval", INSTANCE: "workflow", EVENT: "event" } as Record<string, string>)[type] ?? type.toLowerCase();
        const available = scope ? ctx.organizationIds(key + ".read").some(id => match({ organizationId: id }) && scopeMatch({ organizationId: id, projectId: filter.projectId }) && ctx.organizationIds("executive.read").includes(id)) || rows.length > 0 : coverage[type];
        return { name, definition: calculation, scope, value: available ? rows.filter(predicate).length : null, unit: "count", period: "Current authorized snapshot", source: type, calculation, status: available ? "AVAILABLE" : "NO_DATA", calculatedAt: now, lastUpdated: rows.length ? new Date(Math.max(...rows.map(r => r.updatedAt?.getTime() ?? 0))) : null, coverage: "AUTHORIZED_RECORDS_ONLY", entities: rows.filter(predicate).map(r => ({ id: r.id, title: r.title, href: r.href })) };
      });
    }
    const metrics = metricsFor(null);
    const organizations = await boundedRead(take => client.organization.findMany({ take, where: { id: { in: ctx.organizationIds("organization.read").filter(id => ctx.organizationIds("executive.read").includes(id)) } }, select: { id: true, name: true, type: true } }));
    const scopeOptions = [...organizations];
    for (const p of sources.PROJECT) if (!scopeOptions.some(o => o.id === p.organizationId)) scopeOptions.push({ id: p.organizationId, name: "Project scope: " + p.title, type: ctx.nodes.find(n => n.id === p.organizationId)!.type });
    const companies = [];
    for (const org of organizations.filter(o => o.type === "COMPANY" && (!filter.organizationId || ancestry(ctx.nodes, o.id).some(n => n.id === filter.organizationId) || ancestry(ctx.nodes, filter.organizationId).some(n => n.id === o.id)))) {
      if (!(await ctx.decide("company.read", { organizationId: org.id })).allowed) continue;
      const companyMetrics = metricsFor({ organizationId: org.id });
      const reasons = companyMetrics.filter(m => ["Blocked projects", "Overdue tasks", "Goal concerns", "Unresolved escalations", "Failed events", "Workflow failures"].includes(m.name) && m.value! > 0).map(m => `${m.value} ${m.name.toLowerCase()}`);
      companies.push({ ...org, metrics: companyMetrics, health: reasons.length ? "AT_RISK" : companyMetrics.some(m => m.status === "NO_DATA") ? "UNKNOWN" : "NO_CURRENT_CONCERNS", reasons, coverage: "Authorized records only; not a complete company assessment" });
    }
    const changes = visibleEvents.filter(e => e.createdAt >= from && e.createdAt <= until && /^(project\.(created|status_changed|reopened)|goal\.status_changed|approval\.(approved|rejected)|organization\.(created|updated)|company\.(created|updated)|kpi\.status_changed)$/.test(e.eventType) && JSON.parse(e.metadata ?? "{}").origin !== "USER_REPORTED").map(e => ({ id: e.id, title: e.eventType.replaceAll(".", " ").replaceAll("_", " "), organizationId: e.organizationId, entityId: e.entityId, createdAt: e.createdAt, href: typeMap[e.entityType.toLowerCase()] === "PROJECT" ? `/app/execution/projects/${e.entityId}` : "/app/operations/events" }));
    for (const s of sources.TASK) if (s.dueAt && s.dueAt >= from && s.dueAt <= until && s.dueAt < now && !closed(s.status)) changes.push({ id: "deadline:" + s.id, title: `Task became overdue: ${s.title}`, organizationId: s.organizationId, entityId: s.id, createdAt: s.dueAt, href: s.href });
    const structural = await boundedRead(take => client.auditEvent.findMany({ take, where: { organizationId: { in: ctx.organizationIds("activity.read").filter(id => ctx.organizationIds("executive.read").includes(id)) }, action: { in: ["organizations.created", "organizations.updated", "departments.created", "departments.updated", "teams.created", "teams.updated", "companies.created", "companies.updated"] }, result: "SUCCESS", createdAt: { gte: from, lte: until } }, orderBy: { createdAt: "desc" } }));
    for (const a of structural) {
      if (!a.organizationId || !scopeMatch({ organizationId: a.organizationId }) || filter.productId || JSON.parse(a.metadata ?? "{}").origin === "USER_REPORTED") continue;
      const permission = a.entityType === "companies" ? "company.read" : "organization.read";
      if (!(await ctx.decide(permission, { organizationId: a.organizationId })).allowed) continue;
      changes.push({ id: "audit:" + a.id, title: a.action.replaceAll(".", " "), organizationId: a.organizationId, entityId: a.entityId!, createdAt: a.createdAt, href: "/app/business/" + (a.entityType === "companies" ? "companies" : "organizations") });
    }
    changes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const projectIntelligence = sources.PROJECT.map(p => {
      const tasks = sources.TASK.filter(t => t.projectId === p.id), blockers = sources.BLOCKER.filter(b => b.projectId === p.id && b.status === "OPEN");
      const reasons = [...(p.status === "BLOCKED" ? ["Project status is BLOCKED"] : []), ...(tasks.some(overdue) ? [`${tasks.filter(overdue).length} overdue tasks`] : []), ...(blockers.length ? [`${blockers.length} open blockers`] : [])];
      const milestones = sources.MILESTONE.filter(m => m.projectId === p.id && !closed(m.status));
      const dependencies = sources.DEPENDENCY.filter(d => d.projectId === p.id && d.status !== "COMPLETED"), approvals = sources.APPROVAL.filter(a => a.projectId === p.id && a.status === "PENDING");
      if (milestones.some(m => m.dueAt && m.dueAt <= horizon)) reasons.push("Milestone due within seven days or overdue");
      if (dependencies.length) reasons.push(`${dependencies.length} unresolved dependencies`);
      if (approvals.length) reasons.push(`${approvals.length} approvals assigned to you are pending`);
      return { ...p, health: reasons.length ? "AT_RISK" : "UNKNOWN", reasons, tasks, blockers, milestones, dependencies, approvals, changes: changes.filter(c => c.entityId === p.id || sources.TASK.some(t => t.projectId === p.id && t.id === c.entityId) || sources.GOAL.some(g => g.projectId === p.id && g.id === c.entityId)) };
    });
    const goalIntelligence = [];
    const progressHistory = await boundedRead(take => client.progressUpdate.findMany({ take, where: { goalId: { in: sources.GOAL.map(g => g.id) } }, orderBy: { createdAt: "asc" } }));
    for (const g of sources.GOAL) {
      const history = progressHistory.filter(h => h.goalId === g.id);
      const linkedTasks = sources.TASK.filter(t => t.goalId === g.id), prerequisiteIds = sources.DEPENDENCY.filter(d => linkedTasks.some(t => t.id === d.relatedTaskId)).map(d => d.prerequisiteId);
      goalIntelligence.push({ ...g, trend: trend(history.map(h => h.value)), supportingProjects: sources.PROJECT.filter(p => p.id === g.projectId), blockers: sources.BLOCKER.filter(b => (b.goalId === g.id || linkedTasks.some(t => t.id === b.relatedTaskId)) && b.status === "OPEN"), overdueDependencies: sources.TASK.filter(t => prerequisiteIds.includes(t.id) && overdue(t)) });
    }
    const deadlines = [...sources.TASK, ...sources.MILESTONE, ...sources.GOAL, ...sources.PROJECT].filter(s => s.dueAt && s.dueAt >= now && s.dueAt <= horizon && !closed(s.status)).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
    const wins = [...sources.PROJECT, ...sources.TASK, ...sources.GOAL].filter(s => s.completionDate && s.completionDate >= from && s.completionDate <= until);
    const visibleAttention = attention.filter(a => (!filter.severity || a.severity === filter.severity) && (!filter.status || a.handlingStatus === filter.status));
    const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
    const people = await execution.peopleOptions(userId);
    const personMemberships = await boundedRead(take => client.membership.findMany({ take, where: { ...activeMembershipWhere(), personId: { in: people.map(p => p.id) }, organizationId: { in: ctx.nodes.map(n => n.id) } }, select: { personId: true, organizationId: true, projectId: true, scope: true } }));
    const eligiblePeople = new Set<string>();
    for (const m of personMemberships) {
      const scopes = m.projectId ? [{ organizationId: m.organizationId, projectId: m.projectId }] : m.scope === "DESCENDANTS" ? ctx.nodes.filter(n => ancestry(ctx.nodes, n.id).some(a => a.id === m.organizationId)).map(n => ({ organizationId: n.id, projectId: filter.projectId })) : [{ organizationId: m.organizationId, projectId: filter.projectId }];
      for (const scope of scopes) if (scopeMatch(scope) && (await ctx.decide("executive.read", scope)).allowed && (await ctx.decide("person.read", scope)).allowed) { eligiblePeople.add(m.personId); break; }
    }
    return { calculatedAt: now, sourcePeriod: { from, until }, lastUpdated: [...Object.values(sources).flat(), ...recordRows].reduce<Date | null>((last, r) => r.updatedAt && (!last || r.updatedAt > last) ? r.updatedAt : last, null),
      metrics, companies, attention: visibleAttention, records: recordRows.filter(r => !filter.status || r.status === filter.status), changes, deadlines, wins, projects: projectIntelligence, goals: goalIntelligence, tasks: projection.tasks ? sources.TASK : [],
      decisions: [...sources.APPROVAL.filter(a => a.status === "PENDING"), ...recordRows.filter(r => r.kind === "DECISION" && ["PENDING", "DEFERRED"].includes(r.status)).map(r => source(r, "DECISION"))],
      operations: Object.fromEntries(["APPROVAL", "ESCALATION", "REQUEST", "NOTIFICATION", "REMINDER", "INSTANCE", "EVENT"].map(k => [k, sources[k]])),
      briefing: { date: now.toISOString().slice(0, 10), timezone: "UTC", changes: changes.filter(c => c.createdAt >= todayStart), attention: visibleAttention.filter(a => !["RESOLVED", "DISMISSED"].includes(a.handlingStatus)), deadlines, blockedWork: sources.PROJECT.filter(p => p.status === "BLOCKED"), concerns: sources.GOAL.filter(g => ["AT_RISK", "MISSED"].includes(g.status)), wins },
      options: { organizations: scopeOptions, people: people.filter(p => eligiblePeople.has(p.id)), projects: sources.PROJECT.map(p => ({ id: p.id, name: p.title, organizationId: p.organizationId })), products: await boundedRead(take => client.product.findMany({ take, where: { organizationId: { in: ctx.organizationIds("product.read").filter(id => ctx.organizationIds("executive.read").includes(id)) } }, select: { id: true, name: true } })) },
      capabilities: Object.fromEntries(["decision.manage", "kpi.manage", "risk.manage", "opportunity.manage", "attention.manage"].map(k => [k, { organizations: ctx.organizationIds(k).filter(id => ctx.organizationIds("executive.read").includes(id)), projects: ctx.grants.filter(g => g.key === k && g.projectId && sources.PROJECT.some(p => p.id === g.projectId)).map(g => g.projectId!) }])) };
  }
  async function handleAttention(userId: string, key: string, status: string, reason: string, expectedVersion: number) {
    z.enum(attentionStates).parse(status); z.string().trim().min(1).max(4000).parse(reason);
    const data = await dashboard(userId), item = data.attention.find(a => a.key === key);
    if (!item) throw new AccessError("Signal is not currently active or accessible");
    if (item.recordId) return transition(userId, { id: item.recordId, status, reason, expectedVersion });
    return client.$transaction(async db => {
      const ctx = await createAccessContext(userId, db);
      await ctx.requireAccess("executive.read", item); await ctx.requireAccess("attention.manage", item);
      await attentionSource(db, ctx, item.type, item.id);
      if (!lifecycles.ATTENTION.NEW.includes(status) || expectedVersion !== 0 || !ctx.user?.personId) throw new AccessError("Invalid attention action");
      const row = await db.executiveRecord.create({ data: { kind: "ATTENTION", organizationId: item.organizationId, projectId: item.projectId, title: item.title, ownerPersonId: ctx.user.personId, sourceKey: key, status, version: 1, payload: JSON.stringify({ sourceType: item.type, sourceId: item.id }), dueAt: item.dueAt } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: "NEW", toStatus: status, reason } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user.personId, organizationId: row.organizationId, projectId: row.projectId, action: "attention." + status.toLowerCase(), entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS" });
      return row;
    });
  }
  return { dashboard, save, transition, revise, records, handleAttention };
}
export const executiveService = createExecutiveService();
