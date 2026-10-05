import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { workforcePermissions } from "@/server/authorization/registry";
import { createExecutiveService } from "@/server/domain/executive-service";
import { createExecutionService } from "@/server/domain/execution-service";
import { createOperationsService } from "@/server/domain/operations-service";
import { kpiStatus, trend } from "@/server/domain/executive-input";
import { notify, operationalEvent } from "@/server/domain/operational-events";
const dir = mkdtempSync(join(tmpdir(), "maxpase-phase07-")), file = join(dir, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const service = createExecutiveService(db), execution = createExecutionService(db), ops = createOperationsService(db);
let group: string, a: string, b: string, division: string, admin: string, reader: string, narrow: string, other: string, projectOnly: string, projectId: string, taskId: string, goalId: string;
let seq = 0; const unique = () => "executive-" + ++seq;
const keys = [...new Set([...workforcePermissions.map(p => p.key), ...["company", "organization", "project", "goal", "product", "brand", "membership"].flatMap(d => [d + ".read", d + ".manage"])])];
async function actor(org: string, permissions = keys, descendants = false, projectId?: string) {
  const person = await db.person.create({ data: { displayName: unique() } });
  const user = await db.user.create({ data: { personId: person.id, email: unique() + "@test.invalid" } });
  const role = await db.role.create({ data: { organizationId: org, key: unique(), name: "Founder", permissions: { create: permissions.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId: org, scope: descendants ? "DESCENDANTS" : projectId ? "PROJECT" : "ORGANIZATION", projectId, scopeKey: projectId ? "project:" + projectId : "organization", roles: { create: { roleId: role.id } } } });
  return user.id;
}
async function payload(kind: "DECISION" | "KPI" | "RISK" | "OPPORTUNITY", extra = {}) {
  const person = (await db.user.findUniqueOrThrow({ where: { id: admin } })).personId!;
  return { kind, organizationId: a, ownerPersonId: person, title: unique(), description: "Human-authored business context", reference: unique() + "-reference", ...extra };
}
const metric = (data: Awaited<ReturnType<typeof service.dashboard>>, name: string) => data.metrics.find(m => m.name === name)!;
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(`prisma/migrations/${folder}/migration.sql`, "utf8"));
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]); sql.close();
  group = (await db.organization.create({ data: { type: "GROUP", name: "Group", slug: unique() } })).id;
  a = (await db.organization.create({ data: { type: "COMPANY", parentId: group, name: "Company A", slug: unique() } })).id;
  b = (await db.organization.create({ data: { type: "COMPANY", parentId: group, name: "Secret B", slug: unique() } })).id;
  division = (await db.organization.create({ data: { type: "DIVISION", parentId: a, name: "Division", slug: unique() } })).id;
  for (const key of keys) await db.permission.create({ data: { key, name: key, scope: "GROUP" } });
  admin = await actor(group, keys, true); reader = await actor(a, keys, true); other = await actor(b); narrow = await actor(a, ["executive.read", "organization.read", "company.read", "project.read"], true);
  const p = await execution.save(admin, "projects", { organizationId: division, name: "Visible blocked project", slug: unique(), status: "BLOCKED" }); projectId = p.id;
  taskId = (await execution.save(admin, "tasks", { organizationId: division, projectId, title: "Critical overdue action", priority: "CRITICAL", dueDate: "2025-01-01" })).id;
  await execution.save(admin, "tasks", { organizationId: division, projectId, title: "Normal overdue action", dueDate: "2025-01-01" });
  goalId = (await execution.save(admin, "goals", { organizationId: division, projectId, title: "At risk goal", status: "AT_RISK", targetDate: "2027-01-01" })).id;
  const secret = await execution.save(admin, "projects", { organizationId: b, name: "Secret blocked project", slug: unique(), status: "BLOCKED" });
  await execution.save(admin, "tasks", { organizationId: b, projectId: secret.id, title: "Secret critical task", priority: "CRITICAL", dueDate: "2025-01-01" });
  projectOnly = await actor(division, ["executive.read", "project.read", "task.read", "goal.read", "event.read", "kpi.read"], false, projectId);
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
describe("Phase 07 deterministic executive boundary", () => {
  it("aggregates only authorized companies and rejects forged filters/actors", async () => {
    const view = await service.dashboard(reader);
    expect(metric(view, "Blocked projects").value).toBe(1); expect(metric(view, "Overdue tasks").value).toBe(2);
    expect(view.companies.map(c => c.name)).toEqual(["Company A"]);
    expect(JSON.stringify(view)).not.toContain("Secret");
    await expect(service.dashboard(reader, { organizationId: b })).rejects.toThrow();
    await expect(service.dashboard(reader, { actorUserId: admin })).rejects.toThrow();
    await expect(service.dashboard(reader, { organizationId: a, projectId: "forged" })).rejects.toThrow();
    await expect(service.save(reader, { ...await payload("RISK", { severity: "HIGH" }), actorUserId: admin })).rejects.toThrow();
  });
  it("keeps project-only grants from widening totals and inaccessible data from becoming zero", async () => {
    const view = await service.dashboard(projectOnly);
    expect(metric(view, "Blocked projects").value).toBe(1); expect(view.companies).toEqual([]);
    await expect(service.dashboard(projectOnly, { organizationId: division })).rejects.toThrow();
    const limited = await service.dashboard(narrow);
    expect(metric(limited, "Overdue tasks")).toMatchObject({ value: null, status: "NO_DATA" });
    expect(limited.attention.some(s => s.id === taskId)).toBe(false);
    expect(limited.projects[0].progress).toBeNull();
  });
  it("generates explainable severity without promoting normal overdue tasks to attention", async () => {
    const view = await service.dashboard(reader);
    expect(view.attention.find(s => s.id === taskId)).toMatchObject({ severity: "CRITICAL", handlingStatus: "NEW", explanation: expect.stringContaining("past its due date") });
    expect(view.attention.some(s => s.title === "Normal overdue action")).toBe(false);
    expect(view.attention.find(s => s.id === projectId)?.severity).toBe("HIGH");
    expect(view.attention.find(s => s.id === goalId)?.severity).toBe("MEDIUM");
    const filtered = await service.dashboard(reader, { severity: "CRITICAL", organizationId: a });
    expect(filtered.attention.every(s => s.severity === "CRITICAL")).toBe(true);
  });
  it("persists attention handling with audit, rejects replay and rechecks source revocation", async () => {
    const signal = (await service.dashboard(reader)).attention.find(s => s.id === taskId)!;
    const row = await service.handleAttention(reader, signal.key, "ACKNOWLEDGED", "Owner contacted", 0);
    expect((await service.dashboard(reader)).attention.find(s => s.key === signal.key)).toMatchObject({ handlingStatus: "ACKNOWLEDGED", recordId: row.id });
    await expect(service.handleAttention(reader, signal.key, "IN_PROGRESS", "Replay", 0)).rejects.toThrow("Stale");
    await expect(service.handleAttention(other, signal.key, "RESOLVED", "Forged scope", 1)).rejects.toThrow();
    expect(await db.auditEvent.count({ where: { entityId: row.id } })).toBe(1);
  });
  it("requires an assigned human decision maker and preserves append-only lifecycle history", async () => {
    const row = await service.save(admin, await payload("DECISION", { impact: "Reschedule a blocked initiative", options: ["Reschedule", "Cancel"], dueAt: "2030-01-01" }));
    await service.transition(admin, { id: row.id, status: "PENDING", expectedVersion: 0, reason: "Ready for review" });
    expect((await service.dashboard(admin)).decisions.find(d => d.id === row.id)?.dueAt?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
    await expect(service.transition(reader, { id: row.id, status: "APPROVED", expectedVersion: 1, reason: "Unassigned human" })).rejects.toThrow("designated");
    await service.transition(admin, { id: row.id, status: "DEFERRED", expectedVersion: 1, reason: "Awaiting evidence" });
    await service.transition(admin, { id: row.id, status: "PENDING", expectedVersion: 2, reason: "Evidence received" });
    await service.transition(admin, { id: row.id, status: "APPROVED", expectedVersion: 3, reason: "Human decision" });
    await expect(service.transition(admin, { id: row.id, status: "REJECTED", expectedVersion: 4, reason: "Cannot rewrite" })).rejects.toThrow();
    await service.transition(admin, { id: row.id, status: "COMPLETED", expectedVersion: 4, reason: "Verified completion" });
    expect(await db.executiveHistory.count({ where: { recordId: row.id } })).toBe(6);
    expect(await db.task.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({ status: "TODO" });
  });
  it("uses real, explicit KPI observations, exposes no invented history, and calculates trend", async () => {
    const raw = await payload("KPI", { target: 100, unit: "reports", direction: "HIGHER", periodStart: "2020-01-01", periodEnd: "2030-12-31", source: "Signed operational report" });
    const row = await service.save(admin, raw);
    const before = (await service.records(reader)).find(r => r.id === row.id)!;
    expect(before).toMatchObject({ actual: null, status: "NO_DATA", trend: "INSUFFICIENT_DATA" });
    await expect(service.transition(admin, { id: row.id, status: "ON_TRACK", expectedVersion: 0, reason: "Invented status" })).rejects.toThrow();
    for (const [i, value] of [60, 80, 95].entries()) await service.transition(admin, { id: row.id, status: "OBSERVE", expectedVersion: i, observation: value, reason: "Verified source sample " + i });
    expect((await service.records(reader)).find(r => r.id === row.id)).toMatchObject({ actual: 95, status: "AT_RISK", trend: "IMPROVING" });
    expect((await service.dashboard(reader)).attention.some(s => s.type === "KPI" && s.id === row.id)).toBe(true);
    expect((await service.dashboard(other)).records.some(r => r.id === row.id)).toBe(false);
    expect(kpiStatus(0, 0, "LOWER")).toBe("ON_TRACK"); expect(kpiStatus(null, 100, "HIGHER")).toBe("NO_DATA"); expect(trend([1, 2])).toBe("INSUFFICIENT_DATA"); expect(trend([1, 3, 2])).toBe("VOLATILE");
  });
  it("protects idempotency and immutable KPI definitions/periods", async () => {
    const raw = await payload("RISK", { severity: "MEDIUM", probability: null });
    const one = await service.save(admin, raw), two = await service.save(admin, raw);
    expect(two.id).toBe(one.id);
    await expect(service.save(admin, { ...raw, title: "Altered duplicate" })).rejects.toThrow("different payload");
    await expect(service.save(admin, await payload("KPI", { target: 2, unit: "count", direction: "HIGHER", periodStart: "2030-01-01", periodEnd: "2020-01-01", source: "Report" }))).rejects.toThrow();
    const expired = await service.save(admin, await payload("KPI", { target: 2, unit: "count", direction: "HIGHER", periodStart: "2020-01-01", periodEnd: "2021-01-01", source: "Old report" }));
    await expect(service.transition(admin, { id: expired.id, expectedVersion: 0, status: "OBSERVE", observation: 3, reason: "Backfill" })).rejects.toThrow("period");
  });
  it("protects risk and opportunity scope, validates owners and audits lifecycle updates", async () => {
    const risk = await service.save(admin, await payload("RISK", { severity: "HIGH", probability: 0.4, mitigation: "Resolve dependency" }));
    const opportunity = await service.save(admin, await payload("OPPORTUNITY", { impact: "Improved delivery", nextAction: "Validate demand" }));
    expect((await service.records(reader)).map(r => r.id)).toEqual(expect.arrayContaining([risk.id, opportunity.id]));
    await expect(service.transition(other, { id: risk.id, expectedVersion: 0, status: "ACCEPTED", reason: "Foreign decision" })).rejects.toThrow();
    await expect(service.save(admin, await payload("RISK", { severity: "HIGH", ownerPersonId: (await db.user.findUniqueOrThrow({ where: { id: other } })).personId }))).rejects.toThrow("membership");
    await service.transition(admin, { id: risk.id, expectedVersion: 0, status: "MITIGATING", reason: "Mitigation underway" });
    await service.revise(admin, { id: risk.id, expectedVersion: 1, title: "Updated risk", description: "New mitigation evidence", mitigation: "Owner confirmed revised plan", severity: "MEDIUM", reason: "Risk reassessed" });
    await expect(service.revise(other, { id: risk.id, expectedVersion: 2, title: "Hijack", description: "Wrong scope", reason: "Foreign actor" })).rejects.toThrow();
    await service.transition(reader, { id: opportunity.id, expectedVersion: 0, status: "EVALUATING", reason: "Human evaluation" });
    expect(await db.auditEvent.count({ where: { entityId: risk.id } })).toBe(3);
  });
  it("rolls back business records and history if the audit fails", async () => {
    const sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_executive_audit BEFORE INSERT ON AuditEvent BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    const before = await db.executiveRecord.count(), history = await db.executiveHistory.count();
    try { await expect(service.save(admin, await payload("RISK", { severity: "LOW" }))).rejects.toThrow(); expect(await db.executiveRecord.count()).toBe(before); expect(await db.executiveHistory.count()).toBe(history); }
    finally { sql.exec("DROP TRIGGER fail_executive_audit"); sql.close(); }
  });
  it("detects only meaningful changes and deadline crossings, preserving source confidentiality", async () => {
    const view = await service.dashboard(reader, { from: "2024-01-01", until: "2030-01-01" });
    expect(view.changes.some(c => c.title.includes("Task became overdue"))).toBe(true);
    expect(view.changes.some(c => c.title === "project created")).toBe(true);
    expect(view.changes.some(c => c.title === "task assigned")).toBe(false);
    const limited = await service.dashboard(narrow, { from: "2024-01-01", until: "2030-01-01" });
    expect(limited.changes.some(c => c.entityId === taskId)).toBe(false);
    await expect(ops.registerEvent(admin, { organizationId: a, resourceType: "ORGANIZATION", resourceId: a, eventType: "kpi.status_changed", reference: unique() + "-event" })).rejects.toThrow("Lifecycle");
    await expect(ops.registerEvent(admin, { organizationId: a, resourceType: "ORGANIZATION", resourceId: a, eventType: "companies.updated", reference: unique() + "-event" })).rejects.toThrow("Lifecycle");
    const legacy = await db.$transaction(tx => operationalEvent(tx, { actorUserId: admin, organizationId: a, action: "companies.updated", entityType: "ORGANIZATION", entityId: a, result: "SUCCESS", metadata: { origin: "USER_REPORTED" } }));
    expect((await service.dashboard(reader)).changes.some(c => c.id === "audit:" + legacy.auditId)).toBe(false);
  });
  it("reuses project progress and goal history and produces a safe deterministic briefing DTO", async () => {
    const view = await service.dashboard(reader);
    const existing = await execution.detail(reader, projectId);
    expect(view.projects[0].progress).toBe("calculatedProgress" in existing.project ? existing.project.calculatedProgress : null);
    expect(view.goals.find(g => g.id === goalId)?.trend).toBe("INSUFFICIENT_DATA");
    expect(view.briefing.blockedWork.map(p => p.id)).toContain(projectId);
    expect(view.briefing.timezone).toBe("UTC");
    const json = JSON.stringify(view); expect(json).not.toMatch(/passwordHash|AUTH_SECRET|toolPayload|Secret B/);
    expect(view.calculatedAt).toBeInstanceOf(Date);
    const audit = await db.auditEvent.count(); await service.dashboard(reader); expect(await db.auditEvent.count()).toBe(audit);
  });
  it("reuses the shared approval authority and detects actual approval completion", async () => {
    const resource = { organizationId: division, projectId, resourceType: "PROJECT", resourceId: projectId };
    const control = await ops.saveControl(admin, { organizationId: division, projectId, name: unique(), kind: "APPROVAL", requiredPermission: "approval.decide", stages: [[{ approverUserId: reader, requiredPermission: "approval.decide" }]] });
    const request = await ops.createRequest(admin, { ...resource, title: "Real executive approval", controlPointId: control.id, idempotencyKey: unique() + "-request" });
    await ops.submitRequest(admin, request.id);
    const approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: request.id } });
    const pending = await service.dashboard(reader);
    expect(pending.decisions.find(d => d.id === approval.id)).toMatchObject({ type: "APPROVAL", actionable: true });
    await expect(ops.decide(other, { approvalId: approval.id, decision: "APPROVED", comment: "Foreign actor" })).rejects.toThrow();
    await ops.decide(reader, { approvalId: approval.id, decision: "APPROVED", comment: "Authorized human decision" });
    const after = await service.dashboard(reader);
    expect(after.decisions.some(d => d.id === approval.id)).toBe(false);
    expect(after.changes.some(c => c.entityId === approval.id && c.title === "approval approved")).toBe(true);
    expect(await db.executiveRecord.count({ where: { sourceKey: approval.id } })).toBe(0);
  });
  it("removes revoked source history and attention, and never reports future deadlines as changes", async () => {
    const account = await actor(a, keys, true);
    const signal = (await service.dashboard(account)).attention.find(s => s.id === taskId)!;
    await service.handleAttention(account, signal.key, "IN_PROGRESS", "Second handling update", 1);
    const role = await db.role.findFirstOrThrow({ where: { memberships: { some: { membership: { person: { users: { some: { id: account } } } } } } } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "task.read" } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: permission.id } });
    const revoked = await service.dashboard(account);
    expect(revoked.attention.some(s => s.id === taskId)).toBe(false);
    expect(revoked.records.some(r => r.kind === "ATTENTION" && r.sourceKey === signal.key)).toBe(false);
    const future = await execution.save(admin, "tasks", { organizationId: division, projectId, title: "Future deadline", priority: "HIGH", dueDate: "2030-01-01" });
    expect((await service.dashboard(reader, { from: "2024-01-01", until: "2031-01-01" })).changes.some(c => c.id === "deadline:" + future.id)).toBe(false);
  });
  it("validates product/branch filters before calculating metrics and preserves real goal/dependency context", async () => {
    const product = await db.product.create({ data: { organizationId: a, name: "Readable product", slug: unique() } });
    const foreign = await db.product.create({ data: { organizationId: b, name: "Secret product", slug: unique() } });
    const project = await execution.save(admin, "projects", { organizationId: a, productId: product.id, name: "Product delivery", slug: unique() });
    const goal = await execution.save(admin, "goals", { organizationId: a, projectId: project.id, productId: product.id, title: "Product goal", status: "ACTIVE" });
    const prerequisite = await execution.save(admin, "tasks", { organizationId: a, projectId: project.id, title: "Real prerequisite", dueDate: "2025-01-01" });
    const task = await execution.save(admin, "tasks", { organizationId: a, projectId: project.id, goalId: goal.id, title: "Supporting task" });
    await execution.dependency(admin, { taskId: task.id, prerequisiteId: prerequisite.id });
    await execution.progress(admin, goal.id, 10, "First measured estimate");
    await execution.progress(admin, goal.id, 20, "Second measured estimate");
    await execution.progress(admin, goal.id, 30, "Third measured estimate");
    const view = await service.dashboard(reader, { productId: product.id });
    expect(view.projects.map(p => p.id)).toEqual([project.id]); expect(metric(view, "Active projects").value).toBe(1);
    expect(view.goals.find(g => g.id === goal.id)).toMatchObject({ progress: 30, trend: "IMPROVING", supportingProjects: [expect.objectContaining({ id: project.id })], overdueDependencies: [expect.objectContaining({ id: prerequisite.id })] });
    expect(view.projects[0].reasons).toContain("1 unresolved dependencies");
    await expect(service.dashboard(reader, { productId: foreign.id })).rejects.toThrow();
    await expect(service.dashboard(reader, { organizationId: division, productId: product.id })).rejects.toThrow("outside");
  });
  it("keeps executive notifications private and metrics traceable without logging passive reads", async () => {
    const resource = { organizationId: a, resourceType: "ORGANIZATION", resourceId: a };
    const notice = await db.$transaction(tx => notify(tx, admin, reader, resource, "SYSTEM_EVENT", "Private executive notification", "Actual test event", unique() + "-notice", "HIGH"));
    const view = await service.dashboard(reader);
    expect(view.operations.NOTIFICATION.some(n => n.id === notice!.id)).toBe(true);
    expect((await service.dashboard(admin)).operations.NOTIFICATION.some(n => n.id === notice!.id)).toBe(false);
    const important = metric(view, "My important notifications"); expect(important.entities.map(e => e.id)).toContain(notice!.id);
    await ops.markRead(reader, notice!.id, true);
    expect(metric(await service.dashboard(reader), "My important notifications").entities.map(e => e.id)).not.toContain(notice!.id);
    await expect(ops.markRead(other, notice!.id, true)).rejects.toThrow();
  });
  it("intersects mixed grants for NO_DATA, selector labels and project capability hints", async () => {
    const mixed = await actor(a, ["executive.read", "organization.read", "company.read", "project.read"]);
    const personId = (await db.user.findUniqueOrThrow({ where: { id: mixed } })).personId!;
    const foreignProject = await db.project.findFirstOrThrow({ where: { organizationId: b } });
    const role = await db.role.create({ data: { organizationId: b, key: unique(), name: "Founder", permissions: { create: ["task.read", "event.read", "person.read", "risk.manage", "kpi.manage"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId, organizationId: b, roles: { create: { roleId: role.id } } } });
    await db.membership.create({ data: { personId, organizationId: b, projectId: foreignProject.id, scope: "PROJECT", scopeKey: "project:" + foreignProject.id, roles: { create: { roleId: role.id } } } });
    const view = await service.dashboard(mixed);
    expect(metric(view, "Overdue tasks")).toMatchObject({ value: null, status: "NO_DATA" });
    expect(metric(view, "Failed events")).toMatchObject({ value: null, status: "NO_DATA" });
    expect(view.capabilities["kpi.manage"].projects).toEqual([]);
    expect(view.options.people).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("Secret");
    const partial = await actor(a, ["executive.read", "organization.read", "company.read"]);
    const partialPerson = (await db.user.findUniqueOrThrow({ where: { id: partial } })).personId!;
    const branchRole = await db.role.create({ data: { organizationId: division, key: unique(), name: "Manager", permissions: { create: ["project.read", "task.read"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { organizationId: division, personId: partialPerson, roles: { create: { roleId: branchRole.id } } } });
    const partialView = await service.dashboard(partial);
    expect(partialView.companies[0].metrics.find(m => m.name === "Active projects")).toMatchObject({ value: null, status: "NO_DATA" });
    expect(partialView.companies[0].health).toBe("UNKNOWN");
  });
  it("surfaces actual processing failures through wrapped resources and reauthorizes handling", async () => {
    const reminder = await ops.saveReminder(admin, { organizationId: a, resourceType: "ORGANIZATION", resourceId: a, recipientUserId: reader, remindAt: "2020-01-01", reason: "Real failure exercise", reference: unique() + "-reminder" });
    const sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_reminder_delivery BEFORE INSERT ON Notification BEGIN SELECT RAISE(ABORT, 'test delivery failure'); END;");
    try { expect((await ops.processDue(admin, 25)).failures.map(f => f.id)).toContain(reminder.id); }
    finally { sql.exec("DROP TRIGGER fail_reminder_delivery"); sql.close(); }
    const failure = await db.operationalEvent.findFirstOrThrow({ where: { entityId: reminder.id, status: "FAILED" } });
    const view = await service.dashboard(reader);
    expect(metric(view, "Failed events").entities.map(e => e.id)).toContain(failure.id);
    const attention = view.attention.find(s => s.id === failure.id)!; expect(attention.severity).toBe("HIGH");
    await service.handleAttention(reader, attention.key, "ACKNOWLEDGED", "Reviewing delivery failure", 0);
    expect((await service.records(reader)).some(r => r.kind === "ATTENTION" && r.sourceKey === attention.key)).toBe(true);
    const limited = await actor(a, ["executive.read", "organization.read", "event.read"]);
    expect((await service.dashboard(limited)).attention.some(s => s.id === failure.id)).toBe(false);
    await expect(service.handleAttention(limited, attention.key, "RESOLVED", "No source authority", 1)).rejects.toThrow();
    expect((await service.dashboard(other)).attention.some(s => s.id === failure.id)).toBe(false);
  });
});
