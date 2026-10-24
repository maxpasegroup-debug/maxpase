import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { initializeGroupStructure } from "@/server/group/structure";
import { createCrossBrandQueue } from "@/server/skillcity/cross-brand-queue";
import { createAdvisorCrm } from "@/server/skillcity/crm";

const directory = mkdtempSync(join(tmpdir(), "skillcity-crm-"));
const file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const queue = createCrossBrandQueue(db, () => new Date("2026-10-24T06:00:00Z"));
let directorId: string, advisorId: string, outsiderId: string, advisorPersonId: string, labsId: string, startupId: string, studioId: string, managerRoleId: string;

beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(name => /^\d/.test(name)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close();
  await db.$transaction(initializeGroupStructure);
  const companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  labsId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  startupId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-startup-school" } })).id;
  studioId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-studio" } })).id;
  const foreignId = (await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } })).id;
  const keys = ["organization.read", "labs.sales.self", "labs.sales.read", "aira.crm.self", "aira.crm.manage", "reporting.read", "person.read"];
  for (const key of keys) await db.permission.upsert({ where: { key }, create: { key, name: key, scope: "GROUP" }, update: {} });
  const managerRole = await db.role.create({ data: { organizationId: companyId, key: "crm-queue-director", name: "Director", permissions: { create: ["organization.read", "labs.sales.read", "aira.crm.manage", "reporting.read", "person.read"].map(key => ({ permission: { connect: { key } } })) } } });
  managerRoleId = managerRole.id;
  const advisorRole = await db.role.create({ data: { organizationId: companyId, key: "crm-queue-advisor", name: "Senior Academic Advisor", permissions: { create: ["organization.read", "labs.sales.self", "aira.crm.self"].map(key => ({ permission: { connect: { key } } })) } } });
  async function account(name: string, roleId: string) {
    const person = await db.person.create({ data: { displayName: name } });
    const user = await db.user.create({ data: { email: `${name.toLowerCase().replaceAll(" ", "-")}@test.invalid`, personId: person.id, emailVerifiedAt: new Date() } });
    await db.membership.create({ data: { personId: person.id, organizationId: companyId, scope: "DESCENDANTS", roles: { create: { roleId } } } });
    return { userId: user.id, personId: person.id };
  }
  const director = await account("Queue Director", managerRole.id);
  const advisor = await account("Queue Advisor", advisorRole.id);
  const outsider = await account("Queue Outsider", advisorRole.id);
  directorId = director.userId; advisorId = advisor.userId; advisorPersonId = advisor.personId; outsiderId = outsider.userId;
  for (const organizationId of [labsId, startupId, studioId]) await db.reportingRelationship.create({ data: { organizationId, managerPersonId: director.personId, personId: advisor.personId } });
  const labsPayload = (ownerUserId: string) => JSON.stringify({ company: "Example company", name: "Example contact", email: "contact@example.invalid", phone: "", need: "A real recorded enquiry", source: "MANUAL", consent: true, ownerUserId, nextFollowUp: null, lastContact: null, outcome: "", qualification: "", quoteId: null, acceptance: "", projectId: null });
  const crmPayload = (ownerUserId: string, product: string) => JSON.stringify({ product, name: "Example learner", email: "learner@example.invalid", phone: "", need: "A real recorded enquiry", consent: true, ownerUserId, outcome: "", qualification: "", nextFollowUp: null, lastContact: null });
  await db.executiveRecord.createMany({ data: [
    { organizationId: labsId, kind: "LABS_LEAD", ownerPersonId: advisor.personId, title: "Assigned Labs enquiry", status: "NEW", dueAt: new Date("2026-10-25T08:00:00Z"), sourceKey: "queue:labs:own", payload: labsPayload(advisorId) },
    { organizationId: startupId, kind: "AIRA_CRM_LEAD", ownerPersonId: advisor.personId, title: "Assigned PBA enquiry", status: "CONTACTED", dueAt: new Date("2026-10-24T08:00:00Z"), sourceKey: "queue:pba:own", payload: crmPayload(advisorId, "pba") },
    { organizationId: studioId, kind: "AIRA_CRM_LEAD", ownerPersonId: advisor.personId, title: "Assigned GenZ enquiry", status: "NEW", sourceKey: "queue:genz:own", payload: crmPayload(advisorId, "genz-builder") },
    { organizationId: labsId, kind: "LABS_LEAD", ownerPersonId: outsider.personId, title: "Other advisor enquiry", status: "NEW", sourceKey: "queue:labs:other", payload: labsPayload(outsiderId) },
    { organizationId: labsId, kind: "LABS_LEAD", ownerPersonId: advisor.personId, title: "Closed enquiry", status: "LOST", sourceKey: "queue:labs:closed", payload: labsPayload(advisorId) },
    { organizationId: startupId, kind: "AIRA_CRM_LEAD", ownerPersonId: advisor.personId, title: "Wrong product payload", status: "NEW", sourceKey: "queue:pba:mismatch", payload: crmPayload(advisorId, "genz-builder") },
    { organizationId: studioId, kind: "AIRA_CRM_LEAD", ownerPersonId: advisor.personId, title: "Unreadable details", status: "NEW", sourceKey: "queue:genz:invalid", payload: "{}" },
    { organizationId: foreignId, kind: "LABS_LEAD", ownerPersonId: advisor.personId, title: "Other company private enquiry", status: "NEW", sourceKey: "queue:foreign", payload: labsPayload(advisorId) }
  ] });
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Skill City cross-brand CRM queue", () => {
  it("shows only real, open, assigned records in the correct source pipeline", async () => {
    const self = await queue.list(advisorId, "SELF");
    expect(self.pipelines.map(pipeline => pipeline.key)).toEqual(["labs", "pba", "genz-builder"]);
    expect(self.shown).toBe(3);
    expect(self.pipelines.map(pipeline => pipeline.items.map(item => item.title))).toEqual([["Assigned Labs enquiry"], ["Assigned PBA enquiry"], ["Assigned GenZ enquiry"]]);
    expect(self.pipelines[0].label).toBe("AIRA Labs enquiries");
    expect(self.pipelines[2].unavailableRecords).toBe(1);
    expect(JSON.stringify(self)).not.toContain("Other company private enquiry");
    expect(JSON.stringify(self)).not.toContain("MY SOLAR");
    const team = await queue.list(directorId, "TEAM");
    expect(team.shown).toBe(3);
    expect(team.pipelines[0].items[0].ownerName).toBe("Queue Advisor");
    expect(JSON.stringify(team)).not.toContain("Other advisor enquiry");
    const crm = createAdvisorCrm(db);
    expect((await crm.list(advisorId, "pba")).rows.map(row => row.title)).toEqual(["Assigned PBA enquiry"]);
    const genz = await crm.list(advisorId, "genz-builder");
    expect(genz.rows.map(row => row.title)).toEqual(["Assigned GenZ enquiry"]);
    expect(genz.unavailableRecords).toBe(1);
  });

  it("fails closed when pipeline authority or reporting is removed", async () => {
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "aira.crm.manage" } });
    const grant = await db.rolePermission.findFirstOrThrow({ where: { roleId: managerRoleId, permissionId: permission.id } });
    await db.rolePermission.delete({ where: { id: grant.id } });
    try {
      const team = await queue.list(directorId, "TEAM");
      expect(team.pipelines[0].state).toBe("AVAILABLE");
      expect(team.pipelines[1].state).toBe("UNAUTHORIZED");
      expect(team.pipelines[2].state).toBe("UNAUTHORIZED");
    } finally { await db.rolePermission.create({ data: { roleId: managerRoleId, permissionId: permission.id } }); }
    await db.reportingRelationship.updateMany({ where: { personId: advisorPersonId }, data: { status: "INACTIVE" } });
    try { expect((await queue.list(directorId, "TEAM")).shown).toBe(0); }
    finally { await db.reportingRelationship.updateMany({ where: { personId: advisorPersonId }, data: { status: "ACTIVE" } }); }
    await db.user.update({ where: { id: advisorId }, data: { status: "SUSPENDED" } });
    await expect(queue.list(advisorId, "SELF")).rejects.toThrow();
  });
});
