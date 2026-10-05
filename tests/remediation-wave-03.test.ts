import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { validateActionOrigin } from "@/server/security/origin";
import { migrationManifest, verifyDatabaseReadiness } from "@/server/security/readiness";
import { workforcePermissions } from "@/server/authorization/registry";
import { createAccessContext } from "@/server/authorization/engine";
import { createExecutiveService } from "@/server/domain/executive-service";
import { buildToolContext, retrieveMemory, checkContextSize, CONTEXT_BYTE_BUDGET } from "@/server/sia/context";
import { QueryBudgetError } from "@/server/domain/query-bounds";
import { GET as ready } from "@/app/api/ready/route";
import { GET as health } from "@/app/api/health/route";

const transport = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: transport }));
const directory = mkdtempSync(join(tmpdir(), "maxpase-wave03-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/"), log: [{ emit: "event", level: "query" }] });
const queries: string[] = [];
db.$on("query", event => queries.push(event.query));
let organizationId: string, foreignId: string, userId: string, personId: string, siaId: string, projectId: string;
const selection = () => ({ organizationId, siaId });
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.exec("CREATE TABLE _prisma_migrations (migration_name TEXT, checksum TEXT, finished_at TEXT, rolled_back_at TEXT)");
  for (const [name, checksum] of migrationManifest) sql.prepare("INSERT INTO _prisma_migrations VALUES (?, ?, 'finished', NULL)").run(name, checksum);
  sql.close();
  transport.$queryRaw.mockImplementation((query: TemplateStringsArray) => db.$queryRaw(query));
  organizationId = (await db.organization.create({ data: { name: "Visible company", slug: "wave03-visible", type: "COMPANY" } })).id;
  foreignId = (await db.organization.create({ data: { name: "Foreign confidential company", slug: "wave03-foreign", type: "COMPANY" } })).id;
  personId = (await db.person.create({ data: { displayName: "Fixture operator" } })).id;
  userId = (await db.user.create({ data: { email: "wave03@test.invalid", personId } })).id;
  const keys = [...new Set([...workforcePermissions.filter(p => p.scope !== "GLOBAL").map(p => p.key), "organization.read", "company.read", "project.read", "goal.read", "brand.read", "product.read", "ownership.read", "membership.read"])];
  for (const key of keys) await db.permission.create({ data: { key, name: key, scope: "GROUP" } });
  const human = await db.role.create({ data: { organizationId, key: "wave03-human", name: "Fixture human", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { organizationId, personId, roles: { create: { roleId: human.id } } } });
  siaId = (await db.siaIdentity.create({ data: { name: "Fixture SIA" } })).id;
  const agent = await db.role.create({ data: { organizationId, key: "wave03-agent", name: "Fixture agent", principalType: "AGENT", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.siaRoleAssignment.create({ data: { organizationId, siaId, roleId: agent.id } });
  await db.siaTool.create({ data: { siaId, key: "get_tasks", name: "Tasks", permissionKey: "task.read", enabled: true } });
  projectId = (await db.project.create({ data: { organizationId, name: "Scoped project", slug: "wave03-project" } })).id;
  await db.task.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ organizationId, projectId, title: "Visible task " + i })) });
  await db.task.createMany({ data: Array.from({ length: 6000 }, (_, i) => ({ organizationId: foreignId, title: "Foreign confidential task " + i })) });
}, 30000);
afterAll(async () => { vi.unstubAllEnvs(); await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Wave 03 scoped context cost controls", () => {
  it("reuses one task collection for SIA facts and graph, bounds output and excludes 6000 unrelated tasks", async () => {
    queries.length = 0;
    const result = await buildToolContext(db, userId, selection(), "get_tasks");
    expect(result.facts).toHaveLength(200);
    expect(queries.filter(q => q.includes('FROM `main`.`Task`') && !q.includes("COUNT(") && !q.includes("GROUP BY"))).toHaveLength(1);
    expect(result.limitations.join(" ")).toContain("200 facts");
    const graph = result.context.graph as { nodes: { id: string }[]; edges: { from: string; to: string }[] };
    expect(graph.nodes.length).toBeLessThanOrEqual(500); expect(graph.edges.length).toBeLessThanOrEqual(1000);
    const ids = new Set(graph.nodes.map(n => n.id)); expect(graph.edges.every(e => ids.has(e.from) && ids.has(e.to))).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(CONTEXT_BYTE_BUDGET);
    expect(JSON.stringify(result)).not.toContain("Foreign confidential");
    await expect(buildToolContext(db, userId, { ...selection(), organizationId: foreignId }, "get_tasks")).rejects.toThrow();
  });
  it("keeps selected-project task facts within the executive source intersection", async () => {
    const other = await db.task.create({ data: { organizationId, title: "Outside selected project" } });
    try {
      const result = await buildToolContext(db, userId, { ...selection(), projectId }, "get_tasks");
      expect(result.facts.every(f => f.source.startsWith("TASK:"))).toBe(true);
      expect(JSON.stringify(result)).not.toContain(other.title);
      const executive = await createExecutiveService(db).dashboard(userId);
      expect(executive.metrics.find(m => m.name === "Overdue tasks")?.value).toBe(0);
      expect(executive.tasks).toEqual([]);
    } finally { await db.task.delete({ where: { id: other.id } }); }
  });
  it("loads recent decision history once for repeated memory references without caching authority", async () => {
    const record = await createExecutiveService(db).save(userId, { organizationId, kind: "DECISION", title: "Human decision", ownerPersonId: personId, reference: "wave03-decision", description: "Preserved decision context", impact: "Review", options: ["Wait"] });
    await db.executiveHistory.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ id: "wave03-history-" + String(i).padStart(3, "0"), recordId: record.id, actorUserId: userId, toStatus: "PENDING", reason: "Reason " + i, createdAt: new Date(1700000000000 + i * 1000) })) });
    await db.siaContext.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ siaId, organizationId, key: "wave03-memory-" + i, value: "Reviewed decision reference", category: "DECISION", status: "APPROVED", sourceType: "DECISION", sourceId: record.id })) });
    try {
      const ctx = await createAccessContext(userId, db, selection()); queries.length = 0;
      const memory = await retrieveMemory(db, ctx, selection());
      expect(memory).toHaveLength(100);
      expect(queries.filter(q => q.includes('FROM `main`.`ExecutiveHistory`'))).toHaveLength(1);
      expect(queries.filter(q => q.includes('FROM `main`.`ExecutiveRecord`'))).toHaveLength(100);
      expect(memory[0].source).toMatchObject({ historyTruncated: true, historyLimit: 50, details: { description: "Preserved decision context" }, history: expect.arrayContaining([expect.objectContaining({ reason: "Reason 54" })]) });
      const result = await buildToolContext(db, userId, selection(), "get_tasks");
      expect(result.limitations.join(" ")).toContain("not a complete audit history");
      await db.executiveRecord.update({ where: { id: record.id }, data: { organizationId: foreignId } });
      expect(await retrieveMemory(db, ctx, selection())).toEqual([]);
    } finally {
      await db.siaContext.deleteMany({ where: { sourceId: record.id } });
      await db.executiveHistory.deleteMany({ where: { recordId: record.id } });
      await db.executiveRecord.delete({ where: { id: record.id } });
    }
  });
  it("rejects oversized context explicitly, including multibyte data, rather than silently omitting it", () => {
    expect(() => checkContextSize({ value: "small" })).not.toThrow();
    expect(() => checkContextSize({ value: "\u00e9".repeat(CONTEXT_BYTE_BUDGET / 2) })).toThrow(QueryBudgetError);
  });
  it("stops realistic large decision memory at its byte budget without returning a partial success", async () => {
    const record = await createExecutiveService(db).save(userId, { organizationId, kind: "DECISION", title: "Large history", ownerPersonId: personId, reference: "wave03-large-memory", description: "Human decision", impact: "Review", options: ["Wait"] });
    await db.executiveHistory.createMany({ data: Array.from({ length: 50 }, () => ({ recordId: record.id, actorUserId: userId, toStatus: "DRAFT", reason: "Documented consideration ".repeat(150) })) });
    await db.siaContext.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ siaId, organizationId, key: "large-memory-" + i, value: "Reviewed context", category: "DECISION", status: "APPROVED", sourceType: "DECISION", sourceId: record.id })) });
    try {
      const ctx = await createAccessContext(userId, db, selection()); queries.length = 0;
      await expect(retrieveMemory(db, ctx, selection())).rejects.toThrow(QueryBudgetError);
      expect(queries.filter(q => q.includes('FROM `main`.`ExecutiveHistory`'))).toHaveLength(1);
    } finally {
      await db.siaContext.deleteMany({ where: { sourceId: record.id } }); await db.executiveHistory.deleteMany({ where: { recordId: record.id } }); await db.executiveRecord.delete({ where: { id: record.id } });
    }
  });
});

