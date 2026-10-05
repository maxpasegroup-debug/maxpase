import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { createBusinessService } from "@/server/domain/business-service";
import { getPermissionGrantsForUser } from "@/server/authorization/service";

const directory = mkdtempSync(join(tmpdir(), "maxpase-phase02-"));
const databasePath = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + databasePath.replaceAll("\\", "/") });
const service = createBusinessService(db);
let group: { id: string; group: { id: string } | null };
let admin: { id: string; personId: string | null };
let restricted: { id: string; personId: string | null };
let a: { id: string; organizationId: string };
let b: { id: string; organizationId: string };
let personId: string;
let memberId: string;
let count = 0;
const identity = (prefix: string) => ({ name: prefix, slug: prefix.toLowerCase().replaceAll(" ", "-") + "-" + ++count });
const keys = [...["organization", "company", "membership", "ownership", "brand", "product", "project", "goal"].flatMap(k => [k + ".read", k + ".manage"]), "membership.scope.manage", "membership.assign_role", "goal.progress"];

beforeAll(async () => {
  const sql = new DatabaseSync(databasePath);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(`prisma/migrations/${folder}/migration.sql`, "utf8"));
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(sql.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
  sql.close();
  group = await db.organization.create({ data: { ...identity("Test group"), type: "GROUP", group: { create: { name: "Test group" } } }, include: { group: true } });
  for (const key of keys) await db.permission.create({ data: { key, name: key, scope: key === "organization.manage" ? "GLOBAL" : "GROUP" } });
  const role = await db.role.create({ data: { organizationId: group.id, key: "test-admin", name: "Test admin", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  const person = await db.person.create({ data: { displayName: "Test administrator" } });
  admin = await db.user.create({ data: { email: "admin@test.invalid", personId: person.id } });
  await db.membership.create({ data: { personId: person.id, organizationId: group.id, scope: "DESCENDANTS", roles: { create: { roleId: role.id } } } });
  const ca = await service.save(admin.id, "companies", { ...identity("Company A"), legalName: "Test Company A", groupOrganizationId: group.id });
  const cb = await service.save(admin.id, "companies", { ...identity("Company B"), legalName: "Test Company B", groupOrganizationId: group.id });
  a = await db.companyProfile.findUniqueOrThrow({ where: { id: ca.id } });
  b = await db.companyProfile.findUniqueOrThrow({ where: { id: cb.id } });
  const restrictedRole = await db.role.create({ data: { organizationId: a.organizationId, key: "test-manager", name: "CEO", permissions: { create: keys.filter(k => !["organization.manage", "membership.scope.manage"].includes(k)).map(key => ({ permission: { connect: { key } } })) } } });
  const p = await db.person.create({ data: { displayName: "Test Company A manager" } });
  restricted = await db.user.create({ data: { email: "a@test.invalid", personId: p.id } });
  const member = await db.membership.create({ data: { personId: p.id, organizationId: a.organizationId, scope: "DESCENDANTS", roles: { create: { roleId: restrictedRole.id } } } });
  memberId = member.id;
  const human = await db.person.create({ data: { displayName: "Human without login", memberships: { create: { organizationId: a.organizationId } } } });
  personId = human.id;
}, 30000);

afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Phase 02 relational business graph", () => {
  it("preserves the Phase 01 group and makes the company affiliation explicit", async () => {
    const row = await db.companyProfile.findUniqueOrThrow({ where: { id: a.id }, include: { organization: true } });
    expect(row.groupId).toBe(group.group!.id);
    expect(row.organization.parentId).toBe(group.id);
    expect(await db.companyProfile.findUnique({ where: { organizationId: group.id } })).toBeNull();
    expect(row.identifiers).toBeNull();
    expect(await db.ownershipRelationship.count()).toBe(0);
  });
  it("rejects a company using another company as its group", async () => {
    await expect(service.save(admin.id, "companies", { ...identity("Invalid group"), legalName: "Test", groupOrganizationId: a.organizationId })).rejects.toThrow("parent must be a group");
  });
  it("allows unknown legal details while synchronizing company and organization identity", async () => {
    const updated = await service.save(admin.id, "companies", { name: "Company A updated", slug: "company-a-updated", groupOrganizationId: group.id, legalName: null, shortName: "A" }, a.id);
    const company = await db.companyProfile.findUniqueOrThrow({ where: { id: updated.id }, include: { organization: true } });
    expect(company.legalName).toBeNull();
    expect(company.displayName).toBe(company.organization.name);
    expect(company.organization.slug).toBe("company-a-updated");
    expect(await db.auditEvent.findFirst({ where: { entityId: a.id, action: "companies.updated" } })).toMatchObject({ organizationId: a.organizationId, actorUserId: admin.id });
  });
  it("supports direct departments and typed divisions without requiring every layer", async () => {
    const division = await service.save(admin.id, "organizations", { ...identity("Division"), type: "DIVISION", parentId: a.organizationId });
    const department = await service.save(admin.id, "organizations", { ...identity("Department"), type: "DEPARTMENT", parentId: a.organizationId });
    const team = await service.save(admin.id, "organizations", { ...identity("Team"), type: "TEAM", parentId: department.id });
    expect(await db.organization.findUnique({ where: { id: division.id } })).toMatchObject({ parentId: a.organizationId });
    expect(await db.teamProfile.findUnique({ where: { organizationId: team.id } })).not.toBeNull();
    await expect(service.save(admin.id, "organizations", { ...identity("Bad division"), type: "DIVISION", parentId: team.id })).rejects.toThrow("hierarchy");
  });
  it("prevents organization cycles and cross-company reparenting", async () => {
    const team = await service.save(admin.id, "organizations", { ...identity("Fixed team"), type: "TEAM", parentId: a.organizationId });
    await expect(service.save(admin.id, "organizations", { ...identity("Fixed team edit"), type: "TEAM", parentId: team.id }, team.id)).rejects.toThrow("hierarchy");
    await expect(service.save(admin.id, "organizations", { ...identity("Moved team"), type: "TEAM", parentId: b.organizationId }, team.id)).rejects.toThrow("controlled migration");
  });
  it("records directional company relationship types without inferring subsidiaries", async () => {
    const r = await service.save(admin.id, "relationships", { fromCompanyId: a.id, toCompanyId: b.id, relationship: "AFFILIATE" });
    expect(await db.companyRelationship.findUnique({ where: { id: r.id } })).toMatchObject({ relationship: "AFFILIATE" });
    await expect(service.save(admin.id, "relationships", { fromCompanyId: a.id, toCompanyId: a.id, relationship: "PARENT" })).rejects.toThrow();
    await expect(service.save(admin.id, "relationships", { fromCompanyId: a.id, toCompanyId: b.id, relationship: "OTHER" })).rejects.toThrow();
  });
  it("requires exactly one eligible owner and validates percentages and dates", async () => {
    for (const patch of [{}, { ownerPersonId: personId, ownerOrgId: group.id }, { ownerPersonId: personId, percentage: 101 }, { ownerPersonId: personId, percentage: -1 }, { ownerPersonId: personId, effectiveFrom: "2026-12-01", effectiveTo: "2026-01-01" }]) {
      await expect(service.save(admin.id, "ownership", { companyId: a.id, ...patch })).rejects.toThrow();
    }
    await expect(service.save(admin.id, "ownership", { companyId: a.id, ownerOrgId: a.organizationId })).rejects.toThrow("Ineligible");
    const r = await service.save(admin.id, "ownership", { companyId: a.id, ownerPersonId: personId });
    expect(await db.ownershipRelationship.findUnique({ where: { id: r.id } })).toMatchObject({ percentage: null, ownershipType: "UNSPECIFIED" });
  });
  it("allows documented company and group owners independently from membership", async () => {
    const r = await service.save(admin.id, "ownership", { companyId: b.id, ownerOrgId: a.organizationId, ownershipType: "EQUITY", notes: "Test fixture only" });
    expect(await db.ownershipRelationship.findUnique({ where: { id: r.id } })).toMatchObject({ ownerOrgId: a.organizationId, percentage: null });
    expect(await db.membership.count({ where: { organizationId: b.organizationId, personId: restricted.personId! } })).toBe(0);
  });
  it("clears the previous owner when changing an ownership record's entity type", async () => {
    const relationship = await service.save(admin.id, "ownership", { companyId: a.id, ownerPersonId: personId });
    await service.save(admin.id, "ownership", { companyId: a.id, ownerOrgId: group.id }, relationship.id);
    expect(await db.ownershipRelationship.findUnique({ where: { id: relationship.id } })).toMatchObject({ ownerPersonId: null, ownerOrgId: group.id });
    expect(await db.auditEvent.findFirst({ where: { action: "ownership.updated", entityId: relationship.id } })).toMatchObject({ actorUserId: admin.id, organizationId: a.organizationId });
  });
  it("creates human profiles without accounts and allows multiple justified logins per person", async () => {
    expect(await db.user.count({ where: { personId } })).toBe(0);
    await db.user.create({ data: { email: "second@test.invalid", personId: admin.personId } });
    expect(await db.user.count({ where: { personId: admin.personId } })).toBe(2);
  });
  it("creates dated memberships without granting roles or permissions", async () => {
    const membership = await service.save(admin.id, "memberships", { personId, organizationId: b.organizationId, startDate: "2026-01-01", scope: "ORGANIZATION" });
    expect(await db.membershipRole.count({ where: { membershipId: membership.id } })).toBe(0);
    const u = await db.user.create({ data: { email: "human@test.invalid", personId } });
    expect(await getPermissionGrantsForUser(u.id, db)).toEqual([]);
    await expect(service.save(admin.id, "memberships", { personId, organizationId: a.organizationId, startDate: "2026-12-01", endDate: "2026-01-01" })).rejects.toThrow();
  });
  it("keeps brands distinct from companies and rejects fabricated website schemes", async () => {
    const r = await service.save(admin.id, "brands", { ...identity("Brand A"), organizationId: a.organizationId });
    expect(await db.brand.findUnique({ where: { id: r.id } })).toMatchObject({ organizationId: a.organizationId, website: null });
    expect(await db.companyProfile.count()).toBe(2);
    await expect(service.save(admin.id, "brands", { ...identity("Unsafe brand"), organizationId: a.organizationId, website: "javascript:alert(1)" })).rejects.toThrow();
  });
  it("requires product and brand to have the same business boundary", async () => {
    const brand = await service.save(admin.id, "brands", { ...identity("Linked brand"), organizationId: a.organizationId });
    const product = await service.save(admin.id, "products", { ...identity("Linked product"), organizationId: a.organizationId, brandId: brand.id, type: "SERVICE", lifecycle: "LIVE" });
    expect(await service.productsForBrand(restricted.id, brand.id)).toEqual(expect.arrayContaining([expect.objectContaining({ id: product.id })]));
    await expect(service.save(admin.id, "products", { ...identity("Cross product"), organizationId: b.organizationId, brandId: brand.id })).rejects.toThrow("different organization");
  });
  it("requires project owners to belong to the scope and rejects crossed product links", async () => {
    const product = await service.save(admin.id, "products", { ...identity("Scoped product"), organizationId: a.organizationId });
    const project = await service.save(admin.id, "projects", { ...identity("Scoped project"), organizationId: a.organizationId, productId: product.id, ownerPersonId: restricted.personId, priority: "HIGH", startDate: "2026-01-01", targetDate: "2026-12-01" });
    expect(await db.project.findUnique({ where: { id: project.id } })).toMatchObject({ ownerPersonId: restricted.personId, priority: "HIGH" });
    await expect(service.save(admin.id, "projects", { ...identity("Wrong owner"), organizationId: b.organizationId, ownerPersonId: restricted.personId })).rejects.toThrow("active membership");
    await expect(service.save(admin.id, "projects", { ...identity("Wrong product"), organizationId: b.organizationId, productId: product.id })).rejects.toThrow("different organization");
  });
  it("supports project/product goals with explicit progress and validates bounds", async () => {
    const product = await service.save(admin.id, "products", { ...identity("Goal product"), organizationId: a.organizationId });
    const project = await service.save(admin.id, "projects", { ...identity("Goal project"), organizationId: a.organizationId, productId: product.id });
    const goal = await service.save(admin.id, "goals", { title: "Test objective", organizationId: a.organizationId, projectId: project.id, productId: product.id, progress: 25, ownerPersonId: personId });
    expect(await db.goal.findUnique({ where: { id: goal.id } })).toMatchObject({ progress: 25, status: "DRAFT" });
    await expect(service.save(admin.id, "goals", { title: "Invalid progress", organizationId: a.organizationId, progress: 101 })).rejects.toThrow();
    await expect(service.save(admin.id, "goals", { title: "Cross goal", organizationId: b.organizationId, projectId: project.id })).rejects.toThrow("Access denied");
  });
  it("supports department goals while rejecting department brands/products", async () => {
    const department = await service.save(admin.id, "organizations", { ...identity("Goal department"), type: "DEPARTMENT", parentId: a.organizationId });
    const goal = await service.save(admin.id, "goals", { title: "Department objective", organizationId: department.id });
    expect(await db.goal.findUnique({ where: { id: goal.id } })).toMatchObject({ organizationId: department.id });
    await expect(service.save(admin.id, "brands", { ...identity("Department brand"), organizationId: department.id })).rejects.toThrow("group or company");
  });
});

describe("authorization and atomic audit", () => {
  it("audits explicit role assignments and rejects cross-company and global privilege delegation", async () => {
    const membership = await db.membership.findUniqueOrThrow({ where: { personId_organizationId_scopeKey: { personId, organizationId: a.organizationId, scopeKey: "organization" } } });
    const role = await db.role.create({ data: { organizationId: a.organizationId, key: "reader", name: "Product reader", permissions: { create: { permission: { connect: { key: "product.read" } } } } } });
    await service.setMembershipRole(restricted.id, membership.id, role.id, true);
    expect(await db.membershipRole.findUnique({ where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } } })).not.toBeNull();
    expect(await db.auditEvent.findFirst({ where: { action: "membership.role_assigned", entityId: membership.id } })).toMatchObject({ actorUserId: restricted.id, organizationId: a.organizationId });
    await service.setMembershipRole(restricted.id, membership.id, role.id, false);
    expect(await db.membershipRole.findUnique({ where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } } })).toBeNull();
    const foreign = await db.role.create({ data: { organizationId: b.organizationId, key: "foreign-reader", name: "Foreign reader" } });
    await expect(service.setMembershipRole(restricted.id, membership.id, foreign.id, true)).rejects.toThrow("membership organization");
    const powerful = await db.role.create({ data: { organizationId: a.organizationId, key: "powerful", name: "Global manager", permissions: { create: { permission: { connect: { key: "organization.manage" } } } } } });
    await expect(service.setMembershipRole(restricted.id, membership.id, powerful.id, true)).rejects.toThrow("Cannot delegate");
  });
  it("requires a separate permission to expand a membership authorization scope", async () => {
    const membership = await db.membership.findUniqueOrThrow({ where: { personId_organizationId_scopeKey: { personId, organizationId: a.organizationId, scopeKey: "organization" } } });
    await expect(service.save(restricted.id, "memberships", { personId, organizationId: a.organizationId, scope: "DESCENDANTS" }, membership.id)).rejects.toThrow("Access denied");
    expect(await db.membership.findUnique({ where: { id: membership.id } })).toMatchObject({ scope: "ORGANIZATION" });
  });
  it("lists only authorized companies and filters group company queries", async () => {
    expect(await service.accessibleCompanies(restricted.id)).toEqual([expect.objectContaining({ id: a.id })]);
    expect((await service.list(admin.id, "companies", group.id)).length).toBe(2);
    await expect(service.list(restricted.id, "companies", b.organizationId)).rejects.toThrow("Access denied");
  });
  it("denies Company B reads, creates, edits and linking through Company A", async () => {
    const brandB = await service.save(admin.id, "brands", { ...identity("Private B brand"), organizationId: b.organizationId });
    expect(await service.list(restricted.id, "brands")).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: brandB.id })]));
    await expect(service.productsForBrand(restricted.id, brandB.id)).rejects.toThrow("Access denied");
    await expect(service.save(restricted.id, "brands", { ...identity("Unauthorized"), organizationId: b.organizationId })).rejects.toThrow("Access denied");
    await expect(service.save(restricted.id, "brands", { ...identity("Unauthorized edit"), organizationId: a.organizationId }, brandB.id)).rejects.toThrow("Access denied");
    await expect(service.save(restricted.id, "relationships", { fromCompanyId: a.id, toCompanyId: b.id, relationship: "SUBSIDIARY" })).rejects.toThrow("Access denied");
    await expect(service.save(restricted.id, "products", { ...identity("Indirect cross link"), organizationId: a.organizationId, brandId: brandB.id })).rejects.toThrow("different organization");
  });
  it("allows a company-only manager to update its company without group authority", async () => {
    await service.save(restricted.id, "companies", { name: "Company A maintained", slug: "company-a-maintained", groupOrganizationId: group.id }, a.id);
    expect(await db.companyProfile.findUnique({ where: { id: a.id } })).toMatchObject({ displayName: "Company A maintained", groupId: group.group!.id });
    await expect(service.save(restricted.id, "companies", { name: "Move A", slug: "moved-a", groupOrganizationId: null }, a.id)).rejects.toThrow("controlled migration");
    await expect(service.save(restricted.id, "companies", { name: "Hijack B", slug: "hijacked-b", groupOrganizationId: group.id }, b.id)).rejects.toThrow("Access denied");
  });
  it("filters person scope and ownership context to authorized organizations", async () => {
    const scopes = await service.personScope(restricted.id, personId);
    expect(scopes.every(m => m.organizationId === a.organizationId)).toBe(true);
    expect((await service.list(restricted.id, "ownership")).every(r => "companyId" in r && r.companyId === a.id)).toBe(true);
    expect(await service.list(restricted.id, "relationships")).toEqual([]);
  });
  it("does not infer authority from CEO designation or ownership", async () => {
    const p = await db.person.create({ data: { displayName: "Test CEO" } });
    const user = await db.user.create({ data: { email: "ceo@test.invalid", personId: p.id } });
    await db.membership.create({ data: { personId: p.id, organizationId: b.organizationId, title: "CEO" } });
    await db.ownershipRelationship.create({ data: { companyId: b.id, ownerPersonId: p.id } });
    expect(await service.accessibleCompanies(user.id)).toEqual([]);
    await expect(service.save(user.id, "brands", { ...identity("CEO brand"), organizationId: b.organizationId })).rejects.toThrow("Access denied");
  });
  it("revokes grants for expired, future and suspended memberships and inactive accounts", async () => {
    for (const patch of [{ endDate: new Date("2000-01-01") }, { startDate: new Date("2099-01-01") }, { status: "SUSPENDED" as const }]) {
      await db.membership.update({ where: { id: memberId }, data: patch });
      expect(await service.accessibleCompanies(restricted.id)).toEqual([]);
      await db.membership.update({ where: { id: memberId }, data: { startDate: null, endDate: null, status: "ACTIVE" } });
    }
    await db.user.update({ where: { id: restricted.id }, data: { status: "INACTIVE" } });
    await expect(service.accessibleCompanies(restricted.id)).rejects.toThrow("Access denied");
    await db.user.update({ where: { id: restricted.id }, data: { status: "ACTIVE" } });
  });
  it("requires explicit descendant membership scope and rejects cross-organization role assignments", async () => {
    const department = await service.save(admin.id, "organizations", { ...identity("Private department"), type: "DEPARTMENT", parentId: a.organizationId });
    await db.membership.update({ where: { id: memberId }, data: { scope: "ORGANIZATION" } });
    await expect(service.list(restricted.id, "goals", department.id)).rejects.toThrow("Access denied");
    await db.membership.update({ where: { id: memberId }, data: { scope: "DESCENDANTS" } });
    expect(await service.list(restricted.id, "goals", department.id)).toEqual([]);
    const otherRole = await db.role.create({ data: { organizationId: b.organizationId, key: "foreign", name: "Foreign role", permissions: { create: { permission: { connect: { key: "organization.manage" } } } } } });
    await db.membershipRole.create({ data: { membershipId: memberId, roleId: otherRole.id } });
    expect((await getPermissionGrantsForUser(restricted.id, db)).some(g => g.key === "organization.manage")).toBe(false);
  });
  it("records actor, resource, scope and action for successful creates and updates", async () => {
    const r = await service.save(admin.id, "brands", { ...identity("Audited brand"), organizationId: a.organizationId, metadata: { sample: true } });
    await service.save(admin.id, "brands", { ...identity("Updated brand"), organizationId: a.organizationId }, r.id);
    const events = await db.auditEvent.findMany({ where: { entityId: r.id }, orderBy: { createdAt: "asc" } });
    expect(events.map(e => e.action)).toEqual(["brands.created", "brands.updated"]);
    expect(events[0]).toMatchObject({ actorUserId: admin.id, actorPersonId: admin.personId, organizationId: a.organizationId, result: "SUCCESS", metadata: null });
  });
  it("rolls back a mutation when audit storage fails", async () => {
    await db.$executeRawUnsafe("CREATE TRIGGER test_fail_audit BEFORE INSERT ON AuditEvent BEGIN SELECT RAISE(ABORT, 'test audit unavailable'); END");
    const before = await db.brand.count();
    await expect(service.save(admin.id, "brands", { ...identity("Rollback brand"), organizationId: a.organizationId })).rejects.toThrow();
    expect(await db.brand.count()).toBe(before);
    await db.$executeRawUnsafe("DROP TRIGGER test_fail_audit");
  });
  it("leaves no resource or success audit for rejected mutations", async () => {
    const before = await db.auditEvent.count();
    const attempted = identity("Rejected brand");
    await expect(service.save(restricted.id, "brands", { ...attempted, organizationId: b.organizationId })).rejects.toThrow();
    expect(await db.brand.findFirst({ where: { slug: attempted.slug } })).toBeNull();
    expect(await db.auditEvent.count()).toBe(before);
  });
});
