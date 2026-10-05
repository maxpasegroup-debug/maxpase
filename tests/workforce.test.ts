import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { createWorkforceService } from "@/server/domain/workforce-service";
import { createBusinessService } from "@/server/domain/business-service";
import { createAccessContext } from "@/server/authorization/engine";
import { getPermissionGrantsForUser } from "@/server/authorization/service";
import { inspectSiaToolAccess } from "@/server/sia/access";
import { verifyPassword } from "@/server/auth/password";
import { airaRoleNames } from "@/server/domain/aira-roles";

const directory = mkdtempSync(join(tmpdir(), "maxpase-phase03-"));
const path = join(directory, "test.db");
const url = "file:" + path.replaceAll("\\", "/");
const db = new PrismaClient({ datasourceUrl: url });
const workforce = createWorkforceService(db);
const business = createBusinessService(db);
let adminId: string, groupId: string, aId: string, bId: string, d1: string, d2: string;
let projectA: string, projectB: string;
let manager: { userId: string; personId: string; membershipId: string; roleId: string };
let departmentUser: typeof manager, projectUser: typeof manager;
let sequence = 0;
const seed = () => execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], { env: { ...process.env, DATABASE_URL: url, NODE_ENV: "test" }, stdio: "pipe" });
async function account(organizationId: string, permissions: string[], descendants = false, projectId?: string) {
  const key = "test-" + ++sequence;
  const person = await db.person.create({ data: { displayName: key } });
  const user = await db.user.create({ data: { email: key + "@test.invalid", personId: person.id } });
  const role = await db.role.create({ data: { organizationId, key, name: "Test designation", permissions: { create: permissions.map(key => ({ permission: { connect: { key } } })) } } });
  const membership = await db.membership.create({ data: { organizationId, personId: person.id, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", projectId, scopeKey: projectId ? "project:" + projectId : "organization", roles: { create: { roleId: role.id } } } });
  return { userId: user.id, personId: person.id, membershipId: membership.id, roleId: role.id };
}
beforeAll(async () => {
  const sql = new DatabaseSync(path);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  expect(sql.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]); sql.close();
  seed();
  expect(await db.user.count()).toBe(1); expect(await db.person.count()).toBe(1);
  adminId = (await db.user.findUniqueOrThrow({ where: { email: "admin@maxpase.local" } })).id;
  groupId = (await db.organization.findUniqueOrThrow({ where: { slug: "maxpase-group" } })).id;
  aId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  bId = (await db.organization.create({ data: { type: "COMPANY", name: "Test Company B", slug: "test-company-b", parentId: groupId, company: { create: { displayName: "Test Company B", groupId: (await db.groupProfile.findUniqueOrThrow({ where: { organizationId: groupId } })).id } } } })).id;
  d1 = (await db.organization.create({ data: { type: "DEPARTMENT", name: "Test department one", slug: "test-dept-one", parentId: aId } })).id;
  d2 = (await db.organization.create({ data: { type: "DEPARTMENT", name: "Test department two", slug: "test-dept-two", parentId: aId } })).id;
  projectA = (await db.project.create({ data: { organizationId: aId, name: "Test project A", slug: "test-project-a" } })).id;
  projectB = (await db.project.create({ data: { organizationId: aId, name: "Test project B", slug: "test-project-b" } })).id;
  manager = await account(aId, ["organization.read", "person.read", "person.update", "user.read", "user.create", "user.update", "membership.read", "membership.manage", "membership.assign_role", "role.read", "role.create", "permission.read", "permission.assign", "project.read", "project.manage", "reporting.read", "reporting.manage", "responsibility.read", "responsibility.manage"], true);
  departmentUser = await account(d1, ["organization.read", "person.read", "membership.read", "role.read", "project.read"]);
  projectUser = await account(aId, ["project.read", "project.manage", "membership.read", "membership.manage", "membership.assign_role", "person.read", "responsibility.read", "responsibility.manage"], false, projectA);
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("canonical designations and identities", () => {
  it("seeds all 60 locked AIRA roles without employees, role assignments or SIA human identities", async () => {
    const roles = await db.role.findMany({ where: { organizationId: aId, canonical: true }, orderBy: { key: "asc" } });
    expect(roles.map(r => r.name)).toEqual([...airaRoleNames]);
    expect(roles.length).toBe(60);
    expect(roles[0].name).toBe("Founder");
    expect(roles[59]).toMatchObject({ name: "SIA — Virtual CEO", principalType: "AGENT" });
    expect(roles.slice(0,59).every(r => r.principalType === "HUMAN")).toBe(true);
    expect(await db.membershipRole.count({ where: { role: { canonical: true } } })).toBe(0);
    expect(await db.siaRoleAssignment.count()).toBe(0);
    expect(await db.person.count({ where: { displayName: { contains: "SIA" } } })).toBe(0);
    expect(await db.rolePermission.count({ where: { role: { canonical: true } } })).toBe(0);
  });
  it("preserves seed identities and unassigned canonical roles on repeated development seeding", async () => {
    seed();
    expect(await db.role.count({ where: { canonical: true, organizationId: aId } })).toBe(60);
    expect(await db.user.count({ where: { email: "admin@maxpase.local" } })).toBe(1);
    expect(await db.membershipRole.count({ where: { role: { canonical: true } } })).toBe(0);
  });
  it("locks canonical names, identity types and archival, while supporting reusable role copies", async () => {
    const founder = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: aId, key: "aira-01" } } });
    for (const patch of [{ name: "Owner" }, { principalType: "AGENT" }, { status: "ARCHIVED" }]) await expect(workforce.save(adminId, "roles", { organizationId: aId, key: founder.key, name: founder.name, ...patch }, founder.id)).rejects.toThrow("locked");
    const copied = await workforce.save(adminId, "roles", { organizationId: d1, key: "founder-copy", name: "Founder", copyRoleId: founder.id });
    expect(await db.role.findUnique({ where: { id: copied.id } })).toMatchObject({ canonical: true, name: "Founder", organizationId: d1 });
  });
  it("creates a person without a login and preserves separate contact and sign-in identities", async () => {
    const p = await workforce.save(adminId, "people", { organizationId: aId, displayName: "Test contact", email: "contact@test.invalid", profile: "Test profile" });
    expect(await db.user.count({ where: { personId: p.id } })).toBe(0);
    const user = await workforce.save(adminId, "users", { organizationId: aId, personId: p.id, email: "login@test.invalid", password: "Test-Password-123!" });
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("Test-Password-123!", stored.passwordHash!)).toBe(true);
    expect((await db.person.findUniqueOrThrow({ where: { id: p.id } })).email).toBe("contact@test.invalid");
    expect(await getPermissionGrantsForUser(user.id, db)).toEqual([]);
    const visible = await workforce.list(adminId, "users");
    expect(visible.some(u => "passwordHash" in u)).toBe(false);
    const audits = await db.auditEvent.findMany({ where: { entityId: user.id } });
    expect(JSON.stringify(audits)).not.toContain("Test-Password-123!");
    expect(JSON.stringify(audits)).not.toContain(stored.passwordHash);
  });
  it("suspends and reactivates accounts, revokes sessions, and suspending the person removes grants", async () => {
    const p = await workforce.save(adminId, "people", { organizationId: aId, displayName: "Test lifecycle" });
    const u = await workforce.save(adminId, "users", { organizationId: aId, personId: p.id, email: "lifecycle@test.invalid", password: "Test-Password-456!" });
    await db.session.create({ data: { userId: u.id, expiresAt: new Date("2099-01-01") } });
    await workforce.save(adminId, "users", { organizationId: aId, personId: p.id, email: "lifecycle@test.invalid", status: "SUSPENDED" }, u.id);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect((await createAccessContext(u.id, db)).active).toBe(false);
    await workforce.save(adminId, "users", { organizationId: aId, personId: p.id, email: "lifecycle@test.invalid", status: "ACTIVE" }, u.id);
    expect((await createAccessContext(u.id, db)).active).toBe(true);
    await workforce.save(adminId, "people", { organizationId: aId, displayName: "Test lifecycle", status: "SUSPENDED" }, p.id);
    expect((await createAccessContext(u.id, db)).active).toBe(false);
    expect(await getPermissionGrantsForUser(u.id, db)).toEqual([]);
  });
});