describe("Wave 03 readiness and routing boundaries", () => {
  it("pins the complete migration manifest to actual migration bytes", () => {
    const folders = readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort();
    expect(migrationManifest.map(([name]) => name)).toEqual(folders);
    for (const [name, checksum] of migrationManifest) expect(createHash("sha256").update(readFileSync(join("prisma/migrations", name, "migration.sql"))).digest("hex")).toBe(checksum);
  });
  it("reports process health and database readiness without configured external providers", async () => {
    await expect(verifyDatabaseReadiness(db)).resolves.toBeUndefined();
    const response = await ready(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: "ready" }); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await health().json()).toEqual({ status: "alive" });
  });
  it("fails closed on an earlier unfinished migration and returns only safe endpoint diagnostics", async () => {
    await db.$executeRaw`UPDATE _prisma_migrations SET finished_at = NULL WHERE migration_name = ${migrationManifest[0][0]}`;
    try {
      await expect(verifyDatabaseReadiness(db)).rejects.toThrow("Schema unavailable");
      const response = await ready(); expect(response.status).toBe(503);
      const body = await response.json(); expect(Object.keys(body).sort()).toEqual(["correlationId", "status"]);
      expect(JSON.stringify(body)).not.toMatch(/file:|migration|SELECT|stack|password/i);
      expect(health().status).toBe(200);
    } finally { await db.$executeRaw`UPDATE _prisma_migrations SET finished_at = 'finished' WHERE migration_name = ${migrationManifest[0][0]}`; }
  });
  it("rejects missing, checksum-mismatched, duplicate and unknown active migration ledger entries", async () => {
    const [name, checksum] = migrationManifest[0];
    await db.$executeRaw`DELETE FROM _prisma_migrations WHERE migration_name = ${name}`;
    try { await expect(verifyDatabaseReadiness(db)).rejects.toThrow(); }
    finally { await db.$executeRaw`INSERT INTO _prisma_migrations VALUES (${name}, ${checksum}, 'finished', NULL)`; }
    await db.$executeRaw`UPDATE _prisma_migrations SET checksum = 'tampered' WHERE migration_name = ${name}`;
    try { await expect(verifyDatabaseReadiness(db)).rejects.toThrow(); }
    finally { await db.$executeRaw`UPDATE _prisma_migrations SET checksum = ${checksum} WHERE migration_name = ${name}`; }
    for (const extra of [name, "future-unreviewed-migration"]) {
      await db.$executeRaw`INSERT INTO _prisma_migrations VALUES (${extra}, 'extra', 'finished', NULL)`;
      try { await expect(verifyDatabaseReadiness(db)).rejects.toThrow(); }
      finally { await db.$executeRaw`DELETE FROM _prisma_migrations WHERE checksum = 'extra'`; }
    }
  });
  it("does not accept a successful ledger when a required runtime schema column is missing", async () => {
    await db.$executeRawUnsafe("ALTER TABLE ScheduledJob RENAME COLUMN scanCursor TO oldCursor");
    try { await expect(verifyDatabaseReadiness(db)).rejects.toThrow(); expect((await ready()).status).toBe(503); }
    finally { await db.$executeRawUnsafe("ALTER TABLE ScheduledJob RENAME COLUMN oldCursor TO scanCursor"); }
  });
  it("keeps liveness up but readiness closed for insecure production configuration", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("AUTH_SECRET", "");
    try { expect((await ready()).status).toBe(503); expect(health().status).toBe(200); }
    finally { vi.unstubAllEnvs(); }
  });
  it("keeps middleware a routing hint, protects exact app paths and leaves public paths alone", () => {
    vi.stubEnv("AUTH_COOKIE_NAME", "maxpase_session");
    try {
      for (const path of ["/app", "/app/executive?organizationId=forged"]) {
        const response = middleware(new NextRequest("https://maxpase.test" + path));
        expect(response.status).toBe(307); expect(response.headers.get("location")).toBe("https://maxpase.test/login");
      }
      for (const path of ["/login", "/api/health", "/api/ready", "/application"]) expect(middleware(new NextRequest("https://maxpase.test" + path)).headers.get("x-middleware-next")).toBe("1");
      expect(middleware(new NextRequest("https://maxpase.test/app", { headers: { cookie: "maxpase_session=forged" } })).headers.get("x-middleware-next")).toBe("1");
    } finally { vi.unstubAllEnvs(); }
  });
  it("does not trust forwarding or host values over a configured production origin", () => {
    expect(() => validateActionOrigin("https://maxpase.test", "attacker.test", "https://maxpase.test")).not.toThrow();
    for (const origin of ["https://attacker.test", "https://maxpase.test:444", "https://maxpase.test/login", null]) expect(() => validateActionOrigin(origin, "attacker.test", "https://maxpase.test")).toThrow();
  });
});
