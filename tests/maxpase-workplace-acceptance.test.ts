import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createPostgresFixture } from "./helpers/postgres-fixture";
import { provisionBoss } from "@/server/group/provision";
import { BOSS_EMAIL } from "@/server/group/identity";
import { createAuthenticationService } from "@/server/auth/service";
import { hashPassword } from "@/server/auth/password";
import { createBossService } from "@/server/group/boss-service";
import { createSkillCityManagerDesk } from "@/server/skillcity/manager-desk";
import { createSkillCityDeveloperDesk } from "@/server/skillcity/developer-desk";

const postgres = createPostgresFixture();
const db = postgres.db;
const now = () => new Date("2026-10-24T06:00:00Z");
const pin = String(randomInt(100000, 1000000));
const password = "synthetic-acceptance-password";
const secret = randomBytes(32).toString("base64url");
const auth = createAuthenticationService(db);
const boss = createBossService(db);
const managerDesk = createSkillCityManagerDesk(db, now);
const developerDesk = createSkillCityDeveloperDesk(db, now);
let bossId: string, managerId: string, firstId: string, secondId: string;
let firstPersonId: string, secondPersonId: string, labsId: string, airaId: string, foreignId: string, projectId: string;

beforeAll(async () => {
  await postgres.initialize();
  bossId = (await provisionBoss(db, { BOSS_PIN: pin })).userId;
  airaId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  labsId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  foreignId = (await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } })).id;
  const managerKeys = ["organization.read", "reporting.read", "person.read", "responsibility.read", "responsibility.manage", "decision.decide", "project.read", "task.read", "task.manage", "membership.manage"];
  const developerKeys = ["organization.read", "project.read", "task.read", "task.manage", "labs.delivery.assignee"];
  for (const key of new Set([...managerKeys, ...developerKeys])) await db.permission.upsert({ where: { key }, create: { key, name: key, scope: "GROUP" }, update: {} });
  const managerRole = await db.role.create({ data: { organizationId: airaId, key: "acceptance-manager", name: "Business Development & Operations Manager", permissions: { create: managerKeys.map(key => ({ permission: { connect: { key } } })) } } });
  const developerRole = await db.role.create({ data: { organizationId: labsId, key: "acceptance-developer", name: "Junior Developer", permissions: { create: developerKeys.map(key => ({ permission: { connect: { key } } })) } } });
  async function account(name: string, organizationId: string, roleId: string, scope = "ORGANIZATION") {
    const person = await db.person.create({ data: { displayName: name } });
    const user = await db.user.create({ data: { email: `${name.toLowerCase().replaceAll(" ", "-")}@test.invalid`, personId: person.id, emailVerifiedAt: now(), passwordHash: await hashPassword(password) } });
    await db.membership.create({ data: { personId: person.id, organizationId, scope, roles: { create: { roleId } } } });
    return { userId: user.id, personId: person.id };
  }
  const manager = await account("Acceptance Manager", airaId, managerRole.id, "DESCENDANTS");
  const first = await account("Acceptance Developer One", labsId, developerRole.id);
  const second = await account("Acceptance Developer Two", labsId, developerRole.id);
  managerId = manager.userId; firstId = first.userId; secondId = second.userId;
  firstPersonId = first.personId; secondPersonId = second.personId;
  for (const personId of [firstPersonId, secondPersonId]) await db.reportingRelationship.create({ data: { organizationId: labsId, managerPersonId: manager.personId, personId } });
  projectId = (await db.project.create({ data: { organizationId: labsId, name: "Acceptance Labs project", slug: "acceptance-labs-project", status: "ACTIVE", metadata: JSON.stringify({ kind: "AIRALABS_PROJECT" }) } })).id;
}, 120000);

afterAll(() => postgres.dispose(), 30000);

