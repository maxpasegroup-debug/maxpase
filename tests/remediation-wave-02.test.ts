import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { workforcePermissions } from "@/server/authorization/registry";
import { createAccessContext } from "@/server/authorization/engine";
import { createAutomationService, automationService, automationActions } from "@/server/communications/automation";
import { createCommunicationsService, communicationsService } from "@/server/communications/service";
import { mockAdapter, type CommunicationAdapter } from "@/server/communications/providers";
import { resultFeedback, batchFeedback } from "@/server/communications/feedback";
import { createExecutionService } from "@/server/domain/execution-service";
import { createOperationsService } from "@/server/domain/operations-service";
import { createExecutiveService } from "@/server/domain/executive-service";
import { createAiraService } from "@/server/domain/aira-service";
import { QueryBudgetError, READ_BUDGET } from "@/server/domain/query-bounds";
import { retrieveMemory } from "@/server/sia/context";
import { communicationAction } from "@/app/app/communications/actions";

// Only Next request plumbing is mocked; action mutations use real Prisma services.
const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/server/auth/guards", () => ({ requireSession: async () => session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const directory = mkdtempSync(join(tmpdir(), "maxpase-wave02-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/"), log: [{ emit: "event", level: "query" }] });
const queries: { query: string; params: string }[] = [];
db.$on("query", event => queries.push({ query: event.query, params: event.params }));
let sequence = 0, time = new Date(), groupId: string, rootId: string;
const unique = () => "wave02-" + ++sequence;
const clock = () => time;
const keys = [...new Set([...workforcePermissions.map(p => p.key), "sia.approve_action", "organization.read", "project.read", "project.manage", "company.read", "program.read", "batch.read"])];
const execution = createExecutionService(db), ops = createOperationsService(db), executive = createExecutiveService(db), aira = createAiraService(db);
let wiredCommunication = createCommunicationsService(db, { now: clock }), wiredAutomation = createAutomationService(db, clock);
async function actor(organizationId: string, permissions = keys, projectId?: string) {
  const person = await db.person.create({ data: { displayName: unique(), email: unique() + "@test.invalid" } });
  const user = await db.user.create({ data: { personId: person.id, email: unique() + "@test.invalid" } });
  const role = await db.role.create({ data: { organizationId, key: unique(), name: "Test operator", permissions: { create: permissions.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { organizationId, personId: person.id, projectId, scopeKey: projectId ? "project:" + projectId : "organization", roles: { create: { roleId: role.id } } } });
  return { userId: user.id, personId: person.id, roleId: role.id };
}
async function foundation(slug = unique()) {
  const org = await db.organization.create({ data: { name: unique(), slug, type: "COMPANY", parentId: rootId, company: { create: { groupId, displayName: unique() } } } });
  const owner = await actor(org.id), reviewer = await actor(org.id);
  time = new Date(Date.now() + 10000);
  const automation = createAutomationService(db, clock), communication = createCommunicationsService(db, { now: clock });
  wiredCommunication = communication; wiredAutomation = automation; session.userId = owner.userId;
  return { org: org.id, owner, reviewer, automation, communication };
}
async function tasks(f: Awaited<ReturnType<typeof foundation>>, count: number, offset = 0, eligible = true, projectId?: string) {
  const prefix = unique();
  const data = Array.from({ length: count }, (_, index) => ({ id: prefix + "-" + String(index + offset).padStart(5, "0"), organizationId: f.org, projectId, title: prefix, dueDate: new Date("2000-01-01"), assigneePersonId: eligible ? f.owner.personId : f.reviewer.personId }));
  await db.task.createMany({ data });
  return data;
}
async function ruleJob(f: Awaited<ReturnType<typeof foundation>>, maxRuns = 1, maxAttempts = 3) {
  const rule = await f.automation.saveRule(f.owner.userId, { organizationId: f.org, name: unique(), enabled: true, trigger: "TASK_OVERDUE", action: "NOTIFY_OWNER", condition: { recipientUserId: f.owner.userId } });
  const job = await f.automation.schedule(f.owner.userId, { ruleId: rule.id, nextRunAt: "2000-01-01", intervalMinutes: 60, maxRuns, maxAttempts });
  return { rule, job };
}
const action = (command: string, values: Record<string, string> = {}) => {
  const form = new FormData(); form.set("command", command);
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return communicationAction({ ok: false, message: "" }, form);
};
async function messageFoundation(f: Awaited<ReturnType<typeof foundation>>) {
  const sender = "operations@test.invalid";
  const integration = await f.communication.saveIntegration(f.owner.userId, { organizationId: f.org, name: unique(), channel: "EMAIL", provider: "MOCK", enabled: true, configuration: { sender } });
  const control = await ops.saveControl(f.owner.userId, { organizationId: f.org, name: unique(), kind: "APPROVAL", requiredPermission: "approval.decide", stages: [[{ approverUserId: f.reviewer.userId }]] });
  const policy = await f.communication.savePolicy(f.owner.userId, { organizationId: f.org, name: unique(), controlPointId: control.id, configuration: { channels: ["EMAIL"], senders: [sender], categories: ["OPERATIONAL"], perMinute: 30, perDay: 500 } });
  const consent = await f.communication.setConsent(f.owner.userId, { organizationId: f.org, personId: f.reviewer.personId, channel: "EMAIL", status: "OPTED_IN", source: "Test recipient permission" });
  return { organizationId: f.org, integrationId: integration.id, policyId: policy.id, consentId: consent.id, resourceType: "ORGANIZATION", resourceId: f.org, subject: "Operational review", content: "Controlled test message", purpose: "Operational review", category: "OPERATIONAL", idempotencyKey: unique() };
}
async function queue(f: Awaited<ReturnType<typeof foundation>>, raw: Awaited<ReturnType<typeof messageFoundation>>) {
  const message = await f.communication.propose(f.owner.userId, raw);
  await ops.submitRequest(f.owner.userId, message.requestId!);
  const approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: message.requestId } });
  await ops.decide(f.reviewer.userId, { approvalId: approval.id, decision: "APPROVED", comment: "Human reviewed this exact preview" });
  return message;
}
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const migration of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]); sql.close();
  const root = await db.organization.create({ data: { name: "MAXPASE GROUP", slug: "maxpase-group", type: "GROUP", group: { create: { name: "MAXPASE GROUP" } } }, include: { group: true } }); groupId = root.group!.id; rootId = root.id;
  for (const key of keys) await db.permission.create({ data: { key, name: key, scope: "GROUP" } });
  vi.spyOn(communicationsService, "saveIntegration").mockImplementation((...args) => wiredCommunication.saveIntegration(...args));
  vi.spyOn(communicationsService, "propose").mockImplementation((...args) => wiredCommunication.propose(...args));
  vi.spyOn(communicationsService, "confirm").mockImplementation((...args) => wiredCommunication.confirm(...args));
  vi.spyOn(communicationsService, "deliver").mockImplementation((...args) => wiredCommunication.deliver(...args));
  vi.spyOn(communicationsService, "processDue").mockImplementation((...args) => wiredCommunication.processDue(...args));
  vi.spyOn(automationService, "processDue").mockImplementation((...args) => wiredAutomation.processDue(...args));
});
afterAll(async () => { vi.restoreAllMocks(); await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Wave 02 persisted automation continuation", () => {
  it("reaches all 60 overdue tasks across bounded scans, service restarts and one recurrence", async () => {
    const f = await foundation(), rows = await tasks(f, 60), { job, rule } = await ruleJob(f);
    expect(await f.automation.processDue(f.owner.userId)).toMatchObject([{ processed: 25, status: "PENDING" }]);
    const partial = await db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(partial).toMatchObject({ runs: 0, scanCursor: rows[24].id, scanRuleVersion: rule.version });
    expect(partial.scanStartedAt).not.toBeNull();
    time = new Date(time.getTime() + 60001);
    const restarted = createAutomationService(db, clock);
    expect(await restarted.processDue(f.owner.userId)).toMatchObject([{ processed: 25, status: "PENDING" }]);
    expect((await db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } })).scanCursor).toBe(rows[49].id);
    time = new Date(time.getTime() + 60001);
    expect(await restarted.processDue(f.owner.userId)).toMatchObject([{ processed: 10, status: "SUCCEEDED" }]);
    expect(await db.scheduledJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: "SUCCEEDED", enabled: false, runs: 1, scanCursor: null, scanStartedAt: null });
    expect(await db.automationRun.count({ where: { ruleId: rule.id } })).toBe(60);
    const notifications = await db.notification.findMany({ where: { organizationId: f.org } });
    expect(new Set(notifications.map(n => n.resourceId))).toEqual(new Set(rows.map(t => t.id)));
    expect(await restarted.processDue(f.owner.userId)).toEqual([]);
    expect(await db.automationRun.count({ where: { ruleId: rule.id } })).toBe(60);
  });
  it("advances beyond nonmatching heads and excludes completed records without consuming a page recurrence", async () => {
    const f = await foundation(), rows = await tasks(f, 27), { job } = await ruleJob(f);
    await db.task.updateMany({ where: { id: { in: rows.slice(0, 25).map(t => t.id) } }, data: { assigneePersonId: f.reviewer.personId } });
    await db.task.update({ where: { id: rows[25].id }, data: { status: "COMPLETED" } });
    expect(await f.automation.processDue(f.owner.userId)).toMatchObject([{ processed: 0, skipped: 25, status: "PENDING" }]);
    expect(await db.scheduledJob.findUnique({ where: { id: job.id } })).toMatchObject({ runs: 0, scanCursor: rows[24].id });
    expect(await f.automation.processDue(f.owner.userId)).toMatchObject([{ processed: 1, status: "SUCCEEDED" }]);
    expect(await db.notification.findFirst({ where: { organizationId: f.org } })).toMatchObject({ resourceId: rows[26].id });
  });
  it("retries a failed job finitely while later due jobs succeed and accurately reports partial failure", async () => {
    const f = await foundation(); await tasks(f, 1);
    const failed = await ruleJob(f, 1, 2), successful = await ruleJob(f);
    await db.automationRule.update({ where: { id: failed.rule.id }, data: { enabled: false } });
    const state = await action("processJobs");
    expect(state).toMatchObject({ ok: false, outcome: "PARTIAL" });
    expect(await db.scheduledJob.findUnique({ where: { id: successful.job.id } })).toMatchObject({ status: "SUCCEEDED", runs: 1 });
    expect(await db.scheduledJob.findUnique({ where: { id: failed.job.id } })).toMatchObject({ status: "PENDING", attempts: 1 });
    time = new Date(time.getTime() + 600000); await f.automation.processDue(f.owner.userId);
    expect(await db.scheduledJob.findUnique({ where: { id: failed.job.id } })).toMatchObject({ status: "FAILED", attempts: 2, enabled: false });
    expect(await f.automation.processDue(f.owner.userId)).toEqual([]);
  });
  it("unreadable first-page sources do not hide a later project-authorized source", async () => {
    const f = await foundation(), rows = await tasks(f, 26);
    const project = await db.project.create({ data: { organizationId: f.org, name: unique(), slug: unique() } });
    await db.task.update({ where: { id: rows[25].id }, data: { projectId: project.id } });
    await db.rolePermission.deleteMany({ where: { roleId: f.owner.roleId, permission: { key: "task.read" } } });
    const role = await db.role.create({ data: { organizationId: f.org, key: unique(), name: "One project source", permissions: { create: { permission: { connect: { key: "task.read" } } } } } });
    await db.membership.create({ data: { personId: f.owner.personId, organizationId: f.org, projectId: project.id, scopeKey: "project:" + project.id, roles: { create: { roleId: role.id } } } });
    const { rule } = await ruleJob(f);
    expect(await f.automation.processDue(f.owner.userId)).toMatchObject([{ processed: 0, skipped: 25, status: "PENDING" }]);
    expect(await f.automation.processDue(f.owner.userId)).toMatchObject([{ processed: 1, skipped: 0, status: "SUCCEEDED" }]);
    expect(await db.automationRun.count({ where: { ruleId: rule.id } })).toBe(1);
    expect(await db.notification.findFirst({ where: { organizationId: f.org } })).toMatchObject({ resourceId: rows[25].id });
  });
  it("rolls back page output and cursor when the page completion audit fails, then resumes safely", async () => {
    const f = await foundation(); await tasks(f, 26); const { job, rule } = await ruleJob(f);
    await db.$executeRawUnsafe("CREATE TRIGGER wave02_page_failure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'automation.job_progressed' BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END");
    try {
      expect(await f.automation.processDue(f.owner.userId)).toMatchObject([{ processed: 0, status: "FAILED" }]);
      expect(await db.automationRun.count({ where: { ruleId: rule.id } })).toBe(0);
      expect(await db.notification.count({ where: { organizationId: f.org } })).toBe(0);
      expect(await db.scheduledJob.findUnique({ where: { id: job.id } })).toMatchObject({ scanCursor: null, runs: 0, attempts: 1 });
    } finally { await db.$executeRawUnsafe("DROP TRIGGER wave02_page_failure"); }
    time = new Date(time.getTime() + 180000);
    expect(await f.automation.processDue(f.owner.userId)).toMatchObject([{ processed: 25, status: "PENDING" }]);
    time = new Date(time.getTime() + 60001);
    expect(await f.automation.processDue(f.owner.userId)).toMatchObject([{ processed: 1, status: "SUCCEEDED" }]);
    expect(await db.automationRun.count({ where: { ruleId: rule.id } })).toBe(26);
  });
  it("concurrent/repeated processing cannot duplicate output and still reaches the final page", async () => {
    const f = await foundation(); await tasks(f, 26); const { rule, job } = await ruleJob(f);
    await Promise.allSettled([f.automation.processDue(f.owner.userId), f.automation.processDue(f.owner.userId)]);
    expect(await db.automationRun.count({ where: { ruleId: rule.id } })).toBe(25);
    expect(await db.scheduledJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: "PENDING", runs: 0 });
    time = new Date(time.getTime() + 60001); await f.automation.processDue(f.owner.userId);
    expect(await db.automationRun.count({ where: { ruleId: rule.id } })).toBe(26);
    expect(await f.automation.processDue(f.owner.userId)).toEqual([]);
  });
  it("preserves processor, source, company and high-impact action boundaries", async () => {
    const f = await foundation(); await tasks(f, 1); const { rule } = await ruleJob(f);
    const denied = await actor(f.org, ["automation.read"]), foreign = await foundation();
    await expect(f.automation.processDue(denied.userId)).rejects.toThrow("Access denied");
    expect(await foreign.automation.processDue(foreign.owner.userId)).toEqual([]);
    await db.rolePermission.deleteMany({ where: { roleId: f.owner.roleId, permission: { key: "task.read" } } });
    expect(await f.automation.processDue(f.owner.userId)).toMatchObject([{ processed: 0, skipped: 1 }]);
    expect(await db.automationRun.count({ where: { ruleId: rule.id } })).toBe(0);
    for (const action of ["create_task", "send_email", "send_whatsapp", "EXECUTE_SIA_ACTION"]) await expect(f.automation.saveRule(f.owner.userId, { organizationId: f.org, name: unique(), trigger: "TASK_OVERDUE", action, condition: { recipientUserId: f.owner.userId } })).rejects.toThrow();
    expect(automationActions.every(a => a.risk === "LOW_RISK_WRITE" && !a.external)).toBe(true);
  });
});

