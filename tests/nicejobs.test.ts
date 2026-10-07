import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { createNiceJobsService } from "@/server/nicejobs/service";
import { versionInput } from "@/server/nicejobs/input";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phase01-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") }), service = createNiceJobsService(db);
let company: string, labs: string, startup: string, foreign: string, admin: string, limited: string, outsider: string, worker: string, foreignWorker: string, roleId: string;
let jobs: Awaited<ReturnType<typeof service.seedKnown>>;
const job = () => jobs.find(j => j.title === "Business Development Manager")!;
const change = async (to: string, versionId = job().id) => {
  const v = (await service.detail(admin, versionId)).version;
  await service.changeJob(admin, { id: v.id, revision: ["PAUSED", "ARCHIVED"].includes(to) || v.publishedAt ? v.template.revision : v.revision, to, reason: "Explicit isolated human decision" });
};
async function human(email: string, organizationId: string, keys: string[], descendants = false) {
  const p = await db.person.create({ data: { displayName: email.split("@")[0] } });
  const user = await db.user.create({ data: { email, personId: p.id } });
  const role = await db.role.create({ data: { organizationId, key: email.split("@")[0], name: "Test role", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: p.id, organizationId, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } });
  return { userId: user.id, personId: p.id, roleId: role.id };
}
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close(); await db.$transaction(initializeGroupStructure);
  for (const p of workforcePermissions) await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  await db.permission.upsert({ where: { key: "organization.read" }, update: {}, create: { key: "organization.read", name: "Read organization", scope: "GROUP" } });
  company = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  labs = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  startup = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-startup-school" } })).id;
  foreign = (await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } })).id;
  const keys = workforcePermissions.filter(p => p.key.startsWith("nicejobs.") || p.key === "person.read").map(p => p.key);
  const manager = await human("manager@test.invalid", company, keys, true); admin = manager.userId; roleId = manager.roleId;
  limited = (await human("labs-reader@test.invalid", labs, keys)).userId;
  outsider = (await human("outsider@test.invalid", foreign, keys, true)).userId;
  worker = (await human("known-worker@test.invalid", company, [], true)).personId;
  foreignWorker = (await human("foreign-worker@test.invalid", foreign, [], true)).personId;
}, 30000);
beforeEach(async () => {
  await db.niceJobsAssignment.deleteMany(); await db.niceJobsWorkerProfile.deleteMany();
  await db.niceJobsTemplate.updateMany({ data: { publishedVersionId: null } });
  await db.niceJobsVersionArea.deleteMany(); await db.niceJobsVersion.deleteMany(); await db.niceJobsTemplate.deleteMany();
  jobs = await service.seedKnown(admin);
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Nice Jobs workforce and versioned job foundation", () => {
  it("seeds only the two supplied draft jobs, idempotently, without workforce or invented rules", async () => {
    expect(jobs.map(j => j.title)).toEqual(["Academic Advisor \u2014 Junior", "Business Development Manager"]);
    await service.seedKnown(admin);
    expect(await db.niceJobsTemplate.count()).toBe(2); expect(await db.niceJobsVersion.count()).toBe(2);
    expect(await db.niceJobsWorkerProfile.count()).toBe(0);
    expect(jobs.every(j => j.configuration === null && j.status === "DRAFT")).toBe(true);
    expect((await service.detail(admin, jobs[0].id)).version.areas).toHaveLength(2);
  });
  it("creates future drafts with explicit scoped permission and rejects unauthorized or forged company areas", async () => {
    const raw = { code: "TEST-003", title: "Explicit test-only job", divisionIds: [labs] };
    const v = await service.create(admin, raw); expect(v.status).toBe("DRAFT");
    await expect(service.create(outsider, { ...raw, code: "TEST-004" })).rejects.toThrow();
    await expect(service.create(limited, { ...raw, code: "TEST-005" })).rejects.toThrow();
    await expect(service.create(admin, { ...raw, code: "TEST-006", divisionIds: [foreign] })).rejects.toThrow();
    await expect(service.create(admin, { ...raw, code: "TEST-007", actorUserId: admin })).rejects.toThrow();
  });
  it("keeps versions immutable after publication and preserves assignment v1 when v2 is published", async () => {
    await change("PUBLISHED");
    const assignment = await service.assign(admin, { personId: worker, versionId: job().id, divisionId: labs });
    await expect(service.edit(admin, job().id, 1, { title: "Changed", divisionIds: [labs] })).rejects.toThrow();
    const original = (await service.detail(admin, job().id)).version;
    const v2 = await service.newVersion(admin, job().id, original.template.revision);
    await service.edit(admin, v2.id, 0, { title: "Explicit test revision", divisionIds: [labs] });
    await change("PUBLISHED", v2.id);
    expect((await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).versionId).toBe(job().id);
    expect((await service.detail(admin, job().id)).version.title).toBe("Business Development Manager");
    expect((await service.detail(admin, v2.id)).version.number).toBe(2);
    expect((await service.jobs(admin, { status: "PUBLISHED" })).records.map(r => r.id)).toEqual([v2.id]);
    const other = await human("old-version-worker@test.invalid", labs, []);
    await expect(service.assign(admin, { personId: other.personId, versionId: job().id, divisionId: labs })).rejects.toThrow();
  });
  it("controls review, publication, pause and archive; stale requests cannot replay a transition", async () => {
    await change("REVIEW"); await change("PUBLISHED"); await change("PAUSED");
    await expect(service.assign(admin, { personId: worker, versionId: job().id, divisionId: labs })).rejects.toThrow();
    await change("PUBLISHED");
    const v = (await service.detail(admin, job().id)).version;
    await service.changeJob(admin, { id: v.id, revision: v.template.revision, to: "ARCHIVED", reason: "Archive fixture" });
    await expect(service.changeJob(admin, { id: v.id, revision: v.template.revision, to: "PUBLISHED", reason: "Replay" })).rejects.toThrow();
    await expect(service.assign(admin, { personId: worker, versionId: job().id, divisionId: labs })).rejects.toThrow();
  });
  it("does not treat drafts as published jobs or assignable opportunities", async () => {
    expect((await service.jobs(admin, { status: "PUBLISHED" })).records).toEqual([]);
    await expect(service.assign(admin, { personId: worker, versionId: job().id, divisionId: labs })).rejects.toThrow();
    await expect(service.changeJob(outsider, { id: job().id, revision: 0, to: "PUBLISHED", reason: "Unauthorized" })).rejects.toThrow();
  });
  it("enforces current publication authority independently of editing and role titles", async () => {
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "nicejobs.job.publish" } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId, permissionId: permission.id } } });
    try { await expect(change("PUBLISHED")).rejects.toThrow(); }
    finally { await db.rolePermission.create({ data: { roleId, permissionId: permission.id } }); }
  });
  it("creates a minimal profile and pinned assignment with unknown dates, and rejects duplicates", async () => {
    await change("PUBLISHED");
    const userCount = await db.user.count(), membershipCount = await db.membership.count();
    const a = await service.assign(admin, { personId: worker, versionId: job().id, divisionId: labs });
    expect(a).toMatchObject({ status: "PREPARED", lifecycle: "APPLICANT", startDate: null, endDate: null });
    const raw = { personId: worker, versionId: job().id, divisionId: labs };
    await expect(service.assign(admin, raw)).rejects.toThrow();
    expect(await db.niceJobsWorkerProfile.count()).toBe(1); expect(await db.niceJobsAssignment.count()).toBe(1);
    expect(await db.user.count()).toBe(userCount); expect(await db.membership.count()).toBe(membershipCount);
  });
  it("denies unauthorized assignments, cross-company humans, invalid business areas and self-supervision", async () => {
    await change("PUBLISHED");
    const raw = { personId: worker, versionId: job().id, divisionId: labs };
    await expect(service.assign(outsider, raw)).rejects.toThrow();
    await expect(service.assign(admin, { ...raw, personId: foreignWorker })).rejects.toThrow();
    await expect(service.assign(admin, { ...raw, divisionId: startup })).rejects.toThrow();
    await expect(service.assign(admin, { ...raw, managerId: foreignWorker })).rejects.toThrow();
    await expect(service.assign(admin, { ...raw, managerId: worker })).rejects.toThrow();
    expect(await db.niceJobsWorkerProfile.count()).toBe(0);
  });
  it("requires current date-valid membership and active Person for assignment", async () => {
    await change("PUBLISHED");
    await db.membership.updateMany({ where: { personId: worker }, data: { endDate: new Date(0) } });
    try { await expect(service.assign(admin, { personId: worker, versionId: job().id, divisionId: labs })).rejects.toThrow(); }
    finally { await db.membership.updateMany({ where: { personId: worker }, data: { endDate: null } }); }
  });
  it("records only allowed human lifecycle transitions; skipping, replay and termination are denied", async () => {
    await change("PUBLISHED");
    const a = await service.assign(admin, { personId: worker, versionId: job().id, divisionId: labs });
    await expect(service.transition(admin, { id: a.id, revision: 0, to: "ACTIVE", reason: "Skip training" })).rejects.toThrow();
    await service.transition(admin, { id: a.id, revision: 0, to: "APPROVED", reason: "Human attestation fixture" });
    await expect(service.transition(admin, { id: a.id, revision: 0, to: "OFFERED", reason: "Stale" })).rejects.toThrow();
    await expect(service.transition(admin, { id: a.id, revision: 1, to: "EXITED", reason: "Termination is deferred" })).rejects.toThrow();
    await expect(service.transition(outsider, { id: a.id, revision: 1, to: "OFFERED", reason: "Forged scope" })).rejects.toThrow();
    expect((await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: a.id } })).lifecycle).toBe("APPROVED");
  });
  it("filters workforce by actual company, division, job, status, lifecycle and person search", async () => {
    await change("PUBLISHED"); await change("PUBLISHED", jobs[0].id);
    await service.assign(admin, { personId: worker, versionId: job().id, divisionId: labs });
    const second = await human("second-worker@test.invalid", startup, []);
    await service.assign(admin, { personId: second.personId, versionId: jobs[0].id, divisionId: startup });
    expect((await service.workforce(admin, { companyId: company, divisionId: labs, jobId: job().templateId, assignmentStatus: "PREPARED", lifecycle: "APPLICANT", search: "known-worker" })).records).toHaveLength(1);
    expect((await service.workforce(limited)).records).toHaveLength(1);
    expect((await service.workforce(admin, { divisionId: labs, search: "no matching human" })).records).toEqual([]);
    await expect(service.workforce(admin, { companyId: foreign })).rejects.toThrow();
    await expect(service.workforce(limited, { divisionId: startup })).rejects.toThrow();
    await expect(service.workforce(outsider)).rejects.toThrow();
    expect(JSON.stringify((await service.workforce(limited)).records)).not.toContain("second-worker");
  });
  it("uses database pagination and bounded selected relationships for jobs, people and workforce", async () => {
    await change("PUBLISHED");
    for (let i = 0; i < 4; i++) {
      const p = await human(`paged-worker-${i}@test.invalid`, labs, []);
      await service.assign(admin, { personId: p.personId, versionId: job().id, divisionId: labs });
    }
    const first = await service.workforce(admin, { limit: 2 });
    const second = await service.workforce(admin, { after: first.nextCursor!, limit: 2 });
    expect(first.records).toHaveLength(2); expect(second.records).toHaveLength(2);
    expect(second.nextCursor).toBeNull(); expect(new Set([...first.records, ...second.records].map(r => r.id)).size).toBe(4);
    const page = await service.jobs(admin, { limit: 1 });
    expect(page.records).toHaveLength(1); expect((await service.jobs(admin, { limit: 1, after: page.nextCursor! })).records).toHaveLength(1);
    await expect(service.workforce(admin, { limit: 100001 })).rejects.toThrow();
    expect((await service.people(admin, labs)).records.length).toBeLessThanOrEqual(25);
  });
  it("does not disclose multi-area jobs to a reader missing an area or accept foreign filters", async () => {
    expect((await service.jobs(limited)).records.map(j => j.title)).toEqual(["Business Development Manager"]);
    await expect(service.detail(limited, jobs[0].id)).rejects.toThrow();
    await expect(service.jobs(admin, { companyId: foreign })).rejects.toThrow();
    await expect(service.jobs(limited, { divisionId: startup })).rejects.toThrow();
  });
  it("validates non-executable optional configuration without inventing screening rules", () => {
    expect(versionInput.parse({ title: "Configured later", divisionIds: [labs] }).configuration).toBeNull();
    expect(versionInput.safeParse({ title: "Unsafe", divisionIds: [labs], configuration: { schemaVersion: 1, executable: "script" } }).success).toBe(false);
    expect(versionInput.safeParse({ title: "Unsafe", divisionIds: [labs], configuration: { schemaVersion: 1, requirements: [{ category: "Unknown", description: "Unknown" }] } }).success).toBe(false);
  });
  it("keeps the workforce result bounded with 100,001 isolated fixture workers", async () => {
    await change("PUBLISHED");
    const sql = new DatabaseSync(file);
    try {
      sql.exec("BEGIN");
      sql.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100001) INSERT INTO Person(id,displayName,status,createdAt,updatedAt) SELECT 'large-worker-'||x,'Large fixture worker '||x,'ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM n");
      sql.prepare("INSERT INTO NiceJobsWorkerProfile(id,personId,companyId,createdAt,updatedAt) SELECT 'large-profile-'||id,id,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM Person WHERE id LIKE 'large-worker-%'").run(company);
      sql.prepare("INSERT INTO NiceJobsAssignment(id,profileId,versionId,divisionId,status,lifecycle,createdAt,updatedAt) SELECT 'large-assignment-'||id,id,?,?,'PREPARED','APPLICANT',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM NiceJobsWorkerProfile WHERE id LIKE 'large-profile-%'").run(job().id, labs);
      sql.exec("COMMIT");
      const started = performance.now(), first = await service.workforce(limited, { divisionId: labs, limit: 25 });
      const second = await service.workforce(limited, { divisionId: labs, limit: 25, after: first.nextCursor! });
      expect(first.records).toHaveLength(25); expect(second.records).toHaveLength(25);
      expect(new Set([...first.records, ...second.records].map(r => r.id)).size).toBe(50);
      const plan = sql.prepare("EXPLAIN QUERY PLAN SELECT id FROM NiceJobsAssignment WHERE divisionId=? AND status=? AND id>? ORDER BY id LIMIT 26").all(labs, "PREPARED", "large-assignment-");
      expect(JSON.stringify(plan)).toContain("NiceJobsAssignment_divisionId_status_id_idx");
      console.log(`Nice Jobs isolated 100,001-worker fixture: two 25-row pages in ${(performance.now() - started).toFixed(1)}ms; composite index selected. Not production load certification.`);
    } finally {
      sql.exec("DELETE FROM NiceJobsAssignment WHERE id LIKE 'large-assignment-%'; DELETE FROM NiceJobsWorkerProfile WHERE id LIKE 'large-profile-%'; DELETE FROM Person WHERE id LIKE 'large-worker-%'");
      sql.close();
    }
  }, 30000);
  it("upgrades a populated pre-Phase01 database additively and restores the earlier snapshot without deleting identities", () => {
    const oldFile = join(directory, "upgrade.db"), backupFile = join(directory, "pre-nicejobs.db");
    const old = new DatabaseSync(oldFile);
    try {
      const folders = readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort();
      const phase01 = folders.indexOf("20261007100000_nicejobs_workforce");
      expect(phase01).toBeGreaterThan(0);
      for (const folder of folders.slice(0, phase01)) old.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
      old.exec("INSERT INTO Person(id,displayName,status,createdAt,updatedAt) VALUES('retained-person','Existing fixture person','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
      old.prepare("VACUUM INTO ?").run(backupFile);
      for (const folder of folders.slice(phase01)) old.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
      expect(old.prepare("SELECT displayName FROM Person WHERE id='retained-person'").get()?.displayName).toBe("Existing fixture person");
      expect(old.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe("ok");
      expect(old.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      const restored = new DatabaseSync(backupFile);
      try {
        expect(restored.prepare("SELECT displayName FROM Person WHERE id='retained-person'").get()?.displayName).toBe("Existing fixture person");
        expect(restored.prepare("SELECT name FROM sqlite_master WHERE name='NiceJobsTemplate'").get()).toBeUndefined();
        for (const folder of folders.slice(phase01)) restored.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
        expect(restored.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe("ok");
      } finally { restored.close(); }
    } finally { old.close(); }
  });
  it("rolls back publication, profile creation and assignment when mandatory audit insertion fails", async () => {
    const sql = new DatabaseSync(file);
    sql.exec("CREATE TRIGGER NiceJobsAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action LIKE 'nicejobs.%' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    try {
      await expect(change("PUBLISHED")).rejects.toThrow();
      expect((await service.detail(admin, job().id)).version.publishedAt).toBeNull();
    } finally { sql.exec("DROP TRIGGER NiceJobsAuditFailure"); }
    await change("PUBLISHED");
    sql.exec("CREATE TRIGGER NiceJobsAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'nicejobs.assignment.created' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    try {
      await expect(service.assign(admin, { personId: worker, versionId: job().id, divisionId: labs })).rejects.toThrow();
      expect(await db.niceJobsWorkerProfile.count()).toBe(0); expect(await db.niceJobsAssignment.count()).toBe(0);
    } finally { sql.exec("DROP TRIGGER NiceJobsAuditFailure"); sql.close(); }
  });
  it("denies revoked authority on the next operation and preserves actor/scope/history audit", async () => {
    await change("PUBLISHED");
    const a = await service.assign(admin, { personId: worker, versionId: job().id, divisionId: labs });
    await service.transition(admin, { id: a.id, revision: 0, to: "APPROVED", reason: "Reviewed by a human" });
    const event = await db.auditEvent.findFirstOrThrow({ where: { action: "nicejobs.worker.transitioned", entityId: a.id } });
    expect(event.actorUserId).toBe(admin); expect(event.organizationId).toBe(labs); expect(event.metadata).toContain("APPLICANT");
    await db.membership.updateMany({ where: { roles: { some: { roleId } } }, data: { status: "SUSPENDED" } });
    try { await expect(service.workforce(admin)).rejects.toThrow(); }
    finally { await db.membership.updateMany({ where: { roles: { some: { roleId } } }, data: { status: "ACTIVE" } }); }
  });
  it("fails closed on inactive product or company configuration, never presenting unavailable workforce as a zero", async () => {
    const product = await db.product.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: company, slug: "nice-jobs" } } });
    await db.product.update({ where: { id: product.id }, data: { status: "SUSPENDED" } });
    try { await expect(service.workforce(admin)).rejects.toThrow("Nice Jobs is unavailable"); }
    finally { await db.product.update({ where: { id: product.id }, data: { status: "ACTIVE" } }); }
    await db.companyProfile.update({ where: { organizationId: company }, data: { status: "SUSPENDED" } });
    try { await expect(service.jobs(admin)).rejects.toThrow("Nice Jobs is unavailable"); }
    finally { await db.companyProfile.update({ where: { organizationId: company }, data: { status: "ACTIVE" } }); }
  });
});
