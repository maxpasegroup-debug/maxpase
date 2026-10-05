import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { createExecutionService, completionProgress } from "@/server/domain/execution-service";
import { createWorkforceService } from "@/server/domain/workforce-service";
import { createBusinessService } from "@/server/domain/business-service";
import { workforcePermissions } from "@/server/authorization/registry";

const dir = mkdtempSync(join(tmpdir(), "maxpase-phase04-"));
const path = join(dir, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + path.replaceAll("\\", "/") });
const execution = createExecutionService(db);
const workforce = createWorkforceService(db);
const business = createBusinessService(db);
let admin: string, manager: string, projectUser: string, human: string, a: string, b: string, dept: string, otherDept: string, projectOnly: string;
let count = 0;
const name = () => "Execution " + ++count;
const project = (organizationId = a, status = "ACTIVE") => execution.save(admin, "projects", { organizationId, name: name(), slug: "test-" + count, status });
const task = (projectId?: string, extra: Record<string, unknown> = {}) => execution.save(admin, "tasks", { organizationId: a, projectId, title: name(), ...extra });
beforeAll(async () => {
  const sql = new DatabaseSync(path);
  for (const migration of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(sql.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
  sql.close();
  const root = await db.organization.create({ data: { name: "Test group", slug: "execution-group", type: "GROUP" } });
  a = (await db.organization.create({ data: { name: "Test A", slug: "execution-a", type: "COMPANY", parentId: root.id } })).id;
  b = (await db.organization.create({ data: { name: "Test B", slug: "execution-b", type: "COMPANY", parentId: root.id } })).id;
  dept = (await db.organization.create({ data: { name: "Test department", slug: "execution-dept", type: "DEPARTMENT", parentId: a } })).id;
  otherDept = (await db.organization.create({ data: { name: "Sibling department", slug: "execution-sibling", type: "DEPARTMENT", parentId: a } })).id;
  const keys = [...new Set([...workforcePermissions.map(p => p.key), ...["project", "goal", "brand", "product", "membership", "organization"].flatMap(d => [d + ".read", d + ".manage"]), "membership.scope.manage", "membership.assign_role"])];
  for (const key of keys) await db.permission.create({ data: { key, name: key, scope: "GROUP" } });
  async function actor(org: string, email: string, selected = keys, projectId?: string, descendants = false) {
    const p = await db.person.create({ data: { displayName: email } });
    const user = await db.user.create({ data: { email, personId: p.id } });
    const role = await db.role.create({ data: { organizationId: org, key: email.split("@")[0], name: "Test role", permissions: { create: selected.map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { organizationId: org, personId: p.id, projectId, scopeKey: projectId ? "project:" + projectId : "organization", scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } });
    return user.id;
  }
  admin = await actor(root.id, "execution-admin@test.invalid", keys, undefined, true);
  manager = await actor(a, "execution-manager@test.invalid");
  projectOnly = (await project()).id;
  projectUser = await actor(a, "execution-project@test.invalid", ["project.read", "task.read", "task.manage", "milestone.read", "milestone.manage", "goal.read", "goal.manage", "goal.progress", "dependency.read", "dependency.manage", "blocker.read", "blocker.manage", "responsibility.read", "responsibility.manage", "person.read", "membership.read"], projectOnly);
  human = (await db.person.create({ data: { displayName: "Execution human without login", memberships: { create: { organizationId: a } } } })).id;
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Phase 04 execution domain", () => {
  it("creates, reads, updates and archives projects without granting owner permissions", async () => {
    const p = await project();
    await execution.save(admin, "projects", { organizationId: a, name: "Maintained", slug: "maintained", ownerPersonId: human, accountablePersonId: human, status: "ARCHIVED" }, p.id);
    expect((await execution.list(manager, "projects")).find(r => r.id === p.id)).toMatchObject({ status: "ARCHIVED", ownerPersonId: human, accountablePersonId: human });
    const events = await db.auditEvent.findMany({ where: { entityId: p.id } });
    expect(events.map(e => e.action)).toContain("project.owner_changed");
    expect(events.map(e => e.action)).toContain("project.accountable_changed");
    expect(await db.membershipRole.count({ where: { membership: { personId: human } } })).toBe(0);
  });
  it("isolates company, department and project reads and mutations", async () => {
    const foreign = await project(b);
    const sibling = await project();
    await expect(execution.save(manager, "projects", { organizationId: b, name: "Forged", slug: "forged" }, foreign.id)).rejects.toThrow("Access denied");
    await expect(execution.list(manager, "tasks", { organizationId: b })).rejects.toThrow("Access denied");
    await expect(execution.list(projectUser, "tasks", { projectId: sibling.id })).rejects.toThrow("Access denied");
    expect((await execution.list(projectUser, "projects")).map(p => p.id)).toEqual([projectOnly]);
    const p = await db.person.create({ data: { displayName: "Department actor" } });
    const u = await db.user.create({ data: { email: "dept-execution@test.invalid", personId: p.id } });
    const r = await db.role.create({ data: { organizationId: dept, key: "dept-execution", name: "Dept", permissions: { create: [{ permission: { connect: { key: "task.manage" } } }] } } });
    await db.membership.create({ data: { personId: p.id, organizationId: dept, roles: { create: { roleId: r.id } } } });
    await expect(execution.save(u.id, "tasks", { organizationId: otherDept, title: "Sibling" })).rejects.toThrow("Access denied");
    await execution.save(u.id, "tasks", { organizationId: dept, title: "Own department" });
  });
  it("requires explicit reopen capability and preserves closed project read access", async () => {
    const p = await project(a, "ARCHIVED");
    await expect(task(p.id)).rejects.toThrow("reopened");
    await expect(execution.save(admin, "projects", { organizationId: a, name: "Reopen", slug: "reopen", status: "ACTIVE" }, p.id)).rejects.toThrow("reopen transition");
    await execution.save(admin, "projects", { organizationId: a, name: "Reopen", slug: "reopen", status: "ACTIVE", reopen: true }, p.id);
    await task(p.id);
    await expect(business.save(admin, "projects", { organizationId: a, name: "Close", slug: "reopen", status: "ARCHIVED" }, p.id)).resolves.toMatchObject({ status: "ARCHIVED" });
    await expect(business.save(admin, "projects", { organizationId: a, name: "Legacy bypass", slug: "reopen" }, p.id)).rejects.toThrow("reopen transition");
  });
  it("validates owners, assignees, dated memberships and active human identity", async () => {
    const p = await project();
    const foreign = await db.person.create({ data: { displayName: "B human", memberships: { create: { organizationId: b } } } });
    await expect(task(p.id, { assigneePersonId: foreign.id })).rejects.toThrow("active membership");
    await expect(task(p.id, { ownerPersonId: "unknown" })).rejects.toThrow("active membership");
    const member = await db.membership.findFirstOrThrow({ where: { personId: human } });
    for (const change of [{ endDate: new Date("2000-01-01") }, { startDate: new Date("2099-01-01") }, { status: "SUSPENDED" as const }]) {
      await db.membership.update({ where: { id: member.id }, data: change });
      await expect(task(p.id, { assigneePersonId: human })).rejects.toThrow("active membership");
      await db.membership.update({ where: { id: member.id }, data: { startDate: null, endDate: null, status: "ACTIVE" } });
    }
    await db.person.update({ where: { id: human }, data: { status: "INACTIVE" } });
    await expect(task(p.id, { assigneePersonId: human })).rejects.toThrow("active membership");
    await db.person.update({ where: { id: human }, data: { status: "ACTIVE" } });
    const assigned = await task(p.id, { assigneePersonId: human, ownerPersonId: human });
    expect(await db.task.findUnique({ where: { id: assigned.id } })).toMatchObject({ assigneePersonId: human, creatorPersonId: (await db.user.findUniqueOrThrow({ where: { id: admin } })).personId });
    expect(await db.auditEvent.findFirst({ where: { entityId: assigned.id, action: "task.assigned" } })).not.toBeNull();
  });
  it("allows project-only membership assignment without organization-wide access", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: projectUser } });
    const t = await execution.save(projectUser, "tasks", { organizationId: a, projectId: projectOnly, title: "Scoped work", assigneePersonId: user.personId });
    expect(await db.task.findUnique({ where: { id: t.id } })).toMatchObject({ assigneePersonId: user.personId });
    await expect(execution.save(projectUser, "projects", { organizationId: a, name: "Owner bypass", slug: "owner-bypass" }, projectOnly)).rejects.toThrow("Access denied");
  });
  it("validates milestone relationships, completion and real derived progress", async () => {
    const p = await project();
    const m = await execution.save(admin, "milestones", { organizationId: a, projectId: p.id, name: "Checkpoint" });
    await expect(task(projectOnly, { milestoneId: m.id })).rejects.toThrow("different project");
    const t = await task(p.id, { milestoneId: m.id });
    await expect(execution.save(admin, "milestones", { organizationId: a, projectId: p.id, name: "Checkpoint", status: "COMPLETED" }, m.id)).rejects.toThrow("incomplete tasks");
    await execution.save(admin, "tasks", { organizationId: a, projectId: p.id, milestoneId: m.id, title: "Completed task", status: "COMPLETED" }, t.id);
    expect((await execution.list(admin, "milestones", { projectId: p.id }))[0]).toMatchObject({ calculatedProgress: 100 });
    await execution.save(admin, "milestones", { organizationId: a, projectId: p.id, name: "Checkpoint", status: "COMPLETED" }, m.id);
    expect((await execution.list(admin, "projects", { projectId: p.id }))[0]).toMatchObject({ calculatedProgress: 100 });
  });
  it("normalizes dependency direction, rejects self/cycles/cross-project edges and audits removal", async () => {
    const p = await project(); const x = await task(p.id); const y = await task(p.id); const z = await task(p.id);
    await execution.dependency(admin, { taskId: x.id, prerequisiteId: y.id, relationship: "BLOCKS" });
    await execution.dependency(admin, { taskId: z.id, prerequisiteId: y.id, relationship: "BLOCKED_BY" });
    await expect(execution.dependency(admin, { taskId: x.id, prerequisiteId: z.id })).rejects.toThrow("cycle");
    await expect(execution.dependency(admin, { taskId: x.id, prerequisiteId: x.id })).rejects.toThrow("itself");
    const foreign = await task(projectOnly);
    await expect(execution.dependency(admin, { taskId: x.id, prerequisiteId: foreign.id })).rejects.toThrow("same organization and project");
    await execution.dependency(admin, { taskId: y.id, prerequisiteId: x.id }, false);
    expect(await db.taskDependency.findFirst({ where: { taskId: y.id, prerequisiteId: x.id } })).toBeNull();
    expect(await db.auditEvent.findFirst({ where: { entityId: y.id, action: "dependency.removed" } })).not.toBeNull();
  });
  it("prevents starting unresolved work and reopening a prerequisite of started work", async () => {
    const p = await project(); const x = await task(p.id); const y = await task(p.id);
    await execution.dependency(admin, { taskId: y.id, prerequisiteId: x.id });
    await expect(execution.save(admin, "tasks", { organizationId: a, projectId: p.id, title: "Start", status: "IN_PROGRESS" }, y.id)).rejects.toThrow("Unresolved");
    await execution.save(admin, "tasks", { organizationId: a, projectId: p.id, title: "Done", status: "COMPLETED" }, x.id);
    await execution.save(admin, "tasks", { organizationId: a, projectId: p.id, title: "Start", status: "IN_PROGRESS" }, y.id);
    await expect(execution.save(admin, "tasks", { organizationId: a, projectId: p.id, title: "Reopen", status: "TODO", reopen: true }, x.id)).rejects.toThrow("prerequisite");
  });
  it("records completion timestamps and requires explicit task reopen transitions", async () => {
    const t = await task(undefined, { status: "COMPLETED" });
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).completionDate).toBeInstanceOf(Date);
    await expect(execution.save(admin, "tasks", { organizationId: a, title: "Silent reopen", status: "TODO" }, t.id)).rejects.toThrow("reopen transition");
    await execution.save(admin, "tasks", { organizationId: a, title: "Explicit reopen", status: "TODO", reopen: true }, t.id);
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).completionDate).toBeNull();
  });
  it("supports independent and hierarchical goals while rejecting cycles and sibling companies", async () => {
    const parent = await execution.save(admin, "goals", { organizationId: a, title: "Parent" });
    const child = await execution.save(admin, "goals", { organizationId: dept, title: "Child", parentGoalId: parent.id });
    await expect(execution.save(admin, "goals", { organizationId: a, title: "Cycle", parentGoalId: parent.id }, parent.id)).rejects.toThrow("cycle");
    const sameScopeChild = await execution.save(admin, "goals", { organizationId: a, title: "Same scope child", parentGoalId: parent.id });
    await expect(execution.save(admin, "goals", { organizationId: a, title: "Long cycle", parentGoalId: sameScopeChild.id }, parent.id)).rejects.toThrow("cycle");
    await expect(execution.save(admin, "goals", { organizationId: b, title: "Cross-company child", parentGoalId: parent.id })).rejects.toThrow("branch");
    expect(await db.goal.findUnique({ where: { id: child.id } })).toMatchObject({ parentGoalId: parent.id });
  });
  it("keeps manual progress provenance, rejects invalid values and protects derived progress", async () => {
    const g = await execution.save(admin, "goals", { organizationId: a, title: "Manual", progress: 25, progressReason: "Initial estimate" });
    await execution.progress(admin, g.id, 40, "Review");
    expect((await execution.history(admin, g.id)).map(p => p.value)).toEqual([40, 25]);
    expect((await execution.history(admin, g.id))[0]).toMatchObject({ reason: "Review", actorPersonId: (await db.user.findUniqueOrThrow({ where: { id: admin } })).personId });
    await expect(execution.progress(admin, g.id, 101)).rejects.toThrow("Invalid");
    const derived = await execution.save(admin, "goals", { organizationId: a, title: "Derived", progressMode: "TASKS" });
    expect((await execution.list(admin, "goals")).find(r => r.id === derived.id)).toMatchObject({ calculatedProgress: null });
    await task(undefined, { goalId: derived.id, status: "COMPLETED" }); await task(undefined, { goalId: derived.id });
    expect((await execution.list(admin, "goals")).find(r => r.id === derived.id)).toMatchObject({ calculatedProgress: 50 });
    await expect(execution.progress(admin, derived.id, 73)).rejects.toThrow("manual");
    expect(completionProgress([{ status: "CANCELLED" }])).toBeNull();
  });
  it("creates/resolves structured blockers, validates dependencies and gates completion", async () => {
    const p = await project(); const t = await task(p.id);
    const blocker = await execution.blocker(admin, { organizationId: a, taskId: t.id, description: "Waiting for review", ownerPersonId: human, expectedResolution: "2026-10-03" });
    await expect(execution.save(admin, "tasks", { organizationId: a, projectId: p.id, title: "Complete", status: "COMPLETED" }, t.id)).rejects.toThrow("blockers");
    await expect(execution.blocker(admin, { organizationId: a, taskId: t.id, description: "Self", dependencyTaskId: t.id })).rejects.toThrow("itself");
    await execution.blocker(admin, { organizationId: a, taskId: t.id, description: "Waiting for review", status: "RESOLVED" }, blocker.id);
    expect(await db.executionBlocker.findUnique({ where: { id: blocker.id } })).toMatchObject({ status: "RESOLVED", resolvedAt: expect.any(Date) });
    await execution.save(admin, "tasks", { organizationId: a, projectId: p.id, title: "Complete", status: "COMPLETED" }, t.id);
    expect(await db.auditEvent.findFirst({ where: { entityId: blocker.id, action: "blocker.resolved" } })).not.toBeNull();
  });
  it("validates UTC dates, ordering and completion-before-start", async () => {
    await expect(task(undefined, { startDate: "2026-10-05", dueDate: "2026-10-04" })).rejects.toThrow("precedes");
    await expect(task(undefined, { dueDate: "2026-10-04T10:00:00" })).rejects.toThrow();
    await expect(task(undefined, { dueDate: "2026-02-31" })).rejects.toThrow("calendar date");
    await expect(task(undefined, { status: "COMPLETED", startDate: "2099-01-01" })).rejects.toThrow("Completion");
    const t = await task(undefined, { dueDate: "2026-10-04" });
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).dueDate?.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });
  it("reuses membership and responsibility models without granting automatic capabilities", async () => {
    const p = await project();
    const m = await workforce.save(admin, "memberships", { organizationId: a, projectId: p.id, personId: human });
    await expect(business.save(admin, "memberships", { organizationId: a, personId: human, status: "ACTIVE" }, m.id)).rejects.toThrow("project membership workspace");
    expect(await db.membershipRole.count({ where: { membershipId: m.id } })).toBe(0);
    const t = await task(p.id);
    await workforce.save(admin, "responsibilities", { organizationId: a, taskId: t.id, personId: human, title: "Delivery" });
    expect((await execution.list(admin, "responsibilities", { projectId: p.id })).length).toBe(1);
    await workforce.save(admin, "memberships", { organizationId: a, projectId: p.id, personId: human, status: "ENDED" }, m.id);
    expect(await db.auditEvent.findFirst({ where: { entityId: m.id, action: "memberships.updated" } })).not.toBeNull();
    const milestone = await execution.save(admin, "milestones", { organizationId: a, projectId: projectOnly, name: "Scoped responsibility" });
    const u = await db.user.findUniqueOrThrow({ where: { id: projectUser } });
    await workforce.save(projectUser, "responsibilities", { organizationId: a, milestoneId: milestone.id, personId: u.personId, title: "Checkpoint owner" });
    expect((await execution.list(projectUser, "responsibilities", { projectId: projectOnly })).length).toBe(1);
  });
  it("derives overdue and approaching attention only from accessible records", async () => {
    await execution.save(admin, "tasks", { organizationId: b, title: "Invisible overdue", dueDate: "2026-10-01" });
    const overdue = await task(undefined, { dueDate: "2026-10-01", status: "BLOCKED" });
    const upcoming = await task(undefined, { dueDate: "2026-10-05" });
    const data = await execution.overview(manager, new Date("2026-10-02T00:00:00Z"));
    expect(data.attention).toContainEqual(expect.objectContaining({ id: overdue.id, kind: "OVERDUE" }));
    expect(data.attention).toContainEqual(expect.objectContaining({ id: upcoming.id, kind: "APPROACHING" }));
    expect(data.attention.some(a => a.title === "Invisible overdue")).toBe(false);
    expect(data.metrics.overdueTasks).toBeGreaterThan(0);
  });
  it("searches and filters actual execution records and rejects forged scope filters", async () => {
    const p = await project();
    const t = await task(p.id, { title: "Unique filtered task", priority: "CRITICAL", assigneePersonId: human, dueDate: "2026-10-01" });
    const rows = await execution.list(manager, "tasks", { search: "Unique filtered", projectId: p.id, assigneePersonId: human, priority: "CRITICAL", status: "TODO", dueBefore: "2026-10-02" });
    expect(rows.map(r => r.id)).toEqual([t.id]);
    await expect(execution.list(manager, "milestones", { organizationId: b })).rejects.toThrow("Access denied");
    await expect(execution.list(projectUser, "members", { projectId: p.id })).rejects.toThrow("Access denied");
  });
  it("rolls back execution and progress mutations if audit persistence fails", async () => {
    const g = await execution.save(admin, "goals", { organizationId: a, title: "Audit rollback" });
    const before = await db.task.count(); const updates = await db.progressUpdate.count();
    await db.$executeRawUnsafe("CREATE TRIGGER execution_audit_failure BEFORE INSERT ON AuditEvent BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
    try {
      await expect(task()).rejects.toThrow();
      await expect(execution.progress(admin, g.id, 50)).rejects.toThrow();
      expect(await db.task.count()).toBe(before);
      expect(await db.progressUpdate.count()).toBe(updates);
      expect((await db.goal.findUniqueOrThrow({ where: { id: g.id } })).progress).toBe(0);
    } finally { await db.$executeRawUnsafe("DROP TRIGGER execution_audit_failure"); }
  });
  it("does not expose derived task progress to a project-read-only principal", async () => {
    const p = await project(); await task(p.id, { status: "COMPLETED" });
    const human = await db.person.create({ data: { displayName: "Read-only observer" } });
    const observer = await db.user.create({ data: { email: "execution-observer@test.invalid", personId: human.id } });
    const role = await db.role.create({ data: { organizationId: a, key: "execution-observer", name: "Observer", permissions: { create: { permission: { connect: { key: "project.read" } } } } } });
    await db.membership.create({ data: { organizationId: a, personId: human.id, projectId: p.id, scopeKey: "project:" + p.id, roles: { create: { roleId: role.id } } } });
    expect((await execution.list(observer.id, "projects"))[0]).toMatchObject({ calculatedProgress: null });
    expect((await execution.detail(observer.id, p.id)).sections.tasks).toBeUndefined();
    await expect(execution.save(observer.id, "tasks", { organizationId: a, projectId: p.id, title: "Forged" })).rejects.toThrow("Access denied");
  });
  it("keeps project grants for archived reads but does not allow child writes or unauthorized reopen", async () => {
    const p = await project();
    const user = await db.user.findUniqueOrThrow({ where: { id: projectUser } });
    const role = await db.role.create({ data: { organizationId: a, key: "execution-no-reopen", name: "No reopen", permissions: { create: ["project.read", "project.manage", "task.manage"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { organizationId: a, personId: user.personId!, projectId: p.id, scopeKey: "project:" + p.id, roles: { create: { roleId: role.id } } } });
    await execution.save(admin, "projects", { organizationId: a, name: "Closed access", slug: "closed-access", status: "ARCHIVED" }, p.id);
    expect((await execution.list(projectUser, "projects")).some(row => row.id === p.id)).toBe(true);
    await expect(execution.save(projectUser, "tasks", { organizationId: a, projectId: p.id, title: "Closed write" })).rejects.toThrow("reopened");
    await expect(execution.save(projectUser, "projects", { organizationId: a, name: "Reopen denied", slug: "closed-access", status: "ACTIVE", reopen: true }, p.id)).rejects.toThrow("Access denied");
  });
  it("normalizes historical execution states without losing row IDs or foreign keys", () => {
    const legacy = new DatabaseSync(join(dir, "legacy.db"));
    try {
      const migrations = readdirSync("prisma/migrations").filter(f => /^\d/.test(f) && f <= "20261002160000_phase_04_execution").sort();
      for (const migration of migrations.slice(0, -1)) legacy.exec(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
      legacy.exec("INSERT INTO Organization(id,type,name,slug,updatedAt) VALUES('legacy-org','COMPANY','Legacy','legacy',CURRENT_TIMESTAMP); INSERT INTO Project(id,organizationId,name,slug,status,updatedAt) VALUES('legacy-project','legacy-org','Legacy project','legacy-project','INACTIVE',CURRENT_TIMESTAMP); INSERT INTO Goal(id,organizationId,projectId,title,status,progress,updatedAt) VALUES('legacy-goal','legacy-org','legacy-project','Legacy goal','CANCELED',25,CURRENT_TIMESTAMP); INSERT INTO Task(id,organizationId,projectId,goalId,title,status,updatedAt) VALUES('legacy-task','legacy-org','legacy-project','legacy-goal','Legacy task','DONE',CURRENT_TIMESTAMP);");
      legacy.exec(readFileSync(`prisma/migrations/${migrations.at(-1)}/migration.sql`, "utf8"));
      expect(legacy.prepare("SELECT id,status FROM Project").get()).toEqual({ id: "legacy-project", status: "PAUSED" });
      expect(legacy.prepare("SELECT id,status,progress FROM Goal").get()).toEqual({ id: "legacy-goal", status: "CANCELLED", progress: 25 });
      expect(legacy.prepare("SELECT id,status,goalId,completionDate IS NOT NULL AS completed FROM Task").get()).toEqual({ id: "legacy-task", status: "COMPLETED", goalId: "legacy-goal", completed: 1 });
      expect(legacy.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { legacy.close(); }
  });
});
