import { createHash } from "node:crypto";
import { z } from "zod";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext, type AgentConstraint } from "@/server/authorization/engine";
import { activeMembershipWhere } from "@/server/authorization/business-scope";
import { operationalEvent, notify } from "@/server/domain/operational-events";
import { createEmployeeService, dayBounds } from "./employee";
import { NiceJobsError } from "./input";
import { frameworkPayload, performanceCommand, performanceQuery, pipPayload, evidenceReference, type EvidenceReference } from "./performance-input";
import { workerKnowledgeWhere } from "./knowledge-access";
import { authorizedEvidence, measureMetric, metricResult, metricTrend, overallStatus, sourceAuthorized } from "./performance-evidence";

type DB = Prisma.TransactionClient;
const frameworkInclude = { framework: true } satisfies Prisma.NiceJobsPerformanceVersionInclude;
const snapshotInclude = { frameworkVersion: { include: frameworkInclude }, assignment: { include: createEmployeeService().internal.assignmentInclude } } satisfies Prisma.NiceJobsPerformanceSnapshotInclude;
type Snapshot = Prisma.NiceJobsPerformanceSnapshotGetPayload<{ include: typeof snapshotInclude }>;
const parseResults = (value: string) => z.array(metricResult).max(30).parse(JSON.parse(value));
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createPerformanceService(client: PrismaClient = prisma, now: () => Date = () => new Date()) {
  const employee = createEmployeeService(client, now).internal;
  type Boundary = Awaited<ReturnType<typeof employee.boundary>>;
  async function manager(db: DB, b: Boundary, assignmentId: string, capability = "nicejobs.performance.read") {
    const a = await db.niceJobsAssignment.findUnique({ where: { id: assignmentId }, include: employee.assignmentInclude });
    if (!a || a.profile.companyId !== b.company.id || a.version.template.productId !== b.product.id || a.division.parentId !== b.company.id || a.profile.personId === b.personId) throw new AccessError("Performance scope unavailable");
    for (const key of ["nicejobs.workspace.read", "person.read", "nicejobs.performance.read", capability]) await b.ctx.requireAccess(key, { organizationId: a.divisionId });
    return a;
  }
  async function loadSnapshot(db: DB, b: Boundary, id: string, management: boolean, capability?: string) {
    const s = await db.niceJobsPerformanceSnapshot.findFirst({ where: { id, frameworkVersion: { framework: { companyId: b.company.id } } }, include: snapshotInclude });
    if (!s || s.assignment.divisionId !== s.frameworkVersion.framework.divisionId || s.assignment.versionId !== s.frameworkVersion.framework.jobVersionId) throw new AccessError("Performance unavailable");
    if (management) await manager(db, b, s.assignmentId, capability);
    else { const a = await employee.own(db, b); if (a.id !== s.assignmentId) throw new AccessError("Performance unavailable"); await b.ctx.requireAccess("nicejobs.performance.self.read", { organizationId: a.divisionId }); }
    return s;
  }
  async function frameworkAccess(b: Boundary, org: string, capability: string) {
    if (!b.ctx.nodes.some(n => n.id === org && n.parentId === b.company.id && n.type === "DIVISION" && n.status === "ACTIVE")) throw new AccessError("Framework division unavailable");
    await b.ctx.requireAccess("nicejobs.performance.framework.read", { organizationId: org }); await b.ctx.requireAccess(capability, { organizationId: org });
  }
  async function validateFramework(db: DB, b: Boundary, p: z.infer<typeof frameworkPayload>) {
    await frameworkAccess(b, p.divisionId, "nicejobs.performance.framework.manage");
    if (!await db.niceJobsVersion.findFirst({ where: { id: p.jobVersionId, publishedAt: { not: null }, template: { companyId: b.company.id, productId: b.product.id }, areas: { some: { divisionId: p.divisionId } } }, select: { id: true } })) throw new AccessError("Published scoped job version required");
  }
  async function validateEvidence(db: DB, b: Boundary, a: Snapshot["assignment"], refs: EvidenceReference[]) {
    const visible = await authorizedEvidence(db, b.ctx, a, b.company.id, refs, now());
    if (visible.length !== refs.length) throw new AccessError("Supporting evidence unavailable");
  }
  async function validatePip(db: DB, b: Boundary, s: Snapshot, p: z.infer<typeof pipPayload>) {
    await employee.active(db, b, s.assignment); await employee.member(db, b, p.managerId, s.assignment.divisionId);
    if (p.managerId === s.assignment.profile.personId) throw new AccessError("Independent manager required");
    if (p.privateNote) await b.ctx.requireAccess("nicejobs.pip.private", { organizationId: s.assignment.divisionId });
    await validateEvidence(db, b, s.assignment, p.supportActions.flatMap(v => v.reference ? [v.reference] : []));
    if (!parseResults(s.results).some(r => r.actual !== null && r.evidenceCount > 0 && sourceAuthorized(b.ctx, s.assignment, r.metric.source))) throw new NiceJobsError("PIP requires a real evidence-backed snapshot; no automatic intervention");
  }
  async function announce(db: DB, b: Boundary, s: Snapshot, type: "NICE_JOBS_PERFORMANCE" | "NICE_JOBS_PIP", id: string, ref: string) {
    const users = await db.user.findMany({ where: { personId: s.assignment.profile.personId, status: "ACTIVE" }, select: { id: true }, take: 26 });
    if (users.length > 25) throw new NiceJobsError("Notification recipient bound exceeded");
    for (const u of users) {
      const ctx = await createAccessContext(u.id, db, undefined, { organizationId: b.company.id });
      if (!ctx.organizationIds("notification.read").includes(s.assignment.divisionId) || !ctx.organizationIds(type === "NICE_JOBS_PIP" ? "nicejobs.pip.self.read" : "nicejobs.performance.self.read").includes(s.assignment.divisionId)) continue;
      await notify(db, b.userId, u.id, { organizationId: s.assignment.divisionId, resourceType: type, resourceId: id }, "NICE_JOBS_PERFORMANCE", type === "NICE_JOBS_PIP" ? "Improvement plan available" : "Performance feedback available", "Open your authorized workforce workspace.", ref + ":" + u.id);
    }
  }
  async function mutate(userId: string, raw: unknown) {
    const c = performanceCommand.parse(raw), hash = fingerprint(c), ref = "nicejobs.performance:" + userId + ":" + c.idempotencyKey;
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId);
      let scope: string, id: string | undefined, s: Snapshot | undefined;
      const v = "versionId" in c ? await db.niceJobsPerformanceVersion.findFirst({ where: { id: c.versionId, framework: { companyId: b.company.id } }, include: frameworkInclude }) : null;
      const p = "pipId" in c ? await db.niceJobsPip.findFirst({ where: { id: c.pipId, assignment: { profile: { companyId: b.company.id } } } }) : null;
      const flag = c.operation === "FLAG_RESOLVE" ? await db.niceJobsPerformanceAttention.findUnique({ where: { id: c.flagId } }) : null;
      const feedback = c.operation === "FEEDBACK_ACK" ? await db.niceJobsPerformanceReview.findUnique({ where: { id: c.reviewId } }) : null;
      const worker = ["PIP_ACK", "PIP_RESPONSE", "FEEDBACK_ACK"].includes(c.operation);
      if (c.operation.startsWith("FRAMEWORK")) {
        if (c.operation !== "FRAMEWORK_CREATE" && !v) throw new AccessError("Framework unavailable");
        scope = v?.framework.divisionId ?? (c.operation === "FRAMEWORK_CREATE" ? c.payload.divisionId : "");
        await frameworkAccess(b, scope, c.operation === "FRAMEWORK_PUBLISH" ? "nicejobs.performance.framework.publish" : "nicejobs.performance.framework.manage"); id = v?.id;
        if (c.operation === "FRAMEWORK_CREATE" || c.operation === "FRAMEWORK_EDIT") await validateFramework(db, b, c.payload);
      } else {
        const snapshotId = "snapshotId" in c ? c.snapshotId : p?.snapshotId ?? flag?.snapshotId ?? feedback?.snapshotId;
        if (c.operation === "SNAPSHOT") { const a = await manager(db, b, c.assignmentId, "nicejobs.performance.generate"); scope = a.divisionId; await employee.active(db, b, a); }
        else {
          if (!snapshotId) throw new AccessError("Performance unavailable");
          s = await loadSnapshot(db, b, snapshotId, !worker, c.operation.startsWith("PIP") ? c.operation === "PIP_REVIEW" ? "nicejobs.pip.review" : "nicejobs.pip.manage" : c.operation.startsWith("FLAG") ? "nicejobs.performance.attention.manage" : "nicejobs.performance.review"); scope = s.assignment.divisionId;
          if (worker && c.operation.startsWith("PIP")) { if (!p || !p.released || p.status === "DRAFT") throw new AccessError("Released plan unavailable"); await b.ctx.requireAccess("nicejobs.pip.self.read", { organizationId: scope }); await b.ctx.requireAccess("nicejobs.pip.self.respond", { organizationId: scope }); }
          if (c.operation === "FEEDBACK_ACK" && !feedback?.released) throw new AccessError("Released feedback unavailable");
        }
      }
      // Replays never bypass current authority, resource ownership or private-note permission.
      if ("privateNote" in c && c.privateNote || "payload" in c && "privateNote" in c.payload && c.payload.privateNote) await b.ctx.requireAccess(c.operation.startsWith("PIP") ? "nicejobs.pip.private" : "nicejobs.performance.private", { organizationId: scope });
      const prior = await db.operationalEvent.findUnique({ where: { reference: ref } });
      if (prior) { if (JSON.parse(prior.metadata ?? "{}").fingerprint !== hash) throw new NiceJobsError("Performance replay mismatch"); return { id: prior.entityId }; }
      if (v && "revision" in c && v.revision !== c.revision || p && "revision" in c && p.revision !== c.revision || flag && "revision" in c && flag.revision !== c.revision) throw new NiceJobsError("Record changed; refresh before saving");
      if (c.operation === "FRAMEWORK_CREATE") {
        const f = await db.niceJobsPerformanceFramework.create({ data: { companyId: b.company.id, divisionId: c.payload.divisionId, jobVersionId: c.payload.jobVersionId, name: c.payload.name } });
        id = (await db.niceJobsPerformanceVersion.create({ data: { frameworkId: f.id, number: 1, ownerUserId: userId, period: c.payload.period, timezone: c.payload.timezone, effectiveAt: new Date(c.payload.effectiveAt), definition: JSON.stringify(c.payload) } })).id;
      } else if (c.operation === "FRAMEWORK_EDIT") {
        if (v!.status !== "DRAFT" || v!.framework.divisionId !== c.payload.divisionId || v!.framework.jobVersionId !== c.payload.jobVersionId) throw new NiceJobsError("Only same-scope drafts may be edited");
        await db.niceJobsPerformanceVersion.update({ where: { id: v!.id, revision: c.revision }, data: { definition: JSON.stringify(c.payload), period: c.payload.period, timezone: c.payload.timezone, effectiveAt: new Date(c.payload.effectiveAt), revision: { increment: 1 } } });
      } else if (c.operation === "FRAMEWORK_VERSION") {
        const latest = await db.niceJobsPerformanceVersion.findFirst({ where: { frameworkId: v!.frameworkId }, orderBy: { number: "desc" } });
        if (latest?.id !== v!.id || !v!.publishedAt) throw new NiceJobsError("Create a version only from the latest published framework");
        id = (await db.niceJobsPerformanceVersion.create({ data: { frameworkId: v!.frameworkId, number: v!.number + 1, ownerUserId: userId, period: v!.period, timezone: v!.timezone, effectiveAt: v!.effectiveAt, definition: v!.definition } })).id;
      } else if (c.operation === "FRAMEWORK_PUBLISH" || c.operation === "FRAMEWORK_ARCHIVE") {
        if (c.operation === "FRAMEWORK_PUBLISH" ? v!.status !== "DRAFT" : v!.status !== "PUBLISHED") throw new NiceJobsError("Invalid framework transition");
        const definition = frameworkPayload.parse(JSON.parse(v!.definition));
        if (c.operation === "FRAMEWORK_PUBLISH") { await validateFramework(db, b, definition); const previous = await db.niceJobsPerformanceVersion.findFirst({ where: { frameworkId: v!.frameworkId, publishedAt: { not: null } }, orderBy: { number: "desc" } }); if (previous && v!.effectiveAt <= previous.effectiveAt) throw new NiceJobsError("New framework versions need a later effective date"); }
        await db.niceJobsPerformanceVersion.update({ where: { id: v!.id, revision: c.revision }, data: { status: c.operation === "FRAMEWORK_PUBLISH" ? "PUBLISHED" : "ARCHIVED", ...(c.operation === "FRAMEWORK_PUBLISH" ? { publishedAt: now() } : {}), revision: { increment: 1 } } });
      } else if (c.operation === "SNAPSHOT") {
        const a = await manager(db, b, c.assignmentId, "nicejobs.performance.generate"), f = await db.niceJobsPerformanceVersion.findFirst({ where: { id: c.frameworkVersionId, publishedAt: { not: null }, framework: { companyId: b.company.id, divisionId: a.divisionId, jobVersionId: a.versionId } }, include: frameworkInclude });
        if (!f || f.status !== "PUBLISHED" && !c.supersedesId) throw new AccessError("Applicable published framework required");
        await b.ctx.requireAccess("nicejobs.performance.framework.read", { organizationId: a.divisionId });
        if (f.period !== "CUSTOM" && (c.from.length !== 10 || c.until.length !== 10)) throw new NiceJobsError("Calendar periods require date-only boundaries");
        const start = c.from.length === 10 ? dayBounds(c.from, f.timezone).start : new Date(c.from), end = c.until.length === 10 ? dayBounds(c.until, f.timezone).start : new Date(c.until), days = (Date.parse(c.until) - Date.parse(c.from)) / 86400000;
        if (days <= 0 || days > 366 || f.period === "DAILY" && days !== 1 || f.period === "WEEKLY" && days !== 7 || f.period === "MONTHLY" && (c.from.slice(8) !== "01" || c.until.slice(8) !== "01" || new Date(Date.UTC(Number(c.from.slice(0, 4)), Number(c.from.slice(5, 7)), 1)).toISOString().slice(0, 10) !== c.until) || start < f.effectiveAt || end > now() || a.startDate && start < a.startDate) throw new NiceJobsError("Closed, configured, assignment-valid period required; end is exclusive");
        const previous = c.supersedesId ? await db.niceJobsPerformanceSnapshot.findFirst({ where: { id: c.supersedesId, assignmentId: a.id, frameworkVersionId: f.id, periodStart: start, periodEnd: end, correction: null } }) : null;
        if (c.supersedesId && (!previous || !c.reason)) throw new NiceJobsError("Correction requires the current original period and a reason");
        if (!previous && await db.niceJobsPerformanceVersion.findFirst({ where: { frameworkId: f.frameworkId, number: { gt: f.number }, publishedAt: { not: null }, effectiveAt: { lte: start } }, select: { id: true } })) throw new NiceJobsError("A newer framework applies to this period");
        const results = [];
        for (const m of frameworkPayload.parse(JSON.parse(f.definition)).metrics) results.push(await measureMetric(db, b.ctx, a, b.company.id, m, start, end, now()));
        id = (await db.niceJobsPerformanceSnapshot.create({ data: { assignmentId: a.id, frameworkVersionId: f.id, periodStart: start, periodEnd: end, revision: previous ? previous.revision + 1 : 0, supersedesId: previous?.id, correctionReason: c.reason, results: JSON.stringify(results), status: overallStatus(results), generatedByUserId: userId } })).id;
      } else if (c.operation === "REVIEW") {
        if (c.privateNote) await b.ctx.requireAccess("nicejobs.performance.private", { organizationId: scope });
        if (c.supportTaskId) await validateEvidence(db, b, s!.assignment, [{ type: "TASK", id: c.supportTaskId }]);
        id = (await db.niceJobsPerformanceReview.create({ data: { snapshotId: s!.id, reviewerUserId: userId, feedback: c.feedback, privateNote: c.privateNote, released: c.released, followup: c.followup, supportTaskId: c.supportTaskId } })).id;
        if (c.released) await announce(db, b, s!, "NICE_JOBS_PERFORMANCE", s!.id, ref);
      } else if (c.operation === "FEEDBACK_ACK") { id = feedback!.id; if (feedback!.acknowledgedAt) return { id }; await db.niceJobsPerformanceReview.update({ where: { id }, data: { acknowledgedAt: now() } });
      } else if (c.operation === "FLAG") {
        const result = parseResults(s!.results).find(r => r.metric.key === c.metricKey);
        if (!result || !["ATTENTION", "BELOW_EXPECTATION"].includes(result.status) || !result.evidenceCount || !sourceAuthorized(b.ctx, s!.assignment, result.metric.source)) throw new NiceJobsError("Attention requires configured threshold breach and recorded evidence");
        id = (await db.niceJobsPerformanceAttention.create({ data: { snapshotId: s!.id, metricKey: c.metricKey, reason: c.reason } })).id;
      } else if (c.operation === "FLAG_RESOLVE") { if (flag!.status !== "OPEN") throw new NiceJobsError("Attention already resolved"); id = flag!.id; await db.niceJobsPerformanceAttention.update({ where: { id, revision: c.revision }, data: { status: "RESOLVED", resolution: c.reason, resolvedAt: now(), revision: { increment: 1 } } });
      } else if (c.operation === "PIP_CREATE") {
        await validatePip(db, b, s!, c.payload); const { objectives, supportActions, ...rest } = c.payload;
        const created = await db.niceJobsPip.create({ data: { ...rest, startAt: new Date(rest.startAt), reviewAt: new Date(rest.reviewAt), assignmentId: s!.assignmentId, snapshotId: s!.id, objectives: JSON.stringify(objectives), supportActions: JSON.stringify(supportActions) } }); id = created.id;
      } else if (c.operation === "PIP_EDIT") {
        if (!p || !["DRAFT", "ACTIVE", "UNDER_REVIEW"].includes(p.status)) throw new NiceJobsError("Closed plan cannot be edited"); await validatePip(db, b, s!, c.payload);
        const { objectives, supportActions, ...rest } = c.payload; id = p.id;
        await db.niceJobsPip.update({ where: { id, revision: c.revision }, data: { ...rest, objectives: JSON.stringify(objectives), supportActions: JSON.stringify(supportActions), startAt: new Date(rest.startAt), reviewAt: new Date(rest.reviewAt), status: p.status === "UNDER_REVIEW" ? "ACTIVE" : p.status, released: false, revision: { increment: 1 }, acknowledgedAt: null } });
      } else if (c.operation === "PIP_REVIEW") {
        if (!p || !["ACTIVE", "UNDER_REVIEW"].includes(p.status)) throw new NiceJobsError("Active plan required for review"); await validateEvidence(db, b, s!.assignment, c.evidence); id = p.id;
        await db.niceJobsPipReview.create({ data: { pipId: id, actorUserId: userId, kind: "REVIEW", progress: c.progress, comment: c.comment, privateNote: c.privateNote, evidence: JSON.stringify(c.evidence), nextAction: c.nextAction, released: c.released } });
        await db.niceJobsPip.update({ where: { id, revision: c.revision }, data: { status: "UNDER_REVIEW", revision: { increment: 1 } } });
      } else if (c.operation === "PIP_RESPONSE" || c.operation === "PIP_ACK") {
        id = p!.id; if (c.operation === "PIP_ACK") { if (!p!.requiredAck) throw new NiceJobsError("Plan acknowledgement is not configured"); if (p!.acknowledgedAt) return { id }; await db.niceJobsPip.update({ where: { id }, data: { acknowledgedAt: now(), revision: { increment: 1 } } }); }
        else { await validateEvidence(db, b, s!.assignment, c.evidence); await db.niceJobsPipReview.create({ data: { pipId: id, actorUserId: userId, kind: "WORKER", comment: c.comment, evidence: JSON.stringify(c.evidence), released: true } }); }
      } else if (p) {
        id = p.id;
        if (c.operation === "PIP_ACTIVATE") { if (p.status !== "DRAFT" || p.startAt > now() || p.reviewAt <= now()) throw new NiceJobsError("Draft plan with current dates required"); await employee.active(db, b, s!.assignment); }
        if (c.operation === "PIP_RELEASE" && !["ACTIVE", "UNDER_REVIEW"].includes(p.status) || c.operation === "PIP_CANCEL" && ["COMPLETED", "CANCELLED"].includes(p.status)) throw new NiceJobsError("Invalid plan transition");
        if (c.operation === "PIP_COMPLETE") { const review = await db.niceJobsPipReview.findFirst({ where: { pipId: p.id, kind: "REVIEW" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }); if (p.status !== "UNDER_REVIEW" || !review || !c.outcome) throw new NiceJobsError("Completion requires human review and explicit outcome"); }
        const status = c.operation === "PIP_ACTIVATE" ? "ACTIVE" : c.operation === "PIP_COMPLETE" ? "COMPLETED" : c.operation === "PIP_CANCEL" ? "CANCELLED" : p.status;
        await db.niceJobsPip.update({ where: { id, revision: c.revision }, data: { status, ...(c.operation === "PIP_RELEASE" ? { released: true } : {}), ...("outcome" in c && c.outcome ? { outcome: c.outcome } : {}), revision: { increment: 1 } } });
        if (c.operation === "PIP_RELEASE") await announce(db, b, s!, "NICE_JOBS_PIP", id, ref);
      }
      if (!id) throw new NiceJobsError("Unsupported performance operation");
      if (c.operation.startsWith("PIP") && !worker) { const updated = await db.niceJobsPip.findUniqueOrThrow({ where: { id } }); await db.niceJobsPipReview.create({ data: { pipId: id, actorUserId: userId, kind: "CHANGE", comment: "reason" in c ? c.reason ?? c.operation : c.operation, evidence: "[]", changeSnapshot: JSON.stringify(updated) } }); }
      await operationalEvent(db, { actorUserId: userId, actorPersonId: b.personId, organizationId: scope, action: "nicejobs.performance." + c.operation.toLowerCase(), entityType: c.operation.startsWith("PIP") ? "NiceJobsPip" : "NiceJobsPerformance", entityId: id, result: "SUCCESS", reference: ref, metadata: { fingerprint: hash } });
      return { id };
    });
  }
  async function projectSnapshot(db: DB, b: Boundary, s: Snapshot, management: boolean, includeEvidence = true) {
    const results = parseResults(s.results).filter(r => management || r.metric.visibility === "WORKER").map(r => sourceAuthorized(b.ctx, s.assignment, r.metric.source) ? r : { ...r, actual: null, variance: null, denominator: null, status: "NOT_MEASURED" as const, coverage: "NOT_AUTHORIZED", evidence: [], evidenceCount: 0, sampled: false });
    const visible = new Set((includeEvidence ? await authorizedEvidence(db, b.ctx, s.assignment, b.company.id, results.flatMap(r => r.evidence), now()) : []).map(r => r.type + ":" + r.id));
    return { id: s.id, assignmentId: s.assignmentId, name: s.assignment.profile.person.displayName, job: s.assignment.version.title, jobVersion: s.assignment.version.number, divisionId: s.assignment.divisionId, division: s.assignment.division.name, framework: s.frameworkVersion.framework.name, frameworkVersionId: s.frameworkVersionId, frameworkVersion: s.frameworkVersion.number, periodStart: s.periodStart, periodEnd: s.periodEnd, generatedAt: s.generatedAt, revision: s.revision, supersedesId: s.supersedesId, correctionReason: management ? s.correctionReason : null, status: overallStatus(results), results: results.map(r => ({ ...r, evidence: r.evidence.filter(e => visible.has(e.type + ":" + e.id)), evidenceAccess: !includeEvidence ? "OPEN_DETAIL_FOR_REFERENCES" : r.evidence.every(e => visible.has(e.type + ":" + e.id)) ? "AVAILABLE" : "SOME_REFERENCES_UNAVAILABLE" })) };
  }
  async function list(userId: string, raw: unknown = {}, constraint?: AgentConstraint) {
    const q = performanceQuery.parse(raw);
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId, constraint); if (q.companyId && q.companyId !== b.company.id) throw new AccessError("Company unavailable");
      const a = q.management ? null : await employee.own(db, b);
      if (a) await b.ctx.requireAccess("nicejobs.performance.self.read", { organizationId: a.divisionId });
      const ids = q.management ? b.ctx.organizationIds("nicejobs.performance.read").filter(id => b.ctx.organizationIds("nicejobs.workspace.read").includes(id) && b.ctx.organizationIds("person.read").includes(id)) : [a!.divisionId];
      if (!ids.length || q.divisionId && !ids.includes(q.divisionId) || a && q.assignmentId && q.assignmentId !== a.id) throw new AccessError("Performance scope unavailable");
      const where: Prisma.NiceJobsPerformanceSnapshotWhereInput = { frameworkVersion: { framework: { companyId: b.company.id, divisionId: q.divisionId ?? { in: ids }, ...(q.jobId ? { jobVersion: { templateId: q.jobId } } : {}) } }, assignment: { profile: { personId: q.management ? { not: b.personId } : b.personId, ...(q.management ? { person: { displayName: { contains: q.search } } } : {}) }, version: { template: { productId: b.product.id } } }, ...(q.assignmentId || a ? { assignmentId: a?.id ?? q.assignmentId } : {}), ...(q.frameworkVersionId ? { frameworkVersionId: q.frameworkVersionId } : {}), ...(!q.management && q.search ? { AND: [{ frameworkVersion: { framework: { name: { contains: q.search } } } }] } : {}), correction: null, ...(q.after && q.sort === "ID_ASC" ? { id: { gt: q.after } } : {}), ...(q.from || q.until ? { periodStart: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.until ? { lt: new Date(q.until) } : {}) } } : {}) };
      // Persisted overall status includes private metrics; filtering it must never leak worker-hidden values.
      if (q.status) { if (!q.management) throw new NiceJobsError("Use visible metric status in your individual report"); for (const org of q.divisionId ? [q.divisionId] : ids) for (const key of ["task.read", "nicejobs.lead.pool.read", "nicejobs.report.read", "nicejobs.onboarding.read", "nicejobs.sop.read", "nicejobs.blocker.manage"]) await b.ctx.requireAccess(key, { organizationId: org }); where.status = q.status; }
      if (q.after && q.sort === "PERIOD_DESC") { const cursor = await db.niceJobsPerformanceSnapshot.findFirst({ where: { AND: [where, { id: q.after }] }, select: { id: true, periodEnd: true } }); if (!cursor) throw new AccessError("Report cursor unavailable"); where.AND = [{ OR: [{ periodEnd: { lt: cursor.periodEnd } }, { periodEnd: cursor.periodEnd, id: { lt: cursor.id } }] }]; }
      const rows = await db.niceJobsPerformanceSnapshot.findMany({ where, include: snapshotInclude, orderBy: q.sort === "PERIOD_DESC" ? [{ periodEnd: "desc" }, { id: "desc" }] : { id: "asc" }, take: q.limit + 1 });
      const records = [];
      for (const s of rows.slice(0, q.limit)) records.push(await projectSnapshot(db, b, s, q.management, false));
      return { records, nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null, companyId: b.company.id, timezone: b.timezone, coverage: "BOUNDED_AUTHORIZED_RECORDS" };
    });
  }
  async function detail(userId: string, id: string, management = false, after?: string, constraint?: AgentConstraint) {
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId, constraint), s = await loadSnapshot(db, b, id, management), record = await projectSnapshot(db, b, s, management);
      const privateAccess = management && b.ctx.organizationIds("nicejobs.performance.private").includes(s.assignment.divisionId);
      const reviews = await db.niceJobsPerformanceReview.findMany({ where: { snapshotId: s.id, ...(!management ? { released: true } : {}), ...(after ? { id: { gt: after } } : {}) }, select: { id: true, feedback: true, followup: true, supportTaskId: true, released: true, privateNote: privateAccess, acknowledgedAt: true, createdAt: true }, orderBy: { id: "asc" }, take: 26 });
      const readableTasks = new Set((await authorizedEvidence(db, b.ctx, s.assignment, b.company.id, reviews.flatMap(r => r.supportTaskId ? [{ type: "TASK" as const, id: r.supportTaskId }] : []), now())).map(r => r.id));
      for (const r of reviews) if (r.supportTaskId && !readableTasks.has(r.supportTaskId)) r.supportTaskId = null;
      const attention = await db.niceJobsPerformanceAttention.findMany({ where: { snapshotId: s.id, metricKey: { in: record.results.filter(r => r.coverage !== "NOT_AUTHORIZED").map(r => r.metric.key) } }, orderBy: { id: "asc" }, take: 30 });
      const history = await db.niceJobsPerformanceSnapshot.findMany({ where: { assignmentId: s.assignmentId, frameworkVersionId: s.frameworkVersionId, correction: null, periodEnd: { lte: s.periodEnd } }, select: { periodStart: true, periodEnd: true, results: true }, orderBy: [{ periodEnd: "desc" }, { id: "desc" }], take: 3 });
      const nonoverlap = history.length === 3 && history.slice(1).every((r, i) => r.periodEnd <= history[i].periodStart);
      const trends = record.results.map(r => ({ key: r.metric.key, status: sourceAuthorized(b.ctx, s.assignment, r.metric.source) && nonoverlap ? metricTrend(r.metric, history.slice().reverse().map(h => parseResults(h.results).find(v => v.metric.key === r.metric.key)?.actual ?? null)) : "INSUFFICIENT_DATA", explanation: "Three non-overlapping corrected snapshots using the same framework version; higher/lower directional comparisons only" }));
      const caps = Object.fromEntries(["generate", "review", "private", "attention.manage"].map(k => [k, b.ctx.organizationIds("nicejobs.performance." + k).includes(s.assignment.divisionId)]));
      return { ...record, reviews: reviews.slice(0, 25), reviewNextCursor: reviews.length > 25 ? reviews[24].id : null, attention: management ? attention : attention.map(f => ({ id: f.id, snapshotId: f.snapshotId, metricKey: f.metricKey, status: f.status, revision: f.revision, reason: "Configured metric requires attention; review the actual evidence and ask for support.", resolution: f.status === "RESOLVED" ? "Reviewed by management" : null, createdAt: f.createdAt, resolvedAt: f.resolvedAt })), trends, permissions: caps, canPip: b.ctx.organizationIds("nicejobs.pip.manage").includes(s.assignment.divisionId), canPipPrivate: b.ctx.organizationIds("nicejobs.pip.private").includes(s.assignment.divisionId), timezone: b.timezone };
    });
  }
  async function pipDetail(userId: string, id: string, management = false, after?: string, constraint?: AgentConstraint) {
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId, constraint), p = await db.niceJobsPip.findFirst({ where: { id, assignment: { profile: { companyId: b.company.id } } } });
      if (!p || !management && (!p.released || p.status === "DRAFT")) throw new AccessError("Plan unavailable");
      const s = await loadSnapshot(db, b, p.snapshotId, management);
      await b.ctx.requireAccess(management ? "nicejobs.pip.read" : "nicejobs.pip.self.read", { organizationId: s.assignment.divisionId });
      const privateAccess = management && b.ctx.organizationIds("nicejobs.pip.private").includes(s.assignment.divisionId);
      const objectives = z.array(pipPayload.shape.objectives.element).max(20).parse(JSON.parse(p.objectives)), actions = pipPayload.shape.supportActions.parse(JSON.parse(p.supportActions));
      const refs = await authorizedEvidence(db, b.ctx, s.assignment, b.company.id, actions.flatMap(v => v.reference ? [v.reference] : []), now()), keys = new Set(refs.map(r => r.type + ":" + r.id));
      const reviews = await db.niceJobsPipReview.findMany({ where: { pipId: p.id, ...(management ? privateAccess ? {} : { kind: { not: "CHANGE" } } : { kind: { not: "CHANGE" }, released: true }), ...(after ? { id: { gt: after } } : {}) }, select: { id: true, kind: true, progress: true, comment: true, privateNote: privateAccess, evidence: true, nextAction: true, released: true, changeSnapshot: privateAccess, createdAt: true }, orderBy: { id: "asc" }, take: 26 });
      const visibleReviewRefs = await authorizedEvidence(db, b.ctx, s.assignment, b.company.id, reviews.flatMap(r => JSON.parse(r.evidence) as EvidenceReference[]), now()), visibleKeys = new Set(visibleReviewRefs.map(r => r.type + ":" + r.id));
      return { id: p.id, assignmentId: p.assignmentId, snapshotId: p.snapshotId, name: s.assignment.profile.person.displayName, title: p.title, workerMessage: p.workerMessage, ...(management ? { reason: p.reason, managerId: p.managerId } : {}), ...(privateAccess ? { privateNote: p.privateNote } : {}), objectives, supportActions: actions.map(v => ({ description: v.description, reference: v.reference && keys.has(v.reference.type + ":" + v.reference.id) ? v.reference : undefined })), startAt: p.startAt, reviewAt: p.reviewAt, status: p.status, revision: p.revision, released: p.released, requiredAck: p.requiredAck, acknowledgedAt: p.acknowledgedAt, outcome: p.outcome, reviews: reviews.slice(0, 25).map(r => ({ ...r, evidence: (JSON.parse(r.evidence) as EvidenceReference[]).filter(e => visibleKeys.has(e.type + ":" + e.id)) })), nextCursor: reviews.length > 25 ? reviews[24].id : null, canManage: management && b.ctx.organizationIds("nicejobs.pip.manage").includes(s.assignment.divisionId), canReview: management && b.ctx.organizationIds("nicejobs.pip.review").includes(s.assignment.divisionId), canPrivate: privateAccess, canRespond: !management && b.ctx.organizationIds("nicejobs.pip.self.respond").includes(s.assignment.divisionId), timezone: b.timezone };
    });
  }
  async function options(userId: string, raw: unknown = {}) {
    const q = performanceQuery.parse(raw);
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), ids = b.ctx.organizationIds("nicejobs.performance.framework.read").filter(id => b.ctx.nodes.some(n => n.id === id && n.parentId === b.company.id) && (!q.divisionId || id === q.divisionId));
      const frameworks = await db.niceJobsPerformanceVersion.findMany({ where: { framework: { companyId: b.company.id, divisionId: { in: ids } } }, include: frameworkInclude, orderBy: { id: "asc" }, take: 51 });
      const workers = await db.niceJobsAssignment.findMany({ where: { divisionId: { in: b.ctx.organizationIds("nicejobs.performance.read").filter(id => b.ctx.organizationIds("person.read").includes(id) && b.ctx.organizationIds("nicejobs.workspace.read").includes(id) && (!q.divisionId || id === q.divisionId)) }, profile: { companyId: b.company.id, personId: { not: b.personId } }, version: { template: { productId: b.product.id } }, status: "ACTIVE", activatedAt: { not: null } }, select: { id: true, divisionId: true, versionId: true, profile: { select: { person: { select: { displayName: true } } } } }, orderBy: { id: "asc" }, take: 51 });
      const jobs = await db.niceJobsVersion.findMany({ where: { publishedAt: { not: null }, template: { companyId: b.company.id, productId: b.product.id }, areas: { some: { divisionId: { in: ids } } } }, select: { id: true, templateId: true, title: true, number: true }, orderBy: { id: "asc" }, take: 51 });
      const divisions = await db.organization.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { id: "asc" }, take: 50 });
      return { companyId: b.company.id, canExecutive: b.ctx.organizationIds("executive.read").some(id => b.ctx.organizationIds("nicejobs.performance.read").includes(id)), canGenerate: workers.some(a => b.ctx.organizationIds("nicejobs.performance.generate").includes(a.divisionId)), canCreate: ids.some(id => b.ctx.organizationIds("nicejobs.performance.framework.manage").includes(id)), divisions, frameworks: frameworks.slice(0, 50).map(v => ({ id: v.id, number: v.number, revision: v.revision, status: v.status, definition: frameworkPayload.parse(JSON.parse(v.definition)), canManage: b.ctx.organizationIds("nicejobs.performance.framework.manage").includes(v.framework.divisionId), canPublish: b.ctx.organizationIds("nicejobs.performance.framework.publish").includes(v.framework.divisionId) })), workers: workers.slice(0, 50).map(a => ({ id: a.id, name: a.profile.person.displayName, divisionId: a.divisionId, versionId: a.versionId })), jobs, truncated: frameworks.length > 50 || workers.length > 50 || jobs.length > 50 };
    });
  }
  async function pips(userId: string, raw: unknown = {}, constraint?: AgentConstraint) {
    const q = performanceQuery.parse(raw);
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId, constraint), a = q.management ? null : await employee.own(db, b);
      if (a) await b.ctx.requireAccess("nicejobs.pip.self.read", { organizationId: a.divisionId });
      const ids = q.management ? b.ctx.organizationIds("nicejobs.pip.read").filter(id => b.ctx.organizationIds("person.read").includes(id) && b.ctx.organizationIds("nicejobs.workspace.read").includes(id) && b.ctx.organizationIds("nicejobs.performance.read").includes(id)) : [a!.divisionId];
      if (!ids.length || q.companyId && q.companyId !== b.company.id || q.divisionId && !ids.includes(q.divisionId) || a && q.assignmentId && q.assignmentId !== a.id) throw new AccessError("Plan scope unavailable");
      const rows = await db.niceJobsPip.findMany({ where: { assignment: { profile: { companyId: b.company.id, personId: q.management ? { not: b.personId } : b.personId }, divisionId: q.divisionId ?? { in: ids }, ...(q.jobId ? { version: { templateId: q.jobId } } : {}) }, ...(a || q.assignmentId ? { assignmentId: a?.id ?? q.assignmentId } : {}), ...(!q.management ? { released: true, status: { not: "DRAFT" } } : {}), ...(q.pipStatus ? { AND: [{ status: q.pipStatus }] } : {}), ...(q.from || q.until ? { startAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.until ? { lt: new Date(q.until) } : {}) } } : {}), title: { contains: q.search }, ...(q.after ? { id: { gt: q.after } } : {}) }, select: { id: true, title: true, status: true, startAt: true, reviewAt: true, assignmentId: true, released: true }, orderBy: { id: "asc" }, take: q.limit + 1 });
      return { records: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null };
    });
  }
  async function evidenceOptions(userId: string, assignmentId: string, management = false) {
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), a = management ? await manager(db, b, assignmentId) : await employee.own(db, b);
      if (a.id !== assignmentId) throw new AccessError("Evidence scope unavailable");
      const choices: { id: string; type: EvidenceReference["type"]; name: string }[] = [];
      if (sourceAuthorized(b.ctx, a, "TASK_COMPLETED")) for (const r of await db.task.findMany({ where: employee.taskWhere(b, a), select: { id: true, title: true }, orderBy: { id: "asc" }, take: 25 })) choices.push({ id: r.id, type: "TASK", name: r.title });
      if (sourceAuthorized(b.ctx, a, "LEAD_CONTACT")) for (const r of await db.niceJobsLead.findMany({ where: { companyId: b.company.id, divisionId: a.divisionId, currentWorkerAssignmentId: a.id }, select: { id: true, name: true }, orderBy: { id: "asc" }, take: 25 })) choices.push({ id: r.id, type: "LEAD", name: r.name });
      if (sourceAuthorized(b.ctx, a, "FOLLOWUP_COMPLETED")) for (const r of await db.niceJobsLeadFollowup.findMany({ where: { workerAssignmentId: a.id, lead: { currentWorkerAssignmentId: a.id, divisionId: a.divisionId } }, select: { id: true, purpose: true }, orderBy: { id: "asc" }, take: 25 })) choices.push({ id: r.id, type: "FOLLOWUP", name: r.purpose });
      if (sourceAuthorized(b.ctx, a, "REPORT_SUBMITTED")) for (const r of await db.niceJobsDailyReport.findMany({ where: { assignmentId: a.id, correction: null }, select: { id: true, reportDate: true }, orderBy: { id: "asc" }, take: 25 })) choices.push({ id: r.id, type: "REPORT", name: r.reportDate });
      if (sourceAuthorized(b.ctx, a, "OJT_COMPLETED")) for (const r of await db.niceJobsTrainingProgress.findMany({ where: { onboardingId: a.onboardingId ?? "" }, select: { id: true, key: true }, orderBy: { id: "asc" }, take: 25 })) choices.push({ id: r.id, type: "TRAINING", name: r.key });
      if (sourceAuthorized(b.ctx, a, "BLOCKER_OPEN")) for (const r of await db.executionBlocker.findMany({ where: { niceJobsAssignmentId: a.id, organizationId: a.divisionId }, select: { id: true, reason: true }, orderBy: { id: "asc" }, take: 25 })) choices.push({ id: r.id, type: "BLOCKER", name: r.reason ?? "Blocker" });
      for (const kind of ["SOP", "RESOURCE"] as const) for (const r of await db.niceJobsKnowledgeVersion.findMany({ where: workerKnowledgeWhere(b.ctx, a, b.company.id, kind, now(), false), select: { id: true, title: true, number: true }, orderBy: { id: "asc" }, take: 25 })) choices.push({ id: r.id, type: kind, name: r.title + " / v" + r.number });
      const managerIds = b.ctx.organizationIds("person.read");
      const managers = management && managerIds.includes(a.divisionId) ? await db.person.findMany({ where: { status: "ACTIVE", memberships: { some: { ...activeMembershipWhere(now()), scopeKey: "organization", projectId: null, OR: [{ organizationId: a.divisionId }, { organizationId: { in: [b.company.id, ...b.ctx.nodes.filter(n => n.type === "GROUP").map(n => n.id)] }, scope: "DESCENDANTS" }] } } }, select: { id: true, displayName: true }, orderBy: { id: "asc" }, take: 50 }) : [];
      return { choices, managers: managers.filter(p => p.id !== a.profile.personId).map(p => ({ id: p.id, name: p.displayName })), bounded: true };
    });
  }
  async function evidence(userId: string, snapshotId: string, raw: unknown, management = false) {
    const ref = evidenceReference.parse(raw);
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), s = await loadSnapshot(db, b, snapshotId, management), projection = await projectSnapshot(db, b, s, management);
      if (!projection.results.some(r => r.evidence.some(e => e.type === ref.type && e.id === ref.id))) throw new AccessError("Evidence unavailable");
      let record: object | null = null;
      if (ref.type === "TASK") record = await db.task.findUnique({ where: { id: ref.id }, select: { title: true, status: true, description: true, dueDate: true, completionDate: true } });
      if (ref.type === "LEAD") record = await db.niceJobsLead.findUnique({ where: { id: ref.id }, select: { name: true, priority: true, source: true, workflowInstance: { select: { currentState: { select: { name: true } } } } } });
      if (ref.type === "FOLLOWUP") record = await db.niceJobsLeadFollowup.findUnique({ where: { id: ref.id }, select: { purpose: true, status: true, scheduledAt: true, completedAt: true, outcome: true, nextAction: true } });
      if (ref.type === "REPORT") record = await db.niceJobsDailyReport.findUnique({ where: { id: ref.id }, select: { reportDate: true, revision: true, submittedAt: true, notes: true } });
      if (ref.type === "TRAINING") record = await db.niceJobsTrainingProgress.findUnique({ where: { id: ref.id }, select: { key: true, phase: true, status: true, completedAt: true } });
      if (ref.type === "SOP_RECEIPT") record = await db.niceJobsKnowledgeReceipt.findUnique({ where: { id: ref.id }, select: { readAt: true, acknowledgedAt: true, version: { select: { title: true, number: true } } } });
      if (ref.type === "BLOCKER") record = await db.executionBlocker.findUnique({ where: { id: ref.id }, select: { reason: true, description: true, status: true, createdAt: true, resolvedAt: true } });
      if (!record) throw new AccessError("Evidence unavailable");
      return { snapshotId, type: ref.type, record };
    });
  }
  // Export foundation intentionally exposes only the same bounded, reauthorized report DTO; no private notes.
  async function report(userId: string, raw: unknown = {}) { const result = await list(userId, raw); return { formatVersion: 1, generatedAt: now(), ...result }; }
  async function executiveSummary(userId: string, raw: unknown) {
    const q = performanceQuery.parse(raw);
    if (!q.from || !q.until || q.from >= q.until) throw new NiceJobsError("Executive aggregation requires an explicit bounded period");
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId);
      if (q.companyId && q.companyId !== b.company.id) throw new AccessError("Company unavailable");
      const keys = ["executive.read", "nicejobs.performance.read", "person.read", "nicejobs.workspace.read", "task.read", "nicejobs.lead.pool.read", "nicejobs.report.read", "nicejobs.onboarding.read", "nicejobs.sop.read", "nicejobs.blocker.manage"];
      const ids = b.ctx.nodes.filter(n => n.type === "DIVISION" && n.parentId === b.company.id && keys.every(k => b.ctx.organizationIds(k).includes(n.id))).map(n => n.id);
      if (!ids.length || q.divisionId && !ids.includes(q.divisionId)) throw new AccessError("Executive performance source coverage unavailable");
      const rows = await db.niceJobsPerformanceSnapshot.groupBy({ by: ["frameworkVersionId", "status"], where: { correction: null, periodStart: { gte: new Date(q.from!), lt: new Date(q.until!) }, frameworkVersion: { framework: { companyId: b.company.id, divisionId: q.divisionId ?? { in: ids }, ...(q.jobId ? { jobVersion: { templateId: q.jobId } } : {}) } } }, _count: { _all: true }, orderBy: [{ frameworkVersionId: "asc" }, { status: "asc" }], take: 101 });
      if (rows.length > 100) throw new NiceJobsError("Narrow the aggregation period or division; no partial totals returned");
      const versions = await db.niceJobsPerformanceVersion.findMany({ where: { id: { in: rows.map(r => r.frameworkVersionId) } }, select: { id: true, number: true, framework: { select: { name: true, division: { select: { name: true } }, jobVersion: { select: { title: true } } } } }, take: 100 });
      return { from: q.from, until: q.until, unit: "SNAPSHOTS_NOT_UNIQUE_WORKERS", records: rows.map(r => ({ frameworkVersionId: r.frameworkVersionId, framework: versions.find(v => v.id === r.frameworkVersionId)?.framework.name, version: versions.find(v => v.id === r.frameworkVersionId)?.number, division: versions.find(v => v.id === r.frameworkVersionId)?.framework.division.name, job: versions.find(v => v.id === r.frameworkVersionId)?.framework.jobVersion.title, status: r.status, snapshots: r._count._all })) };
    });
  }
  return { mutate, list, detail, pips, pipDetail, options, evidenceOptions, evidence, report, executiveSummary };
}
export const performanceService = createPerformanceService();
