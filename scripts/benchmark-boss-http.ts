import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, writeFileSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import { provisionBoss } from "../src/server/group/provision";
import { createAuthenticationService } from "../src/server/auth/service";

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "maxpase-launch-http-")), file = join(directory, "fixture.db");
  const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
  const base = "http://127.0.0.1:3005", secret = randomBytes(48).toString("base64url"), cookieName = "launch_fixture_session";
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: "file:" + file.replaceAll("\\", "/"), AUTH_SECRET: secret, AUTH_COOKIE_NAME: cookieName, AUTH_COOKIE_SECURE: "true", APP_ORIGIN: "https://isolated-staging.invalid", NODE_ENV: "production", DEV_BOOTSTRAP_PASSWORD: "" };
  delete env.BOSS_PIN;
  const log = openSync(join(directory, "server.log"), "w");
  let server: ReturnType<typeof spawn> | undefined;
  let stage = "isolated migration";
  try {
    new DatabaseSync(file).close();
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env, stdio: "pipe", windowsHide: true, timeout: 120000 });
    const boss = await provisionBoss(db, { BOSS_PIN: String(randomInt(100000, 1000000)) });
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } });
    const project = await db.project.create({ data: { organizationId: org.id, name: "Large isolated management portfolio", slug: "launch-http", status: "BLOCKED" } });
    await db.task.createMany({ data: Array.from({ length: 1000 }, (_, i) => ({ organizationId: org.id, projectId: project.id, title: `Overdue staging record ${i}: ${"long_reference_".repeat(6)}`, priority: "HIGH" as const, dueDate: new Date("2020-01-01") })) });
    const session = await createAuthenticationService(db).create(boss.userId, secret);
    server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3005"], { env, stdio: ["ignore", log, log], windowsHide: true });
    stage = "production-build server readiness";
    for (let attempt = 0; ; attempt++) {
      if (server.exitCode !== null) throw new Error("Server exited");
      try { if ((await fetch(base + "/api/ready", { signal: AbortSignal.timeout(3000) })).ok) break; } catch { /* Owned isolated server startup only. */ }
      if (attempt >= 45) throw new Error("Server not ready");
      await new Promise(r => setTimeout(r, 1000));
    }
    const paths = { overview: `/app/boss?companyId=${org.id}`, projects: `/app/boss?companyId=${org.id}&view=projects`, tasks: `/app/execution/tasks?organizationId=${org.id}` };
    const samples: Record<string, { elapsedMs: number; bytes: number }[]> = {};
    for (const [name, path] of Object.entries(paths)) {
      stage = name;
      for (let i = 0; i < 22; i++) {
        const start = performance.now();
        const response = await fetch(base + path, { headers: { cookie: `${cookieName}=${session.token}` }, redirect: "manual", signal: AbortSignal.timeout(15000) });
        const body = await response.text(), elapsedMs = performance.now() - start;
        assert.equal(response.status, 200);
        assert.doesNotMatch(body, /Boss Panel unavailable|Sign in to|This result exceeds/);
        if (i >= 2) (samples[name] ??= []).push({ elapsedMs, bytes: Buffer.byteLength(body) });
      }
    }
    const summary = Object.fromEntries(Object.entries(samples).map(([name, rows]) => {
      const ms = rows.map(r => r.elapsedMs).sort((a, b) => a - b);
      const p95 = ms[Math.ceil(ms.length * .95) - 1], p99 = ms[Math.ceil(ms.length * .99) - 1];
      return [name, { observedP95Ms: p95, observedP99Ms: p99, maxHtmlBytes: Math.max(...rows.map(r => r.bytes)), status: p95 <= 2000 && p99 <= 5000 ? "PASS" : "BLOCKED" }];
    }));
    const report = { classification: "ISOLATED LOCAL PRODUCTION-BUILD HTTP; NOT PRODUCTION CONCURRENCY/TLS SLO", measuredAt: new Date().toISOString(), fixtureTasks: 1000, samplesPerRoute: 20, excludedWarmupsPerRoute: 2, criteria: { p95Ms: 2000, p99Ms: 5000, agreed: true }, transport: "Loopback HTTP; secure runtime configuration retained; read-only requests with a fixture-issued cookie; no TLS or origin mutation bypass", summary, samples, status: Object.values(summary).every(s => s.status === "PASS") ? "PASS" : "BLOCKED" };
    writeFileSync(resolve("docs/audit/BOSS_LAUNCH_HTTP.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ classification: report.classification, status: report.status, summary }));
    if (report.status !== "PASS") process.exitCode = 1;
  } catch (error) { console.error(`Isolated HTTP benchmark failed at ${stage}; no production database or session was used. ${error instanceof Error ? error.message.split("\n").slice(0, 3).join(" ").slice(0, 300) : "Unknown error"}`); process.exitCode = 1; }
  finally {
    if (server?.pid && server.exitCode === null) {
      if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch { server.kill("SIGTERM"); } } else server.kill("SIGTERM");
      await new Promise<void>(r => { if (server!.exitCode !== null || server!.signalCode !== null) r(); else server!.once("exit", () => r()); });
    }
    closeSync(log); await db.$disconnect();
    assert.ok(directory.startsWith(join(tmpdir(), "maxpase-launch-http-"))); rmSync(directory, { recursive: true, force: true });
  }
}
void main();