describe("Wave 02 communication action semantic feedback", () => {
  it("distinguishes real saved configuration from unavailable provider delivery", async () => {
    const f = await foundation();
    expect(await action("integration", { organizationId: f.org, name: unique(), channel: "EMAIL", provider: "MOCK", sender: "ops@test.invalid" })).toMatchObject({ ok: true, outcome: "SAVED" });
    const state = await action("integration", { organizationId: f.org, name: unique(), channel: "EMAIL", provider: "EMAIL_UNCONFIGURED", sender: "ops@test.invalid" });
    expect(state).toMatchObject({ ok: true, outcome: "NOT_CONFIGURED" });
    expect(state.message).toContain("not configured");
    expect(await db.integration.count({ where: { organizationId: f.org } })).toBe(2);
  });
  it("reflects actual preview, queued and simulated delivery results without claiming real delivery", async () => {
    const f = await foundation(), raw = await messageFoundation(f);
    expect(await action("propose", raw)).toMatchObject({ ok: true, outcome: "APPROVAL_REQUIRED" });
    const message = await queue(f, raw);
    expect(await action("confirm", { id: message.id, version: String(message.version), confirmed: "true" })).toMatchObject({ ok: true, outcome: "QUEUED" });
    expect(await db.communicationMessage.findUnique({ where: { id: message.id } })).toMatchObject({ status: "QUEUED", deliveredAt: null });
    const state = await action("delivery", { id: message.id });
    expect(state).toMatchObject({ ok: true, outcome: "SIMULATED" }); expect(state.message).toContain("No real delivery");
    expect(await db.communicationMessage.findUnique({ where: { id: message.id } })).toMatchObject({ status: "SIMULATED", simulated: true, deliveredAt: null });
  });
  it("reports backend failure and uncertain delivery faithfully, including a mixed batch", async () => {
    const f = await foundation(), raw = await messageFoundation(f), first = await queue(f, raw), second = await queue(f, { ...raw, idempotencyKey: unique(), content: "Uncertain" });
    await f.communication.confirm(f.owner.userId, first.id, first.version, true); await f.communication.confirm(f.owner.userId, second.id, second.version, true);
    const adapter: CommunicationAdapter = { ...mockAdapter, async send(message) { if (message.content === "Uncertain") throw new Error("private provider fixture detail"); return { status: "FAILED", retryable: false, failureCode: "TRANSIENT_FAILURE" }; } };
    wiredCommunication = createCommunicationsService(db, { adapters: [adapter], now: clock });
    expect(await action("delivery", { id: first.id })).toMatchObject({ ok: false, outcome: "FAILED" });
    const uncertain = await action("delivery", { id: second.id });
    expect(uncertain).toMatchObject({ ok: false, outcome: "UNKNOWN" }); expect(uncertain.message).not.toContain("private provider");
    expect(await db.communicationMessage.findUnique({ where: { id: second.id } })).toMatchObject({ status: "UNKNOWN", retryable: false });
    expect(await action("delivery", { id: second.id })).toMatchObject({ ok: false, outcome: "BLOCKED" });
    const third = await queue(f, { ...raw, idempotencyKey: unique(), content: "Simulate" }), fourth = await queue(f, { ...raw, idempotencyKey: unique(), content: "Uncertain" });
    await f.communication.confirm(f.owner.userId, third.id, third.version, true); await f.communication.confirm(f.owner.userId, fourth.id, fourth.version, true);
    wiredCommunication = createCommunicationsService(db, { adapters: [{ ...adapter, async send(message, credential) { if (message.content === "Uncertain") throw new Error("fixture uncertain"); return mockAdapter.send(message, credential); } }], now: clock });
    expect(await action("process")).toMatchObject({ ok: false, outcome: "PARTIAL" });
    expect(await db.communicationMessage.findUnique({ where: { id: third.id } })).toMatchObject({ status: "SIMULATED" });
    expect(await db.communicationMessage.findUnique({ where: { id: fourth.id } })).toMatchObject({ status: "UNKNOWN" });
  });
  it("never reports success on forged actor, authorization rejection or transaction rollback", async () => {
    const f = await foundation(), denied = await actor(f.org, ["integration.read"]);
    session.userId = denied.userId;
    const input = { organizationId: f.org, name: unique(), channel: "EMAIL", provider: "MOCK", sender: "ops@test.invalid", actorUserId: f.owner.userId };
    expect(await action("integration", input)).toMatchObject({ ok: false, outcome: "BLOCKED" });
    expect(await db.integration.count({ where: { organizationId: f.org } })).toBe(0);
    session.userId = f.owner.userId;
    await db.$executeRawUnsafe("CREATE TRIGGER wave02_mutation_failure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'integration.created' BEGIN SELECT RAISE(ABORT, 'private database failure'); END");
    try {
      const state = await action("integration", input);
      expect(state).toMatchObject({ ok: false, outcome: "FAILED" }); expect(state.message).not.toContain("private database");
      expect(await db.integration.count({ where: { organizationId: f.org } })).toBe(0);
    } finally { await db.$executeRawUnsafe("DROP TRIGGER wave02_mutation_failure"); }
  });
  it("keeps pending, simulated, provider-accepted and recipient-confirmed results semantically distinct", () => {
    expect(resultFeedback("ACCEPTED").message).toContain("not yet verified");
    expect(resultFeedback("SENT").message).toContain("not yet verified");
    expect(resultFeedback("DELIVERED").outcome).toBe("DELIVERED");
    expect(batchFeedback([{ status: "ACCEPTED" }, { status: "SENT" }])).toMatchObject({ ok: true, outcome: "PENDING" });
    expect(batchFeedback([{ status: "SUCCEEDED" }, { status: "PENDING" }])).toMatchObject({ ok: true, outcome: "PENDING" });
    expect(batchFeedback([{ status: "SIMULATED" }])).toMatchObject({ ok: true, outcome: "SIMULATED" });
    expect(batchFeedback([])).toMatchObject({ outcome: "NO_WORK" });
  });
});

