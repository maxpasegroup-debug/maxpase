import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createAccessContext } from "../src/server/authorization/engine";
import { createExecutionService } from "../src/server/domain/execution-service";
import { createExecutiveService } from "../src/server/domain/executive-service";
import { workforcePermissions } from "../src/server/authorization/registry";
import { buildToolContext } from "../src/server/sia/context";
import { createAutomationService } from "../src/server/communications/automation";

const directory = mkdtempSync(join(tmpdir(), "maxpase-local-benchmark-")), file = join(directory, "fixture.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/"), log: [{ emit: "event", level: "query" }] });
const queries: number[] = [];
db.$on("query", event => queries.push(event.duration));
const samples: Record<string, { elapsedMs: number; queryCount: number; databaseMs: number; responseBytes: number }[]> = {};
async function measure<T>(name: string, operation: () => Promise<T>) {
  queries.length = 0;
  const started = performance.now(), result = await operation();
  (samples[name] ??= []).push({ elapsedMs: performance.now() - started, queryCount: queries.length, databaseMs: queries.reduce((sum, duration) => sum + duration, 0), responseBytes: Buffer.byteLength(JSON.stringify(result)) });
  return result;
}
async function main() {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  const plans = [
    ["task", "EXPLAIN QUERY PLAN SELECT id FROM Task WHERE organizationId = ? AND status = ? AND dueDate < ?", "Task_organizationId_status_dueDate_idx"],
    ["communication", "EXPLAIN QUERY PLAN SELECT id FROM CommunicationMessage WHERE organizationId = ? AND status = ? ORDER BY createdAt", "CommunicationMessage_organizationId_status_createdAt_idx"],
    ["events", "EXPLAIN QUERY PLAN SELECT id FROM OperationalEvent WHERE organizationId = ? AND status = ? ORDER BY createdAt", "OperationalEvent_organizationId_status_createdAt_idx"]
  ];
  for (const [name, query, index] of plans) {
    const rows = sql.prepare(query).all(...(name === "task" ? ["fixture", "TODO", Date.now()] : ["fixture", "FAILED"]));
    assert.match(JSON.stringify(rows), new RegExp(index)); console.log("PASS index plan: " + name);
  }
  sql.close();
  const a = await db.organization.create({ data: { name: "Benchmark A", slug: "benchmark-a", type: "COMPANY" } });
  const b = await db.organization.create({ data: { name: "Benchmark B", slug: "benchmark-b", type: "COMPANY" } });
  const person = await db.person.create({ data: { displayName: "Isolated benchmark actor" } });
  const user = await db.user.create({ data: { email: "benchmark@test.invalid", personId: person.id } });
  const keys = [...new Set([...workforcePermissions.filter(p => p.scope !== "GLOBAL").map(p => p.key), "organization.read", "company.read", "project.read", "goal.read", "product.read"] )];
  const role = await db.role.create({ data: { organizationId: a.id, key: "benchmark", name: "Fixture only", permissions: { create: keys.map(key => ({ permission: { create: { key, name: key, scope: "GROUP" } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId: a.id, roles: { create: { roleId: role.id } } } });
  for (const organization of [a, b]) {
    const project = await db.project.create({ data: { organizationId: organization.id, name: "Benchmark project", slug: "benchmark-project" } });
    await db.task.createMany({ data: Array.from({ length: organization.id === a.id ? 300 : 6000 }, (_, i) => ({ organizationId: organization.id, projectId: project.id, title: organization.id === a.id ? "Fixture task " + i : "Foreign private task " + i, assigneePersonId: organization.id === a.id ? person.id : null, status: "TODO" as const, dueDate: new Date("2020-01-01") })) });
  }
  const identity = await db.siaIdentity.create({ data: { name: "Isolated fixture SIA" } });
  const agent = await db.role.create({ data: { organizationId: a.id, key: "benchmark-agent", name: "Fixture agent", principalType: "AGENT", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.siaRoleAssignment.create({ data: { siaId: identity.id, organizationId: a.id, roleId: agent.id } });
  await db.siaTool.create({ data: { siaId: identity.id, key: "get_tasks", name: "Fixture tasks", permissionKey: "task.read", enabled: true } });
  const execution = createExecutionService(db), executive = createExecutiveService(db);
  for (let i = 0; i < 3; i++) {
    const ctx = await measure("authorization", async () => { const context = await createAccessContext(user.id, db); return context.organizationIds("task.read"); }); assert.deepEqual(ctx, [a.id]);
    const tasks = await measure("tasks", () => execution.list(user.id, "tasks")); assert.equal(tasks.length, 300);
    const result = await measure("executive", () => executive.dashboard(user.id)); assert.doesNotMatch(JSON.stringify(result), /Benchmark B|Foreign private task/);
    const context = await measure("siaContext", () => buildToolContext(db, user.id, { siaId: identity.id, organizationId: a.id }, "get_tasks")); assert.equal(context.facts.length, 200); assert.doesNotMatch(JSON.stringify(context), /Benchmark B|Foreign private task/);
  }
  let time = new Date(Date.now() + 10000);
  const automation = createAutomationService(db, () => time);
  const rule = await automation.saveRule(user.id, { organizationId: a.id, name: "Fixture overdue review", enabled: true, trigger: "TASK_OVERDUE", action: "NOTIFY_OWNER", condition: { recipientUserId: user.id } });
  await automation.schedule(user.id, { ruleId: rule.id, nextRunAt: "2000-01-01", intervalMinutes: 60, maxRuns: 1 });
  for (let i = 0; i < 3; i++) {
    const result = await measure("automationScan", () => automation.processDue(user.id)); assert.equal(result[0].processed, 25); assert.equal(result[0].status, "PENDING"); time = new Date(time.getTime() + 61000);
  }
  const report = { classification: "LOCAL BASELINE ONLY", measuredAt: new Date().toISOString(), node: process.version, fixture: { authorizedTasks: 300, unrelatedCompanyTasks: 6000, samplesPerOperation: 3, automationScanSize: 25 }, notes: ["No production database or external provider accessed", "Prisma query event durations are millisecond-resolution engine measurements, not request latency", "No token or model cost measurement; NOT VERIFIED", "Serial fresh-fixture samples include cold first sample; not production percentiles"], samples };
  const name = process.argv[2] ?? "LOCAL_BASELINE_WAVE_03.json";
  assert.match(name, /^[A-Z0-9_]+\.json$/);
  writeFileSync(join("docs/audit", name), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  console.log("PASS isolated local fixture only; not production load/capacity validation");
}
main().catch(() => { console.error("Local benchmark assertions failed; no production database was accessed."); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
