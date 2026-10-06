import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomInt, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { initializeGroupStructure } from "@/server/group/structure";
import { provisionBoss } from "@/server/group/provision";
import { BOSS_EMAIL, validateBossConfiguration } from "@/server/group/identity";
import { createAuthenticationService } from "@/server/auth/service";
import { createBossService } from "@/server/group/boss-service";
import { createAccessContext } from "@/server/authorization/engine";
import { canonicalAiraRoles } from "@/server/domain/aira-roles";
import { bossHref, parseBossFilters } from "@/server/group/boss-reliability";
import { createExecutionService } from "@/server/domain/execution-service";

const directory = mkdtempSync(join(tmpdir(), "maxspace-boss-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
let pin = String(randomInt(100000, 1000000));
const secret = randomBytes(32).toString("base64url");
let now = new Date(), userId: string, groupId: string, airaId: string, pearnId: string;
const auth = createAuthenticationService(db, () => now), boss = createBossService(db);
const credentials = () => ({ email: BOSS_EMAIL, password: pin });
beforeAll(async () => {
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close();
  const provision = await provisionBoss(db, { BOSS_PIN: pin }); userId = provision.userId; groupId = provision.groupId;
  airaId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  pearnId = (await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } })).id;
  for (const role of canonicalAiraRoles) await db.role.create({ data: { ...role, organizationId: airaId } });
}, 30000);
beforeEach(async () => { now = new Date(); await db.securityRateBucket.deleteMany(); });
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("MAXPASE group and Boss controls", () => {
  it("validates filters, includes the entire UTC end day, and preserves company/view/filter navigation", () => {
    const query = { from: "2026-10-01", until: "2026-10-06", status: "ACTIVE", projectId: "project", productId: "product", severity: "HIGH" };
    const parsed = parseBossFilters(query);
    expect(parsed.until?.toISOString()).toBe("2026-10-06T23:59:59.999Z");
    expect(parsed.from?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    const url = new URL(bossHref("projects", airaId, query), "https://test.invalid");
    expect(Object.fromEntries(url.searchParams)).toEqual({ view: "projects", companyId: airaId, ...query });
    for (const bad of [{ from: "2026-02-30" }, { from: "2026-10-07", until: "2026-10-06" }, { status: "FORGED" }, { status: ["ACTIVE", "BLOCKED"] }]) expect(() => parseBossFilters(bad)).toThrow();
  });
  it("does not declare an empty company healthy, invent freshness, or equate service readiness with assurance", async () => {
    const data = await boss.dashboard(userId, pearnId);
    expect(data.cards[0].health).toBe("NO_RECORDED_WORK");
    expect(data.executive.companies[0]).toMatchObject({ health: "NO_RECORDED_WORK", reasons: ["Health not established: no recorded work"] });
    expect(data.executive.companies[0].coverage).toContain("readable metrics");
    expect(data.executive.companies[0]).toHaveProperty("evidence.lastUpdated", null);
    expect(data.cards[0].evidence).toMatchObject({ recordCount: 0, lastUpdated: null, freshness: "NO RECORDED WORK" });
    expect(data.cards[0].metrics.find(m => m.name === "Overdue tasks")?.value).toBe(0);
    // This fixture intentionally lacks Prisma migration metadata: readiness must not pretend to pass.
    expect(data.system).toMatchObject({ database: "UNAVAILABLE", application: "REQUEST SERVED", backup: "NOT VERIFIED", monitoring: "NOT VERIFIED", production: "NOT VERIFIED" });
    expect(data.sia).toMatchObject({ status: "NOT CONFIGURED", canAsk: false, capabilities: [], autonomousExecution: false });
  });
  it("filters authorized work by status and UTC update dates without suppressing company health evidence", async () => {
    const active = await db.project.create({ data: { organizationId: airaId, name: "Reliability active", slug: "reliability-active", status: "ACTIVE", updatedAt: new Date("2026-10-06T23:59:59.000Z") } });
    const blocked = await db.project.create({ data: { organizationId: airaId, name: "Reliability blocked", slug: "reliability-blocked", status: "BLOCKED", updatedAt: new Date("2026-10-05T12:00:00Z") } });
    const foreign = await db.project.create({ data: { organizationId: pearnId, name: "Other company project", slug: "reliability-other" } });
    try {
      const data = await boss.dashboard(userId, airaId, parseBossFilters({ status: "ACTIVE", from: "2026-10-06", until: "2026-10-06" }));
      expect(data.executive.projects.map(p => p.id)).toEqual([active.id]);
      expect(data.cards[0].projects.map(p => p.id).sort()).toEqual([active.id, blocked.id].sort());
      expect(data.cards[0].health).toContain("AT_RISK");
      expect(data.cards[0].evidence.lastUpdated?.toISOString()).toBe("2026-10-06T23:59:59.000Z");
      expect((await boss.dashboard(userId, airaId, { status: "COMPLETED" })).executive.projects).toEqual([]);
      await expect(boss.dashboard(userId, airaId, { projectId: foreign.id })).rejects.toThrow();
      const projectSelection = await boss.dashboard(userId, airaId, { projectId: active.id });
      expect(projectSelection.executive.projects.map(p => p.id)).toEqual([active.id]);
      expect(projectSelection.executive.companies[0].metrics.find(m => m.name === "Blocked projects")?.value).toBe(1);
    } finally { await db.project.deleteMany({ where: { id: { in: [active.id, blocked.id, foreign.id] } } }); }
  });
  it("enables SIA only for active identities with intersected tool authority and an available provider", async () => {
    const sia = await db.siaIdentity.create({ data: { name: "Reliability SIA" } });
    const role = await db.role.create({ data: { organizationId: airaId, key: "reliability-sia", name: "Reader", principalType: "AGENT", permissions: { create: { permission: { connect: { key: "executive.read" } } } } } });
    await db.siaRoleAssignment.create({ data: { siaId: sia.id, organizationId: airaId, roleId: role.id } });
    const provider = process.env.SIA_PROVIDER;
    try {
      expect((await boss.dashboard(userId, airaId)).sia).toMatchObject({ status: "NOT AUTHORIZED", canAsk: false });
      await db.siaTool.create({ data: { siaId: sia.id, key: "get_group_overview", name: "Overview", enabled: true, permissionKey: "executive.read" } });
      process.env.SIA_PROVIDER = "deterministic";
      expect((await boss.dashboard(userId, airaId)).sia).toMatchObject({ canAsk: true, capabilities: ["get group overview"], autonomousExecution: false });
      process.env.SIA_PROVIDER = "unsupported";
      expect((await boss.dashboard(userId, airaId)).sia).toMatchObject({ status: "UNAVAILABLE", canAsk: false });
      await db.siaIdentity.update({ where: { id: sia.id }, data: { status: "SUSPENDED" } });
      expect((await boss.dashboard(userId, airaId)).sia).toMatchObject({ status: "NOT CONFIGURED", canAsk: false });
    } finally {
      if (provider === undefined) delete process.env.SIA_PROVIDER; else process.env.SIA_PROVIDER = provider;
      await db.siaRoleAssignment.deleteMany({ where: { siaId: sia.id } });
      await db.siaIdentity.delete({ where: { id: sia.id } });
      await db.rolePermission.deleteMany({ where: { roleId: role.id } });
      await db.role.delete({ where: { id: role.id } });
    }
  });
  it("initializes known structure idempotently without replacing identities, roles or ownership", async () => {
    const before = await db.organization.findMany({ select: { id: true }, orderBy: { id: "asc" } });
    await db.$transaction(initializeGroupStructure);
    expect(await db.organization.findMany({ select: { id: true }, orderBy: { id: "asc" } })).toEqual(before);
    expect(await db.companyProfile.count()).toBe(3);
    expect((await db.organization.findUniqueOrThrow({ where: { id: groupId } })).name).toBe("MAXPASE GROUP");
    const brands = await db.brand.findMany({ orderBy: { website: "asc" } });
    expect(brands.filter(b => b.website).map(b => b.website).sort()).toEqual(["airaskillcity.com", "airastartupskool.com", "airalabs.online", "nicejobs.online", "teachx.guru", "learnx.guru"].map(d => "https://" + d).sort());
    expect(brands.find(b => b.slug === "top-rank-ai")?.website).toBeNull();
    expect(await db.role.count({ where: { organizationId: airaId, canonical: true } })).toBe(60);
    expect(await db.ownershipRelationship.count()).toBe(0);
    const nice = await db.product.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: airaId, slug: "nice-jobs" } }, include: { division: true } });
    expect(nice.division?.slug).toBe("aira-career-hub");
    expect(nice.brandId).toBe(brands.find(b => b.slug === "nice-jobs")?.id);
  });
  it("rejects invalid private configuration before any credential or structure mutation", async () => {
    for (const value of ["", "invalid", "x".repeat(11), "0".repeat(11)]) {
      expect(() => validateBossConfiguration({ BOSS_PIN: value })).toThrow("exactly six numeric digits");
      await expect(provisionBoss(db, { BOSS_PIN: value })).rejects.toThrow();
    }
    expect(() => validateBossConfiguration({ BOSS_EMAIL: "other@test.invalid" })).toThrow();
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash?.startsWith("$2")).toBe(true);
    const prior = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await db.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    try { await expect(provisionBoss(db, { BOSS_PIN: pin })).rejects.toThrow("operator review"); }
    finally { await db.user.update({ where: { id: userId }, data: { status: prior.status } }); }
    const role = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: groupId, key: "group-boss" } } });
    const permission = await db.permission.create({ data: { key: "boss-test.global", name: "Forbidden global authority", scope: "GLOBAL" } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    try { await expect(provisionBoss(db, { BOSS_PIN: pin })).rejects.toThrow("global authority"); }
    finally { await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } }); await db.permission.delete({ where: { id: permission.id } }); }
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash === prior.passwordHash).toBe(true);
  });
  it("authenticates only the Boss PIN route, hashes credentials and creates audited expiring revocable sessions", async () => {
    const login = await auth.loginBoss(credentials(), secret); expect(!!login).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash === pin).toBe(false);
    expect(JSON.stringify(login).includes(pin)).toBe(false);
    expect(await auth.validate(login!.token, secret)).toMatchObject({ userId });
    expect(await db.auditEvent.count({ where: { actorUserId: userId, action: "auth.login", result: "SUCCESS" } })).toBeGreaterThan(0);
    await expect(auth.login(credentials(), secret)).resolves.toBeNull();
    now = new Date(now.getTime() + 8 * 3600000 + 1000); expect(await auth.validate(login!.token, secret)).toBeNull();
    now = new Date(); await auth.revoke(login!.token, secret); expect(await auth.validate(login!.token, secret)).toBeNull();
  });
  it("rejects wrong identity and wrong credential without exposing credentials in audit", async () => {
    const wrong = String((Number(pin) + 1) % 1000000).padStart(6, "0");
    expect(await auth.loginBoss({ email: BOSS_EMAIL, password: wrong }, secret)).toBeNull();
    expect(await auth.loginBoss({ email: "other@test.invalid", password: pin }, secret)).toBeNull();
    const events = await db.auditEvent.findMany({ where: { action: "auth.login", result: "DENIED" } });
    expect(events.length > 0).toBe(true);
    expect(JSON.stringify(events).includes(pin)).toBe(false);
    expect(JSON.stringify(events).includes(wrong)).toBe(false);
  });
  it("rate-limits malformed PIN attempts and enforces a longer daily brute-force budget", async () => {
    for (let i = 0; i < 5; i++) expect(await auth.loginBoss({ email: BOSS_EMAIL, password: "invalid" }, secret)).toBeNull();
    await expect(auth.loginBoss(credentials(), secret)).rejects.toThrow("Too many requests");
    await db.securityRateBucket.deleteMany();
    now = new Date(Date.UTC(2090, 0, 1));
    for (let i = 0; i < 20; i++) { now = new Date(Date.UTC(2090, 0, 1) + i * 16 * 60000); await auth.loginBoss({ email: BOSS_EMAIL, password: "invalid" }, secret); }
    now = new Date(Date.UTC(2090, 0, 1) + 21 * 16 * 60000);
    await expect(auth.loginBoss(credentials(), secret)).rejects.toThrow("Too many requests");
  });
  it("rotates the stored hash explicitly and revokes previous sessions", async () => {
    const login = await auth.loginBoss(credentials(), secret);
    let replacement: string; do { replacement = String(randomInt(100000, 1000000)); } while (replacement === pin);
    await provisionBoss(db, { BOSS_PIN: replacement });
    expect(await auth.validate(login!.token, secret)).toBeNull();
    expect(await auth.loginBoss(credentials(), secret)).toBeNull();
    pin = replacement; expect(!!await auth.loginBoss(credentials(), secret)).toBe(true);
  });
  it("requires both the Boss identity and current scoped authority, not a role title", async () => {
    const user = await db.user.create({ data: { email: "not-boss@test.invalid", personId: (await db.user.findUniqueOrThrow({ where: { id: userId } })).personId } });
    await expect(boss.authority(user.id)).rejects.toThrow();
    await expect(boss.authority("missing-user")).rejects.toThrow();
    const role = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: groupId, key: "group-boss" } } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "boss.access" } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
    try { await expect(boss.authority(userId)).rejects.toThrow(); }
    finally { await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } }); }
  });
  it("shows company workflow shortcuts only while their current capability is granted", async () => {
    const initial = await boss.dashboard(userId, airaId);
    expect(initial.shortcuts.map(s => s.label)).toEqual(expect.arrayContaining(["New project", "New task", "New goal", "New request", "Approval inbox", "My assignments"]));
    const role = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: groupId, key: "group-boss" } } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "task.manage" } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
    try { expect((await boss.dashboard(userId, airaId)).shortcuts.some(s => s.label === "New task")).toBe(false); }
    finally { await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } }); }
    expect(initial.sia.autonomousExecution).toBe(false);
  });
  it("keeps company context isolated and reports real work, unknown ownership and unconfigured SIA", async () => {
    await db.task.create({ data: { organizationId: airaId, title: "AIRA scoped work", dueDate: new Date("2000-01-01"), priority: "CRITICAL" } });
    await db.task.create({ data: { organizationId: pearnId, title: "PEARN confidential work" } });
    const foreign = await db.organization.create({ data: { type: "COMPANY", name: "Unrelated confidential company", slug: "boss-unrelated-company" } });
    await db.task.create({ data: { organizationId: foreign.id, title: "FOREIGN confidential work" } });
    const all = await boss.dashboard(userId); expect(all.cards).toHaveLength(3);
    expect(JSON.stringify(all).includes("FOREIGN confidential work")).toBe(false);
    const selected = await boss.dashboard(userId, airaId);
    expect(selected.executive.tasks.map(t => t.title)).toEqual(["AIRA scoped work"]);
    expect(selected.overview.queues.overdue.map(t => t.title)).toEqual(["AIRA scoped work"]);
    expect(selected.overview.owner(selected.overview.queues.overdue[0])).toBe("Owner not recorded");
    expect(selected.executive.attention.some(a => a.severity === "CRITICAL")).toBe(true);
    expect(JSON.stringify(selected).includes("PEARN confidential work")).toBe(false);
    expect(selected.graph.ownership).toEqual([]); expect(selected.sia.status).toBe("NOT CONFIGURED");
    expect(selected.system.backup).toBe("NOT VERIFIED");
    await expect(boss.dashboard(userId, foreign.id)).rejects.toThrow();
    const ctx = await createAccessContext(userId, db);
    expect((await ctx.decide("task.read", { organizationId: foreign.id })).allowed).toBe(false);
    const ownTask = selected.overview.queues.overdue[0];
    const execution = createExecutionService(db);
    expect((await execution.listPage(userId, "tasks", { recordId: ownTask.id }, { after: "zzz" })).records.map(r => r.id)).toEqual([ownTask.id]);
    const foreignTask = await db.task.findFirstOrThrow({ where: { organizationId: foreign.id } });
    expect((await execution.listPage(userId, "tasks", { recordId: foreignTask.id })).records).toEqual([]);
    expect((await boss.dashboard(userId, airaId, parseBossFilters({ status: "COMPLETED" }))).overview.queues.overdue.map(t => t.id)).toEqual([ownTask.id]);
  });
  it("does not turn company visibility into project/task or SIA authority after revocation", async () => {
    const role = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: groupId, key: "group-boss" } } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "task.read" } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
    try { const data = await boss.dashboard(userId, airaId); expect(data.executive.tasks).toEqual([]); expect(data.sia.status).toBe("NOT CONFIGURED"); expect(data.readable.task).toBe(false); expect(data.cards[0].metrics.find(m => m.name === "Overdue tasks")?.value).toBeNull(); expect(data.cards[0].evidence.readableMetrics).toBeLessThan(data.cards[0].evidence.totalMetrics); }
    finally { await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } }); }
    expect(await db.siaTool.count({ where: { enabled: true } })).toBe(0);
    expect(await db.integration.count()).toBe(0);
  });
  it("rolls session issuance back when mandatory authentication audit fails", async () => {
    const sql = new DatabaseSync(file);
    sql.exec("CREATE TRIGGER BossAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'auth.login' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    const before = await db.session.count();
    try { await expect(auth.loginBoss(credentials(), secret)).rejects.toThrow(); expect(await db.session.count()).toBe(before); }
    finally { sql.exec("DROP TRIGGER BossAuditFailure"); sql.close(); }
  });
  it("shows a standalone task blocker as real company risk with its resolution deadline", async () => {
    const task = await db.task.create({ data: { organizationId: pearnId, title: "Blocked company work" } });
    const expectedResolution = new Date("2026-10-10T10:00:00Z");
    const blocker = await db.executionBlocker.create({ data: { organizationId: pearnId, taskId: task.id, description: "Awaiting a required input", expectedResolution } });
    try {
      const data = await boss.dashboard(userId, pearnId);
      expect(data.cards[0].health).toBe("AT_RISK");
      expect(data.overview.queues.blockers).toMatchObject([{ id: blocker.id, dueAt: expectedResolution }]);
      expect(data.executive.companies[0].reasons).toContain("Open recorded blockers");
      expect(data.overview.urgent[0].row.id).toBe(blocker.id);
    } finally { await db.executionBlocker.delete({ where: { id: blocker.id } }); await db.task.delete({ where: { id: task.id } }); }
  });
});