describe("scoped authorization and privilege escalation", () => {
  it("denies company, department and project ID switching outside the grant", async () => {
    const company = await createAccessContext(manager.userId, db);
    expect((await company.decide("person.read", { organizationId: aId })).allowed).toBe(true);
    expect((await company.decide("person.read", { organizationId: bId })).allowed).toBe(false);
    await expect(workforce.switchOrganization(manager.userId, bId)).rejects.toThrow("Access denied");
    await expect(workforce.list(manager.userId, "users", { organizationId: bId })).rejects.toThrow("Access denied");
    const department = await createAccessContext(departmentUser.userId, db);
    expect((await department.decide("person.read", { organizationId: d1 })).allowed).toBe(true);
    expect((await department.decide("person.read", { organizationId: d2 })).allowed).toBe(false);
    expect((await department.decide("person.read", { organizationId: aId })).allowed).toBe(false);
    const project = await createAccessContext(projectUser.userId, db);
    expect((await project.decide("project.read", { organizationId: aId, projectId: projectA })).allowed).toBe(true);
    expect((await project.decide("project.read", { organizationId: aId, projectId: projectB })).allowed).toBe(false);
    expect((await project.decide("project.read", { organizationId: bId, projectId: projectA })).allowed).toBe(false);
    expect((await project.decide("project.read", { organizationId: aId })).allowed).toBe(false);
    expect((await project.decide("membership.manage", { organizationId: aId })).allowed).toBe(false);
  });
  it("binds project membership IDs explicitly and allows multiple projects alongside company membership", async () => {
    const p = await workforce.save(adminId, "people", { organizationId: aId, displayName: "Test project member" });
    await workforce.save(adminId, "memberships", { organizationId: aId, projectId: projectA, personId: p.id });
    await workforce.save(adminId, "memberships", { organizationId: aId, projectId: projectB, personId: p.id });
    expect(await db.membership.count({ where: { personId: p.id } })).toBe(3);
    await expect(workforce.save(adminId, "memberships", { organizationId: bId, projectId: projectA, personId: p.id })).rejects.toThrow("Access denied");
    await expect(workforce.save(adminId, "memberships", { organizationId: aId, projectId: projectA, personId: p.id, scope: "DESCENDANTS" })).rejects.toThrow();
    const visible = await workforce.list(projectUser.userId, "memberships");
    expect(visible.every(m => "projectId" in m && m.projectId === projectA)).toBe(true);
    expect((await workforce.list(projectUser.userId, "people")).some(p => p.id === projectUser.personId)).toBe(true);
  });
  it("enforces project-scoped reads and updates in the existing business service", async () => {
    expect(await business.list(projectUser.userId, "projects")).toEqual([expect.objectContaining({ id: projectA })]);
    await business.save(projectUser.userId, "projects", { organizationId: aId, name: "Test project A updated", slug: "test-project-a" }, projectA);
    await expect(business.save(projectUser.userId, "projects", { organizationId: aId, name: "Cross project change", slug: "test-project-b" }, projectB)).rejects.toThrow("Access denied");
    await expect(business.save(projectUser.userId, "projects", { organizationId: bId, name: "Cross company change", slug: "test-project-a" }, projectA)).rejects.toThrow("Access denied");
    expect((await db.project.findUniqueOrThrow({ where: { id: projectB } })).name).toBe("Test project B");
  });
  it("denies role assignments by unauthorized actors, across companies, and to unrelated projects", async () => {
    const role = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: aId, key: "aira-01" } } });
    await expect(workforce.setRole(departmentUser.userId, manager.membershipId, role.id, true)).rejects.toThrow("Access denied");
    const other = await account(bId, []);
    await expect(workforce.setRole(manager.userId, other.membershipId, role.id, true)).rejects.toThrow("Access denied");
    const pOther = await account(aId, [], false, projectB);
    await expect(workforce.setRole(projectUser.userId, pOther.membershipId, role.id, true)).rejects.toThrow("Access denied");
    await expect(workforce.setRole(manager.userId, manager.membershipId, (await db.role.create({ data: { organizationId: bId, key: "foreign-role", name: "Test foreign role" } })).id, true)).rejects.toThrow("membership organization");
  });
  it("prevents permission assignment, global escalation and unsupported registry changes", async () => {
    const role = await db.role.create({ data: { organizationId: aId, key: "test-restricted", name: "Test restricted" } });
    const system = await db.permission.findUniqueOrThrow({ where: { key: "system.admin" } });
    await expect(workforce.setPermission(manager.userId, role.id, system.id, true)).rejects.toThrow("Access denied");
    const read = await db.permission.findUniqueOrThrow({ where: { key: "person.read" } });
    await expect(workforce.setPermission(departmentUser.userId, role.id, read.id, true)).rejects.toThrow("Access denied");
    await expect(workforce.save(manager.userId, "permissions", { organizationId: aId, key: "custom.denied", name: "Test", scope: "COMPANY" })).rejects.toThrow("Global capability");
    const cap = await workforce.save(adminId, "permissions", { organizationId: aId, key: "custom.registered", name: "Test capability", scope: "COMPANY" });
    expect(await db.rolePermission.count({ where: { permissionId: cap.id } })).toBe(0);
    await expect(workforce.save(adminId, "permissions", { organizationId: aId, key: "custom.renamed", name: "Test", scope: "GLOBAL" }, cap.id)).rejects.toThrow("immutable");
  });
  it("audits explicit permission assignment and revocation and immediately changes resolved access", async () => {
    const recipient = await account(aId, []);
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "person.read" } });
    await workforce.setPermission(adminId, recipient.roleId, permission.id, true);
    expect((await (await createAccessContext(recipient.userId, db)).decide("person.read", { organizationId: aId })).allowed).toBe(true);
    await workforce.setPermission(adminId, recipient.roleId, permission.id, false);
    expect((await (await createAccessContext(recipient.userId, db)).decide("person.read", { organizationId: aId })).allowed).toBe(false);
    expect((await db.auditEvent.findMany({ where: { entityId: recipient.roleId } })).map(a => a.action)).toEqual(["permission.assigned", "permission.revoked"]);
  });
  it("does not turn designation, responsibility or reporting into access", async () => {
    const recipient = await account(aId, []);
    const founder = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: aId, key: "aira-01" } } });
    await workforce.setRole(adminId, recipient.membershipId, founder.id, true);
    await workforce.save(adminId, "responsibilities", { organizationId: aId, personId: recipient.personId, title: "Test accountable person" });
    await workforce.save(adminId, "reporting", { organizationId: aId, personId: recipient.personId, managerPersonId: manager.personId });
    expect(await getPermissionGrantsForUser(recipient.userId, db)).toEqual([]);
  });
  it("blocks expansion of an exact-only grant through role and capability delegation", async () => {
    const narrow = await account(aId, ["membership.assign_role", "permission.assign", "person.read"]);
    const recipient = await account(aId, [], true);
    const role = await db.role.create({ data: { organizationId: aId, key: "test-reader-wide", name: "Test reader", permissions: { create: { permission: { connect: { key: "person.read" } } } } } });
    await expect(workforce.setRole(narrow.userId, recipient.membershipId, role.id, true)).rejects.toThrow("Cannot delegate");
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "person.read" } });
    await expect(workforce.setPermission(narrow.userId, recipient.roleId, permission.id, true)).rejects.toThrow("descendant");
    await expect(business.setMembershipRole(narrow.userId, recipient.membershipId, role.id, true)).rejects.toThrow("Cannot delegate");
  });
  it("protects shared human identity and account credentials across all memberships", async () => {
    const shared = await account(aId, []);
    await db.membership.create({ data: { personId: shared.personId, organizationId: bId } });
    await expect(workforce.save(manager.userId, "people", { organizationId: aId, displayName: "Unauthorized change" }, shared.personId)).rejects.toThrow("Access denied");
    await expect(workforce.save(manager.userId, "users", { organizationId: aId, personId: shared.personId, email: "replacement@test.invalid", password: "Test-Password-789!" }, shared.userId)).rejects.toThrow("Access denied");
    await expect(workforce.save(manager.userId, "users", { organizationId: aId, personId: shared.personId, email: "extra@test.invalid", password: "Test-Password-789!" })).rejects.toThrow("Access denied");
    expect((await db.person.findUniqueOrThrow({ where: { id: shared.personId } })).displayName).not.toBe("Unauthorized change");
  });
  it("cannot reactivate a role-bearing membership without controlling its capabilities", async () => {
    const powerful = await account(aId, ["system.admin"]);
    await db.membership.update({ where: { id: powerful.membershipId }, data: { status: "ENDED" } });
    await expect(workforce.save(manager.userId, "memberships", { organizationId: aId, personId: powerful.personId, status: "ACTIVE" }, powerful.membershipId)).rejects.toThrow("Access denied");
    expect((await db.membership.findUniqueOrThrow({ where: { id: powerful.membershipId } })).status).toBe("ENDED");
  });
  it("removes access for inactive people, expired memberships and archived parent scopes", async () => {
    const temp = await account(d2, ["person.read"]);
    await db.person.update({ where: { id: temp.personId }, data: { status: "INACTIVE" } });
    expect(await getPermissionGrantsForUser(temp.userId, db)).toEqual([]);
    await db.person.update({ where: { id: temp.personId }, data: { status: "ACTIVE" } });
    await db.membership.update({ where: { id: temp.membershipId }, data: { endDate: new Date("2000-01-01") } });
    expect(await getPermissionGrantsForUser(temp.userId, db)).toEqual([]);
    await db.membership.update({ where: { id: temp.membershipId }, data: { endDate: null } });
    await db.organization.update({ where: { id: d2 }, data: { status: "ARCHIVED" } });
    expect((await (await createAccessContext(temp.userId, db)).decide("person.read", { organizationId: d2 })).allowed).toBe(false);
    await db.organization.update({ where: { id: d2 }, data: { status: "ACTIVE" } });
  });
  it("explains permitted decisions internally and denies unprivileged inspection", async () => {
    const result = await workforce.explain(adminId, manager.userId, "person.read", { organizationId: aId });
    expect(result).toMatchObject({ allowed: true, via: { membershipId: manager.membershipId, roleId: manager.roleId } });
    await expect(workforce.explain(manager.userId, adminId, "system.admin", { organizationId: groupId })).rejects.toThrow("Access denied");
  });
  it("revokes global grants when their membership's ancestor organization is archived", async () => {
    const global = await account(d2, ["system.admin"]);
    await db.organization.update({ where: { id: aId }, data: { status: "ARCHIVED" } });
    expect(await getPermissionGrantsForUser(global.userId, db)).toEqual([]);
    expect((await (await createAccessContext(global.userId, db)).decide("system.admin", { organizationId: bId })).allowed).toBe(false);
    await db.organization.update({ where: { id: aId }, data: { status: "ACTIVE" } });
  });
  it("allows removal of an archived human role without restoring its capabilities", async () => {
    const person = await account(aId, ["person.read"]);
    await workforce.save(adminId, "roles", { organizationId: aId, key: (await db.role.findUniqueOrThrow({ where: { id: person.roleId } })).key, name: "Test designation", status: "ARCHIVED" }, person.roleId);
    expect(await getPermissionGrantsForUser(person.userId, db)).toEqual([]);
    await workforce.setRole(adminId, person.membershipId, person.roleId, false);
    expect(await db.membershipRole.count({ where: { membershipId: person.membershipId } })).toBe(0);
  });
  it("applies basic database search and organization filters without bypassing isolation", async () => {
    expect((await workforce.list(adminId, "roles", { organizationId: aId, search: "Counsellor" })).length).toBe(2);
    expect((await workforce.list(manager.userId, "departments")).every(o => "parentId" in o && o.parentId === aId)).toBe(true);
    expect((await workforce.list(manager.userId, "departments", { organizationId: aId })).some(o => o.id === d1)).toBe(true);
    expect(await workforce.list(departmentUser.userId, "people", { organizationId: d1, search: "does-not-exist" })).toEqual([]);
    await expect(workforce.list(departmentUser.userId, "people", { organizationId: d2, search: "" })).rejects.toThrow("Access denied");
  });
});