describe("Wave 02 authorized query bounds and pages", () => {
  it("pages beyond 200 tied task records deterministically without duplication or company disclosure", async () => {
    const f = await foundation(), rows = await tasks(f, 205), foreign = await foundation(); await tasks(foreign, 80);
    let cursor: string | undefined; const seen: string[] = [];
    do {
      const page = await execution.listPage(f.owner.userId, "tasks", {}, { after: cursor });
      expect(page.records.length).toBeLessThanOrEqual(50);
      expect(page.records.every(r => r.organizationId === f.org)).toBe(true);
      seen.push(...page.records.map(r => r.id)); cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(rows.map(r => r.id)); expect(new Set(seen).size).toBe(205);
    await expect(execution.listPage(f.owner.userId, "tasks", { organizationId: foreign.org }, { after: rows[49].id })).rejects.toThrow("Access denied");
    await db.rolePermission.deleteMany({ where: { roleId: f.owner.roleId, permission: { key: "task.read" } } });
    expect((await execution.listPage(f.owner.userId, "tasks", {}, { after: rows[49].id })).records).toEqual([]);
  });
  it("pages dependencies with both task.read checks preserved on every cursor", async () => {
    const f = await foundation(), rows = await tasks(f, 62);
    await db.taskDependency.createMany({ data: rows.slice(1).map((task, index) => ({ id: unique(), taskId: task.id, prerequisiteId: rows[index].id })) });
    const first = await execution.listPage(f.owner.userId, "dependencies");
    expect(first.records).toHaveLength(50);
    expect((await execution.listPage(f.owner.userId, "dependencies", {}, { after: first.nextCursor! })).records).toHaveLength(11);
    await db.rolePermission.deleteMany({ where: { roleId: f.owner.roleId, permission: { key: "task.read" } } });
    expect((await execution.listPage(f.owner.userId, "dependencies", {}, { after: first.nextCursor! })).records).toEqual([]);
  });
  it("preserves full executive aggregates above page size and excludes foreign data", async () => {
    const f = await foundation(); await tasks(f, 205); const foreign = await foundation(); await tasks(foreign, 60);
    expect((await execution.listPage(f.owner.userId, "tasks")).records).toHaveLength(50);
    expect((await execution.overview(f.owner.userId, time)).metrics.overdueTasks).toBe(205);
    const dashboard = await executive.dashboard(f.owner.userId, {}, time);
    const metric = dashboard.metrics.find(m => m.name === "Overdue tasks");
    expect(metric?.value).toBe(205);
  });
  it("enforces SQL read limits and rejects oversized aggregates rather than publishing truncated totals", async () => {
    const f = await foundation(), rows = await tasks(f, READ_BUDGET + 1);
    queries.length = 0;
    const page = await execution.listPage(f.owner.userId, "tasks", {}, { after: rows[4990].id, limit: 100 });
    expect(page.records.map(r => r.id)).toEqual(rows.slice(4991).map(r => r.id));
    expect(queries.some(q => q.query.includes("Task") && q.query.includes("LIMIT") && JSON.parse(q.params).includes(101))).toBe(true);
    await expect(execution.overview(f.owner.userId)).rejects.toBeInstanceOf(QueryBudgetError);
    expect(queries.some(q => q.query.includes("Task") && q.query.includes("LIMIT") && JSON.parse(q.params).includes(5001))).toBe(true);
    await expect(execution.listPage(f.owner.userId, "tasks", {}, { limit: 101 })).rejects.toThrow();
  });
  it("paginates recipient-filtered operational notifications and batches activity source lookups", async () => {
    const f = await foundation();
    await db.notification.createMany({ data: Array.from({ length: 65 }, (_, i) => ({ id: unique() + "-" + i, reference: unique(), organizationId: f.org, recipientUserId: f.owner.userId, type: "SYSTEM_EVENT", title: "Review", message: "Review", resourceType: "ORGANIZATION", resourceId: f.org })) });
    await db.notification.create({ data: { reference: unique(), organizationId: f.org, recipientUserId: f.reviewer.userId, type: "SYSTEM_EVENT", title: "Private recipient", message: "Private", resourceType: "ORGANIZATION", resourceId: f.org } });
    const first = await ops.listPage(f.owner.userId, "notifications"), next = await ops.listPage(f.owner.userId, "notifications", {}, { after: first.nextCursor! });
    expect(first.records).toHaveLength(50); expect(next.records).toHaveLength(15);
    expect([...first.records, ...next.records].every(n => n.recipientUserId === f.owner.userId)).toBe(true);
    for (let i = 0; i < 8; i++) await execution.save(f.owner.userId, "tasks", { organizationId: f.org, title: unique() });
    queries.length = 0; await ops.list(f.owner.userId, "activity");
    expect(queries.filter(q => q.query.includes("OperationalEvent") && q.query.includes("SELECT")).length).toBe(1);
  });
  it("communication pages reach later threads and keep overview totals independent of page size", async () => {
    const f = await foundation();
    const integration = await f.communication.saveIntegration(f.owner.userId, { organizationId: f.org, name: unique(), channel: "EMAIL", provider: "MOCK", configuration: { sender: "ops@test.invalid" } });
    await db.communicationThread.createMany({ data: Array.from({ length: 65 }, (_, i) => ({ id: unique() + "-" + i, reference: unique(), integrationId: integration.id, organizationId: f.org, resourceType: "ORGANIZATION", resourceId: f.org, participants: "[]", channel: "EMAIL", priority: "HIGH" })) });
    const first = await f.communication.workspace(f.owner.userId, f.org, { view: "threads" });
    const second = await f.communication.workspace(f.owner.userId, f.org, { view: "threads", cursor: first.nextCursor! });
    expect(first.threads).toHaveLength(50); expect(second.threads).toHaveLength(15);
    expect(new Set([...first.threads, ...second.threads].map(t => t.id)).size).toBe(65);
    expect(first.overview.importantThreads).toBe(65); expect(second.overview.importantThreads).toBe(65);
    await db.rolePermission.deleteMany({ where: { roleId: f.owner.roleId, permission: { key: "communication.read" } } });
    await expect(f.communication.workspace(f.owner.userId, f.org, { view: "threads", cursor: first.nextCursor! })).rejects.toThrow("Access denied");
  });
  it("AIRA program and batch cursors retain independent division authorization", async () => {
    const f = await foundation("aira-skill-city");
    const division = await db.organization.create({ data: { name: unique(), slug: unique(), type: "DIVISION", parentId: f.org } });
    const sibling = await db.organization.create({ data: { name: unique(), slug: unique(), type: "DIVISION", parentId: f.org } });
    const reader = await actor(division.id, ["company.read", "program.read", "batch.read", "organization.read"]);
    // Company entry is separate from division domain grants.
    const entryRole = await db.role.create({ data: { organizationId: f.org, key: unique(), name: "Company entry", permissions: { create: ["company.read", "organization.read"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId: reader.personId, organizationId: f.org, scope: "DESCENDANTS", roles: { create: { roleId: entryRole.id } } } });
    for (let i = 0; i < 62; i++) {
      const program = await db.program.create({ data: { id: unique(), organizationId: division.id, companyOrganizationId: f.org, slug: unique(), name: unique() } });
      await db.batch.create({ data: { id: unique(), programId: program.id, name: unique(), startDate: time } });
    }
    await db.program.create({ data: { organizationId: sibling.id, companyOrganizationId: f.org, slug: unique(), name: "Sibling private" } });
    for (const kind of ["programs", "batches"] as const) {
      const first = await aira.listPage(reader.userId, kind, { divisionId: division.id });
      expect(first.records).toHaveLength(50);
      const next = await aira.listPage(reader.userId, kind, { divisionId: division.id }, { after: first.nextCursor! });
      expect(next.records).toHaveLength(12);
      expect((await aira.listPage(reader.userId, kind, { divisionId: sibling.id }, { after: first.nextCursor! })).records).toEqual([]);
      expect([...first.records, ...next.records].every(p => p.organizationId === division.id)).toBe(true);
    }
    const first = await aira.listPage(reader.userId, "batches");
    await db.rolePermission.deleteMany({ where: { roleId: reader.roleId, permission: { key: "program.read" } } });
    const later = await aira.listPage(reader.userId, "batches", {}, { after: first.nextCursor! });
    expect(later.records).toHaveLength(12); expect(later.records.every(b => b.programName === null && !("program" in b))).toBe(true);
  });
  it("caps SIA memory candidate scanning without letting unreadable first pages hide authorized later memory", async () => {
    const f = await foundation(), identity = await db.siaIdentity.create({ data: { name: unique(), title: "Test SIA" } });
    const ctx = await createAccessContext(f.owner.userId, db);
    const data = Array.from({ length: 101 }, () => ({ id: unique(), siaId: identity.id, organizationId: f.org, category: "FACT", status: "APPROVED", key: unique(), value: "Untrusted data", sourceType: "TASK", sourceId: "missing-task" }));
    await db.siaContext.createMany({ data });
    const visible = await db.siaContext.create({ data: { ...data[0], id: unique(), key: unique(), sourceType: "HUMAN_ATTESTATION", updatedAt: new Date("2000-01-01") } });
    expect((await retrieveMemory(db, ctx, { siaId: identity.id, organizationId: f.org })).map(m => m.id)).toEqual([visible.id]);
    await db.siaContext.deleteMany({ where: { siaId: identity.id } });
    await db.siaContext.createMany({ data: Array.from({ length: READ_BUDGET + 1 }, () => ({ ...data[0], id: unique(), key: unique() })) });
    await expect(retrieveMemory(db, ctx, { siaId: identity.id, organizationId: f.org })).rejects.toBeInstanceOf(QueryBudgetError);
    const last = await db.siaContext.findFirstOrThrow({ where: { siaId: identity.id } });
    await db.siaContext.delete({ where: { id: last.id } });
    expect(await retrieveMemory(db, ctx, { siaId: identity.id, organizationId: f.org })).toEqual([]);
  });
  it("batches project progress without per-project task retrieval and preserves weighted milestone progress", async () => {
    const f = await foundation();
    const projects = Array.from({ length: 20 }, () => ({ id: unique(), organizationId: f.org, name: unique(), slug: unique() }));
    await db.project.createMany({ data: projects });
    await db.task.createMany({ data: projects.flatMap(project => [
      { organizationId: f.org, projectId: project.id, title: unique(), status: "COMPLETED" },
      { organizationId: f.org, projectId: project.id, title: unique(), status: "TODO" }
    ]) });
    queries.length = 0;
    const page = await execution.listPage(f.owner.userId, "projects");
    expect(page.records).toHaveLength(20); expect(page.records.every(p => p.calculatedProgress === 50)).toBe(true);
    expect(queries.filter(q => q.query.includes("Task") && q.query.includes("SELECT")).length).toBeLessThanOrEqual(2);
    const first = await db.milestone.create({ data: { projectId: projects[0].id, name: unique(), status: "ACTIVE" } });
    await db.milestone.create({ data: { projectId: projects[0].id, name: unique(), status: "COMPLETED" } });
    await db.task.create({ data: { organizationId: f.org, projectId: projects[0].id, milestoneId: first.id, title: unique(), status: "TODO" } });
    expect((await execution.listPage(f.owner.userId, "projects")).records.find(p => p.id === projects[0].id)?.calculatedProgress).toBe(50);
    await db.rolePermission.deleteMany({ where: { roleId: f.owner.roleId, permission: { key: "task.read" } } });
    expect((await execution.listPage(f.owner.userId, "projects")).records.every(p => p.calculatedProgress === null)).toBe(true);
  });
  it("all reviewed top-level collection queries declare a take bound", () => {
    const files = ["domain/execution-service.ts", "domain/operations-service.ts", "domain/aira-service.ts", "domain/executive-service.ts", "domain/workforce-service.ts", "domain/business-service.ts", "communications/service.ts", "communications/automation.ts", "sia/service.ts", "sia/context.ts"];
    const unbounded: string[] = [];
    for (const file of files) {
      const source = ts.createSourceFile(file, readFileSync("src/server/" + file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "findMany") {
          const argument = node.arguments[0];
          if (!argument || !ts.isObjectLiteralExpression(argument) || !argument.properties.some(p => p.name?.getText(source) === "take")) unbounded.push(file + ":" + source.getLineAndCharacterOfPosition(node.getStart(source)).line);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(unbounded).toEqual([]);
  });
});
