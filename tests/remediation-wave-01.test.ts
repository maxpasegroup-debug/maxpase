import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { businessService, createBusinessService } from "@/server/domain/business-service";
import { createWorkforceService } from "@/server/domain/workforce-service";
import { createExecutionService } from "@/server/domain/execution-service";
import { createExecutiveService } from "@/server/domain/executive-service";
import { createAiraService } from "@/server/domain/aira-service";
import { saveBusinessAction } from "@/app/app/business/actions";

// Mock only the Next request/cache boundary; the action still invokes real domain authorization.
const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/server/auth/guards", () => ({ requireSession: async () => session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const directory = mkdtempSync(join(tmpdir(), "maxpase-remediation-01-"));
const file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const business = createBusinessService(db), workforce = createWorkforceService(db);
const execution = createExecutionService(db), executive = createExecutiveService(db), aira = createAiraService(db);
let company: string, other: string, division: string, sibling: string;
let sequence = 0;
const unique = () => "wave01-" + ++sequence;
const permissions = ["person.create", "membership.manage", "membership.read", "organization.read", "company.read", "project.read", "task.read", "dependency.read", "executive.read", "program.read", "batch.read", "responsibility.read"];
async function actor(organizationId: string, keys: string[], descendants = false, projectId?: string) {
  const person = await db.person.create({ data: { displayName: unique() } });
  const user = await db.user.create({ data: { email: unique() + "@test.invalid", personId: person.id } });
  const role = await db.role.create({ data: { organizationId, key: unique(), name: "Test designation", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId, projectId, scopeKey: projectId ? "project:" + projectId : "organization", scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } });
  return { userId: user.id, personId: person.id, roleId: role.id };
}
async function project(organizationId: string) {
  return db.project.create({ data: { organizationId, name: unique(), slug: unique() } });
}
async function dependency(organizationId: string, projectId?: string) {
  const source = await db.task.create({ data: { organizationId, projectId, title: "SECRET source " + unique() } });
  const target = await db.task.create({ data: { organizationId, projectId, title: "SECRET prerequisite " + unique() } });
  const edge = await db.taskDependency.create({ data: { taskId: source.id, prerequisiteId: target.id } });
  return { source, target, edge };
}
async function program(organizationId: string, companyOrganizationId = company) {
  const p = await db.program.create({ data: { companyOrganizationId, organizationId, name: "SECRET program " + unique(), slug: unique(), status: "ACTIVE" } });
  const b = await db.batch.create({ data: { programId: p.id, name: "SECRET batch " + unique(), startDate: new Date("2099-01-01") } });
  return { p, b };
}
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const migration of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  sql.close();
  const root = await db.organization.create({ data: { name: "MAXPASE GROUP", slug: "maxpase-group", type: "GROUP", group: { create: { name: "MAXPASE GROUP" } } }, include: { group: true } });
  company = (await db.organization.create({ data: { name: "AIRA Skill City", slug: "aira-skill-city", type: "COMPANY", parentId: root.id, company: { create: { displayName: "AIRA Skill City", groupId: root.group!.id } } } })).id;
  other = (await db.organization.create({ data: { name: "Other company", slug: unique(), type: "COMPANY", parentId: root.id, company: { create: { displayName: "Other company", groupId: root.group!.id } } } })).id;
  division = (await db.organization.create({ data: { name: "Division A", slug: unique(), type: "DIVISION", parentId: company } })).id;
  sibling = (await db.organization.create({ data: { name: "Division B", slug: unique(), type: "DIVISION", parentId: company } })).id;
  for (const key of permissions) await db.permission.create({ data: { key, name: key, scope: "GROUP" } });
  vi.spyOn(businessService, "save").mockImplementation(business.save);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

