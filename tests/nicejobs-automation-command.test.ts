import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createPostgresFixture } from "./helpers/postgres-fixture";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { createNiceJobsAutomationControl } from "@/server/nicejobs/automation-control";
import { createWorkforceCommandCenter } from "@/server/nicejobs/command-center";
import { createWorkforceExceptions } from "@/server/nicejobs/workforce-exceptions";
import { registeredTool } from "@/server/sia/registry";
import { operationalEvent } from "@/server/domain/operational-events";
import { createNiceJobsControlPanel } from "@/server/nicejobs/control-panel";
import { createSiaService } from "@/server/sia/service";
import { deterministicProvider } from "@/server/sia/provider";

const postgres = createPostgresFixture();
const db = postgres.db;
const now = new Date("2026-10-09T12:00:00Z");
const automation = createNiceJobsAutomationControl(db, () => now);
const command = createWorkforceCommandCenter(db, () => now);
const exceptions = createWorkforceExceptions(db, () => now);
let company: string, division: string, manager: string, reviewer: string, outsider: string;

async function human(org: string, keys: string[], descendants = false) {
  const person = await db.person.create({ data: { displayName: "Isolated automation actor " + crypto.randomUUID() } });
  const user = await db.user.create({ data: { personId: person.id, email: crypto.randomUUID() + "@phase10.invalid" } });
  const role = await db.role.create({ data: { key: person.id, name: "Isolated automation authority", organizationId: org, permissions: { create: [...new Set(keys)].map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId: org, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } });
  return user.id;
}
beforeAll(async () => {
  await postgres.initialize();
  await db.$transaction(initializeGroupStructure);
  for (const p of workforcePermissions) await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  await db.permission.upsert({ where: { key: "organization.read" }, update: {}, create: { key: "organization.read", name: "Read organization", scope: "GROUP" } });
  company = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  division = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  const all = [...workforcePermissions.map(p => p.key), "organization.read"];
  manager = await human(company, all, true);
  reviewer = await human(division, all);
  outsider = await human((await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } })).id, all, true);
}, 120000);
afterAll(() => postgres.dispose(), 30000);

async function draft() {
  const input = { operation: "DRAFT", idempotencyKey: crypto.randomUUID(), reason: "Isolated workflow fixture", definition: { organizationId: division, name: "Overdue work review", description: "Internal notification only", enabled: false, trigger: "TASK_OVERDUE", action: "NOTIFY_OWNER", condition: { minimumAgeMinutes: 0, recipientUserId: reviewer } } };
  const row = await automation.mutate(manager, input) as { id: string; version: number };
  return { row, input };
}
async function publish() {
  const { row } = await draft();
  await automation.mutate(manager, { operation: "SUBMIT", ruleId: row.id, expectedVersion: row.version, reason: "Ready for independent review" });
  await automation.mutate(reviewer, { operation: "PUBLISH", ruleId: row.id, expectedVersion: row.version + 1, reason: "Reviewed bounded internal rule" });
  return row.id;
}

