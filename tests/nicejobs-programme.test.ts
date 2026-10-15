import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { createNiceJobsService } from "@/server/nicejobs/service";
import { configuration } from "@/server/nicejobs/input";
import { fixtureOpportunity } from "./fixtures/nicejobs-opportunity";
import { fixtureProgramme } from "./fixtures/nicejobs-programme";
import { createApplicationService } from "@/server/nicejobs/applications";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-programme-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") }), service = createNiceJobsService(db);
let company: string, labs: string, startup: string, admin: string, foreign: string, reader: string, reviewer: string, reviewerRole: string, limited: string, candidate: string;
let version: Awaited<ReturnType<typeof service.create>>;
async function human(name: string, organizationId: string, keys: string[], descendants = false) {
  const person = await db.person.create({ data: { displayName: name } });
  const user = await db.user.create({ data: { email: `${name}@test.invalid`, personId: person.id } });
  const role = await db.role.create({ data: { key: person.id, name: "Nominated title is not authority", organizationId, permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } });
  return { id: user.id, roleId: role.id };
}
async function data() { return { title: "Synthetic launch role", description: "Synthetic complete disclosure", engagement: "CONTRACT", divisionIds: [labs], configuration: { schemaVersion: 1, opportunity: await fixtureOpportunity(db, admin), ...fixtureProgramme(admin) } }; }
async function move(to: string, id = version.id, actor = admin) {
  const v = (await service.detail(admin, id)).version;
  return service.changeJob(actor, { id, revision: v.publishedAt ? v.template.revision : v.revision, to, reason: "Explicit isolated human decision" });
}
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close(); await db.$transaction(initializeGroupStructure);
  for (const p of workforcePermissions) await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  await db.permission.upsert({ where: { key: "organization.read" }, update: {}, create: { key: "organization.read", name: "Read organization", scope: "GROUP" } });
  const org = async (slug: string) => (await db.organization.findUniqueOrThrow({ where: { slug } })).id;
  company = await org("aira-skill-city"); labs = await org("aira-labs"); startup = await org("aira-startup-school");
  const keys = workforcePermissions.filter(p => p.key.startsWith("nicejobs.") || p.key === "person.read").map(p => p.key);
  admin = (await human("programme-admin", company, keys, true)).id;
  foreign = (await human("foreign-admin", await org("pearn"), keys, true)).id;
  reader = (await human("programme-reader", company, ["nicejobs.job.read"], true)).id;
  const r = await human("training-reviewer", company, ["nicejobs.ojt.review", "nicejobs.readiness.review"], true); reviewer = r.id; reviewerRole = r.roleId;
  limited = (await human("single-area-reviewer", labs, ["nicejobs.ojt.review", "nicejobs.readiness.review"])).id;
  candidate = (await human("programme-candidate", await org("aira-career-hub"), ["organization.read", "nicejobs.application.self"])).id;
}, 30000);
beforeEach(async () => {
  await db.niceJobsApplicationHistory.deleteMany(); await db.niceJobsApplication.deleteMany(); await db.niceJobsApplicationSequence.deleteMany();
  await db.niceJobsTemplate.updateMany({ data: { publishedVersionId: null } });
  await db.niceJobsVersionArea.deleteMany(); await db.niceJobsVersion.deleteMany(); await db.niceJobsTemplate.deleteMany();
  version = await service.create(admin, { code: "JOB-BAM", visibility: "PUBLIC", ...await data() });
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Job and programme setup", () => {
  it("keeps incomplete 100-day schedules in draft and blocks duration-only or missing-day readiness", async()=>{
    const raw=await data();raw.configuration.ojt.stages[9].activities.pop();
    await service.edit(admin,version.id,0,raw);
    expect((await service.detail(admin,version.id)).setup.items.find(i=>i.key==="curriculum")?.issues.join(" ")).toContain("100");
    await expect(move("PENDING_VERIFICATION")).rejects.toThrow("Missing or duplicate days");
    expect((await service.detail(admin,version.id)).version.status).toBe("DRAFT");
    await expect(service.edit(admin,version.id,1,{...raw,configuration:{...raw.configuration,ojt:null}})).rejects.toThrow("cannot be removed");
    const durationOnly={...raw.configuration.ojt,curriculum:null};
    await expect(service.edit(admin,version.id,1,{...raw,configuration:{...raw.configuration,ojt:durationOnly}})).rejects.toThrow();
  });
  it("rejects unresolved or out-of-scope day learning files at review instead of trusting a supplied ID",async()=>{
    const raw=await data();raw.configuration.ojt.stages[0].activities[0].reference="unknown-file-version";
    await service.edit(admin,version.id,0,raw);await expect(move("PENDING_VERIFICATION")).rejects.toThrow("learning file is unavailable");
    expect((await service.detail(admin,version.id)).version.status).toBe("DRAFT");
  });
  it("shows complete inputs without claiming approval; requires review then approval and rejects replay", async () => {
    expect((await service.detail(admin, version.id)).setup).toMatchObject({ required: true, ready: true, issues: [] });
    await expect(move("PUBLISHED")).rejects.toThrow("Submit the complete draft");
    await expect(move("APPROVED")).rejects.toThrow("Submit the complete draft");
    await move("PENDING_VERIFICATION");
    await expect(move("PUBLISHED")).rejects.toThrow("Submit the complete draft");
    await move("APPROVED"); await move("PUBLISHED");
    await expect(service.changeJob(admin, { id: version.id, revision: 2, to: "PUBLISHED", reason: "Replay" })).rejects.toThrow();
    const events = await db.auditEvent.findMany({ where: { entityId: version.id, action: { in: ["nicejobs.job.pending_verification", "nicejobs.job.approved", "nicejobs.job.published"] } } });
    expect(events).toHaveLength(3); expect(events.every(event => event.actorUserId === admin && event.organizationId === company)).toBe(true);
  });
  it("keeps each of the three owner drafts blocked with visible missing requirements", async () => {
    await db.niceJobsVersionArea.deleteMany(); await db.niceJobsVersion.deleteMany(); await db.niceJobsTemplate.deleteMany();
    const drafts = await service.seedInitialOpportunities(admin);
    for (const draft of drafts) {
      const detail = await service.detail(admin, draft.id);
      expect(detail.setup.required).toBe(true); expect(detail.setup.ready).toBe(false);
      expect(detail.setup.items.map(item => item.key)).toEqual(["disclosure", "manager", "reviewers", "approvals", "orientation", "outcomes", "curriculum"]);
      await expect(move("PENDING_VERIFICATION", draft.id)).rejects.toThrow();
      await expect(move("PUBLISHED", draft.id)).rejects.toThrow();
      expect((await service.detail(admin, draft.id)).version.status).toBe("DRAFT");
    }
    expect((await service.detail(admin, drafts[2].id)).setup.issues.join(" ")).toContain("Legal employer");
  });
  it("does not bypass launch gates by clearing setup, weakening orientation or changing audience", async () => {
    const raw = await data();
    await expect(service.edit(admin, version.id, 0, { ...raw, configuration: { schemaVersion: 1, opportunity: raw.configuration.opportunity } })).rejects.toThrow("cannot be removed");
    await service.edit(admin, version.id, 0, { ...raw, configuration: { ...raw.configuration, programmeSetup: { ...raw.configuration.programmeSetup, trainingOutcomes: "" } } });
    const v = (await service.detail(admin, version.id)).version;
    await service.visibility(admin, { id: version.id, revision: v.template.revision, to: "INTERNAL", reason: "Synthetic audience" });
    expect((await service.detail(admin, version.id)).setup.ready).toBe(false);
    await expect(move("PENDING_VERIFICATION")).rejects.toThrow();
    await service.edit(admin, version.id, 1, { ...raw, configuration: { ...raw.configuration, preOfferRequired: false } });
    expect((await service.detail(admin, version.id)).setup.items.find(item => item.key === "orientation")?.issues).toHaveLength(1);
    await expect(move("PENDING_VERIFICATION")).rejects.toThrow();
  });
  it("requires exact manager identity and current reviewer scope, not names or existing accounts", async () => {
    const raw = await data();
    for (const id of [reader, foreign, "not-an-account"]) {
      await service.edit(admin, version.id, (await service.detail(admin, version.id)).version.revision, { ...raw, configuration: { ...raw.configuration, programmeSetup: { ...raw.configuration.programmeSetup, ojtReviewerUserId: id } } });
      expect((await service.detail(admin, version.id)).setup.items.find(item => item.key === "reviewers")?.issues.length).toBeGreaterThan(0);
      await expect(move("PENDING_VERIFICATION")).rejects.toThrow();
    }
    await service.edit(admin, version.id, 3, { ...raw, configuration: { ...raw.configuration, programmeSetup: { ...raw.configuration.programmeSetup, managerUserId: reviewer } } });
    expect((await service.detail(admin, version.id)).setup.items.find(item => item.key === "manager")?.issues.length).toBeGreaterThan(0);
    await expect(move("PENDING_VERIFICATION", version.id, foreign)).rejects.toThrow();
    await expect(service.changeJob(admin, { id: version.id, revision: 4, to: "APPROVED", reason: "Forged identity", actorUserId: foreign })).rejects.toThrow();
  });
  it("rechecks revoked permissions and inactive accounts at publication and resume", async () => {
    const raw = await data();
    await service.edit(admin, version.id, 0, { ...raw, configuration: { ...raw.configuration, programmeSetup: { ...raw.configuration.programmeSetup, ojtReviewerUserId: reviewer, readinessReviewerUserId: reviewer } } });
    await move("PENDING_VERIFICATION"); await move("APPROVED");
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "nicejobs.ojt.review" } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: reviewerRole, permissionId: permission.id } } });
    try { await expect(move("PUBLISHED")).rejects.toThrow("OJT reviewer"); }
    finally { await db.rolePermission.create({ data: { roleId: reviewerRole, permissionId: permission.id } }); }
    await db.user.update({ where: { id: reviewer }, data: { status: "SUSPENDED" } });
    try { await expect(move("PUBLISHED")).rejects.toThrow("reviewer"); }
    finally { await db.user.update({ where: { id: reviewer }, data: { status: "ACTIVE" } }); }
    await move("PUBLISHED"); await move("PAUSED");
    await db.membership.updateMany({ where: { roles: { some: { roleId: reviewerRole } } }, data: { endDate: new Date(0) } });
    try { await expect(move("PUBLISHED")).rejects.toThrow("reviewer"); }
    finally { await db.membership.updateMany({ where: { roles: { some: { roleId: reviewerRole } } }, data: { endDate: null } }); }
  });
  it("requires reviewers across all areas and rejects programme changes without configuration authority", async () => {
    const raw = await data();
    await service.edit(admin, version.id, 0, { ...raw, divisionIds: [labs, startup], configuration: { ...raw.configuration, programmeSetup: { ...raw.configuration.programmeSetup, ojtReviewerUserId: limited } } });
    expect((await service.detail(admin, version.id)).setup.ready).toBe(false); await expect(move("PENDING_VERIFICATION")).rejects.toThrow();
    const editor = await human("job-editor", company, ["nicejobs.job.read", "nicejobs.job.edit", "person.read"], true);
    await expect(service.edit(editor.id, version.id, 1, raw)).rejects.toThrow();
    await expect(service.opportunityOptions(foreign, version.id)).rejects.toThrow();
    const choices = await service.opportunityOptions(admin, version.id);
    expect(choices.accounts.some(account => account.id === foreign)).toBe(false);
  });
  it("flags changed canonical employer identity before review instead of trusting a confirmed field", async () => {
    const employer = await db.companyProfile.findUniqueOrThrow({ where: { organizationId: company } });
    await db.companyProfile.update({ where: { organizationId: company }, data: { legalName: "Changed synthetic legal identity" } });
    try {
      expect((await service.detail(admin, version.id)).setup.issues).toContain("Verify the canonical legal employer and recruitment authority.");
      await expect(move("PENDING_VERIFICATION")).rejects.toThrow("canonical legal employer");
    } finally { await db.companyProfile.update({ where: { organizationId: company }, data: { legalName: employer.legalName } }); }
  });
  it("returning to draft invalidates approval, keeps published versions immutable and audits atomically", async () => {
    await move("PENDING_VERIFICATION"); await move("APPROVED"); await move("DRAFT");
    const raw = await data(); await service.edit(admin, version.id, 3, { ...raw, configuration: { ...raw.configuration, programmeSetup: { ...raw.configuration.programmeSetup, trainingOutcomes: "" } } });
    await expect(move("PUBLISHED")).rejects.toThrow();
    await service.edit(admin, version.id, 4, raw); await move("PENDING_VERIFICATION");
    const sql = new DatabaseSync(file);
    sql.exec("CREATE TRIGGER ProgrammeAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'nicejobs.job.approved' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    try {
      await expect(move("APPROVED")).rejects.toThrow();
      expect((await service.detail(admin, version.id)).version.status).toBe("PENDING_VERIFICATION");
    } finally { sql.exec("DROP TRIGGER ProgrammeAuditFailure"); sql.close(); }
    await move("APPROVED"); await move("PUBLISHED");
    const published = (await service.detail(admin, version.id)).version;
    await expect(service.edit(admin, version.id, published.revision, raw)).rejects.toThrow();
    const next = await service.newVersion(admin, version.id, published.template.revision);
    await expect(move("PUBLISHED", next.id)).rejects.toThrow("Submit the complete draft");
  });
  it("validates strict non-executable setup and explicitly gates future opted-in roles", async () => {
    const raw = await data();
    expect(configuration.safeParse({ ...raw.configuration, programmeSetup: { ...raw.configuration.programmeSetup, execute: "script" } }).success).toBe(false);
    const future = await service.create(admin, { code: "FUTURE-PROGRAMME", ...raw });
    expect((await service.detail(admin, future.id)).setup.required).toBe(true);
    await expect(move("PUBLISHED", future.id)).rejects.toThrow("Submit the complete draft");
    await expect(service.edit(admin, future.id, 0, { ...raw, configuration: { schemaVersion: 1, opportunity: raw.configuration.opportunity } })).rejects.toThrow("cannot be removed");
  });
  it("restricts approval to the nominated reviewer even when another human has publishing permission", async () => {
    const publisher = await human("other-publisher", company, ["nicejobs.job.read", "nicejobs.job.publish"], true);
    await move("PENDING_VERIFICATION");
    const detail = await service.detail(publisher.id, version.id);
    expect(detail.capabilities.publish).toBe(true); expect(detail.capabilities.programmeApproval).toBe(false);
    await expect(move("APPROVED", version.id, publisher.id)).rejects.toThrow("different authorized publication reviewer");
    await move("APPROVED");
  });
  it("hides incomplete published setup, blocks direct creation and submission, and keeps evidence private", async () => {
    const applications = createApplicationService(db);
    await move("PENDING_VERIFICATION"); await move("APPROVED"); await move("PUBLISHED");
    const publicResult = await applications.publicOpportunities({ kind: "jobs" });
    expect(publicResult.records.map(row => row.id)).toEqual([version.id]);
    expect(JSON.stringify(publicResult)).not.toContain("programme-admin");
    expect(JSON.stringify(publicResult)).not.toContain("Synthetic engagement approval");
    const application = await applications.create(candidate, { versionId: version.id, divisionId: labs });
    // A malformed legacy/imported record is not made valid merely by its published status.
    const raw = await data();
    await db.niceJobsVersion.update({ where: { id: version.id }, data: { configuration: JSON.stringify({ ...raw.configuration, programmeSetup: { ...raw.configuration.programmeSetup, trainingOutcomes: "" } }) } });
    expect((await applications.publicOpportunities({ kind: "jobs" })).records).toEqual([]);
    expect((await applications.opportunities(candidate)).records).toEqual([]);
    expect((await applications.detail(candidate, application.reference, true)).canEdit).toBe(false);
    await expect(applications.create(candidate, { versionId: version.id, divisionId: labs })).rejects.toThrow("programme setup is incomplete");
    await expect(applications.mutate(candidate, { reference: application.reference, revision: 0, action: "SUBMIT", answers: {} })).rejects.toThrow("programme setup is incomplete");
    expect((await applications.detail(candidate, application.reference, true)).status).toBe("DRAFT");
  });
});