describe("Wave 01 Person mutation boundary", () => {
  it("preserves authorized creation and atomic Person/membership audits on both services", async () => {
    const user = await actor(company, ["person.create", "membership.manage"]);
    for (const service of [business, workforce]) {
      const created = await service.save(user.userId, "people", { organizationId: company, displayName: unique() });
      expect(await db.person.findUnique({ where: { id: created.id } })).not.toBeNull();
      expect(await db.membership.count({ where: { personId: created.id, organizationId: company } })).toBe(1);
      expect(await db.auditEvent.count({ where: { actorUserId: user.userId, entityId: created.id, result: "SUCCESS" } })).toBe(1);
    }
  });
  it("rejects missing, unrelated and Person-only grants with no mutation or success audit", async () => {
    for (const keys of [["membership.read", "membership.manage"], ["company.read"], ["person.create"]]) {
      const user = await actor(company, keys);
      const before = { people: await db.person.count(), memberships: await db.membership.count(), audit: await db.auditEvent.count() };
      for (const service of [business, workforce]) await expect(service.save(user.userId, "people", { organizationId: company, displayName: unique() })).rejects.toThrow("Access denied");
      expect({ people: await db.person.count(), memberships: await db.membership.count(), audit: await db.auditEvent.count() }).toEqual(before);
    }
  });
  it("rejects cross-company, sibling-division and project-only creation grants", async () => {
    const p = await project(company);
    const users = [await actor(company, ["person.create", "membership.manage"]), await actor(division, ["person.create", "membership.manage"]), await actor(company, ["person.create", "membership.manage"], false, p.id)];
    for (const [index, user] of users.entries()) {
      const organizationId = index === 0 ? other : index === 1 ? sibling : company;
      const before = await db.person.count();
      for (const service of [business, workforce]) await expect(service.save(user.userId, "people", { organizationId, displayName: unique() })).rejects.toThrow("Access denied");
      expect(await db.person.count()).toBe(before);
    }
  });
  it("uses the trusted server-action actor despite a crafted actor field", async () => {
    const denied = await actor(company, ["membership.manage"]), authorized = await actor(company, ["person.create", "membership.manage"]);
    session.userId = denied.userId;
    const form = new FormData();
    form.set("kind", "people"); form.set("organizationId", company); form.set("displayName", unique()); form.set("actorUserId", authorized.userId);
    const before = await db.person.count();
    expect(await saveBusinessAction({}, form)).toEqual({ error: "Access denied" });
    expect(await db.person.count()).toBe(before);
    session.userId = authorized.userId;
    expect(await saveBusinessAction({}, form)).toEqual({ success: true });
    expect(await db.person.count()).toBe(before + 1);
  });
});

describe("Wave 01 dependency source confidentiality", () => {
  it("requires both capabilities and removes content from lists, detail and dashboards on revocation", async () => {
    const p = await project(company), link = await dependency(company, p.id);
    const user = await actor(company, ["project.read", "dependency.read", "task.read", "executive.read"], false, p.id);
    const rows = await execution.list(user.userId, "dependencies", { projectId: p.id, search: link.source.title });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).toContain(link.source.title);
    expect(JSON.stringify(rows)).toContain(link.target.title);
    expect(JSON.stringify(await execution.overview(user.userId))).toContain(link.target.title);
    await db.rolePermission.deleteMany({ where: { roleId: user.roleId, permission: { key: "task.read" } } });
    expect(await execution.list(user.userId, "dependencies", { projectId: p.id, search: link.source.title })).toEqual([]);
    for (const result of [await execution.detail(user.userId, p.id), await execution.overview(user.userId), await executive.dashboard(user.userId)]) {
      expect(JSON.stringify(result)).not.toContain(link.source.title);
      expect(JSON.stringify(result)).not.toContain(link.target.title);
    }
    expect(await db.taskDependency.findUnique({ where: { id: link.edge.id } })).not.toBeNull();
    const taskOnly = await actor(company, ["task.read"]);
    expect(await execution.list(taskOnly.userId, "dependencies")).toEqual([]);
  });
  it("rejects cross-company and sibling-project filters and protects both endpoints of malformed edges", async () => {
    const a = await project(company), b = await project(company), foreign = await dependency(other);
    const own = await dependency(company, a.id), hidden = await dependency(company, b.id);
    const user = await actor(company, ["dependency.read", "task.read"], false, a.id);
    await db.taskDependency.createMany({ data: [{ taskId: own.source.id, prerequisiteId: hidden.target.id }, { taskId: hidden.source.id, prerequisiteId: own.target.id }, { taskId: own.source.id, prerequisiteId: foreign.target.id }] });
    const result = await execution.list(user.userId, "dependencies");
    expect(result.map(r => r.id)).toEqual([own.edge.id]);
    expect(JSON.stringify(result)).not.toContain(hidden.source.title);
    expect(JSON.stringify(result)).not.toContain(hidden.target.title);
    expect(JSON.stringify(result)).not.toContain(foreign.target.title);
    await expect(execution.list(user.userId, "dependencies", { organizationId: other })).rejects.toThrow("Access denied");
    await expect(execution.list(user.userId, "dependencies", { projectId: b.id })).rejects.toThrow("Access denied");
    const mixed = await actor(company, ["dependency.read"], true);
    const readerRole = await db.role.create({ data: { organizationId: division, key: unique(), name: "Task source reader", permissions: { create: { permission: { connect: { key: "task.read" } } } } } });
    await db.membership.create({ data: { personId: mixed.personId, organizationId: division, roles: { create: { roleId: readerRole.id } } } });
    const left = await dependency(division), right = await dependency(sibling);
    await db.taskDependency.createMany({ data: [{ taskId: left.source.id, prerequisiteId: right.target.id }, { taskId: right.source.id, prerequisiteId: left.target.id }] });
    expect((await execution.list(mixed.userId, "dependencies")).map(r => r.id)).toEqual([left.edge.id]);
  });
  it("does not disclose unreadable task labels through the related responsibility view", async () => {
    const link = await dependency(division), user = await actor(division, ["responsibility.read"]);
    const responsibility = await db.responsibility.create({ data: { organizationId: division, personId: user.personId, taskId: link.source.id, title: "Assigned responsibility" } });
    const rows = await workforce.list(user.userId, "responsibilities");
    expect(rows.find(r => r.id === responsibility.id)).toMatchObject({ task: null });
    expect(JSON.stringify(rows)).not.toContain(link.source.title);
    await db.rolePermission.create({ data: { roleId: user.roleId, permissionId: (await db.permission.findUniqueOrThrow({ where: { key: "task.read" } })).id } });
    expect(JSON.stringify(await workforce.list(user.userId, "responsibilities"))).toContain(link.source.title);
  });
});