describe("Nice Jobs Phase 10 automation and command control", () => {
  it("provides scoped lifecycle navigation, denies applicants and forged company scope, and keeps SIA disabled-first", async () => {
    const panel = createNiceJobsControlPanel(db);
    const result = await panel.navigation(manager, { companyId: company, divisionId: division });
    expect(result.groups.map(g => g.label)).toEqual(["Overview", "Opportunities", "Applicants", "Workforce", "Earnings", "System"]);
    expect(result.divisionId).toBe(division);
    await expect(panel.navigation(manager, { companyId: "forged-company" })).rejects.toThrow();
    await expect(panel.navigation(outsider, { divisionId: division })).rejects.toThrow();
    const applicant = await human(division, ["nicejobs.application.self"]);
    await expect(panel.navigation(applicant)).rejects.toThrow();
    expect((await panel.assistance(manager, { divisionId: division })).state).toBe("NOT_CONFIGURED");
  });
  it("audits an explicitly configured read-only preparation and rejects replay after agent revocation", async () => {
    const keys = ["organization.read", "sia.access.read", "executive.read", "nicejobs.command.read", "nicejobs.application.read"];
    for (const key of keys) await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key, scope: "GROUP" } });
    const boss = await human(division, keys);
    const identity = await db.siaIdentity.create({ data: { name: "Isolated management assistant", title: "Read-only preparation" } });
    const role = await db.role.create({ data: { key: "panel-agent-" + identity.id, name: "Isolated scoped agent", principalType: "AGENT", organizationId: division, permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
    const grant = await db.siaRoleAssignment.create({ data: { siaId: identity.id, roleId: role.id, organizationId: division } });
    await db.siaTool.create({ data: { siaId: identity.id, key: "get_workforce_command", name: "Management preparation", permissionKey: "nicejobs.command.read", enabled: true } });
    const panel = createNiceJobsControlPanel(db);
    expect((await panel.assistance(boss, { divisionId: division })).state).toBe("AVAILABLE");
    const sia = createSiaService(db, deterministicProvider);
    const input = { siaId: identity.id, organizationId: division, message: "Prepare workforce command overview", idempotencyKey: crypto.randomUUID() };
    const result = await sia.converse(boss, input);
    expect(result.context.authority).toBe("READ_ONLY_HUMAN_AGENT_INTERSECTION");
    const run = await db.siaRun.findUniqueOrThrow({ where: { id: String(result.context.runId) } });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.auditId).toBe(result.context.auditId);
    expect(await db.auditEvent.findUnique({ where: { id: run.auditId! } })).toMatchObject({ entityType: "SiaRun", entityId: run.id, action: "sia.tool_completed" });
    expect(await db.siaAction.count({ where: { requesterUserId: boss } })).toBe(0);
    await db.siaRoleAssignment.delete({ where: { id: grant.id } });
    await expect(sia.converse(boss, input)).rejects.toThrow();
    expect((await panel.assistance(boss, { divisionId: division })).state).toBe("NOT_AUTHORIZED");
    await db.siaTool.update({ where: { siaId_key: { siaId: identity.id, key: "get_workforce_command" } }, data: { enabled: false } });
  });
  it("represents legacy automation rows in the PostgreSQL baseline without losing references", async () => {
    const person = await db.person.create({ data: { displayName: "Legacy fixture actor" } });
    const user = await db.user.create({ data: { email: "legacy@phase10.invalid", personId: person.id } });
    const rule = await db.automationRule.create({ data: { id: "legacy-rule", organizationId: company, ownerUserId: user.id, ownerPersonId: person.id, name: "Legacy rule", trigger: "TASK_OVERDUE", action: "NOTIFY_OWNER", condition: "{}" } });
    const run = await db.automationRun.create({ data: { id: "legacy-run", ruleId: rule.id, reference: "legacy-reference", fingerprint: "legacy-fingerprint", status: "SUCCEEDED" } });
    expect(await db.automationRule.findUniqueOrThrow({ where: { id: rule.id }, select: { name: true, lifecycle: true } })).toMatchObject({ name: "Legacy rule", lifecycle: "LEGACY" });
    expect(await db.automationRun.findUniqueOrThrow({ where: { id: run.id }, select: { reference: true, fingerprint: true } })).toMatchObject({ reference: "legacy-reference", fingerprint: "legacy-fingerprint" });
    await postgres.assertIntegrity();
  });
  it("deduplicates drafts, validates the trigger/action pair, and rejects another company", async () => {
    const { row, input } = await draft();
    expect((await automation.mutate(manager, input) as { id: string }).id).toBe(row.id);
    await expect(automation.mutate(manager, { ...input, reason: "Changed", definition: { ...input.definition, name: "Changed" } })).rejects.toThrow("replay");
    await expect(automation.mutate(outsider, { ...input, idempotencyKey: crypto.randomUUID() })).rejects.toThrow();
    await expect(automation.mutate(manager, { ...input, idempotencyKey: crypto.randomUUID(), definition: { ...input.definition, action: "FLAG_ATTENTION" } })).rejects.toThrow();
  });
  it("requires independent human publication and preserves immutable published content", async () => {
    const { row } = await draft();
    await automation.mutate(manager, { operation: "SUBMIT", ruleId: row.id, expectedVersion: row.version, reason: "Submit to review" });
    await expect(automation.mutate(manager, { operation: "PUBLISH", ruleId: row.id, expectedVersion: row.version + 1, reason: "Self publish" })).rejects.toThrow();
    await expect(automation.mutate(outsider, { operation: "PUBLISH", ruleId: row.id, expectedVersion: row.version + 1, reason: "Outside scope" })).rejects.toThrow();
    await automation.mutate(reviewer, { operation: "PUBLISH", ruleId: row.id, expectedVersion: row.version + 1, reason: "Independent approval" });
    const version = await db.niceJobsAutomationVersion.findFirstOrThrow({ where: { ruleId: row.id, status: "PUBLISHED" } });
    await expect(db.niceJobsAutomationVersion.update({ where: { id: version.id }, data: { definition: "{}" } })).rejects.toThrow();
    await expect(automation.mutate(reviewer, { operation: "PUBLISH", ruleId: row.id, expectedVersion: row.version + 1, reason: "Replay" })).rejects.toThrow();
    expect((await db.operationalEvent.count({ where: { organizationId: division, entityId: row.id } }))).toBeGreaterThan(0);
  });
  it("records UTC jobs but does not imply an automatic scheduler", async () => {
    const ruleId = await publish();
    const job = await automation.mutate(manager, { operation: "SCHEDULE", ruleId, job: { ruleId, nextRunAt: "2026-10-09T13:00:00.000Z", timezone: "UTC", intervalMinutes: 1440, maxRuns: 1 }, reason: "Daily review" }) as unknown as { status: string };
    expect(job.status).toBe("PENDING");
    const overview = await command.overview(manager, { divisionId: division });
    expect(overview.scheduler).toBe("NOT_CONFIGURED");
    await expect(command.overview(outsider, { divisionId: division })).rejects.toThrow();
  });
  it("processes a real scoped event once and rolls back an ineligible attempt", async () => {
    const ruleId = await publish();
    const recipient = await db.user.findUniqueOrThrow({ where: { id: reviewer } });
    const task = await db.task.create({ data: { organizationId: division, title: "Isolated overdue task", ownerPersonId: recipient.personId, status: "TODO", dueDate: new Date("2026-10-08T00:00:00Z") } });
    const source = await db.$transaction(tx => operationalEvent(tx, { actorUserId: manager, organizationId: division, action: "task.created", entityType: "Task", entityId: task.id, result: "SUCCESS" }));
    const action = { operation: "PROCESS_EVENT", ruleId, eventId: source.id };
    const first = await automation.mutate(reviewer, action) as { id: string; status: string } | null;
    expect(first?.status).toBe("SUCCEEDED");
    const run = await db.automationRun.findUniqueOrThrow({ where: { id: first!.id } });
    expect(JSON.parse(run.evidence!)).toMatchObject({ processorUserId: reviewer, ownerUserId: manager, action: "NOTIFY_OWNER", requiredPermission: "notification.generate", resultId: run.resultId, workflowVersionId: run.workflowVersionId });
    expect((await automation.detail(manager, ruleId)).runs.find(r => r.id === run.id)?.authority?.action).toBe("NOTIFY_OWNER");
    expect((await automation.mutate(manager, action) as { id: string } | null)?.id).toBe(first?.id);
    expect(await db.automationRun.count({ where: { ruleId, sourceEventId: source.id } })).toBe(1);
    expect(await db.notification.count({ where: { recipientUserId: reviewer, resourceId: task.id } })).toBe(1);
    const other = await db.$transaction(tx => operationalEvent(tx, { actorUserId: manager, organizationId: division, action: "task.completed", entityType: "Task", entityId: task.id, result: "SUCCESS" }));
    await db.task.update({ where: { id: task.id }, data: { status: "COMPLETED" } });
    expect(await automation.mutate(manager, { ...action, eventId: other.id })).toBeNull();
    expect(await db.automationRun.count({ where: { ruleId } })).toBe(1);
  });
  it("rolls back execution and notification when the execution audit cannot commit", async () => {
    const ruleId = await publish();
    const recipient = await db.user.findUniqueOrThrow({ where: { id: reviewer } });
    const task = await db.task.create({ data: { organizationId: division, title: "Audit rollback task", ownerPersonId: recipient.personId, status: "TODO", dueDate: new Date("2026-10-08T00:00:00Z") } });
    const source = await db.$transaction(tx => operationalEvent(tx, { actorUserId: manager, organizationId: division, action: "task.created", entityType: "Task", entityId: task.id, result: "SUCCESS" }));
    const restoreLegacyTrigger1 = await postgres.rejectInsert("AuditEvent", "automation.executed");
    try { await expect(automation.mutate(manager, { operation: "PROCESS_EVENT", ruleId, eventId: source.id })).rejects.toThrow(); }
    finally { await restoreLegacyTrigger1(); }
    expect(await db.automationRun.count({ where: { ruleId } })).toBe(0);
    expect(await db.notification.count({ where: { resourceId: task.id } })).toBe(0);
  });
  it("shows terminal job failures, deduplicates exceptions, and enforces owner transitions", async () => {
    const ruleId = await publish();
    const job = await db.scheduledJob.create({ data: { ruleId, organizationId: division, nextRunAt: now, timezone: "UTC", intervalMinutes: 60, maxRuns: 1, maxAttempts: 1, status: "FAILED", enabled: false, failureCode: "AUTOMATION_FAILED" } });
    await automation.mutate(manager, { operation: "PROCESS_DUE", limit: 25 });
    const first = await db.niceJobsOperationalException.findFirstOrThrow({ where: { sourceId: job.id } });
    expect((await db.$transaction(tx => exceptions.recordFailedJob(tx, manager, job.id))).id).toBe(first.id);
    expect((await command.overview(manager, { divisionId: division })).metrics.find(m => m.key === "automationFailures")?.value).toBeGreaterThan(0);
    await expect(exceptions.detail(outsider, first.id)).rejects.toThrow();
    await expect(exceptions.mutate(outsider, { id: first.id, operation: "ACKNOWLEDGE", revision: 0, reason: "Forged cross-company actor" })).rejects.toThrow();
    const assigned = await exceptions.mutate(manager, { id: first.id, operation: "ASSIGN", revision: 0, ownerUserId: reviewer, reason: "Review job failure" });
    expect(assigned.revision).toBe(1);
    await expect(exceptions.mutate(manager, { id: first.id, operation: "ASSIGN", revision: 0, ownerUserId: reviewer, reason: "Stale replay" })).rejects.toThrow();
    await exceptions.mutate(reviewer, { id: first.id, operation: "RESOLVE", revision: 1, reason: "Failure reviewed; job remains stopped" });
    expect((await exceptions.detail(manager, first.id)).row.status).toBe("RESOLVED");
  });
  it("reconciles later failed jobs beyond the first 25 within the requested per-call limit", async () => {
    const ruleId = await publish();
    const reconciled = await db.scheduledJob.create({ data: { id: "a-wave1-reconciled", ruleId, organizationId: division, nextRunAt: now, timezone: "UTC", intervalMinutes: 60, maxRuns: 1, maxAttempts: 1, status: "FAILED", enabled: false, failureCode: "AUTOMATION_FAILED" } });
    await db.$transaction(tx => exceptions.recordFailedJob(tx, manager, reconciled.id));
    const jobs = Array.from({ length: 31 }, (_, index) => ({ id: `wave1-failed-${String(index).padStart(3, "0")}`, ruleId, organizationId: division, nextRunAt: now, timezone: "UTC", intervalMinutes: 60, maxRuns: 1, maxAttempts: 1, status: "FAILED", enabled: false, failureCode: "AUTOMATION_FAILED" }));
    await db.scheduledJob.createMany({ data: jobs });
    await automation.mutate(manager, { operation: "PROCESS_DUE", limit: 5 });
    expect(await db.niceJobsOperationalException.count({ where: { sourceId: { in: jobs.map(job => job.id) } } })).toBe(5);
    for (let index = 0; index < 6; index++) await automation.mutate(manager, { operation: "PROCESS_DUE", limit: 5 });
    expect(await db.niceJobsOperationalException.count({ where: { sourceId: { in: jobs.map(job => job.id) } } })).toBe(31);
    expect(await db.niceJobsOperationalException.findUnique({ where: { companyId_sourceKey: { companyId: company, sourceKey: `automation-job:${jobs[30].id}` } } })).not.toBeNull();
    await automation.mutate(manager, { operation: "PROCESS_DUE", limit: 5 });
    expect(await db.niceJobsOperationalException.count({ where: { sourceId: { in: jobs.map(job => job.id) } } })).toBe(31);
    expect(await db.niceJobsOperationalException.count({ where: { sourceId: reconciled.id } })).toBe(1);
    await expect(automation.mutate(outsider, { operation: "PROCESS_DUE", limit: 5 })).rejects.toThrow();
  });
  it("registers only a read-only SIA command tool", () => {
    const tool = registeredTool("get_workforce_command");
    expect(tool?.risk).toBe("READ_ONLY");
    expect(tool?.requiredPermission).toBe("nicejobs.command.read");
    expect(registeredTool("execute_workforce_automation")).toBeUndefined();
  });
});