describe("reporting, responsibility, SIA and audit", () => {
  it("validates reporting membership, self-reporting and cycles with scoped audit events", async () => {
    const first = await account(aId, []); const second = await account(aId, []);
    const reporting = await workforce.save(adminId, "reporting", { organizationId: aId, personId: first.personId, managerPersonId: second.personId });
    await expect(workforce.save(adminId, "reporting", { organizationId: aId, personId: second.personId, managerPersonId: first.personId })).rejects.toThrow("cycle");
    await expect(workforce.save(adminId, "reporting", { organizationId: aId, personId: first.personId, managerPersonId: first.personId })).rejects.toThrow();
    await expect(workforce.save(adminId, "reporting", { organizationId: bId, personId: first.personId, managerPersonId: second.personId })).rejects.toThrow("active membership");
    expect(await db.auditEvent.findFirst({ where: { entityId: reporting.id } })).toMatchObject({ actorUserId: adminId, organizationId: aId });
    await workforce.save(adminId, "reporting", { organizationId: aId, personId: first.personId, managerPersonId: second.personId, status: "INACTIVE" }, reporting.id);
    expect((await db.reportingRelationship.findUniqueOrThrow({ where: { id: reporting.id } })).status).toBe("INACTIVE");
  });
  it("assigns typed responsibility without changing ownership or permissions and rejects cross-company targets", async () => {
    const person = await account(aId, []);
    const product = await db.product.create({ data: { organizationId: aId, name: "Test responsibility product", slug: "test-responsibility-product" } });
    const goal = await db.goal.create({ data: { organizationId: aId, title: "Test responsibility goal" } });
    for (const target of [{}, { projectId: projectA }, { productId: product.id }, { goalId: goal.id }]) await workforce.save(adminId, "responsibilities", { organizationId: aId, personId: person.personId, title: "Test responsibility", ...target });
    expect(await db.ownershipRelationship.count()).toBe(0);
    expect(await getPermissionGrantsForUser(person.userId, db)).toEqual([]);
    await expect(workforce.save(adminId, "responsibilities", { organizationId: bId, personId: person.personId, title: "Cross target", productId: product.id })).rejects.toThrow();
    await expect(workforce.save(adminId, "responsibilities", { organizationId: aId, personId: person.personId, title: "Ambiguous target", productId: product.id, projectId: projectA })).rejects.toThrow();
  });
  it("keeps SIA roles out of human memberships and requires scoped agent grants and enabled tools", async () => {
    const agent = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: aId, key: "aira-60" } } });
    await expect(workforce.setRole(adminId, manager.membershipId, agent.id, true)).rejects.toThrow("human");
    await expect(business.setMembershipRole(adminId, manager.membershipId, agent.id, true)).rejects.toThrow("human");
    await db.membershipRole.create({ data: { membershipId: manager.membershipId, roleId: agent.id } });
    expect((await getPermissionGrantsForUser(manager.userId, db)).every(g => g.roleId !== agent.id)).toBe(true);
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "organization.read" } });
    await workforce.setPermission(adminId, agent.id, permission.id, true);
    const initial = await inspectSiaToolAccess("sia-default", "organization.read", aId, db);
    expect(initial).toMatchObject({ permissionAllowed: false, executionEnabled: false });
    await expect(workforce.setSiaRole(manager.userId, "sia-default", aId, agent.id, true)).rejects.toThrow("Access denied");
    await workforce.setSiaRole(adminId, "sia-default", aId, agent.id, true);
    await db.siaTool.create({ data: { siaId: "sia-default", key: "organization.read", name: "Test read tool", permissionKey: "organization.read", enabled: true } });
    expect(await inspectSiaToolAccess("sia-default", "organization.read", aId, db)).toMatchObject({ permissionAllowed: true, toolAllowed: true, executionEnabled: false });
    expect(await inspectSiaToolAccess("sia-default", "organization.read", bId, db)).toMatchObject({ permissionAllowed: false, executionEnabled: false });
    const global = await db.permission.findUniqueOrThrow({ where: { key: "system.admin" } });
    await expect(workforce.setPermission(adminId, agent.id, global.id, true)).rejects.toThrow("global");
  });
  it("rolls back access-control writes when audit persistence fails", async () => {
    const role = await db.role.create({ data: { organizationId: aId, key: "test-rollback-role", name: "Test rollback role" } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "person.read" } });
    await db.$executeRawUnsafe("CREATE TRIGGER test_access_audit_failure BEFORE INSERT ON AuditEvent BEGIN SELECT RAISE(ABORT, 'test audit unavailable'); END");
    await expect(workforce.setPermission(adminId, role.id, permission.id, true)).rejects.toThrow();
    expect(await db.rolePermission.count({ where: { roleId: role.id } })).toBe(0);
    const before = await db.person.count();
    await expect(workforce.save(adminId, "people", { organizationId: aId, displayName: "Test rollback person" })).rejects.toThrow();
    expect(await db.person.count()).toBe(before);
    await db.$executeRawUnsafe("DROP TRIGGER test_access_audit_failure");
  });
});