describe("Wave 01 AIRA division filter intersection", () => {
  it("does not turn company/organization reads into program or batch access, including dashboard selectors", async () => {
    const records = await program(division), user = await actor(company, ["company.read", "organization.read"], true);
    for (const kind of ["programs", "batches"] as const) {
      expect(await aira.list(user.userId, kind)).toEqual([]);
      expect(await aira.list(user.userId, kind, { divisionId: division, search: "SECRET", status: kind === "programs" ? "ACTIVE" : "PLANNED" })).toEqual([]);
    }
    await expect(executive.dashboard(user.userId)).rejects.toThrow("Access denied");
    const executiveReader = await actor(company, ["company.read", "organization.read", "executive.read"], true);
    for (const data of [await aira.workspace(user.userId), await aira.overview(user.userId), await executive.dashboard(executiveReader.userId)]) {
      expect(JSON.stringify(data)).not.toContain(records.p.name);
      expect(JSON.stringify(data)).not.toContain(records.b.name);
    }
  });
  it("allows independent program and batch reads without leaking the other domain's name", async () => {
    const records = await program(division);
    const programReader = await actor(company, ["company.read", "organization.read", "program.read"], true);
    const batchReader = await actor(company, ["company.read", "organization.read", "batch.read"], true);
    expect((await aira.list(programReader.userId, "programs", { divisionId: division })).map(r => r.id)).toContain(records.p.id);
    expect(await aira.list(programReader.userId, "batches", { divisionId: division })).toEqual([]);
    expect(await aira.list(batchReader.userId, "programs", { divisionId: division })).toEqual([]);
    const batches = await aira.list(batchReader.userId, "batches", { divisionId: division });
    expect(batches.find(r => r.id === records.b.id)).toMatchObject({ name: records.b.name, programName: null });
    expect(JSON.stringify(batches)).not.toContain(records.p.name);
    expect(JSON.stringify(await aira.overview(batchReader.userId))).not.toContain(records.p.name);
    const both = await actor(company, ["company.read", "organization.read", "program.read", "batch.read"], true);
    expect((await aira.list(both.userId, "batches", { divisionId: division })).find(r => r.id === records.b.id)).toMatchObject({ programName: records.p.name });
  });
  it("only narrows readable division records and rejects foreign, invalid and conflicting scopes", async () => {
    const allowed = await program(division), hidden = await program(sibling), foreign = await program(other, other);
    const user = await actor(company, ["company.read", "organization.read"], true);
    const reader = await db.role.create({ data: { organizationId: division, key: unique(), name: "Division reader", permissions: { create: ["program.read", "batch.read"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId: user.personId, organizationId: division, roles: { create: { roleId: reader.id } } } });
    for (const [kind, id, hiddenName] of [["programs", allowed.p.id, hidden.p.name], ["batches", allowed.b.id, hidden.b.name]] as const) {
      const all = await aira.list(user.userId, kind), narrowed = await aira.list(user.userId, kind, { divisionId: division });
      expect(narrowed.map(r => r.id).sort()).toEqual(all.map(r => r.id).sort());
      expect(narrowed.map(r => r.id)).toContain(id);
      expect(await aira.list(user.userId, kind, { divisionId: sibling })).toEqual([]);
      expect(await aira.list(user.userId, kind, { organizationId: division, divisionId: sibling })).toEqual([]);
      await expect(aira.list(user.userId, kind, { divisionId: other })).rejects.toThrow("outside AIRA");
      await expect(aira.list(user.userId, kind, { divisionId: "forged-division" })).rejects.toThrow();
      expect(JSON.stringify(narrowed)).not.toContain(hiddenName);
      expect(JSON.stringify(narrowed)).not.toContain(foreign.p.name);
    }
    const dashboard = await aira.overview(user.userId);
    expect(dashboard.activePrograms.map(r => r.id)).toContain(allowed.p.id);
    expect(JSON.stringify(dashboard)).not.toContain(hidden.p.name);
    expect(JSON.stringify(dashboard)).not.toContain(hidden.b.name);
    expect(JSON.stringify(dashboard)).not.toContain(foreign.p.name);
    await db.rolePermission.deleteMany({ where: { roleId: reader.id } });
    expect(await aira.list(user.userId, "programs", { divisionId: division })).toEqual([]);
    expect(await aira.list(user.userId, "batches", { divisionId: division })).toEqual([]);
  });
});
