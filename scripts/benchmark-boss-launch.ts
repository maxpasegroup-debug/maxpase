import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomInt } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import { provisionBoss } from "../src/server/group/provision";
import { createBossService } from "../src/server/group/boss-service";
import { createExecutionService } from "../src/server/domain/execution-service";
import { QueryBudgetError } from "../src/server/domain/query-bounds";
import { AccessError } from "../src/server/authorization/engine";

const directory = mkdtempSync(join(tmpdir(), "maxpase-boss-launch-"));
const file = join(directory, "fixture.db"), durations: number[] = [];
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/"), log: [{ emit: "event", level: "query" }] });
db.$on("query", event => durations.push(event.duration));
type Sample = { elapsedMs: number; queryCount: number; databaseMs: number; responseBytes: number };
const samples: Record<string, Sample[]> = {};
let stage = "migration fixture";
async function measure<T>(name: string, operation: () => Promise<T>) {
  durations.length = 0;
  const start = performance.now(), result = await operation();
  (samples[name] ??= []).push({ elapsedMs: performance.now() - start, queryCount: durations.length, databaseMs: durations.reduce((a, b) => a + b, 0), responseBytes: Buffer.byteLength(JSON.stringify(result)) });
  return result;
}
async function main() {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close();
  stage = "isolated provisioning";
  const boss = await provisionBoss(db, { BOSS_PIN: String(randomInt(100000, 1000000)) });
  const a = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } });
  const b = await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } });
  const project = await db.project.create({ data: { organizationId: a.id, name: "Isolated large portfolio", slug: "launch-benchmark", status: "BLOCKED" } });
  await db.task.createMany({ data: Array.from({ length: 6000 }, (_, i) => ({ organizationId: b.id, title: `FOREIGN_PRIVATE_MARKER_${i}` })) });
  const service = createBossService(db), execution = createExecutionService(db);
  for (const count of [100, 1000]) {
    stage = `portfolio ${count}`;
    await db.task.deleteMany({ where: { organizationId: a.id } });
    await db.task.createMany({ data: Array.from({ length: count }, (_, i) => ({ organizationId: a.id, projectId: project.id, title: `Long management follow-up ${i} ${"evidence_".repeat(15)}`, status: i % 3 === 0 ? "COMPLETED" as const : "TODO" as const, priority: "HIGH" as const, dueDate: new Date("2020-01-01") })) });
    // One warm-up is excluded. Every measured call creates fresh authorization contexts.
    await service.dashboard(boss.userId, a.id);
    for (let i = 0; i < 10; i++) {
      const result = await measure(`boss_${count}`, () => service.dashboard(boss.userId, a.id));
      assert.equal(result.snapshot.tasks.length, count);
      assert.doesNotMatch(JSON.stringify(result), /FOREIGN_PRIVATE_MARKER/);
      const page = await measure(`task_page_${count}`, () => execution.listPage(boss.userId, "tasks", { organizationId: a.id, sort: "deadline" }));
      assert.equal(page.records.length, 50); assert.ok(page.nextCursor);
    }
  }
  stage = "capacity refusal";
  await db.task.createMany({ data: Array.from({ length: 4001 }, (_, i) => ({ organizationId: a.id, title: `Capacity boundary ${i}` })) });
  await assert.rejects(service.dashboard(boss.userId, a.id), QueryBudgetError);
  stage = "permission revocation";
  const role = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: boss.groupId, key: "group-boss" } } });
  const permission = await db.permission.findUniqueOrThrow({ where: { key: "task.read" } });
  await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
  await assert.rejects(execution.listPage(boss.userId, "tasks", { organizationId: a.id }), AccessError);
  const summary = Object.fromEntries(Object.entries(samples).map(([name, rows]) => {
    const sorted = rows.map(r => r.elapsedMs).sort((a, b) => a - b);
    return [name, { medianMs: sorted[Math.floor(sorted.length / 2)], observedP95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxQueryCount: Math.max(...rows.map(r => r.queryCount)), maxResponseBytes: Math.max(...rows.map(r => r.responseBytes)) }];
  }));
  const label = process.argv[2] ?? "BOSS_LAUNCH_BASELINE";
  assert.match(label, /^[A-Z0-9_]+$/);
  const report = { classification: "ISOLATED LOCAL SERVICE BENCHMARK; NOT PRODUCTION SLO ACCEPTANCE", measuredAt: new Date().toISOString(), node: process.version, fixture: { authorizedTasks: [100, 1000], unrelatedCompanyTasks: 6000, warmups: 1, samplesPerOperation: 10, explicitCapacityRefusalAt: 5001 }, criteria: { localBossObservedP95Ms: 2000, localTaskPageObservedP95Ms: 2000, state: "PROPOSED, NOT OWNER-AGREED" }, notes: ["No production data, credentials or external provider accessed", "Serial service timings exclude browser, network, TLS and concurrent load", "Prisma engine duration has millisecond resolution; no SQL or parameters recorded", "Query-capacity refusal is explicit, not silent truncation", "Fresh authorization denies reads immediately after permission revocation"], summary, samples };
  writeFileSync(resolve("docs/audit", label + ".json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ classification: report.classification, summary, isolation: "PASS", capacityRefusal: "PASS", revocation: "PASS" }));
}
main().catch(error => { console.error(`Boss launch benchmark failed at ${stage}: ${error instanceof assert.AssertionError ? error.message : error.code ?? error.name}`); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); assert.ok(directory.startsWith(join(tmpdir(), "maxpase-boss-launch-"))); rmSync(directory, { recursive: true, force: true }); });
