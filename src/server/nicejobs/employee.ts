import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext, type AgentConstraint } from "@/server/authorization/engine";
import { activeMembershipWhere, ancestry } from "@/server/authorization/business-scope";
import { createExecutionService } from "@/server/domain/execution-service";
import { operationalEvent, notify } from "@/server/domain/operational-events";
import { resolveResource } from "@/server/domain/operations-scope";
import { unavailableAttachments, type PrivateAttachmentResolver } from "@/server/communications/providers";
import { createOnboardingService } from "./onboarding";
import { employeeCommand, employeeQuery, workQuery } from "./employee-input";
import { NiceJobsError } from "./input";
import { workerLeadSource, leadReportSnapshot, managerLeadCounts } from "./lead-sources";
import { workerKnowledgeSnapshot } from "./knowledge-access";
import { isTimezone } from "@/lib/timezone";

type DB = Prisma.TransactionClient;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const open = ["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED"] as const;
const assignmentInclude = { profile: { include: { person: { select: { id: true, displayName: true, status: true } } } }, version: { include: { template: true } }, division: { select: { id: true, name: true, parentId: true, status: true } }, manager: { select: { id: true, displayName: true, status: true } }, onboarding: { select: { id: true, status: true, applicationId: true } }, readinessReview: { select: { id: true, kind: true, outcome: true } } } satisfies Prisma.NiceJobsAssignmentInclude;
type Assignment = Prisma.NiceJobsAssignmentGetPayload<{ include: typeof assignmentInclude }>;
export function localDay(instant: Date, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: isTimezone(timezone) ? timezone : "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  return ["year", "month", "day"].map(k => p.find(v => v.type === k)!.value).join("-");
}
export function dayBounds(date: string, timezone: string) {
  const utc = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== date) throw new NiceJobsError("Invalid report date");
  const boundary = (day: string, center: number) => {
    let lo = center - 36 * 3600000, hi = center + 36 * 3600000;
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (localDay(new Date(mid), timezone) < day) lo = mid; else hi = mid; }
    return new Date(hi);
  };
  return { start: boundary(date, utc), end: boundary(new Date(utc + 86400000).toISOString().slice(0, 10), utc + 86400000) };
}
export function createEmployeeService(client: PrismaClient = prisma, now: () => Date = () => new Date(), attachments: PrivateAttachmentResolver = unavailableAttachments) {
  const onboarding = createOnboardingService(client, now, attachments).internal;
  async function boundary(db: DB, userId: string, constraint?: AgentConstraint) {
    const company = await db.organization.findUnique({ where: { slug: "aira-skill-city" }, include: { company: true } });
    const product = company && await db.product.findUnique({ where: { organizationId_slug: { organizationId: company.id, slug: "nice-jobs" } }, include: { division: true } });
    if (!company || company.type !== "COMPANY" || company.status !== "ACTIVE" || company.company?.status !== "ACTIVE" || !product || product.status !== "ACTIVE" || product.division?.slug !== "aira-career-hub" || product.division.parentId !== company.id || product.division.status !== "ACTIVE") throw new AccessError("Nice Jobs unavailable");
    const ctx = await createAccessContext(userId, db, constraint, { organizationId: company.id });
    if (!ctx.active || !ctx.user?.personId) throw new AccessError("Active human account required");
    const account = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    return { ctx, company, product, personId: ctx.user.personId, userId, timezone: account.timezone ?? "UTC" };
  }
  type Boundary = Awaited<ReturnType<typeof boundary>>;
  async function member(db: DB, b: Boundary, personId: string, divisionId: string) {
    const path = ancestry(b.ctx.nodes, divisionId).map(n => n.id);
    if (!await db.person.findFirst({ where: { id: personId, status: "ACTIVE", memberships: { some: { ...activeMembershipWhere(now()), projectId: null, scopeKey: "organization", OR: [{ organizationId: divisionId }, { organizationId: { in: path }, scope: "DESCENDANTS" }] } } }, select: { id: true } })) throw new AccessError("Active business-area membership required");
  }
  function relation(b: Boundary, a: Assignment) {
    if (a.profile.companyId !== b.company.id || a.version.template.companyId !== b.company.id || a.version.template.productId !== b.product.id || a.division.parentId !== b.company.id || a.division.status !== "ACTIVE" || a.profile.person.status !== "ACTIVE") throw new AccessError("Assignment unavailable");
  }
  async function active(db: DB, b: Boundary, a: Assignment) {
    relation(b, a);
    if (a.status !== "ACTIVE" || a.lifecycle !== "ACTIVE" || !a.activatedAt || !a.onboardingId || !a.readinessReviewId || a.onboarding?.status !== "READY" || a.readinessReview?.kind !== "READINESS" || a.readinessReview.outcome !== "READY" || !a.startDate || a.startDate > now() || a.endDate && a.endDate <= now()) throw new AccessError("Active readiness-backed assignment required");
    await member(db, b, a.profile.personId, a.divisionId);
  }
  async function own(db: DB, b: Boundary) {
    const rows = await db.niceJobsAssignment.findMany({ where: { profile: { companyId: b.company.id, personId: b.personId }, status: "ACTIVE", lifecycle: "ACTIVE", onboardingId: { not: null }, readinessReviewId: { not: null } }, include: assignmentInclude, take: 2 });
    if (rows.length !== 1) throw new AccessError("No unique active assignment is available");
    await active(db, b, rows[0]); await b.ctx.requireAccess("nicejobs.workspace.self", { organizationId: rows[0].divisionId });
    return rows[0];
  }
  async function management(db: DB, b: Boundary, id: string, capability = "nicejobs.workspace.read") {
    const a = await db.niceJobsAssignment.findUnique({ where: { id }, include: assignmentInclude });
    if (!a) throw new AccessError("Worker unavailable"); relation(b, a);
    if (a.profile.personId === b.personId) throw new AccessError("Independent management required");
    await b.ctx.requireAccess("nicejobs.workspace.read", { organizationId: a.divisionId }); await b.ctx.requireAccess(capability, { organizationId: a.divisionId }); await b.ctx.requireAccess("person.read", { organizationId: a.divisionId });
    return a;
  }
  function taskWhere(b: Boundary, a: Assignment): Prisma.TaskWhereInput {
    const orgs = b.ctx.organizationIds("task.read"), projects = b.ctx.grants.filter(g => g.key === "task.read" && g.projectId).map(g => g.projectId!);
    const selfRead = a.profile.personId === b.personId && b.ctx.organizationIds("nicejobs.work.read").includes(a.divisionId);
    return { niceJobsAssignmentId: a.id, assigneePersonId: a.profile.personId, organizationId: a.divisionId, OR: [{ organizationId: { in: orgs } }, { projectId: { in: projects } }, ...(selfRead ? [{ niceJobsAssignmentId: a.id }] : [])] };
  }
  async function task(db: DB, b: Boundary, a: Assignment, id: string) {
    const t = await db.task.findFirst({ where: { AND: [taskWhere(b, a), { id }] } });
    if (!t) throw new AccessError("Assigned task unavailable");
    if (a.profile.personId === b.personId && (await b.ctx.decide("nicejobs.work.read", t)).allowed) await b.ctx.requireAccess("nicejobs.work.read", t);
    else await b.ctx.requireAccess("task.read", t);
    return t;
  }
  async function event(db: DB, b: Boundary, divisionId: string, id: string, type: string, action: string, reference: string, fingerprint: string, reason?: string) {
    return operationalEvent(db, { actorUserId: b.userId, actorPersonId: b.personId, organizationId: divisionId, action: "nicejobs.work." + action.toLowerCase(), entityType: type, entityId: id, result: "SUCCESS", reference, metadata: { fingerprint, ...(reason ? { reason } : {}) } });
  }
  async function notice(db: DB, b: Boundary, a: Assignment, title: string, ref: string, manager = false) {
    const personId = manager ? a.managerId : a.profile.personId;
    if (!personId) return;
    const accounts = await db.user.findMany({ where: { personId, status: "ACTIVE" }, select: { id: true }, take: 26 });
    if (accounts.length > 25) throw new NiceJobsError("Notification recipient limit exceeded");
    for (const u of accounts) {
      const ctx = await createAccessContext(u.id, db, undefined, { organizationId: b.company.id });
      if (!(await ctx.decide("notification.read", { organizationId: a.divisionId })).allowed || !(await ctx.decide(manager ? "nicejobs.workspace.read" : "nicejobs.workspace.self", { organizationId: a.divisionId })).allowed) continue;
      await notify(db, b.userId, u.id, { organizationId: a.divisionId, resourceType: "NICE_JOBS_ASSIGNMENT", resourceId: a.id }, "NICE_JOBS_WORK", title, a.version.title, ref + ":" + u.id);
    }
  }
  async function activation(db: DB, b: Boundary, c: Extract<ReturnType<typeof employeeCommand.parse>, { operation: "ACTIVATE" }>) {
    const core = await onboarding.boundary(db, b.userId, false), e = await onboarding.load(db, core, c.applicationReference, false), scope = { organizationId: e.application.divisionId };
    if (e.application.candidateId === b.personId) throw new AccessError("Candidate self-activation is forbidden");
    await b.ctx.requireAccess("nicejobs.worker.activate", scope); await b.ctx.requireAccess("nicejobs.worker.assign", scope); await b.ctx.requireAccess("person.read", scope);
    const p = onboarding.plan(e), checks = await onboarding.requirements(db, e, p);
    if (e.status !== "READY" || e.readinessStatus !== "READY" || !e.completedAt || !onboarding.ready(checks) || !e.application.area.version.publishedAt || e.offer.expiresAt && e.offer.acceptedAt! >= e.offer.expiresAt) throw new NiceJobsError("Valid completed readiness and accepted offer required");
    const proof = await db.niceJobsTrainingReview.findFirst({ where: { onboardingId: e.id, kind: "READINESS", outcome: "READY" }, include: { event: { include: { audit: true } } }, orderBy: [{ reviewedAt: "desc" }, { id: "desc" }] });
    const evidence = proof?.requirements ? JSON.parse(proof.requirements) : null;
    if (!proof || proof.reviewerPersonId === e.application.candidateId || proof.reviewerUserId !== e.readinessReviewerUserId || proof.reviewerPersonId !== e.readinessReviewerPersonId || proof.event.status !== "SUCCEEDED" || proof.event.eventType !== "nicejobs.onboarding.decide_readiness" || proof.event.entityId !== e.id || proof.event.organizationId !== scope.organizationId || proof.event.audit?.actorPersonId !== proof.reviewerPersonId || proof.event.audit?.result !== "SUCCESS" || evidence?.versionId !== e.plan.versionId || evidence.offerId !== e.offerId || evidence.planFingerprint !== e.plan.fingerprint || !onboarding.ready(evidence.checks)) throw new NiceJobsError("Auditable readiness decision required");
    const acceptance = await db.niceJobsApplicationHistory.findFirst({ where: { applicationId: e.applicationId, action: "ACCEPT_OFFER" } });
    const acceptanceEvent = acceptance ? await db.operationalEvent.findFirst({ where: { id: acceptance.eventId, entityType: "NiceJobsApplication", entityId: e.applicationId, eventType: "nicejobs.application.accept_offer", organizationId: scope.organizationId, status: "SUCCEEDED" }, include: { audit: true } }) : null;
    if (!acceptance || !acceptanceEvent || acceptanceEvent.audit?.result !== "SUCCESS" || acceptanceEvent.audit.actorPersonId !== e.application.candidateId || JSON.parse(acceptance.evidence ?? "{}").offerReference !== e.offer.reference) throw new NiceJobsError("Accepted offer evidence required");
    await member(db, b, e.application.candidateId, scope.organizationId);
    if (c.managerId) { if (c.managerId === e.application.candidateId) throw new NiceJobsError("Self-supervision is forbidden"); await member(db, b, c.managerId, scope.organizationId); }
    const existing = await db.niceJobsAssignment.findUnique({ where: { onboardingId: e.id }, include: assignmentInclude });
    if (existing) { if (existing.managerId !== (c.managerId ?? null) || existing.startDate?.getTime() !== c.startDate.getTime()) throw new NiceJobsError("Activation replay mismatch"); return existing; }
    if (c.revision !== e.revision) throw new NiceJobsError("Readiness changed; refresh before activation");
    if (c.startDate > now()) throw new NiceJobsError("Activation cannot start in the future");
    const profile = await db.niceJobsWorkerProfile.upsert({ where: { companyId_personId: { companyId: b.company.id, personId: e.application.candidateId } }, update: {}, create: { companyId: b.company.id, personId: e.application.candidateId } });
    if (await db.niceJobsAssignment.findFirst({ where: { profileId: profile.id, status: { not: "ENDED" } }, select: { id: true } })) throw new NiceJobsError("An open assignment conflicts with activation; explicit reconciliation required");
    return db.niceJobsAssignment.create({ data: { profileId: profile.id, versionId: e.plan.versionId, divisionId: scope.organizationId, managerId: c.managerId, status: "ACTIVE", lifecycle: "ACTIVE", startDate: c.startDate, onboardingId: e.id, readinessReviewId: proof.id, activatedAt: now(), activatedByUserId: b.userId }, include: assignmentInclude });
  }
  async function snapshot(db: DB, b: Boundary, a: Assignment, reportDate: string) {
    await b.ctx.requireAccess("nicejobs.work.read", { organizationId: a.divisionId });
    await b.ctx.requireAccess("nicejobs.blocker.self", { organizationId: a.divisionId });
    const range = dayBounds(reportDate, b.timezone), where = taskWhere(b, a);
    const tasks = await db.task.findMany({ where: { AND: [where, { OR: [{ status: { in: [...open] }, createdAt: { lt: range.end } }, { status: "COMPLETED", completionDate: { gte: range.start, lt: range.end } }] }] }, select: { id: true, title: true, status: true, completionDate: true, dueDate: true }, orderBy: { id: "asc" }, take: 101 });
    if (tasks.length > 100) throw new NiceJobsError("Report exceeds 100 tasks; no partial report was stored");
    const blockers = await db.executionBlocker.findMany({ where: { niceJobsAssignmentId: a.id, status: "OPEN", createdAt: { lt: range.end } }, select: { id: true, reason: true, description: true, taskId: true }, orderBy: { id: "asc" }, take: 51 });
    if (blockers.length > 50) throw new NiceJobsError("Report exceeds 50 blockers; no partial report was stored");
    return { tasks, blockers };
  }
  async function mutate(userId: string, raw: unknown) {
    const c = employeeCommand.parse(raw), fingerprint = hash({ userId, c }), reference = `nicejobs-work:${userId}:${c.idempotencyKey}`;
    return client.$transaction(async db => {
      const b = await boundary(db, userId), prior = await db.operationalEvent.findUnique({ where: { reference }, include: { audit: true } });
      // Reauthorize before returning any previously stored mutation result.
      let a: Assignment;
      if (c.operation === "ACTIVATE") a = await activation(db, b, c);
      else if ("assignmentId" in c && c.assignmentId) a = await management(db, b, c.assignmentId, c.operation === "SET_MANAGER" ? "nicejobs.work.manage" : c.operation === "REMIND" ? "reminder.manage" : "nicejobs.work.manage");
      else if (c.operation === "RESOLVE_BLOCKER") {
        const blocker = await db.executionBlocker.findUnique({ where: { id: c.blockerId }, select: { niceJobsAssignmentId: true } });
        if (!blocker?.niceJobsAssignmentId) throw new AccessError("Blocker unavailable"); a = await management(db, b, blocker.niceJobsAssignmentId, "nicejobs.blocker.manage");
      } else a = await own(db, b);
      const scope = { organizationId: a.divisionId };
      const ownOperation = ["TASK_STATE", "DAILY_REPORT", "BLOCKER"].includes(c.operation) || c.operation === "REMIND" && !c.assignmentId;
      if (ownOperation) { await active(db, b, a); await b.ctx.requireAccess(c.operation === "TASK_STATE" ? "nicejobs.work.perform" : c.operation === "DAILY_REPORT" ? "nicejobs.report.self" : c.operation === "BLOCKER" ? "nicejobs.blocker.self" : "reminder.manage", scope); }
      const transitionTask = c.operation === "TASK_STATE" ? await task(db, b, a, c.taskId) : null;
      if (c.operation === "ASSIGN_TASK") { await active(db, b, a); await b.ctx.requireAccess("task.manage", scope); await b.ctx.requireAccess("task.read", scope); }
      if (prior) { if (prior.audit?.actorPersonId !== b.personId || JSON.parse(prior.metadata ?? "{}").fingerprint !== fingerprint) throw new NiceJobsError("Replay mismatch"); return { id: prior.entityId, assignmentId: a.id }; }
      let id = a.id, type = "NiceJobsAssignment", title = "Workforce update", managerNotice = false;
      if (c.operation === "TASK_STATE") {
        const t = transitionTask!;
        if (!["TODO", "IN_PROGRESS"].includes(t.status) || c.to === "IN_PROGRESS" && t.status !== "TODO") throw new NiceJobsError("Task transition unavailable");
        if ((await db.task.updateMany({ where: { id: t.id, revision: c.revision }, data: { revision: { increment: 0 } } })).count !== 1) throw new NiceJobsError("Task changed; refresh before retrying");
        if (c.evidence) {
          if (c.evidence.attachment) { try { await attachments.authorize(userId, a.divisionId, c.evidence.attachment.reference); } catch { throw new NiceJobsError("Private evidence storage is not configured or authorized"); } }
          if (c.evidence.record) { const r = c.evidence.record.type === "TASK" ? await task(db, b, a, c.evidence.record.id) : await resolveResource(db, b.ctx, c.evidence.record.type, c.evidence.record.id); if (r.organizationId !== a.divisionId) throw new AccessError("Evidence scope mismatch"); }
          await db.taskEvidence.create({ data: { taskId: t.id, actorUserId: userId, actorPersonId: b.personId, data: JSON.stringify(c.evidence) } });
          await operationalEvent(db, { actorUserId: userId, actorPersonId: b.personId, organizationId: a.divisionId, action: "task.evidence_submitted", entityType: "Task", entityId: t.id, result: "SUCCESS" });
        }
        const narrow = async (_user: string, _db: DB = db) => {
          if (_user !== userId || _db !== db) throw new AccessError("Task operation context mismatch");
          return { ...b.ctx, requireAccess: async (key: string, s: { organizationId: string; projectId?: string | null }) => key === "task.manage" && s.organizationId === t.organizationId && (s.projectId ?? null) === t.projectId ? b.ctx.requireAccess("nicejobs.work.perform", s) : b.ctx.requireAccess(key, s) };
        };
        await createExecutionService(client, narrow).save(userId, "tasks", { organizationId: t.organizationId, projectId: t.projectId, title: t.title, description: t.description, priority: t.priority, ownerPersonId: t.ownerPersonId, assigneePersonId: t.assigneePersonId, goalId: t.goalId, milestoneId: t.milestoneId, startDate: t.startDate, dueDate: t.dueDate, estimatedHours: t.estimatedHours, status: c.to }, t.id, db);
        id = t.id; type = "Task"; title = c.to === "COMPLETED" ? "Task completed" : "Task started";
      } else if (c.operation === "ASSIGN_TASK") {
        await active(db, b, a); await b.ctx.requireAccess("task.manage", scope); await b.ctx.requireAccess("task.read", scope);
        const t = await createExecutionService(client).save(userId, "tasks", { ...c, organizationId: a.divisionId, assigneePersonId: a.profile.personId, status: "TODO" }, undefined, db);
        await db.task.update({ where: { id: t.id }, data: { niceJobsAssignmentId: a.id, evidenceRequired: c.evidenceRequired } });
        id = t.id; type = "Task"; title = "Task assigned";
      } else if (c.operation === "DAILY_REPORT") {
        if (c.reportDate !== localDay(now(), b.timezone)) throw new NiceJobsError("Reports reflect today's actual state; backdated reports are not supported");
        const previous = await db.niceJobsDailyReport.findFirst({ where: { assignmentId: a.id, reportDate: c.reportDate }, orderBy: { revision: "desc" } });
        if (previous && (previous.id !== c.supersedesId || !c.correctionReason) || !previous && (c.supersedesId || c.correctionReason)) throw new NiceJobsError("Use an explicit correction of the latest report");
        const data = await snapshot(db, b, a, c.reportDate);
        id = (await db.niceJobsDailyReport.create({ data: { assignmentId: a.id, reportDate: c.reportDate, timezone: b.timezone, revision: previous ? previous.revision + 1 : 0, supersedesId: previous?.id, correctionReason: c.correctionReason, operationalSnapshot: JSON.stringify(await leadReportSnapshot(db, b.ctx, a, dayBounds(c.reportDate, b.timezone))), taskSnapshot: JSON.stringify(data.tasks), blockerSnapshot: JSON.stringify(data.blockers), notes: c.notes, submittedByUserId: userId, submittedByPersonId: b.personId } })).id;
        type = "NiceJobsDailyReport"; title = previous ? "Daily report corrected" : "Daily report submitted"; managerNotice = true;
      } else if (c.operation === "BLOCKER") {
        const t = c.taskId ? await task(db, b, a, c.taskId) : null;
        if (t && !open.includes(t.status as typeof open[number])) throw new NiceJobsError("Closed task cannot accept blockers");
        id = (await db.executionBlocker.create({ data: { organizationId: a.divisionId, taskId: t?.id, niceJobsAssignmentId: a.id, reporterUserId: userId, ownerPersonId: a.managerId, reason: c.reason, description: c.description } })).id;
        type = "ExecutionBlocker"; title = "Blocker reported"; managerNotice = true;
      } else if (c.operation === "RESOLVE_BLOCKER") {
        if ((await db.executionBlocker.updateMany({ where: { id: c.blockerId, niceJobsAssignmentId: a.id, status: "OPEN", revision: c.revision }, data: { status: "RESOLVED", resolvedAt: now(), revision: { increment: 1 } } })).count !== 1) throw new NiceJobsError("Blocker changed or already resolved");
        id = c.blockerId; type = "ExecutionBlocker"; title = "Blocker resolved";
      } else if (c.operation === "SET_MANAGER") {
        if (c.managerId === a.profile.personId) throw new NiceJobsError("Self-supervision is forbidden"); await member(db, b, c.managerId, a.divisionId);
        if ((await db.niceJobsAssignment.updateMany({ where: { id: a.id, revision: c.revision }, data: { managerId: c.managerId, revision: { increment: 1 } } })).count !== 1) throw new NiceJobsError("Assignment changed; refresh before retrying");
        a = await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: a.id }, include: assignmentInclude }); title = "Manager updated";
      } else if (c.operation === "REMIND") {
        await active(db, b, a); const today = dayBounds(localDay(now(), b.timezone), b.timezone);
        const exists = c.kind === "MISSING_REPORT" ? !await db.niceJobsDailyReport.findFirst({ where: { assignmentId: a.id, reportDate: localDay(now(), b.timezone) }, select: { id: true } }) : c.kind === "BLOCKER" ? !!await db.executionBlocker.findFirst({ where: { niceJobsAssignmentId: a.id, status: "OPEN" }, select: { id: true } }) : !!await db.task.findFirst({ where: { AND: [taskWhere(b, a), { status: { in: [...open] }, ...(c.kind === "OVERDUE" ? { dueDate: { lt: now() } } : c.kind === "DUE" ? { dueDate: { gte: today.start, lt: today.end } } : {}) }] }, select: { id: true } });
        if (!exists) throw new NiceJobsError("No matching current reminder condition"); title = c.kind.replaceAll("_", " ").toLowerCase() + " reminder";
      } else title = "Worker activated";
      await event(db, b, a.divisionId, id, type, c.operation, reference, fingerprint, "reason" in c ? c.reason : undefined);
      await notice(db, b, a, title, reference, managerNotice);
      return { id, assignmentId: a.id };
    });
  }
  async function work(userId: string, raw: unknown = {}, constraint?: AgentConstraint) {
    const q = workQuery.parse(raw);
    return client.$transaction(async db => {
      const b = await boundary(db, userId, constraint), a = await own(db, b), bounds = dayBounds(localDay(now(), b.timezone), b.timezone);
      const filter: Prisma.TaskWhereInput = q.view === "completed" ? { status: "COMPLETED" } : q.view === "overdue" ? { status: { in: [...open] }, dueDate: { lt: now() } } : q.view === "pending" ? { status: { in: [...open] } } : q.view === "today" ? { OR: [{ dueDate: { gte: bounds.start, lt: bounds.end } }, { status: "COMPLETED", completionDate: { gte: bounds.start, lt: bounds.end } }] } : {};
      const rows = await db.task.findMany({ where: { AND: [taskWhere(b, a), filter, { title: { contains: q.search }, ...(q.after ? { id: { gt: q.after } } : {}) }] }, select: { id: true, title: true, description: true, status: true, priority: true, dueDate: true, completionDate: true, revision: true, evidenceRequired: true }, orderBy: { id: "asc" }, take: q.limit + 1 });
      return { records: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null, timezone: b.timezone };
    });
  }
  async function day(userId: string, constraint?: AgentConstraint) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId, constraint), a = await own(db, b), date = localDay(now(), b.timezone), bounds = dayBounds(date, b.timezone), where = taskWhere(b, a);
      if (constraint && (constraint.organizationId !== a.divisionId || constraint.projectId)) throw new AccessError("Worker SIA scope mismatch");
      const scope = { organizationId: a.divisionId }, canReadTasks = (await b.ctx.decide("nicejobs.work.read", scope)).allowed || (await b.ctx.decide("task.read", scope)).allowed || b.ctx.grants.some(g => g.key === "task.read" && g.projectId && g.organizationId === a.divisionId);
      const canBlock = (await b.ctx.decide("nicejobs.blocker.self", scope)).allowed;
      const leads = await workerLeadSource(db, b.ctx, a, now(), bounds);
      const knowledge = await workerKnowledgeSnapshot(db, b.ctx, a, b.company.id, now());
      const tasks = await db.task.findMany({ where: { AND: [where, { status: { in: [...open] } }] }, select: { id: true, title: true, description: true, priority: true, status: true, dueDate: true, evidenceRequired: true, revision: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 26 });
      const completed = await db.task.findMany({ where: { AND: [where, { status: "COMPLETED", completionDate: { gte: bounds.start, lt: bounds.end } }] }, select: { id: true, title: true, completionDate: true }, orderBy: { id: "asc" }, take: 26 });
      const blockers = canBlock ? await db.executionBlocker.findMany({ where: { niceJobsAssignmentId: a.id, status: "OPEN" }, select: { id: true, reason: true, description: true, taskId: true, status: true, createdAt: true, revision: true }, orderBy: { id: "asc" }, take: 26 }) : [];
      const overdue = await db.task.findMany({ where: { AND: [where, { status: { in: [...open] }, dueDate: { lt: now() } }] }, select: { id: true, title: true, status: true, priority: true, dueDate: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 25 });
      const today = await db.task.findMany({ where: { AND: [where, { status: { in: [...open] }, dueDate: { gte: bounds.start, lt: bounds.end } }] }, select: { id: true, title: true, status: true, dueDate: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 25 });
      const reports = (await b.ctx.decide("nicejobs.report.self", { organizationId: a.divisionId })).allowed ? await db.niceJobsDailyReport.findMany({ where: { assignmentId: a.id }, select: { id: true, reportDate: true, revision: true, notes: true, submittedAt: true, operationalSnapshot: b.ctx.organizationIds("nicejobs.lead.self.read").includes(a.divisionId) }, orderBy: [{ reportDate: "desc" }, { revision: "desc" }], take: 10 }) : [];
      const totals = canReadTasks ? { assigned: await db.task.count({ where }), pending: await db.task.count({ where: { AND: [where, { status: { in: [...open] } }] } }), overdue: await db.task.count({ where: { AND: [where, { status: { in: [...open] }, dueDate: { lt: now() } }] } }), today: await db.task.count({ where: { AND: [where, { status: { in: [...open] }, dueDate: { gte: bounds.start, lt: bounds.end } }] } }), completed: await db.task.count({ where: { AND: [where, { status: "COMPLETED", completionDate: { gte: bounds.start, lt: bounds.end } }] } }) } : null;
      const linkedGoals = await db.task.findMany({ where: { AND: [where, { goalId: { not: null } }] }, select: { goalId: true }, orderBy: { id: "asc" }, take: 25 });
      const goals = await db.goal.findMany({ where: { id: { in: linkedGoals.map(t => t.goalId!) }, organizationId: a.divisionId, OR: [{ organizationId: { in: b.ctx.organizationIds("goal.read") } }, { projectId: { in: b.ctx.grants.filter(g => g.key === "goal.read" && g.projectId).map(g => g.projectId!) } }] }, select: { id: true, title: true, status: true, targetDate: true }, orderBy: { id: "asc" }, take: 25 });
      const notifications = (await b.ctx.decide("notification.read", scope)).allowed ? await db.notification.findMany({ where: { recipientUserId: userId, organizationId: a.divisionId, OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }], AND: [{ OR: [{ resourceType: "NICE_JOBS_ASSIGNMENT", resourceId: a.id }, { resourceType: "TASK", resourceId: { in: tasks.map(t => t.id) } }, { resourceType: "NICE_JOBS_LEAD", resourceId: { in: leads.leads.map(l => l.id) } }] }] }, select: { id: true, title: true, message: true, type: true, readAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 }) : [];
      const rank = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 }; tasks.sort((x, y) => (rank[x.priority as keyof typeof rank] ?? 2) - (rank[y.priority as keyof typeof rank] ?? 2) || (x.dueDate?.getTime() ?? Infinity) - (y.dueDate?.getTime() ?? Infinity));
      return { knowledge, leads, assignment: { id: a.id, name: a.profile.person.displayName, title: a.version.title, version: a.version.number, company: b.company.name, companyId: b.company.id, division: a.division.name, divisionId: a.divisionId, manager: a.manager?.displayName ?? null, startDate: a.startDate, revision: a.revision, trainingReference: a.onboarding?.applicationId }, date, timezone: b.timezone, canReadTasks, totals, goals, notifications, overdue, today, tasks: tasks.slice(0, 25), completed: completed.slice(0, 25), blockers: blockers.slice(0, 25), reports, truncated: tasks.length > 25 || completed.length > 25 || blockers.length > 25, canPerform: (await b.ctx.decide("nicejobs.work.perform", { organizationId: a.divisionId })).allowed, canReport: (await b.ctx.decide("nicejobs.report.self", { organizationId: a.divisionId })).allowed, canBlock, canRemind: (await b.ctx.decide("reminder.manage", { organizationId: a.divisionId })).allowed, asOf: now() };
    });
  }
  async function workforce(userId: string, raw: unknown = {}) {
    const q = employeeQuery.parse(raw);
    return client.$transaction(async db => {
      const b = await boundary(db, userId), ids = b.ctx.organizationIds("nicejobs.workspace.read").filter(id => b.ctx.organizationIds("person.read").includes(id));
      if (q.attention === "BLOCKED" && !ids.every(id => b.ctx.organizationIds("nicejobs.blocker.manage").includes(id)) || q.attention === "OVERDUE" && !ids.every(id => b.ctx.organizationIds("task.read").includes(id))) throw new AccessError("Attention source access unavailable");
      if (q.companyId && q.companyId !== b.company.id || !ids.length || q.divisionId && !ids.includes(q.divisionId)) throw new AccessError("Workforce scope unavailable");
      const rows = await db.niceJobsAssignment.findMany({ where: { divisionId: q.divisionId ?? { in: ids }, profile: { companyId: b.company.id, personId: { not: b.personId }, person: { displayName: { contains: q.search } } }, version: { template: { productId: b.product.id, ...(q.jobId ? { id: q.jobId } : {}) } }, ...(q.managerId ? { managerId: q.managerId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.after ? { id: { gt: q.after } } : {}), ...(q.attention === "NO_MANAGER" ? { managerId: null } : q.attention === "BLOCKED" ? { blockers: { some: { status: "OPEN" } } } : q.attention === "OVERDUE" ? { tasks: { some: { status: { in: [...open] }, dueDate: { lt: now() }, organizationId: { in: b.ctx.organizationIds("task.read") } } } } : {}) }, include: assignmentInclude, orderBy: { id: "asc" }, take: q.limit + 1 });
      const pageIds = rows.slice(0, q.limit).map(a => a.id);
      const leadCounts = await managerLeadCounts(db, b.ctx, rows.slice(0, q.limit), now(), dayBounds(localDay(now(), b.timezone), b.timezone));
      const blockerCounts = await db.executionBlocker.groupBy({ by: ["niceJobsAssignmentId"], where: { niceJobsAssignmentId: { in: pageIds }, organizationId: { in: b.ctx.organizationIds("nicejobs.blocker.manage") }, status: "OPEN" }, _count: { _all: true }, orderBy: { niceJobsAssignmentId: "asc" }, take: 100 });
      const taskCounts = await db.task.groupBy({ by: ["niceJobsAssignmentId", "status"], where: { niceJobsAssignmentId: { in: pageIds }, organizationId: { in: b.ctx.organizationIds("task.read") } }, _count: { _all: true }, orderBy: { niceJobsAssignmentId: "asc" }, take: 600 });
      const overdueCounts = await db.task.groupBy({ by: ["niceJobsAssignmentId"], where: { niceJobsAssignmentId: { in: pageIds }, organizationId: { in: b.ctx.organizationIds("task.read") }, status: { in: [...open] }, dueDate: { lt: now() } }, _count: { _all: true }, orderBy: { niceJobsAssignmentId: "asc" }, take: 100 });
      const blockersByAssignment = new Map(blockerCounts.map(r => [r.niceJobsAssignmentId, r._count._all])), overdueByAssignment = new Map(overdueCounts.map(r => [r.niceJobsAssignmentId, r._count._all]));
      const workingByAssignment = new Map(taskCounts.filter(r => r.status === "IN_PROGRESS").map(r => [r.niceJobsAssignmentId, r._count._all]));
      return { records: rows.slice(0, q.limit).map(a => ({ leadCounts: leadCounts.get(a.id) ?? null, id: a.id, name: a.profile.person.displayName, title: a.version.title, version: a.version.number, company: b.company.name, division: a.division.name, divisionId: a.divisionId, manager: a.manager?.displayName ?? null, status: a.status, lifecycle: a.lifecycle, startDate: a.startDate, revision: a.revision, readinessBacked: !!a.onboardingId && !!a.readinessReviewId, openBlockers: b.ctx.organizationIds("nicejobs.blocker.manage").includes(a.divisionId) ? blockersByAssignment.get(a.id) ?? 0 : null, overdueTasks: b.ctx.organizationIds("task.read").includes(a.divisionId) ? overdueByAssignment.get(a.id) ?? 0 : null, workingTasks: b.ctx.organizationIds("task.read").includes(a.divisionId) ? workingByAssignment.get(a.id) ?? 0 : null, canManage: b.ctx.organizationIds("nicejobs.work.manage").includes(a.divisionId) })), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null, companyId: b.company.id, company: b.company.name };
    });
  }
  async function detail(userId: string, assignmentId: string, blockerAfter?: string) {
    const blockerPage = employeeQuery.parse({ after: blockerAfter });
    return client.$transaction(async db => {
      const b = await boundary(db, userId), a = await management(db, b, assignmentId), scope = { organizationId: a.divisionId };
      const tasks = await db.task.findMany({ where: taskWhere(b, a), select: { id: true, title: true, status: true, priority: true, dueDate: true, evidenceRequired: true }, orderBy: { id: "asc" }, take: 25 });
      const reports = (await b.ctx.decide("nicejobs.report.read", scope)).allowed ? await db.niceJobsDailyReport.findMany({ where: { assignmentId: a.id }, select: { id: true, reportDate: true, revision: true, notes: true, submittedAt: true, operationalSnapshot: b.ctx.organizationIds("nicejobs.lead.pool.read").includes(a.divisionId) }, orderBy: [{ reportDate: "desc" }, { revision: "desc" }], take: 10 }) : null;
      const blockers = (await b.ctx.decide("nicejobs.blocker.manage", scope)).allowed ? await db.executionBlocker.findMany({ where: { niceJobsAssignmentId: a.id, status: "OPEN", ...(blockerPage.after ? { id: { gt: blockerPage.after } } : {}) }, select: { id: true, reason: true, description: true, status: true, createdAt: true, resolvedAt: true, revision: true, taskId: true }, orderBy: { id: "asc" }, take: 26 }) : null;
      const leadCounts = await managerLeadCounts(db, b.ctx, [a], now(), dayBounds(localDay(now(), b.timezone), b.timezone));
      return { leadCounts: leadCounts.get(a.id) ?? null, assignment: { id: a.id, name: a.profile.person.displayName, title: a.version.title, company: b.company.name, companyId: b.company.id, division: a.division.name, divisionId: a.divisionId, version: a.version.number, manager: a.manager?.displayName ?? null, status: a.status, lifecycle: a.lifecycle, startDate: a.startDate, revision: a.revision }, tasks, reports, blockers: blockers?.slice(0, 25) ?? null, blockerNextCursor: blockers && blockers.length > 25 ? blockers[24].id : null, asOf: now(), canManage: (await b.ctx.decide("nicejobs.work.manage", scope)).allowed, canAssign: (await b.ctx.decide("nicejobs.work.manage", scope)).allowed && (await b.ctx.decide("task.manage", scope)).allowed && a.status === "ACTIVE" && !!a.activatedAt, canRemind: (await b.ctx.decide("reminder.manage", scope)).allowed, timezone: b.timezone };
    });
  }
  async function navigation(userId: string) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId); let worker = false;
      try { await own(db, b); worker = true; } catch (e) { if (!(e instanceof AccessError)) throw e; }
      const notificationOrganizationIds = [...new Set([...b.ctx.organizationIds("notification.read"), ...b.ctx.grants.filter(g => g.key === "notification.read" && g.projectId).map(g => g.organizationId)])].filter((id): id is string => !!id).filter(id => ancestry(b.ctx.nodes, id).some(n => n.id === b.company.id));
      return { worker, notificationOrganizationIds, leads: !!b.ctx.organizationIds("nicejobs.lead.pool.read").length, manage: b.ctx.organizationIds("nicejobs.workspace.read").some(id => b.ctx.organizationIds("person.read").includes(id)), command: b.ctx.organizationIds("nicejobs.command.read").some(id => b.ctx.nodes.some(n => n.id === id && n.parentId === b.company.id)), activate: !!b.ctx.organizationIds("nicejobs.worker.activate").length };
    });
  }
  async function managers(userId: string, divisionId: string, search = "", after?: string) {
    const q = employeeQuery.parse({ search, after });
    return client.$transaction(async db => {
      const b = await boundary(db, userId); await b.ctx.requireAccess("person.read", { organizationId: divisionId });
      if (!(await b.ctx.decide("nicejobs.work.manage", { organizationId: divisionId })).allowed) await b.ctx.requireAccess("nicejobs.worker.activate", { organizationId: divisionId });
      const path = ancestry(b.ctx.nodes, divisionId).map(n => n.id);
      const rows = await db.person.findMany({ where: { status: "ACTIVE", displayName: { contains: q.search }, ...(q.after ? { id: { gt: q.after } } : {}), memberships: { some: { ...activeMembershipWhere(now()), projectId: null, scopeKey: "organization", OR: [{ organizationId: divisionId }, { organizationId: { in: path }, scope: "DESCENDANTS" }] } } }, select: { id: true, displayName: true }, orderBy: { id: "asc" }, take: 26 });
      return { records: rows.slice(0, 25).map(p => ({ id: p.id, name: p.displayName })), nextCursor: rows.length > 25 ? rows[24].id : null };
    });
  }
  async function options(userId: string) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId), ids = b.ctx.organizationIds("nicejobs.workspace.read").filter(id => b.ctx.organizationIds("person.read").includes(id));
      if (!ids.length) throw new AccessError("Workforce scope unavailable");
      const divisions = await db.organization.findMany({ where: { id: { in: ids }, parentId: b.company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 12 });
      const jobs = await db.niceJobsTemplate.findMany({ where: { companyId: b.company.id, productId: b.product.id, versions: { some: { assignments: { some: { divisionId: { in: ids } } } } } }, select: { id: true, code: true }, orderBy: { id: "asc" }, take: 101 });
      const managers = await db.person.findMany({ where: { managedJobAssignments: { some: { divisionId: { in: ids }, profile: { companyId: b.company.id } } } }, select: { id: true, displayName: true }, orderBy: { id: "asc" }, take: 101 });
      return { company: { id: b.company.id, name: b.company.name }, divisions, jobs: jobs.slice(0, 100).map(j => ({ id: j.id, name: j.code })), managers: managers.slice(0, 100).map(p => ({ id: p.id, name: p.displayName })), truncated: jobs.length > 100 || managers.length > 100 };
    });
  }
  return { mutate, day, work, workforce, detail, navigation, managers, options, internal: { boundary, own, active, member, taskWhere, snapshot, assignmentInclude } };
}
export const employeeService = createEmployeeService();
