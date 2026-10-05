import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createOperationsService, recurrenceDate } from "@/server/domain/operations-service";
import { createExecutionService } from "@/server/domain/execution-service";
import { workforcePermissions } from "@/server/authorization/registry";
const dir = mkdtempSync(join(tmpdir(), "maxpase-phase05-"));
const file = join(dir, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const ops = createOperationsService(db), execution = createExecutionService(db);
let a: string, b: string, admin: string, requester: string, first: string, parallel: string, last: string, outsider: string, viewer: string;
let sequence = 0;
const unique = () => "operations-" + ++sequence;
const scope = () => ({ organizationId: a, projectId: null, resourceType: "ORGANIZATION", resourceId: a });
const keys = [...new Set([...workforcePermissions.map(p => p.key), "sia.approve_action", ...["organization", "project", "task", "goal", "milestone", "product", "brand"].flatMap(d => [d + ".read", d + ".manage"])])];
async function actor(org: string, permissions = keys, descendants = false) {
  const person = await db.person.create({ data: { displayName: unique() } });
  const user = await db.user.create({ data: { personId: person.id, email: unique() + "@test.invalid" } });
  const role = await db.role.create({ data: { organizationId: org, key: unique(), name: "CEO", permissions: { create: permissions.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { organizationId: org, personId: person.id, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } });
  return user.id;
}
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(`prisma/migrations/${folder}/migration.sql`, "utf8"));
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  sql.close();
  const root = await db.organization.create({ data: { name: "Operations group", slug: unique(), type: "GROUP" } });
  a = (await db.organization.create({ data: { name: "Company A", slug: unique(), type: "COMPANY", parentId: root.id } })).id;
  b = (await db.organization.create({ data: { name: "Company B", slug: unique(), type: "COMPANY", parentId: root.id } })).id;
  for (const key of keys) await db.permission.create({ data: { key, name: key, scope: "GROUP" } });
  admin = await actor(root.id, keys, true);
  requester = await actor(a); first = await actor(a); parallel = await actor(a); last = await actor(a); outsider = await actor(b);
  viewer = await actor(a, ["organization.read", "workflow.read", "request.read", "approval.read", "notification.read", "event.read", "activity.read"]);
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
async function policy(stages = [[first]], kind = "APPROVAL") {
  return ops.saveControl(admin, { organizationId: a, name: unique(), kind, requiredPermission: kind === "APPROVAL" ? "approval.decide" : "control.evaluate", stages: kind === "APPROVAL" ? stages.map(stage => stage.map(approverUserId => ({ approverUserId }))) : [] });
}
async function request(controlPointId?: string, extra: Record<string, unknown> = {}) {
  const p = controlPointId ?? (await policy()).id;
  const r = await ops.createRequest(requester, { ...scope(), title: unique(), controlPointId: p, idempotencyKey: unique(), ...extra });
  await ops.submitRequest(requester, r.id);
  return r;
}
const approvals = (id: string) => db.siaApproval.findMany({ where: { requestId: id }, orderBy: [{ stageIndex: "asc" }, { approverUserId: "asc" }] });
const decide = (user: string, id: string, decision = "APPROVED") => ops.decide(user, { approvalId: id, decision, comment: "Reviewed against the operational policy" });
async function workflow(controlPointId?: string) {
  const definition = await ops.saveWorkflow(admin, { organizationId: a, key: "PROCESS_" + ++sequence, version: 1, name: unique(), states: [{ key: "READY", name: "Ready", initial: true }, { key: "FINISHED", name: "Finished", terminal: true }], transitions: [{ key: "FINISH", from: "READY", to: "FINISHED", requiredPermission: "workflow.transition", requireReason: true, controlPointId }] });
  await ops.publishWorkflow(admin, definition.id);
  const instance = await ops.startWorkflow(requester, { ...scope(), definitionId: definition.id, title: unique(), idempotencyKey: unique() });
  const transition = await db.workflowTransition.findFirstOrThrow({ where: { definitionId: definition.id } });
  return { definition, instance, transition, command: { instanceId: instance.id, transitionId: transition.id, expectedVersion: 0, reason: "Checked", idempotencyKey: unique() } };
}
describe("Phase 05 operational controls and security", () => {
  it("separates immutable published definitions from instances and prevents arbitrary states", async () => {
    const w = await workflow();
    expect(w.instance.currentStateId).toBe(w.transition.fromStateId);
    await expect(ops.publishWorkflow(admin, w.definition.id)).rejects.toThrow("draft");
    await expect(ops.transition(requester, { ...w.command, transitionId: "forged" })).rejects.toThrow();
    await ops.transition(requester, w.command);
    expect(await db.workflowInstance.findUnique({ where: { id: w.instance.id } })).toMatchObject({ status: "SUCCEEDED", version: 1, currentStateId: w.transition.toStateId });
  });
  it("rejects invalid graphs, missing reasons and capability escalation in configuration", async () => {
    const raw = { organizationId: a, key: "BAD", version: 1, name: unique(), states: [{ key: "A", name: "A", initial: true }, { key: "B", name: "B", terminal: true }, { key: "C", name: "C", terminal: true }], transitions: [{ key: "AB", from: "A", to: "B", requiredPermission: "workflow.transition" }] };
    await expect(ops.saveWorkflow(admin, raw)).rejects.toThrow("reachable");
    await expect(ops.saveControl(viewer, { organizationId: a, name: "Forged", kind: "VALIDATION", requiredPermission: "system.admin" })).rejects.toThrow();
    const w = await workflow();
    await expect(ops.transition(requester, { ...w.command, reason: "" })).rejects.toThrow("reason");
    await expect(ops.transition(viewer, w.command)).rejects.toThrow("Access denied");
    await expect(ops.processDue(viewer)).rejects.toThrow("Access denied");
  });
  it("makes instance and transition retries idempotent and rejects altered replay bodies", async () => {
    const w = await workflow();
    const key = unique(), raw = { ...scope(), title: unique(), definitionId: w.definition.id, idempotencyKey: key };
    const instance = await ops.startWorkflow(requester, raw);
    expect((await ops.startWorkflow(requester, raw)).id).toBe(instance.id);
    await expect(ops.startWorkflow(requester, { ...raw, title: "Changed" })).rejects.toThrow("Idempotency");
    const result = await ops.transition(requester, w.command);
    expect((await ops.transition(requester, w.command)).id).toBe(result.id);
    await expect(ops.transition(requester, { ...w.command, reason: "Changed" })).rejects.toThrow("replay");
    await expect(ops.transition(requester, { ...w.command, idempotencyKey: unique() })).rejects.toThrow("State changed");
    expect(await db.workflowHistory.count({ where: { instanceId: w.instance.id } })).toBe(1);
  });
  it("isolates company and project scopes and ignores forged actor identity", async () => {
    await expect(ops.createRequest(outsider, { ...scope(), actorUserId: requester, title: unique(), controlPointId: (await policy()).id, idempotencyKey: unique() })).rejects.toThrow("Access denied");
    await expect(ops.list(requester, "events", { organizationId: b })).rejects.toThrow("Access denied");
    await expect(ops.saveReminder(requester, { ...scope(), organizationId: b, recipientUserId: requester, remindAt: "2000-01-01", reason: "Forged", reference: unique() })).rejects.toThrow("scope");
    const p = await execution.save(admin, "projects", { organizationId: b, name: unique(), slug: unique() });
    await expect(ops.startWorkflow(requester, { ...scope(), projectId: p.id, definitionId: (await workflow()).definition.id, title: unique(), idempotencyKey: unique() })).rejects.toThrow("scope");
    const event = await ops.registerEvent(requester, { ...scope(), eventType: "system.received", reference: unique(), actorUserId: outsider });
    expect(event.actorUserId).toBe(requester);
  });
  it("requires configured human approval at a specific workflow state version", async () => {
    const p = await policy(), w = await workflow(p.id);
    await expect(ops.transition(requester, w.command)).rejects.toThrow("approval");
    const r = await request(p.id, { workflowInstanceId: w.instance.id });
    await decide(first, (await approvals(r.id))[0].id);
    await ops.transition(requester, w.command);
    expect(await db.workflowInstance.findUnique({ where: { id: w.instance.id } })).toMatchObject({ version: 1 });
  });
  it("revalidates approved authority after membership suspension", async () => {
    const p = await policy(), w = await workflow(p.id), r = await request(p.id, { workflowInstanceId: w.instance.id });
    await decide(first, (await approvals(r.id))[0].id);
    const user = await db.user.findUniqueOrThrow({ where: { id: first } });
    await db.membership.updateMany({ where: { personId: user.personId! }, data: { status: "SUSPENDED" } });
    try { await expect(ops.transition(requester, w.command)).rejects.toThrow("authority"); }
    finally { await db.membership.updateMany({ where: { personId: user.personId! }, data: { status: "ACTIVE" } }); }
  });
  it("supports ordered stages with parallel unanimous decisions within a stage", async () => {
    const p = await policy([[first, parallel], [last]]), r = await request(p.id), chain = await approvals(r.id);
    const one = chain.find(a => a.approverUserId === first)!, two = chain.find(a => a.approverUserId === parallel)!, three = chain.find(a => a.approverUserId === last)!;
    expect((await ops.list(last, "approvals")).find(row => row.id === three.id)).toMatchObject({ actionable: false });
    await expect(decide(last, three.id)).rejects.toThrow("Earlier");
    await decide(first, one.id);
    expect(await db.operationalRequest.findUnique({ where: { id: r.id } })).toMatchObject({ status: "SUBMITTED" });
    await expect(decide(last, three.id)).rejects.toThrow("Earlier");
    await decide(parallel, two.id);
    expect((await ops.list(last, "approvals")).find(row => row.id === three.id)).toMatchObject({ actionable: true });
    await decide(last, three.id);
    expect(await db.operationalRequest.findUnique({ where: { id: r.id } })).toMatchObject({ status: "APPROVED" });
    expect(await db.notification.count({ where: { reference: "approval:" + three.id } })).toBe(1);
    const obsolete = await db.notification.findFirstOrThrow({ where: { reference: "approval:" + three.id } });
    expect(obsolete.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect((await ops.list(last, "notifications")).some(n => n.id === obsolete.id)).toBe(false);
  });
  it("rejects unauthorized approvers, role-name authority and approval replay", async () => {
    const r = await request(), approval = (await approvals(r.id))[0];
    await expect(decide(viewer, approval.id)).rejects.toThrow("assigned");
    await expect(decide(outsider, approval.id)).rejects.toThrow("assigned");
    await decide(first, approval.id);
    await expect(decide(first, approval.id)).rejects.toThrow("pending");
    expect(await db.auditEvent.count({ where: { entityId: approval.id, action: "approval.approved" } })).toBe(1);
  });
  it("rejects self approval by default and cancels remaining stages after rejection", async () => {
    const own = await policy([[requester]]);
    await expect(request(own.id)).rejects.toThrow("Self approval");
    const identity = await db.user.findUniqueOrThrow({ where: { id: requester } });
    const alias = await db.user.create({ data: { personId: identity.personId, email: unique() + "@test.invalid" } });
    await expect(policy([[requester, alias.id]])).rejects.toThrow("only once");
    const aliasPolicy = await policy([[alias.id]]);
    await expect(request(aliasPolicy.id)).rejects.toThrow("Self approval");
    const p = await policy([[first], [last]]), r = await request(p.id), chain = await approvals(r.id);
    await decide(first, chain[0].id, "REJECTED");
    expect((await approvals(r.id)).map(a => a.status)).toEqual(["REJECTED", "CANCELLED"]);
    await expect(decide(last, chain[1].id)).rejects.toThrow("pending");
    const pending = await request();
    const original = await db.user.findUniqueOrThrow({ where: { id: first } });
    const replacement = await actor(a);
    const otherPerson = (await db.user.findUniqueOrThrow({ where: { id: replacement } })).personId;
    await db.user.update({ where: { id: first }, data: { personId: otherPerson } });
    try {
      const assignment = (await approvals(pending.id))[0];
      expect((await ops.list(first, "approvals")).find(row => row.id === assignment.id)).toMatchObject({ actionable: false });
      await expect(decide(first, assignment.id)).rejects.toThrow("human identity");
    }
    finally { await db.user.update({ where: { id: first }, data: { personId: original.personId } }); }
  });
  it("supports draft changes, request duplicate protection, cancellation and expiry", async () => {
    const p = await policy(), raw = { ...scope(), title: unique(), controlPointId: p.id, idempotencyKey: unique() };
    const r = await ops.createRequest(requester, raw);
    expect((await ops.createRequest(requester, raw)).id).toBe(r.id);
    await expect(ops.createRequest(requester, { ...raw, title: "Changed" })).rejects.toThrow("replay");
    await ops.updateRequest(requester, r.id, "Changed", "Real change");
    await ops.submitRequest(requester, r.id);
    await expect(ops.updateRequest(requester, r.id, "Again", "")).rejects.toThrow("draft");
    await ops.cancelRequest(requester, r.id);
    expect((await approvals(r.id))[0].status).toBe("CANCELLED");
    const expired = await request();
    await db.operationalRequest.update({ where: { id: expired.id }, data: { expiresAt: new Date("2000-01-01") } });
    await expect(decide(first, (await approvals(expired.id))[0].id)).rejects.toThrow("expired");
    await ops.processDue(admin, 100);
    expect(await db.operationalRequest.findUnique({ where: { id: expired.id } })).toMatchObject({ status: "EXPIRED" });
  });
  it("enforces verification controls without allowing them to replace human decisions", async () => {
    const p = await policy([], "VERIFICATION"), w = await workflow(p.id);
    await expect(ops.transition(requester, w.command)).rejects.toThrow("verification");
    await ops.checkControl(requester, w.instance.id, p.id, false, "Needs correction");
    await expect(ops.transition(requester, w.command)).rejects.toThrow("verification");
    await ops.checkControl(requester, w.instance.id, p.id, true, "Verified after correction");
    await ops.transition(requester, w.command);
    const human = await policy(), h = await workflow(human.id);
    await expect(ops.checkControl(requester, h.instance.id, human.id, true, "Bypass")).rejects.toThrow("cannot be replaced");
  });
  it("generates real private notifications, honors preferences and protects duplicate references", async () => {
    const raw = { ...scope(), recipientUserId: first, reason: "A real operational notice", reference: unique() };
    const n = await ops.generateNotification(requester, raw);
    expect((await ops.generateNotification(requester, raw))!.id).toBe(n!.id);
    await expect(ops.generateNotification(requester, { ...raw, reason: "Different" })).rejects.toThrow("replay");
    await expect(ops.markRead(requester, n!.id)).rejects.toThrow("unavailable");
    await ops.markRead(first, n!.id);
    expect((await ops.list(first, "notifications", { read: "read", type: "SYSTEM_EVENT" })).some(r => r.id === n!.id)).toBe(true);
    expect((await ops.list(requester, "notifications")).some(r => r.id === n!.id)).toBe(false);
    await ops.preference(first, { type: "SYSTEM_EVENT", channel: "IN_APP", enabled: false });
    expect(await ops.generateNotification(requester, { ...raw, reference: unique() })).toBeNull();
    await ops.preference(first, { type: "SYSTEM_EVENT", channel: "IN_APP", enabled: true });
    await ops.preference(first, { type: "ALL", channel: "EMAIL", enabled: true });
    expect(await db.notificationPreference.count({ where: { userId: first, channel: "EMAIL" } })).toBe(1);
  });
  it("validates forged recipients and schedules reminders exactly once through bounded runs", async () => {
    const raw = { ...scope(), recipientUserId: first, remindAt: "2000-01-01", reason: "Real reminder", reference: unique() };
    await expect(ops.saveReminder(requester, { ...raw, recipientUserId: outsider })).rejects.toThrow("Access denied");
    const r = await ops.saveReminder(requester, raw);
    expect((await ops.saveReminder(requester, raw)).id).toBe(r.id);
    await expect(ops.processDue(requester, 101)).rejects.toThrow("batch");
    await ops.processDue(requester); await ops.processDue(requester);
    expect(await db.reminder.findUnique({ where: { id: r.id } })).toMatchObject({ status: "SUCCEEDED" });
    expect(await db.notification.count({ where: { reference: "reminder:" + r.id } })).toBe(1);
  });
  it("records explicit safe processing failure when a reminder recipient loses access", async () => {
    const recipient = await actor(a);
    const r = await ops.saveReminder(requester, { ...scope(), recipientUserId: recipient, remindAt: "2000-01-01", reason: "Revoked recipient", reference: unique() });
    await db.user.update({ where: { id: recipient }, data: { status: "SUSPENDED" } });
    const result = await ops.processDue(requester);
    expect(result.failures).toContainEqual({ id: r.id, code: "PROCESSING_FAILED" });
    expect(await db.reminder.findUnique({ where: { id: r.id } })).toMatchObject({ status: "FAILED", failureCode: "PROCESSING_FAILED" });
    expect(await db.notification.count({ where: { reference: "reminder:" + r.id } })).toBe(0);
  });
  it("generates finite recurring tasks and workflows with UTC anchored monthly behavior", async () => {
    expect(recurrenceDate(new Date("2024-01-31T10:00:00Z"), "MONTHLY", 1, 1).toISOString()).toBe("2024-02-29T10:00:00.000Z");
    expect(recurrenceDate(new Date("2024-01-31T10:00:00Z"), "MONTHLY", 1, 2).toISOString()).toBe("2024-03-31T10:00:00.000Z");
    const raw = { ...scope(), title: unique(), kind: "TASK", template: { title: unique() }, frequency: "WEEKLY", startAt: "2000-01-01", maxOccurrences: 1 };
    const r = await ops.saveRecurring(requester, raw);
    const w = await workflow();
    const run = await ops.saveRecurring(requester, { ...raw, kind: "WORKFLOW", template: null, definitionId: w.definition.id });
    await ops.processDue(admin); await ops.processDue(admin);
    expect(await db.recurringOccurrence.count({ where: { recurringWorkId: r.id } })).toBe(1);
    expect(await db.recurringOccurrence.count({ where: { recurringWorkId: run.id } })).toBe(1);
    expect(await db.recurringWork.findUnique({ where: { id: r.id } })).toMatchObject({ status: "COMPLETED", occurrences: 1 });
    await expect(ops.saveRecurring(requester, { ...raw, timezone: "Asia/Kolkata" })).rejects.toThrow();
  });
  it("does not generate recurring work for closed projects and records atomic failures", async () => {
    const p = await execution.save(admin, "projects", { organizationId: a, name: unique(), slug: unique() });
    const r = await ops.saveRecurring(requester, { organizationId: a, projectId: p.id, resourceType: "PROJECT", resourceId: p.id, title: unique(), kind: "TASK", template: { title: unique() }, frequency: "DAILY", startAt: "2000-01-01", maxOccurrences: 1 });
    await execution.save(admin, "projects", { organizationId: a, name: p.id, slug: p.id, status: "ARCHIVED" }, p.id);
    await ops.processDue(admin);
    expect(await db.recurringWork.findUnique({ where: { id: r.id } })).toMatchObject({ status: "FAILED", occurrences: 0 });
    expect(await db.recurringOccurrence.count({ where: { recurringWorkId: r.id } })).toBe(0);
  });
  it("requires explicit true escalation triggers and scoped responsible people", async () => {
    const p = await execution.save(admin, "projects", { organizationId: a, name: unique(), slug: unique(), status: "ACTIVE" });
    const raw = { organizationId: a, projectId: p.id, resourceType: "PROJECT", resourceId: p.id, trigger: "BLOCKED_PROJECT", level: 1, responsibleUserId: first, reason: "Resolve blocked delivery", reference: unique() };
    await expect(ops.escalate(requester, raw)).rejects.toThrow();
    await execution.save(admin, "projects", { organizationId: a, name: unique(), slug: unique(), status: "BLOCKED" }, p.id);
    const e = await ops.escalate(requester, raw);
    expect((await ops.escalate(requester, raw)).id).toBe(e.id);
    await ops.changeStatus(requester, "escalation", e.id, "RESOLVED");
    expect(await db.escalation.findUnique({ where: { id: e.id } })).toMatchObject({ status: "RESOLVED" });
    await expect(ops.escalate(requester, { ...raw, reference: unique(), responsibleUserId: outsider })).rejects.toThrow();
    const pending = await request();
    const approvalEscalation = { ...scope(), resourceType: "REQUEST", resourceId: pending.id, trigger: "PENDING_APPROVAL", responsibleUserId: first, level: 2, reason: "Awaiting human review", reference: unique() };
    await ops.escalate(requester, approvalEscalation);
    await decide(first, (await approvals(pending.id))[0].id);
    await expect(ops.escalate(requester, { ...approvalEscalation, reference: unique() })).rejects.toThrow("trigger");
  });
  it("derives safe activity from atomic events and rejects duplicate event forgery", async () => {
    const raw = { ...scope(), eventType: "business.observed", reference: unique(), correlationId: unique(), metadata: { confidential: "not-in-activity" } };
    const e = await ops.registerEvent(requester, raw);
    await expect(ops.registerEvent(requester, { ...raw, eventType: "task.completed", reference: unique() })).rejects.toThrow("domain mutation");
    expect((await ops.list(viewer, "events", { type: "business.observed" })).find(row => row.id === e.id)).toMatchObject({ origin: "USER_REPORTED" });
    expect((await ops.registerEvent(requester, raw)).id).toBe(e.id);
    await expect(ops.registerEvent(requester, { ...raw, eventType: "business.forged" })).rejects.toThrow("replay");
    const activity = await ops.list(viewer, "activity", { actorUserId: requester, entityId: a });
    expect(activity.some(a => "title" in a && a.title === "business observed")).toBe(true);
    expect(JSON.stringify(activity)).not.toContain("confidential");
    expect(JSON.stringify(await ops.list(viewer, "events"))).not.toContain("not-in-activity");
    const day = e.createdAt.toISOString().slice(0, 10);
    expect((await ops.list(viewer, "events", { from: day, until: day, actorUserId: requester, entityId: a })).some(r => r.id === e.id)).toBe(true);
    expect((await ops.list(outsider, "events")).some(r => r.id === e.id)).toBe(false);
    expect(await db.auditEvent.findUnique({ where: { id: e.auditId } })).toMatchObject({ actorUserId: requester, organizationId: a });
  });
  it("rolls back workflow transition, approval decision and notification when audit fails", async () => {
    const w = await workflow(), r = await request(), approval = (await approvals(r.id))[0];
    const sql = new DatabaseSync(file);
    sql.exec('CREATE TRIGGER deny_operation_audit BEFORE INSERT ON AuditEvent BEGIN SELECT RAISE(ABORT, "audit unavailable"); END;');
    try {
      await expect(ops.transition(requester, w.command)).rejects.toThrow();
      await expect(decide(first, approval.id)).rejects.toThrow();
      await expect(ops.generateNotification(requester, { ...scope(), recipientUserId: first, reason: "Rollback", reference: "rollback-notice" })).rejects.toThrow();
      expect(await db.workflowInstance.findUnique({ where: { id: w.instance.id } })).toMatchObject({ version: 0 });
      expect(await db.siaApproval.findUnique({ where: { id: approval.id } })).toMatchObject({ status: "PENDING", decidedAt: null });
      expect(await db.notification.count({ where: { reference: a + ":manual:rollback-notice" } })).toBe(0);
    } finally { sql.exec("DROP TRIGGER deny_operation_audit"); sql.close(); }
  });
  it("keeps SIA execution disabled even after independent human approval", async () => {
    const sia = await db.siaIdentity.create({ data: { name: "Test SIA" } });
    const p = await policy();
    const r = await ops.createRequest(requester, { ...scope(), title: "Prepare a recommendation", controlPointId: p.id, idempotencyKey: unique() }, { siaId: sia.id, toolKey: "recommendation.create", payload: { text: "Prepared, not executed" } });
    expect(await ops.siaBoundary(requester, r.id)).toMatchObject({ executionEnabled: false, humanApprovalValid: false });
    await ops.submitRequest(requester, r.id); await decide(first, (await approvals(r.id))[0].id);
    const role = await db.role.create({ data: { organizationId: a, key: unique(), name: "Test agent", principalType: "AGENT", permissions: { create: [{ permission: { connect: { key: "sia.approve_action" } } }] } } });
    await db.siaRoleAssignment.create({ data: { siaId: sia.id, organizationId: a, roleId: role.id } });
    await db.siaTool.create({ data: { siaId: sia.id, key: "recommendation.create", name: "Recommendation", permissionKey: "sia.approve_action", enabled: true } });
    expect(await ops.siaBoundary(requester, r.id)).toMatchObject({ permissionAllowed: true, toolAllowed: true, executionEnabled: false, humanApprovalValid: true, verificationStatus: "NOT_RUN" });
    const read = await ops.createRequest(requester, { ...scope(), title: "Propose reading organization", controlPointId: p.id, idempotencyKey: unique() }, { siaId: sia.id, toolKey: "organization.read" });
    expect(await ops.siaBoundary(requester, read.id)).toMatchObject({ approvalRequired: true, toolApprovalRequired: false, humanApprovalValid: false, executionEnabled: false });
    const w = await workflow(p.id);
    const bound = await ops.createRequest(requester, { ...scope(), title: "State-bound proposal", controlPointId: p.id, workflowInstanceId: w.instance.id, idempotencyKey: unique() }, { siaId: sia.id, toolKey: "recommendation.create" });
    await ops.submitRequest(requester, bound.id); await decide(first, (await approvals(bound.id))[0].id);
    expect(await ops.siaBoundary(requester, bound.id)).toMatchObject({ humanApprovalValid: true, executionEnabled: false });
    await ops.transition(requester, w.command);
    expect(await ops.siaBoundary(requester, bound.id)).toMatchObject({ humanApprovalValid: false, executionEnabled: false });
  });
  it("builds real overview counts, filters and My Tasks without synthetic work", async () => {
    const person = (await db.user.findUniqueOrThrow({ where: { id: requester } })).personId!;
    const t = await execution.save(admin, "tasks", { organizationId: a, title: unique(), assigneePersonId: person, dueDate: "2000-01-01" });
    expect((await ops.list(requester, "my-tasks", { status: "TODO", dueBefore: "2001-01-01" })).some(r => r.id === t.id)).toBe(true);
    expect((await ops.list(first, "my-tasks")).some(r => r.id === t.id)).toBe(false);
    expect(await ops.overview(requester)).toMatchObject({ overdueTasks: 1 });
    const completed = await execution.save(admin, "tasks", { organizationId: a, title: unique(), status: "COMPLETED", dueDate: "2000-01-01" });
    const overdue = await execution.list(requester, "tasks", { overdue: "true" });
    expect(overdue.some(r => r.id === t.id)).toBe(true);
    expect(overdue.some(r => r.id === completed.id)).toBe(false);
    expect((await ops.workspace(viewer)).scopes["approval.decide"].organizations).toEqual([]);
    const sql = new DatabaseSync(file);
    expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(sql.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" }); sql.close();
  });
  it("keeps project-only and department control authority inside the actual resource scope", async () => {
    const p = await execution.save(admin, "projects", { organizationId: a, name: unique(), slug: unique() });
    const sibling = await execution.save(admin, "projects", { organizationId: a, name: unique(), slug: unique() });
    const user = await actor(a), person = (await db.user.findUniqueOrThrow({ where: { id: user } })).personId!;
    const membership = await db.membership.findFirstOrThrow({ where: { personId: person } });
    await db.membership.update({ where: { id: membership.id }, data: { projectId: p.id, scopeKey: "project:" + p.id } });
    await ops.saveControl(user, { organizationId: a, projectId: p.id, name: unique(), kind: "VERIFICATION", requiredPermission: "control.evaluate" });
    await expect(ops.saveControl(user, { organizationId: a, projectId: sibling.id, name: unique(), kind: "VERIFICATION", requiredPermission: "control.evaluate" })).rejects.toThrow("Access denied");
    await expect(ops.saveControl(user, { organizationId: a, name: unique(), kind: "VERIFICATION", requiredPermission: "control.evaluate" })).rejects.toThrow("Access denied");
    const d1 = await db.organization.create({ data: { name: unique(), slug: unique(), type: "DEPARTMENT", parentId: a } });
    const d2 = await db.organization.create({ data: { name: unique(), slug: unique(), type: "DEPARTMENT", parentId: a } });
    const departmentUser = await actor(d1.id);
    await expect(ops.saveControl(departmentUser, { organizationId: d2.id, name: unique(), kind: "VERIFICATION", requiredPermission: "control.evaluate" })).rejects.toThrow("Access denied");
    expect((await ops.list(user, "controls")).every(r => "projectId" in r && r.projectId === p.id)).toBe(true);
  });
  it("rejects simultaneous competing transitions without leaving duplicate history", async () => {
    const w = await workflow();
    const results = await Promise.allSettled([ops.transition(requester, w.command), ops.transition(requester, { ...w.command, idempotencyKey: unique() })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.workflowHistory.count({ where: { instanceId: w.instance.id } })).toBe(1);
    expect(await db.workflowInstance.findUnique({ where: { id: w.instance.id } })).toMatchObject({ version: 1 });
  });
  it("requires underlying resource reads for reminders on requests and preserves personal preference ownership", async () => {
    const t = await execution.save(admin, "tasks", { organizationId: a, title: unique() });
    const r = await request(undefined, { resourceType: "TASK", resourceId: t.id });
    await expect(ops.saveReminder(requester, { ...scope(), resourceType: "REQUEST", resourceId: r.id, recipientUserId: viewer, remindAt: "2099-01-01", reason: "Confidential work", reference: unique() })).rejects.toThrow("Access denied");
    expect((await ops.list(viewer, "requests")).some(row => row.id === r.id)).toBe(false);
    await ops.preference(viewer, { userId: first, type: "REMINDER", channel: "PUSH", enabled: false });
    expect(await db.notificationPreference.findUnique({ where: { userId_type_channel: { userId: viewer, type: "REMINDER", channel: "PUSH" } } })).toMatchObject({ enabled: false });
    expect(await db.notificationPreference.findUnique({ where: { userId_type_channel: { userId: first, type: "REMINDER", channel: "PUSH" } } })).toBeNull();
    const processor = await actor(a, ["operations.process", "organization.read"]);
    const reminder = await ops.saveReminder(requester, { ...scope(), resourceType: "TASK", resourceId: t.id, recipientUserId: first, remindAt: "2000-01-01", reason: "Needs an authorized processor", reference: unique() });
    await expect(ops.processDue(processor)).rejects.toThrow("Access denied");
    expect(await db.reminder.findUnique({ where: { id: reminder.id } })).toMatchObject({ status: "PENDING", failureCode: null });
    await ops.changeStatus(requester, "reminder", reminder.id, "CANCELLED");
  });
  it("rolls back recurring outputs and surfaces audit-storage failure instead of claiming success", async () => {
    const r = await ops.saveRecurring(requester, { ...scope(), title: unique(), kind: "TASK", template: { title: unique() }, frequency: "DAILY", startAt: "2000-01-01", maxOccurrences: 1 });
    const before = await db.task.count();
    const sql = new DatabaseSync(file);
    sql.exec('CREATE TRIGGER deny_recurring_audit BEFORE INSERT ON AuditEvent BEGIN SELECT RAISE(ABORT, "audit unavailable"); END;');
    try {
      await expect(ops.processDue(admin, 100)).rejects.toThrow();
      expect(await db.task.count()).toBe(before);
      expect(await db.recurringOccurrence.count({ where: { recurringWorkId: r.id } })).toBe(0);
      expect(await db.recurringWork.findUnique({ where: { id: r.id } })).toMatchObject({ status: "ACTIVE", occurrences: 0 });
    } finally { sql.exec("DROP TRIGGER deny_recurring_audit"); sql.close(); }
    await ops.changeStatus(requester, "recurrence", r.id, "CANCELLED");
  });
});
