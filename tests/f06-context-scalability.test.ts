import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import { workforcePermissions } from "@/server/authorization/registry";
import { createAccessContext } from "@/server/authorization/engine";
import { buildToolContext, checkContextSize, CONTEXT_BYTE_BUDGET } from "@/server/sia/context";
import { siaToolRegistry } from "@/server/sia/registry";
import { QueryBudgetError } from "@/server/domain/query-bounds";

const directory = mkdtempSync(join(tmpdir(), "maxpase-f06-")), file = join(directory, "fixture.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/"), log: [{ emit: "event", level: "query" }] });
const queries: { sql: string; params: string; duration: number; observedAt: number }[] = [];
db.$on("query", event => queries.push({ sql: event.query, params: event.params, duration: event.duration, observedAt: performance.now() }));
let organizationId: string, foreignId: string, personId: string, userId: string, siaId: string, roleId: string, projectId: string;
const selection = () => ({ organizationId, siaId });
let small: { queries: number; ms: number };
async function measure() {
  queries.length = 0;
  const start = performance.now();
  const context = await buildToolContext(db, userId, selection(), "get_tasks");
  let transactionStart: number | undefined, maxTransactionMs = 0;
  for (const q of queries) {
    if (/^BEGIN/.test(q.sql)) transactionStart = q.observedAt;
    else if (/^(COMMIT|ROLLBACK)/.test(q.sql) && transactionStart !== undefined) { maxTransactionMs = Math.max(maxTransactionMs, q.observedAt - transactionStart); transactionStart = undefined; }
  }
  return { context, queries: queries.length, ms: performance.now() - start, maxTransactionMs };
}
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close();
  organizationId = (await db.organization.create({ data: { name: "F06 authorized company", slug: "f06-company", type: "COMPANY" } })).id;
  foreignId = (await db.organization.create({ data: { name: "FOREIGN confidential company", slug: "f06-foreign", type: "COMPANY" } })).id;
  personId = (await db.person.create({ data: { displayName: "Scoped fixture human" } })).id;
  userId = (await db.user.create({ data: { email: "f06@test.invalid", personId } })).id;
  const keys = [...new Set([...workforcePermissions.filter(p => p.scope !== "GLOBAL").map(p => p.key), "organization.read", "company.read", "project.read", "goal.read", "product.read"])];
  for (const key of keys) await db.permission.create({ data: { key, name: key, scope: "GROUP" } });
  const role = await db.role.create({ data: { organizationId, key: "f06-human", name: "Scoped human", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  roleId = role.id;
  await db.membership.create({ data: { organizationId, personId, roles: { create: { roleId } } } });
  siaId = (await db.siaIdentity.create({ data: { name: "F06 fixture SIA" } })).id;
  const agent = await db.role.create({ data: { organizationId, key: "f06-agent", name: "Scoped agent", principalType: "AGENT", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.siaRoleAssignment.create({ data: { organizationId, siaId, roleId: agent.id } });
  await db.siaTool.create({ data: { siaId, key: "get_tasks", name: "Task context", permissionKey: "task.read", enabled: true } });
  projectId = (await db.project.create({ data: { organizationId, name: "Relevant project", slug: "f06-project" } })).id;
  await db.task.create({ data: { organizationId, projectId, title: "Relevant task" } });
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("F06 scope-first context", () => {
  it("small baseline returns the relevant task", async () => {
    const result = await measure(); small = { queries: result.queries, ms: result.ms };
    expect(result.context.facts).toEqual([expect.objectContaining({ label: "Relevant task" })]);
    console.info("F06 small", JSON.stringify({ queries: result.queries, ms: result.ms, maxTransactionMs: result.maxTransactionMs, bytes: Buffer.byteLength(JSON.stringify(result.context)) }));
  });
  it("5001 unrelated organizations do not expand hierarchy or time out the same scoped context", async () => {
    if (!small) { const result = await measure(); small = { queries: result.queries, ms: result.ms }; }
    await db.organization.createMany({ data: Array.from({ length: 5001 }, (_, i) => ({ name: "FOREIGN unrelated " + i, slug: "f06-unrelated-" + i, type: "COMPANY" as const })) });
    const start = performance.now();
    try {
      const result = await measure();
      console.info("F06 large", JSON.stringify({ queries: result.queries, ms: result.ms, maxTransactionMs: result.maxTransactionMs, small, organizationCount: 5003 }));
      expect(result.context.facts).toEqual([expect.objectContaining({ label: "Relevant task" })]);
      expect(JSON.stringify(result.context)).not.toContain("FOREIGN");
      expect(result.queries).toBeLessThanOrEqual(small.queries + 5);
      const ctx = await createAccessContext(userId, db, selection());
      expect(ctx.nodes.map(n => n.id)).toEqual([organizationId]);
      expect(queries.filter(q => q.sql.includes('FROM `main`.`Organization`')).every(q => q.sql.includes("WHERE"))).toBe(true);
    } catch (error) {
      console.info("F06 large failure", JSON.stringify({ ms: performance.now() - start, queries: queries.length, code: (error as { code?: string }).code, message: error instanceof Error ? error.message : "unknown" }));
      throw error;
    }
  }, 120000);
  it("cross-company and missing nested task/goal reads never enter context", async () => {
    await db.task.create({ data: { organizationId: foreignId, title: "FOREIGN task" } });
    await db.goal.create({ data: { organizationId, projectId, title: "Restricted nested goal" } });
    await db.rolePermission.deleteMany({ where: { roleId, permission: { key: { in: ["task.read", "goal.read"] } } } });
    try {
      await expect(buildToolContext(db, userId, selection(), "get_tasks")).rejects.toThrow();
      await db.siaTool.create({ data: { siaId, key: "get_project_status", name: "Project context", enabled: true, permissionKey: "project.read" } });
      const nested = await buildToolContext(db, userId, { ...selection(), projectId }, "get_project_status");
      expect(JSON.stringify(nested)).not.toMatch(/Relevant task|Restricted nested goal/);
      await db.rolePermission.create({ data: { roleId, permissionId: (await db.permission.findUniqueOrThrow({ where: { key: "task.read" } })).id } });
      await db.rolePermission.deleteMany({ where: { roleId, permission: { key: "project.read" } } });
      const result = await measure();
      expect(JSON.stringify(result.context)).not.toMatch(/FOREIGN|Restricted nested goal|Relevant project/);
      await expect(buildToolContext(db, userId, { ...selection(), organizationId: foreignId }, "get_tasks")).rejects.toThrow();
    } finally {
      for (const key of ["task.read", "goal.read", "project.read"]) await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId: (await db.permission.findUniqueOrThrow({ where: { key } })).id } }, create: { roleId, permissionId: (await db.permission.findUniqueOrThrow({ where: { key } })).id }, update: {} });
    }
  });
  it("project-only memberships do not widen to sibling project work", async () => {
    const other = await db.project.create({ data: { organizationId, name: "Restricted sibling project", slug: "f06-sibling" } });
    await db.task.create({ data: { organizationId, projectId: other.id, title: "Restricted sibling task" } });
    const membership = await db.membership.findFirstOrThrow({ where: { personId, organizationId } });
    await db.membership.update({ where: { id: membership.id }, data: { projectId, scopeKey: "project:" + projectId } });
    try {
      const result = await buildToolContext(db, userId, { ...selection(), projectId }, "get_tasks");
      expect(result.facts).toEqual([expect.objectContaining({ label: "Relevant task" })]);
      expect(JSON.stringify(result)).not.toContain("Restricted sibling");
      await expect(buildToolContext(db, userId, { ...selection(), projectId: other.id }, "get_tasks")).rejects.toThrow();
    } finally { await db.membership.update({ where: { id: membership.id }, data: { projectId: null, scopeKey: "organization" } }); }
  });
  it("retains final byte bounds and denies current revoked authority", async () => {
    expect(() => checkContextSize({ value: "x".repeat(CONTEXT_BYTE_BUDGET) })).toThrow();
    await db.role.update({ where: { id: roleId }, data: { status: "ARCHIVED" } });
    try { await expect(buildToolContext(db, userId, selection(), "get_tasks")).rejects.toThrow(); }
    finally { await db.role.update({ where: { id: roleId }, data: { status: "ACTIVE" } }); }
  });
  it("all registered read context families remain scoped after unrelated hierarchy growth", async () => {
    for (const tool of siaToolRegistry.filter(t => t.risk === "READ_ONLY")) {
      await db.siaTool.upsert({ where: { siaId_key: { siaId, key: tool.key } }, create: { siaId, key: tool.key, name: tool.name, enabled: true, permissionKey: tool.requiredPermission }, update: { enabled: true, permissionKey: tool.requiredPermission } });
      const result = await buildToolContext(db, userId, { ...selection(), ...(tool.key === "get_project_status" ? { projectId } : {}) }, tool.key);
      expect(JSON.stringify(result)).not.toContain("FOREIGN");
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(CONTEXT_BYTE_BUDGET);
    }
  });
  it("bounded principal batches fail explicitly before loading oversized nested permissions", async () => {
    const data = Array.from({ length: 5001 }, (_, i) => ({ id: "f06-capacity-" + i, key: "f06.capacity." + i, name: "Capacity fixture", scope: "GROUP" as const }));
    await db.permission.createMany({ data });
    await db.rolePermission.createMany({ data: data.map(p => ({ roleId, permissionId: p.id })) });
    try {
      queries.length = 0;
      await expect(createAccessContext(userId, db, selection())).rejects.toThrow(QueryBudgetError);
      const permissionReads = queries.filter(q => q.sql.includes('FROM `main`.`RolePermission`'));
      expect(permissionReads).toHaveLength(1);
      expect(permissionReads[0].sql).toContain("LIMIT");
      expect(queries.some(q => q.sql.includes("passwordHash"))).toBe(false);
    } finally { await db.rolePermission.deleteMany({ where: { permissionId: { in: data.map(p => p.id) } } }); await db.permission.deleteMany({ where: { id: { in: data.map(p => p.id) } } }); }
  });
  it("inactive and cyclic ancestors cannot authorize a scoped context", async () => {
    const parent = await db.organization.create({ data: { name: "Scoped ancestor", slug: "f06-ancestor", type: "GROUP" } });
    await db.organization.update({ where: { id: organizationId }, data: { parentId: parent.id } });
    try {
      await db.organization.update({ where: { id: parent.id }, data: { status: "ARCHIVED" } });
      await expect(buildToolContext(db, userId, selection(), "get_tasks")).rejects.toThrow();
      await db.organization.update({ where: { id: parent.id }, data: { status: "ACTIVE", parentId: organizationId } });
      await expect(buildToolContext(db, userId, selection(), "get_tasks")).rejects.toThrow();
    } finally { await db.organization.update({ where: { id: organizationId }, data: { parentId: null } }); await db.organization.update({ where: { id: parent.id }, data: { parentId: null } }); }
  });
  it("unrelated agent assignments cannot expand a narrowly scoped authorization graph", async () => {
    const roles = Array.from({ length: 5001 }, (_, i) => ({ id: "f06-foreign-role-" + i, organizationId: foreignId, key: "foreign-agent-" + i, name: "FOREIGN unused role", principalType: "AGENT" as const }));
    await db.role.createMany({ data: roles });
    await db.siaRoleAssignment.createMany({ data: roles.map(role => ({ organizationId: foreignId, siaId, roleId: role.id })) });
    const result = await measure();
    expect(result.queries).toBeLessThanOrEqual(small.queries + 5);
    expect(JSON.stringify(result.context)).not.toContain("FOREIGN");
    const ctx = await createAccessContext(userId, db, selection());
    expect(ctx.nodes.map(n => n.id)).toEqual([organizationId]);
    expect(ctx.grants.every(g => g.organizationId === organizationId)).toBe(true);
  });
});
