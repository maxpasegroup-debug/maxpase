import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createAiraService } from "@/server/domain/aira-service";
import { seedAiraStructure } from "@/server/domain/aira-seed";
import { airaDivisions } from "@/server/domain/company-structure";
import { createWorkforceService } from "@/server/domain/workforce-service";
import { createBusinessService } from "@/server/domain/business-service";
import { createExecutionService } from "@/server/domain/execution-service";
import { createOperationsService } from "@/server/domain/operations-service";
import { workforcePermissions } from "@/server/authorization/registry";
const dir = mkdtempSync(join(tmpdir(), "maxpase-phase06-")), file = join(dir, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const service = createAiraService(db), workforce = createWorkforceService(db), business = createBusinessService(db), execution = createExecutionService(db), ops = createOperationsService(db);
let company: string, group: string, other: string, school: string, labs: string, career: string, admin: string, outsider: string, exact: string, reader: string;
let sequence = 0;
const unique = () => "aira-test-" + ++sequence;
const keys = [...new Set([...workforcePermissions.map(p => p.key), ...["company", "organization", "membership", "product", "brand", "project", "goal"].flatMap(d => [d + ".read", d + ".manage"])])];
async function actor(organizationId: string, permissions = keys, descendants = false) {
  const person = await db.person.create({ data: { displayName: unique() } });
  const user = await db.user.create({ data: { personId: person.id, email: unique() + "@test.invalid" } });
  const role = await db.role.create({ data: { organizationId, key: unique(), name: "Founder", permissions: { create: permissions.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } });
  return user.id;
}
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(`prisma/migrations/${folder}/migration.sql`, "utf8"));
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]); sql.close();
  const g = await db.organization.create({ data: { name: "MAXPASE GROUP", slug: "maxpase-group", type: "GROUP", group: { create: { name: "MAXPASE GROUP" } } }, include: { group: true } }); group = g.id;
  company = (await db.organization.create({ data: { name: "AIRA Skill City Private Limited", slug: "aira-skill-city", type: "COMPANY", parentId: group, company: { create: { displayName: "AIRA Skill City", groupId: g.group!.id } } } })).id;
  other = (await db.organization.create({ data: { name: "Other company", slug: unique(), type: "COMPANY", parentId: group, company: { create: { displayName: "Other company", groupId: g.group!.id } } } })).id;
  const divisions = await db.$transaction(tx => seedAiraStructure(tx, company));
  school = divisions.find(d => d.slug === "aira-startup-school")!.id; labs = divisions.find(d => d.slug === "aira-labs")!.id; career = divisions.find(d => d.slug === "aira-career-hub")!.id;
  for (const key of keys) await db.permission.create({ data: { key, name: key, scope: "GROUP" } });
  admin = await actor(group, keys, true); outsider = await actor(other); exact = await actor(company); reader = await actor(company, ["company.read", "organization.read", "program.read", "batch.read", "location.read"], true);
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
const program = async (organizationId = school, extra = {}) => service.save(admin, "programs", { organizationId, name: unique(), slug: unique(), ...extra });
describe("Phase 06 AIRA company OS", () => {
  it("seeds only the canonical structure and Nice Jobs, idempotently", async () => {
    const before = await db.organization.count();
    await db.$transaction(tx => seedAiraStructure(tx, company));
    expect(await db.organization.count()).toBe(before);
    expect(await db.organization.findMany({ where: { parentId: company, type: "DIVISION" }, select: { name: true } })).toEqual(expect.arrayContaining(airaDivisions.map(d => ({ name: d.name }))));
    expect(await db.product.findUnique({ where: { organizationId_slug: { organizationId: company, slug: "nice-jobs" } } })).toMatchObject({ divisionId: career, type: "PLATFORM", lifecycle: "CONCEPT" });
    expect(await db.program.count()).toBe(0); expect(await db.batch.count()).toBe(0); expect(await db.location.count()).toBe(0);
  });
  it("requires actual AIRA authority rather than a title or another company's permissions", async () => {
    await expect(service.enter(outsider)).rejects.toThrow();
    await expect(service.save(outsider, "programs", { organizationId: school, name: unique(), slug: unique() })).rejects.toThrow();
    await expect(service.list(outsider, "programs")).rejects.toThrow();
    await expect(service.save(exact, "programs", { organizationId: school, name: unique(), slug: unique() })).rejects.toThrow("Access denied");
    await expect(service.save(reader, "programs", { organizationId: school, name: unique(), slug: unique() })).rejects.toThrow("Access denied");
    expect((await service.workspace(reader)).capabilities["program.manage"]).toEqual([]);
  });
  it("rejects forged company, actor, scope, hierarchy and resource identities", async () => {
    await expect(service.save(admin, "programs", { organizationId: school, companyOrganizationId: other, name: unique(), slug: unique() })).rejects.toThrow();
    await expect(service.save(admin, "locations", { organizationId: other, name: unique(), actorUserId: outsider })).rejects.toThrow();
    await expect(service.saveShared(admin, "projects", { organizationId: other, name: unique(), slug: unique() })).rejects.toThrow("outside AIRA");
    await expect(service.list(admin, "programs", { organizationId: other })).rejects.toThrow("outside AIRA");
    await expect(service.list(admin, "products", { divisionId: other })).rejects.toThrow("outside AIRA");
    await expect(service.saveShared(admin, "teams", { parentId: other, type: "TEAM", name: unique(), slug: unique() })).rejects.toThrow();
  });
  it("keeps unknown pricing, duration and dates null and validates explicit pricing", async () => {
    const p = await program();
    expect(await db.program.findUnique({ where: { id: p.id } })).toMatchObject({ priceMinor: null, currency: null, durationDays: null, capacity: null, status: "DRAFT", companyOrganizationId: company, organizationId: school });
    await expect(program(school, { priceMinor: 100 })).rejects.toThrow();
    await expect(program(school, { priceMinor: -1, currency: "INR" })).rejects.toThrow();
    const priced = await program(school, { priceMinor: 0, currency: "INR", capacity: 10 });
    expect(await db.program.findUnique({ where: { id: priced.id } })).toMatchObject({ priceMinor: 0, currency: "INR" });
    await expect(service.save(admin, "programs", { organizationId: labs, name: unique(), slug: unique() }, p.id)).rejects.toThrow("cannot be changed");
  });
  it("validates company and division product/brand relationships and canonical names", async () => {
    const foreign = await business.save(admin, "products", { organizationId: other, name: unique(), slug: unique() });
    await expect(program(school, { productId: foreign.id })).rejects.toThrow("another company");
    const nice = await db.product.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: company, slug: "nice-jobs" } } });
    await expect(program(labs, { productId: nice.id })).rejects.toThrow("another company or division");
    await expect(business.save(admin, "products", { organizationId: company, name: "Nice Jobs", slug: "nice-jobs", divisionId: labs }, nice.id)).rejects.toThrow("Career Hub");
    await expect(business.save(admin, "products", { organizationId: company, name: unique(), slug: unique(), divisionId: other })).rejects.toThrow();
    await expect(workforce.save(admin, "organizations", { parentId: company, type: "DIVISION", name: "Renamed", slug: "aira-startup-school" }, school)).rejects.toThrow("Canonical");
    const product = await service.saveShared(admin, "products", { organizationId: company, divisionId: labs, name: unique(), slug: unique() });
    const p = await program(labs, { productId: product.id });
    expect(await db.program.findUnique({ where: { id: p.id } })).toMatchObject({ productId: product.id });
    await expect(business.save(admin, "products", { organizationId: company, divisionId: school, name: unique(), slug: unique() }, product.id)).rejects.toThrow("linked program");
  });
  it("uses shared configurable departments and teams without requiring every layer", async () => {
    const department = await service.saveShared(admin, "departments", { parentId: school, type: "DEPARTMENT", name: unique(), slug: unique() });
    const team = await service.saveShared(admin, "teams", { parentId: department.id, type: "TEAM", name: unique(), slug: unique() });
    expect(await db.teamProfile.findUnique({ where: { organizationId: team.id } })).not.toBeNull();
    await expect(service.saveShared(admin, "teams", { parentId: labs, type: "TEAM", name: unique(), slug: unique() }, team.id)).rejects.toThrow();
  });
  it("validates batches, planned defaults, UTC dates, lifecycle and capacity", async () => {
    const p = await program(school, { capacity: 2 });
    const b = await service.save(admin, "batches", { programId: p.id, name: unique() });
    expect(await db.batch.findUnique({ where: { id: b.id } })).toMatchObject({ status: "PLANNED", startDate: null, endDate: null });
    await expect(service.save(admin, "batches", { programId: p.id, name: unique(), status: "ACTIVE" })).rejects.toThrow("active program");
    await expect(service.save(admin, "batches", { programId: p.id, name: unique(), capacity: 3 })).rejects.toThrow("capacity");
    await expect(service.save(admin, "batches", { programId: p.id, name: unique(), startDate: "2026-02-30" })).rejects.toThrow();
    await expect(service.save(admin, "batches", { programId: p.id, name: unique(), startDate: "2026-10-04T12:00:00" })).rejects.toThrow();
    await expect(service.save(admin, "batches", { programId: p.id, name: unique(), startDate: "2026-10-05", endDate: "2026-10-04" })).rejects.toThrow();
    const q = await program(); await expect(service.save(admin, "batches", { programId: q.id, name: unique() }, b.id)).rejects.toThrow("cannot be changed");
  });
  it("validates locations without inventing addresses or cross-division delivery", async () => {
    const l = await service.save(admin, "locations", { organizationId: company, name: unique() });
    expect(await db.location.findUnique({ where: { id: l.id } })).toMatchObject({ status: "PLANNED", address: null, city: null });
    const p = await program(); await service.save(admin, "batches", { programId: p.id, name: unique(), locationId: l.id });
    const sibling = await service.save(admin, "locations", { organizationId: labs, name: unique() });
    await expect(service.save(admin, "batches", { programId: p.id, name: unique(), locationId: sibling.id })).rejects.toThrow("unavailable");
    await expect(service.save(admin, "locations", { organizationId: labs, name: unique() }, l.id)).rejects.toThrow("cannot be changed");
  });
  it("reuses responsibilities for ownership, academics, managers, trainers and teams", async () => {
    const p = await program(), personId = (await db.user.findUniqueOrThrow({ where: { id: admin } })).personId!;
    const team = await service.saveShared(admin, "teams", { parentId: school, type: "TEAM", name: unique(), slug: unique() });
    const r = await service.saveShared(admin, "responsibilities", { organizationId: school, personId, programId: p.id, teamId: team.id, kind: "ACADEMIC", title: "Academic responsibility" });
    expect(await db.responsibility.findUnique({ where: { id: r.id } })).toMatchObject({ programId: p.id, personId, teamId: team.id, kind: "ACADEMIC" });
    await expect(workforce.save(admin, "responsibilities", { organizationId: labs, personId, programId: p.id, title: unique() })).rejects.toThrow("another scope");
    await expect(workforce.save(admin, "responsibilities", { organizationId: school, personId: (await db.user.findUniqueOrThrow({ where: { id: outsider } })).personId!, programId: p.id, title: unique() })).rejects.toThrow("membership");
    await expect(workforce.save(admin, "responsibilities", { organizationId: school, personId, programId: p.id, batchId: "forged", title: unique() })).rejects.toThrow();
  });
  it("records participants against existing people without accounts, enrolment or LMS creation", async () => {
    const p = await program(school, { capacity: 1 }), b = await service.save(admin, "batches", { programId: p.id, name: unique() });
    const first = await db.person.create({ data: { displayName: unique(), memberships: { create: { organizationId: school } } } });
    const second = await db.person.create({ data: { displayName: unique(), memberships: { create: { organizationId: school } } } });
    const a = await service.save(admin, "participants", { batchId: b.id, personId: first.id });
    expect((await service.save(admin, "participants", { batchId: b.id, personId: first.id })).id).toBe(a.id);
    expect(await db.user.count({ where: { personId: first.id } })).toBe(0);
    await expect(service.save(admin, "participants", { batchId: b.id, personId: second.id })).rejects.toThrow("capacity");
    await expect(service.save(admin, "participants", { batchId: b.id, personId: first.id, status: "ACTIVE" })).rejects.toThrow("active batch");
  });
  it("links programs to shared projects/tasks/goals and rejects cross-scope links", async () => {
    const p = await program();
    const project = await service.saveShared(admin, "projects", { organizationId: school, programId: p.id, name: unique(), slug: unique(), status: "PLANNED" });
    const goal = await service.saveShared(admin, "goals", { organizationId: school, programId: p.id, projectId: project.id, title: unique() });
    const task = await execution.save(admin, "tasks", { organizationId: school, projectId: project.id, goalId: goal.id, title: unique() });
    expect(await db.project.findUnique({ where: { id: project.id } })).toMatchObject({ programId: p.id });
    expect(await db.task.findUnique({ where: { id: task.id } })).toMatchObject({ goalId: goal.id });
    await expect(execution.save(admin, "projects", { organizationId: other, programId: p.id, name: unique(), slug: unique() })).rejects.toThrow("another scope");
    await expect(execution.save(admin, "goals", { organizationId: labs, programId: p.id, title: unique() })).rejects.toThrow("another scope");
    const second = await program();
    await expect(execution.save(admin, "goals", { organizationId: school, programId: second.id, projectId: project.id, title: unique() })).rejects.toThrow("conflicts");
    await expect(execution.save(admin, "projects", { organizationId: school, programId: second.id, name: unique(), slug: unique() }, project.id)).rejects.toThrow("linked goal");
  });
  it("reuses explicit employer relationships and retains project-only capability boundaries", async () => {
    const from = await db.companyProfile.findUniqueOrThrow({ where: { organizationId: company } }), to = await db.companyProfile.findUniqueOrThrow({ where: { organizationId: other } });
    const relation = await business.save(admin, "relationships", { fromCompanyId: from.id, toCompanyId: to.id, relationship: "EMPLOYER" });
    expect((await service.list(admin, "employers")).map(r => r.id)).toContain(relation.id);
    expect(await service.list(reader, "employers")).toEqual([]);
    await expect(business.save(exact, "relationships", { fromCompanyId: from.id, toCompanyId: to.id, relationship: "EMPLOYER" })).rejects.toThrow();
    const p = await program(), project = await execution.save(admin, "projects", { organizationId: school, programId: p.id, name: unique(), slug: unique() });
    const narrow = await actor(company, ["company.read"]), personId = (await db.user.findUniqueOrThrow({ where: { id: narrow } })).personId!;
    const role = await db.role.create({ data: { organizationId: school, key: unique(), name: "Project reader", permissions: { create: { permission: { connect: { key: "project.read" } } } } } });
    await db.membership.create({ data: { personId, organizationId: school, projectId: project.id, scopeKey: "project:" + project.id, roles: { create: { roleId: role.id } } } });
    expect((await service.list(narrow, "projects")).map(r => r.id)).toEqual([project.id]);
    expect(await service.list(narrow, "programs")).toEqual([]);
    await expect(service.save(narrow, "programs", { organizationId: school, name: unique(), slug: unique() })).rejects.toThrow();
  });
  it("uses the shared workflow, request and approval engine for real program resources", async () => {
    const p = await program();
    const reviewer = await actor(school);
    const control = await ops.saveControl(admin, { organizationId: school, name: unique(), kind: "APPROVAL", requiredPermission: "approval.decide", stages: [[{ approverUserId: reviewer }]] });
    const definition = await ops.saveWorkflow(admin, { organizationId: school, name: unique(), key: "AIRA_PROCESS_" + ++sequence, version: 1, states: [{ key: "READY", name: "Ready", initial: true }, { key: "DONE", name: "Done", terminal: true }], transitions: [{ key: "FINISH", from: "READY", to: "DONE", requiredPermission: "workflow.transition", controlPointId: control.id }] });
    await ops.publishWorkflow(admin, definition.id);
    const raw = { resourceType: "PROGRAM", resourceId: p.id, organizationId: other, definitionId: definition.id, title: unique(), idempotencyKey: unique() };
    const instance = await service.startWorkflow(admin, raw);
    expect(instance.organizationId).toBe(school);
    expect((await service.startWorkflow(admin, raw)).id).toBe(instance.id);
    await expect(service.startWorkflow(outsider, raw)).rejects.toThrow();
    const request = await ops.createRequest(admin, { organizationId: school, resourceType: "PROGRAM", resourceId: p.id, title: unique(), idempotencyKey: unique(), controlPointId: control.id, workflowInstanceId: instance.id });
    await ops.submitRequest(admin, request.id);
    const approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: request.id } });
    await expect(ops.decide(outsider, { approvalId: approval.id, decision: "APPROVED", comment: "Forged" })).rejects.toThrow();
    await ops.decide(reviewer, { approvalId: approval.id, decision: "APPROVED", comment: "Reviewed program" });
    expect(await db.operationalRequest.findUnique({ where: { id: request.id } })).toMatchObject({ status: "APPROVED" });
    expect(await db.program.findUnique({ where: { id: p.id } })).toMatchObject({ status: "DRAFT" });
  });
  it("projects real scoped dashboard data and confidential empty states", async () => {
    const dashboard = await service.overview(admin);
    expect(dashboard.workspace.company.id).toBe(company);
    expect(dashboard.workspace.organizations.map(o => o.id)).not.toContain(other);
    expect(dashboard.workspace.products.every(p => p.id)).toBe(true);
    const narrow = await service.overview(reader);
    expect(narrow.activeProjects).toEqual([]); expect(narrow.pending).toEqual([]); expect(narrow.workspace.people).toEqual([]);
  });
  it("audits trusted company entry and mutations and rolls back on audit failure", async () => {
    await service.enter(admin);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "company.context_entered", actorUserId: admin } });
    expect(audit.organizationId).toBe(company);
    const before = await db.program.count(), name = unique();
    const sql = new DatabaseSync(file);
    sql.exec("CREATE TRIGGER fail_company_audit BEFORE INSERT ON AuditEvent BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    try { await expect(service.save(admin, "programs", { organizationId: school, name, slug: unique() })).rejects.toThrow(); }
    finally { sql.exec("DROP TRIGGER fail_company_audit"); sql.close(); }
    expect(await db.program.count()).toBe(before);
    expect(await db.operationalEvent.count({ where: { auditId: audit.id } })).toBe(1);
  });
  it("preserves human and company boundaries after membership revocation", async () => {
    const user = await actor(company, keys, true);
    await service.enter(user);
    const personId = (await db.user.findUniqueOrThrow({ where: { id: user } })).personId!;
    await db.membership.updateMany({ where: { personId }, data: { status: "ENDED" } });
    await expect(service.enter(user)).rejects.toThrow();
    await expect(service.list(user, "programs")).rejects.toThrow();
  });
});