describe("MAXPASE workplace four-account acceptance", () => {
  it("carries scoped work from Boss and manager to two distinct developers and independent review", async () => {
    const ownerSession = await auth.loginBoss({ email: BOSS_EMAIL, password: pin }, secret);
    expect((await auth.validate(ownerSession!.token, secret))?.userId).toBe(bossId);
    for (const [email, userId] of [["acceptance-manager@test.invalid", managerId], ["acceptance-developer-one@test.invalid", firstId], ["acceptance-developer-two@test.invalid", secondId]]) {
      const session = await auth.loginPortal({ email, password }, secret, "skillcity");
      expect((await auth.validate(session!.token, secret, "skillcity"))?.userId).toBe(userId);
    }
    const foreign = await db.task.create({ data: { organizationId: foreignId, assigneePersonId: firstPersonId, title: "Other company task" } });
    const ownerBefore = await boss.dashboard(bossId, airaId);
    expect(ownerBefore.cards).toHaveLength(1);
    expect(ownerBefore.oversight.openTasks).toBe(0);
    const focus = await managerDesk.setFocus(managerId, { organizationId: labsId, personId: firstPersonId, title: "Labs delivery", startsOn: "2026-10-24", endsOn: "2026-11-14", decisionReference: "acceptance-focus-approval", reference: randomUUID() });
    expect(focus.replay).toBe(false);
    const first = await developerDesk.assignTask(managerId, { projectId, developerUserId: firstId, title: "Build the workflow", dueDate: "2026-11-01T10:00:00.000Z", reference: randomUUID() });
    const second = await developerDesk.assignTask(managerId, { projectId, developerUserId: secondId, title: "Test the integration", dueDate: "2026-11-02T10:00:00.000Z", reference: randomUUID() });
    const manager = await managerDesk.list(managerId);
    expect(manager.summary).toMatchObject({ directReports: 2, openTasks: 2 });
    expect(manager.people.find(person => person.personId === firstPersonId)?.currentFocus?.title).toBe("Labs delivery");
    expect((await developerDesk.workspace(firstId)).projects[0].tasks.map(task => task.id)).toEqual([first.id]);
    expect((await developerDesk.workspace(secondId)).projects[0].tasks.map(task => task.id)).toEqual([second.id]);
    await expect(developerDesk.contribute(secondId, { taskId: first.id, detail: "Attempted work on another assignment", reference: randomUUID() })).rejects.toThrow();
    const contribution = await developerDesk.contribute(firstId, { taskId: first.id, detail: "Implemented the scoped workflow and recorded evidence", reference: randomUUID() });
    expect(contribution.replay).toBe(false);
    await developerDesk.assignDuty(managerId, { taskId: first.id, reviewerUserId: secondId, duty: "CODE_REVIEW", reference: randomUUID() });
    await developerDesk.assignDuty(managerId, { taskId: first.id, reviewerUserId: secondId, duty: "TESTING", reference: randomUUID() });
    await expect(developerDesk.review(firstId, { taskId: first.id, duty: "CODE_REVIEW", verdict: "APPROVED", comment: "Self-review is forbidden", reference: randomUUID() })).rejects.toThrow();
    for (const duty of ["CODE_REVIEW", "TESTING"] as const) await developerDesk.review(secondId, { taskId: first.id, duty, verdict: "APPROVED", comment: "Independent evidence reviewed", reference: randomUUID() });
    const secondWorkspace = await developerDesk.workspace(secondId);
    expect(secondWorkspace.projects[0].tasks.find(task => task.id === first.id)?.duties).toEqual(["CODE_REVIEW", "TESTING"]);
    const revision = (await db.task.findUniqueOrThrow({ where: { id: first.id } })).revision;
    await developerDesk.completeReviewedTask(managerId, { taskId: first.id, revision, reason: "Independent review and testing approved", reference: randomUUID() });
    expect((await db.task.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("COMPLETED");
    expect((await managerDesk.list(managerId)).summary.openTasks).toBe(1);
    const ownerAfter = await boss.dashboard(bossId, airaId);
    expect(ownerAfter.oversight.openTasks).toBe(1);
    expect(JSON.stringify(ownerAfter.snapshot.tasks)).not.toContain(foreign.id);
    expect(await db.operationalEvent.count({ where: { organizationId: labsId, actorUserId: firstId, eventType: "staff.developer_contribution_recorded" } })).toBe(1);
    expect(await db.operationalEvent.count({ where: { organizationId: labsId, actorUserId: secondId, eventType: "staff.developer_review_recorded" } })).toBe(2);
    expect(await db.operationalEvent.count({ where: { organizationId: labsId, actorUserId: managerId, eventType: "staff.developer_task_reviewed_complete" } })).toBe(1);
    await db.membership.update({ where: { personId_organizationId_scopeKey: { personId: secondPersonId, organizationId: labsId, scopeKey: `project:${projectId}` } }, data: { status: "INACTIVE" } });
    expect((await developerDesk.workspace(secondId)).projects).toEqual([]);
    await expect(developerDesk.contribute(secondId, { taskId: second.id, detail: "Attempt after project access revoked", reference: randomUUID() })).rejects.toThrow();
    expect((await boss.dashboard(bossId, airaId)).oversight.openTasks).toBe(1);
  });
});
