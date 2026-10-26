import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPostgresFixture } from "./helpers/postgres-fixture";
import { initializeGroupStructure } from "@/server/group/structure";
import { createSkillCityDeveloperDesk } from "@/server/skillcity/developer-desk";
import { createLabsService } from "@/server/labs/service";
import { createExecutionService } from "@/server/domain/execution-service";

const postgres = createPostgresFixture();
const db = postgres.db;
const desk = createSkillCityDeveloperDesk(db, () => new Date("2026-10-24T06:00:00Z"));
let directorId: string, firstId: string, secondId: string, labsId: string, projectId: string, foreignProjectId: string;

beforeAll(async () => {
  await postgres.initialize();
  await db.$transaction(initializeGroupStructure);
  const companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  labsId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  const foreignId = (await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } })).id;
  const keys = ["organization.read", "project.read", "task.read", "task.manage", "labs.delivery.assignee", "membership.manage", "person.read", "responsibility.manage", "responsibility.read", "decision.decide"];
  for (const key of keys) await db.permission.upsert({ where: { key }, create: { key, name: key, scope: "GROUP" }, update: {} });
  const directorRole = await db.role.create({ data: { organizationId: companyId, key: "developer-desk-director", name: "Director", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  const developerRole = await db.role.create({ data: { organizationId: labsId, key: "developer-desk-worker", name: "Junior Developer", permissions: { create: keys.filter(key => ["organization.read", "project.read", "task.read", "task.manage", "labs.delivery.assignee"].includes(key)).map(key => ({ permission: { connect: { key } } })) } } });
  async function account(name: string, roleId: string, organizationId: string, scope = "ORGANIZATION") {
    const person = await db.person.create({ data: { displayName: name } });
    const user = await db.user.create({ data: { email: `${name.toLowerCase().replaceAll(" ", "-")}@test.invalid`, personId: person.id, emailVerifiedAt: new Date() } });
    await db.membership.create({ data: { personId: person.id, organizationId, scope, roles: { create: { roleId } } } });
    return user.id;
  }
  directorId = await account("Desk Director", directorRole.id, companyId, "DESCENDANTS");
  firstId = await account("Developer One", developerRole.id, labsId);
  secondId = await account("Developer Two", developerRole.id, labsId);
  projectId = (await db.project.create({ data: { organizationId: labsId, name: "Synthetic Labs delivery", slug: "developer-test", metadata: JSON.stringify({ kind: "AIRALABS_PROJECT" }) } })).id;
  foreignProjectId = (await db.project.create({ data: { organizationId: foreignId, name: "Other company", slug: "foreign-developer-test", metadata: JSON.stringify({ kind: "AIRALABS_PROJECT" }) } })).id;
}, 120000);
afterAll(() => postgres.dispose(), 30000);

describe("Skill City developer desk", () => {
  it("keeps two assignees distinct and review/testing independent", async () => {
    const one = await desk.assignTask(directorId, { projectId, developerUserId: firstId, title: "Implement feature", dueDate: "2026-11-01T10:00:00.000Z", reference: randomUUID() });
    const two = await desk.assignTask(directorId, { projectId, developerUserId: secondId, title: "Build integration", dueDate: "2026-11-02T10:00:00.000Z", reference: randomUUID() });
    const firstPersonId = (await db.user.findUniqueOrThrow({ where: { id: firstId } })).personId!;
    await db.project.update({ where: { id: projectId }, data: { ownerPersonId: firstPersonId } });
    const legacy = createLabsService(db, () => new Date(), "skillcity");
    expect((await legacy.projectWork(firstId, projectId)).tasks.map(task => task.id)).toEqual([one.id]);
    await expect(legacy.saveTask(firstId, { projectId, taskId: two.id, title: "Forged update", description: "", dueDate: "2026-11-02T10:00:00.000Z", status: "IN_PROGRESS", reference: randomUUID() })).rejects.toThrow();
    const execution = createExecutionService(db);
    await expect(execution.save(directorId, "tasks", { organizationId: labsId, projectId, title: "Implement feature", assigneePersonId: firstPersonId, status: "COMPLETED", metadata: { skillCityDeveloperReviewRequired: true } }, one.id)).rejects.toThrow();
    await expect(execution.save(directorId, "tasks", { organizationId: labsId, projectId, title: "Implement feature", assigneePersonId: firstPersonId, status: "TODO", metadata: {} }, one.id)).rejects.toThrow();
    expect((await desk.workspace(firstId)).projects[0].tasks.map(task => task.id)).toEqual([one.id]);
    expect((await desk.workspace(secondId)).projects[0].tasks.map(task => task.id)).toEqual([two.id]);
    await expect(desk.contribute(secondId, { taskId: one.id, detail: "Changed work without assignment", reference: randomUUID() })).rejects.toThrow();
    const contributionInput = { taskId: one.id, detail: "Implemented the approved task and attached a review reference", reference: randomUUID() };
    const contribution = await desk.contribute(firstId, contributionInput);
    expect(contribution.replay).toBe(false);
    expect((await desk.contribute(firstId, contributionInput)).replay).toBe(true);
    await expect(desk.contribute(firstId, { ...contributionInput, detail: "Changed on replay" })).rejects.toThrow();
    await expect(desk.assignDuty(directorId, { taskId: one.id, reviewerUserId: firstId, duty: "CODE_REVIEW", reference: randomUUID() })).rejects.toThrow();
    await desk.assignDuty(directorId, { taskId: one.id, reviewerUserId: secondId, duty: "CODE_REVIEW", reference: randomUUID() });
    await desk.assignDuty(directorId, { taskId: one.id, reviewerUserId: secondId, duty: "TESTING", reference: randomUUID() });
    const second = (await desk.workspace(secondId)).projects[0].tasks;
    expect(second.map(task => task.id).sort()).toEqual([one.id, two.id].sort());
    expect(second.find(task => task.id === one.id)?.duties.sort()).toEqual(["CODE_REVIEW", "TESTING"]);
    await expect(desk.review(firstId, { taskId: one.id, duty: "CODE_REVIEW", verdict: "APPROVED", comment: "Self-review attempt", reference: randomUUID() })).rejects.toThrow();
    const reviewed = await desk.review(secondId, { taskId: one.id, duty: "CODE_REVIEW", verdict: "REWORK", comment: "Add failure-case coverage", reference: randomUUID() });
    expect(reviewed.replay).toBe(false);
    expect((await db.task.findUniqueOrThrow({ where: { id: one.id } })).status).toBe("TODO");
    expect((await desk.workspace(firstId)).projects[0].tasks[0].history.map(item => item.kind)).toEqual(["Code review", "Contribution"]);
    const revision = (await db.task.findUniqueOrThrow({ where: { id: one.id } })).revision;
    await desk.updateOwnTask(firstId, { taskId: one.id, revision, status: "BLOCKED", description: "Waiting for review changes", reference: randomUUID() });
    expect((await db.task.findUniqueOrThrow({ where: { id: one.id } })).assigneePersonId).toBe((await db.user.findUniqueOrThrow({ where: { id: firstId } })).personId);
    const completion = { taskId: one.id, revision: revision + 1, reason: "Independent review and testing completed", reference: randomUUID() };
    await expect(desk.completeReviewedTask(directorId, completion)).rejects.toThrow();
    await desk.contribute(firstId, { taskId: one.id, detail: "Addressed review findings with updated tests", reference: randomUUID() });
    await desk.review(secondId, { taskId: one.id, duty: "CODE_REVIEW", verdict: "APPROVED", comment: "Changes and tests reviewed", reference: randomUUID() });
    await desk.review(secondId, { taskId: one.id, duty: "TESTING", verdict: "APPROVED", comment: "Failure cases independently tested", reference: randomUUID() });
    await expect(desk.completeReviewedTask(firstId, completion)).rejects.toThrow();
    const restoreLegacyTrigger1 = await postgres.rejectInsert("AuditEvent", "staff.developer_task_reviewed_complete");
    try {
      await expect(desk.completeReviewedTask(directorId, completion)).rejects.toThrow();
      expect((await db.task.findUniqueOrThrow({ where: { id: one.id } })).status).toBe("BLOCKED");
    } finally { await restoreLegacyTrigger1(); }
    expect((await desk.completeReviewedTask(directorId, completion)).replay).toBe(false);
    expect((await desk.completeReviewedTask(directorId, completion)).replay).toBe(true);
    await expect(desk.completeReviewedTask(directorId, { ...completion, reason: "Changed replay" })).rejects.toThrow();
    expect((await db.task.findUniqueOrThrow({ where: { id: one.id } })).status).toBe("COMPLETED");
    await expect(desk.review(secondId, { taskId: one.id, duty: "TESTING", verdict: "APPROVED", comment: "Post-completion review", reference: randomUUID() })).rejects.toThrow();
    await expect(desk.updateOwnTask(firstId, { taskId: one.id, revision: revision + 2, status: "TODO", description: "Forged reopen", reference: randomUUID() })).rejects.toThrow();
  });

  it("rejects foreign scope and revoked project membership", async () => {
    await expect(desk.assignTask(directorId, { projectId: foreignProjectId, developerUserId: firstId, title: "Foreign work", dueDate: "2026-11-01T10:00:00.000Z", reference: randomUUID() })).rejects.toThrow();
    const personId = (await db.user.findUniqueOrThrow({ where: { id: secondId } })).personId!;
    await db.membership.update({ where: { personId_organizationId_scopeKey: { personId, organizationId: labsId, scopeKey: "project:" + projectId } }, data: { status: "INACTIVE" } });
    expect((await desk.workspace(secondId)).projects).toEqual([]);
    await expect(desk.review(secondId, { taskId: (await db.task.findFirstOrThrow({ where: { title: "Implement feature" } })).id, duty: "TESTING", verdict: "APPROVED", comment: "Revoked reviewer", reference: randomUUID() })).rejects.toThrow();
  });

  it("rolls assignment back when operational audit fails", async () => {
    const restoreLegacyTrigger2 = await postgres.rejectInsert("AuditEvent", "staff.developer_task_assigned");
    try {
      await expect(desk.assignTask(directorId, { projectId, developerUserId: firstId, title: "Must roll back", dueDate: "2026-11-03T10:00:00.000Z", reference: randomUUID() })).rejects.toThrow();
      expect(await db.task.count({ where: { title: "Must roll back" } })).toBe(0);
    } finally { await restoreLegacyTrigger2(); }
  });
});
