import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { initializeGroupStructure } from "@/server/group/structure";
import { createSkillCityManagerDesk } from "@/server/skillcity/manager-desk";
import { createSkillCityEmployeeDashboard } from "@/server/skillcity/employee-dashboard";

const directory = mkdtempSync(join(tmpdir(), "skillcity-manager-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const desk = createSkillCityManagerDesk(db, () => new Date("2026-10-24T06:00:00Z"));
let managerId: string, staffId: string, labsId: string, foreignId: string, managerRoleId: string;

beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(name => /^\d/.test(name)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close();
  await db.$transaction(initializeGroupStructure);
  const companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  labsId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  foreignId = (await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } })).id;
  const manager = await db.person.create({ data: { displayName: "Synthetic manager" } });
  const staff = await db.person.create({ data: { displayName: "Synthetic report" } });
  staffId = staff.id;
  managerId = (await db.user.create({ data: { email: "manager@test.invalid", personId: manager.id, emailVerifiedAt: new Date() } })).id;
  await db.user.create({ data: { email: "report@test.invalid", personId: staff.id, emailVerifiedAt: new Date() } });
  const keys = ["organization.read", "executive.read", "decision.decide", "person.read", "reporting.read", "responsibility.read", "task.read", "task.manage", "blocker.manage"];
  for (const key of [...keys, "responsibility.manage"]) await db.permission.upsert({ where: { key }, create: { key, name: key, scope: "GROUP" }, update: {} });
  const role = await db.role.create({ data: { organizationId: companyId, key: "synthetic-manager-desk", name: "Director", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  managerRoleId = role.id;
  await db.membership.create({ data: { personId: manager.id, organizationId: companyId, scope: "DESCENDANTS", roles: { create: { roleId: role.id } } } });
  await db.membership.create({ data: { personId: staff.id, organizationId: labsId } });
  await db.reportingRelationship.create({ data: { organizationId: labsId, personId: staff.id, managerPersonId: manager.id } });
  await db.task.create({ data: { organizationId: labsId, assigneePersonId: staff.id, title: "Real assigned work" } });
  await db.task.create({ data: { organizationId: foreignId, assigneePersonId: staff.id, title: "Other company work" } });
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Skill City manager desk", () => {
  it("shows only direct, authorized work and requires responsibility authority for focus", async () => {
    await db.role.update({ where: { id: managerRoleId }, data: { name: "Business Development & Operations Manager" } });
    const workspace = createSkillCityEmployeeDashboard(db);
    expect((await workspace.dashboard(managerId)).view).toBe("manager");
    await expect(workspace.dashboard(managerId, "director")).rejects.toThrow();
    const initial = await desk.list(managerId);
    const report = initial.people.find(person => person.personId === staffId && person.organizationId === labsId);
    expect(report?.tasks.map(task => task.title)).toEqual(["Real assigned work"]);
    expect(report?.canSetFocus).toBe(false);
    expect(initial.summary).toMatchObject({ directReports: 1, openTasks: 1, overdueTasks: 0, openBlockers: null, dueFollowUps: null, pendingDecisions: null });
    for (let index = 0; index < 12; index++) await db.task.create({ data: { organizationId: labsId, assigneePersonId: staffId, title: `Additional work ${index}`, dueDate: index < 2 ? new Date("2026-10-23T00:00:00Z") : null } });
    const counted = await desk.list(managerId);
    expect(counted.people[0].tasks).toHaveLength(10);
    expect(counted.summary).toMatchObject({ openTasks: 13, overdueTasks: 2, openBlockers: null });
    await db.executionBlocker.create({ data: { organizationId: labsId, taskId: counted.people[0].tasks[0].id, description: "Synthetic open blocker" } });
    expect(JSON.stringify((await desk.list(managerId)).people)).not.toContain("Synthetic open blocker");
    const blockerPermission = await db.permission.upsert({ where: { key: "blocker.read" }, create: { key: "blocker.read", name: "blocker read", scope: "GROUP" }, update: {} });
    await db.rolePermission.create({ data: { roleId: managerRoleId, permissionId: blockerPermission.id } });
    const blockerReadable = await desk.list(managerId);
    expect(blockerReadable.summary.openBlockers).toBe(1);
    expect(JSON.stringify(blockerReadable.people)).toContain("Synthetic open blocker");
    for (const key of ["approval.read", "approval.decide"]) {
      const permission = await db.permission.upsert({ where: { key }, create: { key, name: key, scope: "GROUP" }, update: {} });
      await db.rolePermission.create({ data: { roleId: managerRoleId, permissionId: permission.id } });
    }
    expect((await desk.list(managerId)).summary.pendingDecisions).toBe(0);
    const input = { organizationId: labsId, personId: staffId, title: "BGOS delivery", startsOn: "2026-10-24", endsOn: "2026-11-14", decisionReference: "director-approval-001", reference: randomUUID() };
    await expect(desk.setFocus(managerId, input)).rejects.toThrow();
    expect(await db.responsibility.count()).toBe(0);
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "responsibility.manage" } });
    await db.rolePermission.create({ data: { roleId: managerRoleId, permissionId: permission.id } });
    const first = await desk.setFocus(managerId, input);
    expect(first.replay).toBe(false);
    expect(await db.auditEvent.count({ where: { action: "staff.focus_approved", entityId: first.id } })).toBe(1);
    expect(await db.membershipRole.count({ where: { roleId: managerRoleId } })).toBe(1);
    expect((await desk.setFocus(managerId, input)).replay).toBe(true);
    await expect(desk.setFocus(managerId, { ...input, title: "Changed on replay" })).rejects.toThrow();
    expect((await desk.list(managerId)).people.find(person => person.personId === staffId)?.currentFocus?.title).toBe("BGOS delivery");
    const second = await desk.setFocus(managerId, { ...input, title: "Startup follow-ups", reference: randomUUID() });
    expect(second.replay).toBe(false);
    const focus = (await desk.list(managerId)).people.find(person => person.personId === staffId);
    expect(focus?.currentFocus?.title).toBe("Startup follow-ups");
    expect(focus?.focusHistory.map(item => item.status)).toEqual(["ACTIVE", "ARCHIVED"]);
    await expect(desk.setFocus(managerId, { ...input, organizationId: foreignId, reference: randomUUID() })).rejects.toThrow();
    expect(await db.responsibility.count({ where: { organizationId: foreignId } })).toBe(0);
    await db.$executeRawUnsafe("CREATE TRIGGER fail_focus_audit BEFORE INSERT ON AuditEvent WHEN NEW.action = 'staff.focus_approved' BEGIN SELECT RAISE(ABORT, 'isolated audit failure'); END");
    try {
      await expect(desk.setFocus(managerId, { ...input, title: "Should roll back", reference: randomUUID() })).rejects.toThrow();
      expect((await desk.list(managerId)).people.find(person => person.personId === staffId)?.currentFocus?.title).toBe("Startup follow-ups");
      expect(await db.responsibility.count({ where: { personId: staffId } })).toBe(2);
    } finally { await db.$executeRawUnsafe("DROP TRIGGER fail_focus_audit"); }
    const task = await db.task.findFirstOrThrow({ where: { organizationId: labsId, assigneePersonId: staffId } });
    const change = { taskId: task.id, revision: task.revision, status: "BLOCKED", deadlineMode: "SET", dueDate: "2026-11-02T10:00:00.000Z", reason: "Delivery needs a revised deadline", reference: randomUUID() };
    expect((await desk.changeTask(managerId, change)).replay).toBe(false);
    expect((await desk.changeTask(managerId, change)).replay).toBe(true);
    await expect(desk.changeTask(managerId, { ...change, reason: "Changed replay" })).rejects.toThrow();
    await expect(desk.changeTask(managerId, { ...change, reference: randomUUID() })).rejects.toThrow();
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).dueDate?.toISOString()).toBe(change.dueDate);
    const open = { taskId: task.id, description: "Waiting for the specification", expectedResolution: "2026-10-29", reason: "Delivery cannot proceed until confirmed", reference: randomUUID() };
    const blocker = await desk.setBlocker(managerId, open);
    expect((await desk.setBlocker(managerId, open)).replay).toBe(true);
    await expect(desk.changeTask(managerId, { taskId: task.id, revision: task.revision + 1, status: "TODO", deadlineMode: "KEEP", dueDate: null, reason: "Cannot ignore an open blocker", reference: randomUUID() })).rejects.toThrow();
    const resolved = await desk.setBlocker(managerId, { taskId: task.id, blockerId: blocker.id, reason: "Specification received and checked", reference: randomUUID() });
    expect((await db.executionBlocker.findUniqueOrThrow({ where: { id: resolved.id } })).status).toBe("RESOLVED");
    const activeFocus = (await desk.list(managerId)).people.find(person => person.personId === staffId)?.currentFocus;
    expect(activeFocus).toBeTruthy();
    const end = { focusId: activeFocus!.id, reason: "Work priority changed by manager", reference: randomUUID() };
    expect((await desk.endFocus(managerId, end)).replay).toBe(false);
    expect((await desk.endFocus(managerId, end)).replay).toBe(true);
    expect((await desk.list(managerId)).people.find(person => person.personId === staffId)?.currentFocus).toBeNull();
    await db.$executeRawUnsafe("CREATE TRIGGER fail_task_control_audit BEFORE INSERT ON AuditEvent WHEN NEW.action = 'staff.task_controlled' BEGIN SELECT RAISE(ABORT, 'isolated audit failure'); END");
    try {
      const current = await db.task.findUniqueOrThrow({ where: { id: task.id } });
      await expect(desk.changeTask(managerId, { taskId: task.id, revision: current.revision, status: "TODO", deadlineMode: "CLEAR", dueDate: null, reason: "Should roll back with audit", reference: randomUUID() })).rejects.toThrow();
      expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("BLOCKED");
    } finally { await db.$executeRawUnsafe("DROP TRIGGER fail_task_control_audit"); }
    await db.reportingRelationship.updateMany({ where: { organizationId: labsId, personId: staffId }, data: { status: "INACTIVE" } });
    expect((await desk.list(managerId)).people).toEqual([]);
    await expect(desk.setFocus(managerId, { ...input, reference: randomUUID() })).rejects.toThrow();
    await db.reportingRelationship.updateMany({ where: { organizationId: labsId, personId: staffId }, data: { status: "ACTIVE", endDate: new Date("2026-10-23T18:30:00Z") } });
    expect((await desk.list(managerId)).people).toEqual([]);
    await expect(desk.setFocus(managerId, { ...input, reference: randomUUID() })).rejects.toThrow();
  });
});
