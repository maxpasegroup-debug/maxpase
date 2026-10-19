import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { provisionBoss } from "@/server/group/provision";
import { createNexaService } from "@/server/group/nexa-service";
import { createSiaService } from "@/server/sia/service";
import { registeredTool } from "@/server/sia/registry";
import { createOperationsService } from "@/server/domain/operations-service";
import { createBrandCommandService } from "@/server/group/brand-command";

const dir = mkdtempSync(join(tmpdir(), "maxpase-nexa-"));
const file = join(dir, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const service = createNexaService(db);
let bossId: string, airaId: string, pearnId: string, directorId: string, foreignId: string;

async function makeDirector(companyId: string) {
  const person = await db.person.create({ data: { displayName: "Synthetic director" } });
  const user = await db.user.create({ data: { email: `${randomUUID()}@test.invalid`, personId: person.id, emailVerifiedAt: new Date() } });
  const role = await db.role.create({ data: { organizationId: companyId, key: `director-${randomUUID()}`, name: "Director", principalType: "HUMAN", permissions: { create: ["organization.read", "company.read", "executive.read", "decision.decide", "sia.access.read", "sia.propose", "task.read", "task.manage", "request.manage", "control.read"].map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId: companyId, scope: "ORGANIZATION", roles: { create: { roleId: role.id } } } });
  return user.id;
}

beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  sql.close();
  bossId = (await provisionBoss(db, { BOSS_PIN: String(randomInt(100000, 1000000)) })).userId;
  airaId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  pearnId = (await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } })).id;
  directorId = await makeDirector(airaId);
  foreignId = await makeDirector(pearnId);
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("private group directives", () => {
  const instruction = "Review the AIRA operating priorities and prepare a scoped director action.";
  const directorBrief = "Review current company priorities and seek independent approval for any proposed work.";

  it("requires the Boss, a verified director in the exact company, and replay integrity", async () => {
    const idempotencyKey = randomUUID();
    const input = { organizationId: airaId, directorUserId: directorId, instruction, directorBrief, idempotencyKey };
    await expect(service.create(directorId, input)).rejects.toThrow();
    await expect(service.create(bossId, { ...input, directorUserId: foreignId })).rejects.toThrow();
    expect(await db.nexaDirective.count()).toBe(0);
    const created = await service.create(bossId, input);
    expect((await service.create(bossId, input)).id).toBe(created.id);
    await expect(service.create(bossId, { ...input, directorBrief: "Changed brief for same request", idempotencyKey })).rejects.toThrow("replay");
    expect(await db.nexaDirective.count()).toBe(1);
    expect(await db.siaAction.count()).toBe(0);
    expect(await db.task.count()).toBe(0);
  });

  it("keeps the private instruction out of director projections and blocks skipped preparation", async () => {
    const director = await service.directorDesk(directorId, airaId);
    expect(director.rows).toHaveLength(1);
    expect(JSON.stringify(director)).not.toContain(instruction);
    expect(JSON.stringify(director)).not.toContain("NEXA");
    await expect(service.directorDesk(foreignId, airaId)).rejects.toThrow();
    await expect(service.decide(directorId, director.rows[0].id, director.rows[0].version, "APPROVED", "Reviewed evidence and scope")).rejects.toThrow();
    await expect(service.prepare(directorId, director.rows[0].id, "forged-sia", director.rows[0].version)).rejects.toThrow();
    await expect(service.proposeTask(directorId, { id: director.rows[0].id, version: director.rows[0].version, controlPointId: "forged", parameters: { title: "Unsafe task", priority: "NORMAL" } })).rejects.toThrow();
    expect((await db.nexaDirective.findUniqueOrThrow({ where: { id: director.rows[0].id } })).status).toBe("DIRECTOR_REVIEW");
    expect(await db.siaAction.count()).toBe(0);
    expect(await db.task.count()).toBe(0);
  });

  it("records real human actor and scope while keeping the agent separate from user and SIA identities", async () => {
    const row = await db.nexaDirective.findFirstOrThrow();
    const event = await db.auditEvent.findFirstOrThrow({ where: { entityType: "GroupDirective", entityId: row.id, action: "group.directive_created" } });
    expect(event.actorUserId).toBe(bossId);
    expect(event.organizationId).toBe(airaId);
    expect(await db.user.findUnique({ where: { id: row.nexaId } })).toBeNull();
    expect(await db.siaIdentity.findUnique({ where: { id: row.nexaId } })).toBeNull();
    expect(await db.nexaIdentity.findUnique({ where: { id: row.nexaId } })).toMatchObject({ name: "NEXA" });
  });
  it("requires configured SIA read authority, records director decision, and never creates a task by approval alone", async () => {
    const row = await db.nexaDirective.findFirstOrThrow();
    const sia = await db.siaIdentity.create({ data: { name: "Synthetic SIA" } });
    const agentRole = await db.role.create({ data: { organizationId: airaId, key: `sia-${randomUUID()}`, name: "Scoped SIA reader", principalType: "AGENT", permissions: { create: ["company.read", "executive.read"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.siaRoleAssignment.create({ data: { siaId: sia.id, organizationId: airaId, roleId: agentRole.id } });
    await db.siaTool.create({ data: { siaId: sia.id, key: "get_company_overview", name: "Company overview", permissionKey: "company.read", enabled: true } });
    expect((await service.directorDesk(directorId, airaId)).sia.map(s => s.id)).toContain(sia.id);
    await service.prepare(directorId, row.id, sia.id, row.version);
    const prepared = await db.nexaDirective.findUniqueOrThrow({ where: { id: row.id } });
    expect(prepared.status).toBe("PREPARED");
    expect(prepared.siaPreparation).toContain("SIA_READ_ONLY_CONTEXT");
    await expect(service.prepare(directorId, row.id, sia.id, row.version)).rejects.toThrow();
    await expect(service.decide(foreignId, row.id, prepared.version, "APPROVED", "Cross-company attempt")).rejects.toThrow();
    await service.decide(directorId, row.id, prepared.version, "APPROVED", "Authorized director reviewed the evidence");
    await expect(service.decide(directorId, row.id, prepared.version, "APPROVED", "Replay approval attempt")).rejects.toThrow();
    expect((await db.nexaDirective.findUniqueOrThrow({ where: { id: row.id } })).outcome).toBe("CONTROLLED_REQUEST_REQUIRED");
    expect(await db.siaAction.count()).toBe(0);
    expect(await db.task.count()).toBe(0);
  });
  it("keeps advisor assistance disabled without an explicit self-scoped tool and advisor appointment", async () => {
    expect(registeredTool("get_advisor_day")).toMatchObject({ risk: "READ_ONLY", requiredPermission: "labs.sales.self", requiresApproval: false });
    const sia = await db.siaIdentity.findFirstOrThrow({ where: { name: "Synthetic SIA" } });
    await expect(createSiaService(db).preview(directorId, { siaId: sia.id, organizationId: airaId }, "get_advisor_day")).rejects.toThrow();
    await expect(createSiaService(db).preview(foreignId, { siaId: sia.id, organizationId: airaId }, "get_advisor_day")).rejects.toThrow();
  });
  it("hides prepared evidence and blocks decision after SIA tool revocation", async () => {
    const sia = await db.siaIdentity.findFirstOrThrow({ where: { name: "Synthetic SIA" } });
    const row = await service.create(bossId, { organizationId: airaId, directorUserId: directorId, instruction, directorBrief, idempotencyKey: randomUUID() });
    await service.prepare(directorId, row.id, sia.id, row.version);
    const prepared = await db.nexaDirective.findUniqueOrThrow({ where: { id: row.id } });
    await db.siaTool.update({ where: { siaId_key: { siaId: sia.id, key: "get_company_overview" } }, data: { enabled: false } });
    const visible = (await service.directorDesk(directorId, airaId)).rows.find(item => item.id === row.id);
    expect(visible?.siaPreparation).toBeNull();
    expect(visible?.preparationCurrent).toBe(false);
    await expect(service.decide(directorId, row.id, prepared.version, "APPROVED", "Cannot approve stale evidence")).rejects.toThrow();
    expect((await db.nexaDirective.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PREPARED");
  });
  it("rolls back directive creation when audit persistence fails", async () => {
    const before = await db.nexaDirective.count();
    const sql = new DatabaseSync(file);
    sql.exec("CREATE TRIGGER nexa_audit_failure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'group.directive_created' BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END");
    sql.close();
    try {
      await expect(service.create(bossId, { organizationId: airaId, directorUserId: directorId, instruction, directorBrief, idempotencyKey: randomUUID() })).rejects.toThrow();
      expect(await db.nexaDirective.count()).toBe(before);
    } finally {
      const cleanup = new DatabaseSync(file);
      cleanup.exec("DROP TRIGGER nexa_audit_failure");
      cleanup.close();
    }
  });
  it("submits a director-approved task proposal to an independent human without executing it", async () => {
    const row = await db.nexaDirective.findFirstOrThrow({ where: { status: "DIRECTOR_APPROVED" } });
    const assignment = await db.siaRoleAssignment.findFirstOrThrow({ where: { siaId: row.siaId!, organizationId: airaId } });
    for (const key of ["task.manage", "task.read"]) {
      const permission = await db.permission.findUniqueOrThrow({ where: { key } });
      await db.rolePermission.create({ data: { roleId: assignment.roleId, permissionId: permission.id } });
    }
    await db.siaTool.create({ data: { siaId: row.siaId!, key: "create_task", name: "Create task", permissionKey: "task.manage", enabled: true } });
    const control = await createOperationsService(db).saveControl(bossId, { organizationId: airaId, name: "Independent task approval", kind: "APPROVAL", requiredPermission: "task.manage", stages: [[{ approverUserId: bossId, requiredPermission: "approval.decide" }]] });
    const action = await service.proposeTask(directorId, { id: row.id, version: row.version, controlPointId: control.id, parameters: { title: "Review company follow-up plan", priority: "NORMAL" } });
    expect(action.status).toBe("APPROVAL_REQUIRED");
    expect((await db.operationalRequest.findUniqueOrThrow({ where: { id: action.requestId! } })).status).toBe("SUBMITTED");
    expect(await db.siaApproval.count({ where: { requestId: action.requestId! } })).toBe(1);
    expect((await db.nexaDirective.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACTION_PROPOSED");
    expect(await db.task.count()).toBe(0);
    await expect(service.proposeTask(directorId, { id: row.id, version: row.version, controlPointId: control.id, parameters: { title: "Review company follow-up plan", priority: "NORMAL" } })).rejects.toThrow();
  });
  it("limits advisor SIA briefing to assigned Labs leads and revokes it with the tool", async () => {
    const labsId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
    const person = await db.person.create({ data: { displayName: "Synthetic advisor" } });
    const user = await db.user.create({ data: { email: `${randomUUID()}@test.invalid`, personId: person.id, emailVerifiedAt: new Date() } });
    const companyRole = await db.role.create({ data: { organizationId: airaId, key: `advisor-company-${randomUUID()}`, name: "Company reader", permissions: { create: { permission: { connect: { key: "organization.read" } } } } } });
    await db.membership.create({ data: { personId: person.id, organizationId: airaId, scope: "ORGANIZATION", roles: { create: { roleId: companyRole.id } } } });
    const advisorRole = await db.role.create({ data: { organizationId: labsId, key: `advisor-${randomUUID()}`, name: "Senior Academic Advisor", permissions: { create: ["organization.read", "labs.sales.self", "sia.access.read"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId: person.id, organizationId: labsId, scope: "ORGANIZATION", roles: { create: { roleId: advisorRole.id } } } });
    const sia = await db.siaIdentity.create({ data: { name: "Advisor SIA" } });
    const agent = await db.role.create({ data: { organizationId: labsId, key: `advisor-sia-${randomUUID()}`, name: "Advisor SIA scope", principalType: "AGENT", permissions: { create: { permission: { connect: { key: "labs.sales.self" } } } } } });
    await db.siaRoleAssignment.create({ data: { siaId: sia.id, organizationId: labsId, roleId: agent.id } });
    await db.siaTool.create({ data: { siaId: sia.id, key: "get_advisor_day", name: "Advisor day", permissionKey: "labs.sales.self", enabled: true } });
    const payload = JSON.stringify({ company: "Fixture", name: "Contact", email: "contact@fixture.invalid", phone: "", need: "Follow-up", source: "MANUAL", consent: true, ownerUserId: user.id, nextFollowUp: null, lastContact: null, outcome: "", qualification: "", quoteId: null, acceptance: "", projectId: null });
    const own = await db.executiveRecord.create({ data: { kind: "LABS_LEAD", organizationId: labsId, ownerPersonId: person.id, title: "Assigned Labs enquiry", status: "NEW", sourceKey: randomUUID(), payload } });
    await db.executiveRecord.create({ data: { kind: "LABS_LEAD", organizationId: pearnId, ownerPersonId: person.id, title: "Foreign private enquiry", status: "NEW", sourceKey: randomUUID(), payload } });
    const selection = { siaId: sia.id, organizationId: labsId };
    const briefing = await createSiaService(db).preview(user.id, selection, "get_advisor_day");
    expect(briefing.facts.map(f => f.label)).toContain(own.title);
    expect(JSON.stringify(briefing)).not.toContain("Foreign private enquiry");
    expect(briefing.actions.some(action => action.includes("approved product disclosures"))).toBe(true);
    await db.siaTool.update({ where: { siaId_key: { siaId: sia.id, key: "get_advisor_day" } }, data: { enabled: false } });
    await expect(createSiaService(db).preview(user.id, selection, "get_advisor_day")).rejects.toThrow();
  });
  it("opens only canonical Boss brand commands and keeps scoped HR access gated", async () => {
    const command = createBrandCommandService(db);
    const labs = await command.read(bossId, "aira-skill-city", "aira-labs");
    expect(labs.companyId).toBe(airaId);
    expect(labs.label).toBe("AIRA Labs");
    expect(labs.scopeId).not.toBe(pearnId);
    expect(labs.canManagePeople).toBe(true);
    expect((await command.read(bossId, "aira-skill-city", "aira-skill-city")).label).toBe("AIRA Skill City");
    const unconfigured = await command.read(bossId, "aira-skill-city", "aira-skill-studio");
    expect(unconfigured.label).toBe("AIRA Skill Studio");
    expect(unconfigured.brand).toBeNull();
    await expect(command.read(directorId, "aira-skill-city", "aira-labs")).rejects.toThrow();
    await expect(command.read(bossId, "aira-skill-city", "not-a-brand")).rejects.toThrow();
    await expect(command.read(bossId, "pearn", "aira-labs")).rejects.toThrow();
  });
});
