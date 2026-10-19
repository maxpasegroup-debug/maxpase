import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { createNiceJobsService } from "@/server/nicejobs/service";
import { fixtureOpportunity } from "./fixtures/nicejobs-opportunity";
import { createApplicationService } from "@/server/nicejobs/applications";
import { createRecruitmentService } from "@/server/nicejobs/recruitment";
import { createOperationsService } from "@/server/domain/operations-service";
import { createOnboardingService } from "@/server/nicejobs/onboarding";
import { createEmployeeService, dayBounds, localDay } from "@/server/nicejobs/employee";
import { employeeCommand } from "@/server/nicejobs/employee-input";
import { createSiaService } from "@/server/sia/service";
import { createExecutionService } from "@/server/domain/execution-service";
import { createGoalService } from "@/server/nicejobs/goals";
import { createParticipantDashboard } from "@/server/nicejobs/participant-dashboard";
import { createAccountPreferences } from "@/server/account/preferences";
import { createKnowledgeService } from "@/server/nicejobs/knowledge";
import { createFinanceService } from "@/server/nicejobs/finance";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phase05-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/"), log: [{ level: "query", emit: "event" }] });
let capturedQueries: string[] | null = null;
db.$on("query", e => { capturedQueries?.push(e.query); });
const employee = createEmployeeService(db, () => clock), sia = createSiaService(db);
const jobs = createNiceJobsService(db), applications = createApplicationService(db), operations = createOperationsService(db);
let clock = new Date();
const recruitment = createRecruitmentService(db, () => clock), onboarding = createOnboardingService(db, () => clock);
const dashboard = createParticipantDashboard({ account: createAccountPreferences(db), applications, onboarding, employee, knowledge: createKnowledgeService(db, () => clock), operations });
let company: string, labs: string, career: string, manager: string, approver: string, mentor: string, readyReviewer: string, candidate: string, other: string, outsider: string, reader: string, versionId: string, controlId: string;
const quiz = { form: { fields: [{ key: "safe", label: "Synthetic safety acknowledgement", type: "BOOLEAN", required: true }] }, assessment: { questions: [{ field: "safe", operator: "EQ", value: true, weight: 1, required: true }], passMark: 100 }, maxAttempts: 2 };
const orientation = { modules: [{ key: "introduction", title: "Synthetic introduction", order: 1, lessons: [{ key: "welcome", title: "Synthetic welcome", type: "TEXT", text: "Isolated fixture only, not real training", order: 1, completion: "ACKNOWLEDGE" }, { key: "check", title: "Synthetic quiz", type: "QUIZ", order: 2, completion: "QUIZ", quiz }] }] };
const ojt = { stages: [{ key: "practice", title: "Synthetic practice", order: 1, activities: [{ key: "evidence", title: "Synthetic practice activity", type: "PRACTICE", order: 1, instruction: "Describe the isolated fixture practice", expectedOutcome: "Independent review of fixture evidence", evidenceRequired: true, reviewRequired: true, maxAttempts: 2, dueDays: 1 }] }], assessment: { kind: "HUMAN", criteria: "Verify synthetic practical skill; explicit human rubric", maxAttempts: 2 } };
const training = { orientation, ojt, readiness: { requireAssessment: true, criteria: "Mandatory fixture training and assessment must pass" } };
async function human(name: string, org: string, keys: string[], descendants = false) {
  const person = await db.person.create({ data: { displayName: name } });
  const user = await db.user.create({ data: { email: name + "@phase05.invalid", personId: person.id } });
  const role = await db.role.create({ data: { key: person.id, name: "Explicit fixture capabilities", organizationId: org, permissions: { create: [...new Set(keys)].map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId: org, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } }); return user.id;
}
async function publish(extra = {}, code = "TEST-04") {
  const v = await jobs.create(manager, { code, title: "Synthetic onboarding job", description: "Synthetic onboarding opportunity", visibility: "PUBLIC", divisionIds: [labs], configuration: { schemaVersion: 1, opportunity: await fixtureOpportunity(db, manager), application: { fields: [{ key: "experience", label: "Synthetic experience", type: "NUMBER", required: true }] }, eligibility: { rules: [{ field: "experience", operator: "GTE", value: 1 }] }, screening: { questions: [{ field: "experience", operator: "GTE", value: 1, weight: 1 }], passMark: 80 }, interview: { enabled: false, type: "VIDEO", duration: 30, questions: [], evaluationRequired: false }, management: { policies: [{ divisionId: labs, controlPointId: controlId }] }, offer: { title: "Synthetic offer", content: { terms: "Isolated fixture, not employment terms" }, validityDays: 2 }, ...training, ...extra } });
  await jobs.changeJob(manager, { id: v.id, revision: 0, to: "PUBLISHED", reason: "Fixture publication" }); return v.id;
}
async function accepted(userId = candidate, version = versionId) {
  let a = await applications.create(userId, { versionId: version, divisionId: labs });
  a = await applications.mutate(userId, { reference: a.reference, revision: 0, action: "SUBMIT", answers: { experience: 2 } });
  for (const action of ["ELIGIBILITY", "SCREENING", "SHORTLIST"]) a = await applications.mutate(manager, { reference: a.reference, revision: a.revision, action, reason: "Fixture human review" });
  const act = async (operation: string, extra = {}, actor = manager) => { const r = await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: a.reference } }); return recruitment.mutate(actor, { reference: r.reference, revision: r.revision, operation, reason: "Fixture decision", ...extra }); };
  await act("START_REVIEW");
  const r = await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: a.reference } }), approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: r.reviewRequestId, status: "PENDING" } });
  await act("DECIDE", { approvalId: approval.id, decision: "APPROVED" }, approver); await act("PREPARE_OFFER");
  let offer = await db.niceJobsOffer.findFirstOrThrow({ where: { applicationId: r.id } }); await act("READY_OFFER", { offerReference: offer.reference, recordRevision: offer.revision });
  offer = await db.niceJobsOffer.findUniqueOrThrow({ where: { id: offer.id } }); await act("ISSUE_OFFER", { offerReference: offer.reference, recordRevision: offer.revision });
  offer = await db.niceJobsOffer.findUniqueOrThrow({ where: { id: offer.id } }); await act("ACCEPT_OFFER", { offerReference: offer.reference, recordRevision: offer.revision }, userId);
  return a.reference;
}
async function command(reference: string, operation: string, extra = {}, actor = candidate, own = actor === candidate || actor === other) {
  const e = await db.niceJobsOnboarding.findFirst({ where: { application: { reference } } }), a = await db.niceJobsApplication.findUniqueOrThrow({ where: { reference } });
  return { applicationReference: reference, revision: e?.revision ?? a.revision, operation, idempotencyKey: crypto.randomUUID(), ...(!own ? { reason: "PRIVATE-FIXTURE-NOTES" } : {}), ...extra };
}
async function act(reference: string, operation: string, extra = {}, actor = candidate, own = actor === candidate || actor === other) { return onboarding.mutate(actor, await command(reference, operation, extra, actor, own), own); }
async function enroll(reference?: string) { const ref = reference ?? await accepted(); await act(ref, "ENROLL"); return ref; }
async function progress(ref: string, key: string) { return db.niceJobsTrainingProgress.findFirstOrThrow({ where: { onboarding: { application: { reference: ref } }, key } }); }
async function assigned(ref: string) { await act(ref, "ASSIGN_REVIEWER", { reviewerKind: "OJT", reviewerUserId: mentor }, manager, false); await act(ref, "ASSIGN_REVIEWER", { reviewerKind: "READINESS", reviewerUserId: readyReviewer }, manager, false); }
async function reviewed(ref: string, key: string, outcome: string, feedback = "Released fixture feedback") {
  const p = await progress(ref, key), s = await db.niceJobsTrainingSubmission.findFirstOrThrow({ where: { progressId: p.id, attempt: p.attempt } });
  return act(ref, "REVIEW", { submissionId: s.id, outcome, feedback }, mentor, false);
}
beforeAll(async () => {
  const sql = new DatabaseSync(file); for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8")); sql.close();
  await db.$transaction(initializeGroupStructure);
  for (const p of workforcePermissions) await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  await db.permission.upsert({ where: { key: "organization.read" }, update: {}, create: { key: "organization.read", name: "Read", scope: "GROUP" } });
  const org = async (slug: string) => (await db.organization.findUniqueOrThrow({ where: { slug } })).id;
  company = await org("aira-skill-city"); labs = await org("aira-labs"); career = await org("aira-career-hub");
  for (const key of ["goal.read", "goal.manage", "goal.progress"]) await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key, scope: "GROUP" } });
  const all = [...workforcePermissions.map(p => p.key), "organization.read", "goal.read", "goal.manage", "goal.progress"];
  manager = await human("manager", company, all, true); approver = await human("approver", labs, ["nicejobs.application.read", "nicejobs.management.review", "nicejobs.management.approve", "approval.read", "approval.decide", "request.read", "control.read", "notification.read"]);
  mentor = await human("mentor", labs, ["nicejobs.ojt.review", "notification.read"]); readyReviewer = await human("readiness", labs, ["nicejobs.readiness.review", "notification.read"]);
  candidate = await human("candidate", career, ["organization.read", "nicejobs.application.self", "nicejobs.onboarding.self", "notification.read"]); other = await human("other", career, ["organization.read", "nicejobs.application.self", "nicejobs.onboarding.self", "notification.read"]);
  outsider = await human("outsider", await org("pearn"), all, true); reader = await human("reader", labs, ["nicejobs.onboarding.read"]);
  for (const userId of [candidate, other]) {
    const user = await db.user.update({ where: { id: userId }, data: { timezone: "Asia/Kolkata" } });
    const role = await db.role.create({ data: { key: "work-" + userId, name: "Explicit worker fixture", organizationId: labs, permissions: { create: ["nicejobs.workspace.self", "nicejobs.work.perform", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read", "reminder.manage", "sia.access.read"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId: user.personId!, organizationId: labs, roles: { create: { roleId: role.id } } } });
  }
  controlId = (await operations.saveControl(manager, { organizationId: labs, name: "Fixture independent approval", kind: "HUMAN_DECISION", requiredPermission: "nicejobs.management.approve", stages: [[{ approverUserId: approver, requiredPermission: "nicejobs.management.approve" }]] })).id;
}, 30000);
beforeEach(async () => {
  await db.niceJobsDailyReport.updateMany({ data: { supersedesId: null } });
  await db.niceJobsDailyReport.deleteMany(); await db.taskEvidence.deleteMany(); await db.executionBlocker.deleteMany(); await db.task.deleteMany(); await db.goal.deleteMany(); await db.niceJobsAssignment.deleteMany(); await db.niceJobsWorkerProfile.deleteMany();
  await db.niceJobsTrainingReview.deleteMany(); await db.niceJobsTrainingSubmission.deleteMany(); await db.niceJobsTrainingProgress.deleteMany(); await db.niceJobsOnboarding.deleteMany(); await db.niceJobsTrainingPlan.deleteMany();
  await db.niceJobsOffer.deleteMany(); await db.niceJobsApplicationHistory.deleteMany(); await db.niceJobsApplication.deleteMany(); await db.siaApproval.deleteMany(); await db.operationalRequest.deleteMany(); await db.notification.deleteMany();
  await db.niceJobsTemplate.updateMany({ data: { publishedVersionId: null } }); await db.niceJobsVersionArea.deleteMany(); await db.niceJobsVersion.deleteMany(); await db.niceJobsTemplate.deleteMany();
  clock = new Date(); versionId = await publish();
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
async function ready(user = candidate) {
  const ref = await accepted(user);
  await act(ref, "ENROLL", {}, user, true);
  const run = async (operation: string, extra = {}) => act(ref, operation, extra, user, true);
  await run("START_ORIENTATION"); await run("COMPLETE_LESSON", { progressId: (await progress(ref, "welcome")).id, acknowledged: true }); await run("COMPLETE_LESSON", { progressId: (await progress(ref, "check")).id, answers: { safe: true } }); await run("FINISH_ORIENTATION");
  await assigned(ref); await run("START_OJT"); await run("SUBMIT_ACTIVITY", { progressId: (await progress(ref, "evidence")).id, evidence: { text: "Isolated practice" } }); await reviewed(ref, "evidence", "APPROVED"); await run("SUBMIT_ASSESSMENT", { progressId: (await progress(ref, "ojt_assessment")).id, evidence: { text: "Isolated assessment" } }); await reviewed(ref, "ojt_assessment", "PASS"); await run("REQUEST_READINESS"); await act(ref, "DECIDE_READINESS", { outcome: "READY" }, readyReviewer, false);
  return ref;
}
async function activationInput(ref: string, extra = {}) {
  const e = await db.niceJobsOnboarding.findFirstOrThrow({ where: { application: { reference: ref } } });
  return { operation: "ACTIVATE", confirmed: true, idempotencyKey: crypto.randomUUID(), applicationReference: ref, revision: e.revision, startDate: clock.toISOString(), managerId: (await db.user.findUniqueOrThrow({ where: { id: manager } })).personId!, reason: "Authorized fixture activation", ...extra };
}
async function activate(user = candidate) { return employee.mutate(manager, await activationInput(await ready(user))); }
async function workTask(assignmentId: string, extra = {}) {
  return employee.mutate(manager, { operation: "ASSIGN_TASK", confirmed: true, idempotencyKey: crypto.randomUUID(), assignmentId, title: "Real isolated assigned task", description: "Fixture instructions", priority: "HIGH", reason: "Fixture task assignment", ...extra });
}
async function workCommand(operation: string, extra = {}, actor = candidate) { return employee.mutate(actor, { operation, confirmed: true, idempotencyKey: crypto.randomUUID(), ...extra }); }
async function agent() {
  const identity = await db.siaIdentity.create({ data: { name: "Isolated SIA", title: "Shared worker assistant" } });
  const keys = ["nicejobs.workspace.self", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read"];
  const role = await db.role.create({ data: { key: "agent-" + identity.id, name: "Explicit scoped agent", principalType: "AGENT", organizationId: labs, permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.siaRoleAssignment.create({ data: { siaId: identity.id, roleId: role.id, organizationId: labs } });
  await db.siaTool.create({ data: { siaId: identity.id, key: "get_worker_day", name: "Worker day", permissionKey: "nicejobs.workspace.self", enabled: true } });
  return identity.id;
}
describe("Nice Jobs active worker environment and governed SIA", () => {
  it("keeps applicant and accepted-offer dashboards outside employee work authority", async () => {
    expect((await dashboard.context(candidate)).navigation.data?.worker).toBe(false);
    expect((await dashboard.home(candidate, false)).stage).toBe("APPLICANT");
    await expect(employee.day(candidate)).rejects.toThrow();
    await expect(createFinanceService(db).list(candidate)).rejects.toThrow();
    await accepted();
    const selected = await dashboard.home(candidate, false);
    expect(selected.stage).toBe("SELECTED_CANDIDATE");
    expect(selected.work).toBeNull();
    expect((await dashboard.context(candidate)).navigation.data?.worker).toBe(false);
    await expect(employee.day(candidate)).rejects.toThrow();
    await expect(createFinanceService(db).list(candidate)).rejects.toThrow();
    expect(await db.niceJobsAssignment.count()).toBe(0);
    expect(await db.niceJobsWallet.count()).toBe(0);
  });
  it("projects only own live work into Home and preserves candidate and company isolation", async () => {
    const assignment = await activate();
    await workTask(assignment.id, { title: "Own dashboard task" });
    const otherAssignment = await activate(other);
    await workTask(otherAssignment.id, { title: "Other participant private task" });
    const home = await dashboard.home(candidate, true);
    expect(home.stage).toBe("ACTIVE_WORKER");
    expect(home.work?.data?.tasks.map(t => t.title)).toEqual(["Own dashboard task"]);
    expect(home.applications.data?.records).toHaveLength(1);
    expect(home.learning.data?.records).toHaveLength(1);
    expect(home.learning.data?.records[0].ojt.completed).toBe(1);
    expect((await dashboard.home(outsider, false)).applications.status).toBe("UNAUTHORIZED");
    const context = await dashboard.context(candidate);
    expect(context.account.name).toBe("candidate");
    expect(context.navigation.data?.worker).toBe(true);
    await db.niceJobsAssignment.update({ where: { id: assignment.id }, data: { status: "SUSPENDED" } });
    expect((await dashboard.context(candidate)).navigation.data?.worker).toBe(false);
    expect((await dashboard.home(candidate, false)).work).toBeNull();
  });
  it("reviews a participant plan with canonical approval, protects changes and leaves money untouched", async () => {
    await activate();
    const goals = createGoalService(db, () => clock);
    const point = await operations.saveControl(manager, { organizationId: labs, name: "Fixture goal manager approval", kind: "HUMAN_DECISION", requiredPermission: "nicejobs.work.manage", stages: [[{ approverUserId: manager, requiredPermission: "nicejobs.work.manage" }]] });
    const c = { operation: "PROPOSE", confirmed: true, idempotencyKey: crypto.randomUUID(), outcome: { outcome: "Verified fixture outcomes", target: 30, unit: "outcomes" } };
    const g = await goals.mutate(candidate, c); expect(await goals.mutate(candidate, c)).toEqual(g);
    await expect(goals.mutate(candidate, { ...c, outcome: { ...c.outcome, target: 99 } })).rejects.toThrow();
    await expect(goals.list(outsider, (await employee.day(candidate)).assignment.id)).rejects.toThrow();
    const cmd = (operation: string, extra = {}) => ({ operation, confirmed: true, idempotencyKey: crypto.randomUUID(), goalId: g.id, ...extra });
    await expect(goals.mutate(manager, cmd("APPLY"))).rejects.toThrow();
    await goals.mutate(candidate, cmd("SUBMIT", { controlPointId: point.id }));
    const row = (await goals.list(candidate)).records.find(r => r.id === g.id)!;
    await expect(goals.mutate(candidate, cmd("DECIDE", { approvalId: row.approvals[0].id, decision: "APPROVED", reason: "Self approval" }))).rejects.toThrow();
    await goals.mutate(manager, cmd("DECIDE", { approvalId: row.approvals[0].id, decision: "APPROVED", reason: "Reviewed fixture plan" }));
    await goals.mutate(manager, cmd("APPLY"));
    expect((await db.goal.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("ACTIVE");
    await expect(goals.mutate(manager, cmd("RESPONSIBILITY", { stageKey: "unconfigured", title: "Fixture responsibility", instruction: "Fixture work", reason: "Fixture review" }))).rejects.toThrow();
    await goals.mutate(manager, cmd("RESPONSIBILITY", { stageKey: "practice", title: "Fixture responsibility", instruction: "Use reviewed fixture skills", reason: "Verified skill milestone" }));
    const skillTask = await db.task.findFirstOrThrow({ where: { goalId: g.id } });
    expect(skillTask.evidenceRequired).toBe(true); expect(JSON.parse(skillTask.metadata!).stageKey).toBe("practice");
    expect(skillTask.niceJobsAssignmentId).toBe((await employee.day(candidate)).assignment.id);
    await expect(createExecutionService(db).progress(manager, g.id, 100, "Bypass")).rejects.toThrow();
    await expect(createExecutionService(db).save(manager, "goals", { organizationId: labs, title: "Bypass", status: "ACTIVE" }, g.id)).rejects.toThrow();
    const changed = await goals.mutate(candidate, { ...c, idempotencyKey: crypto.randomUUID(), previousGoalId: g.id, outcome: { ...c.outcome, target: 60 } });
    expect((await db.goal.findUniqueOrThrow({ where: { id: changed.id } })).status).toBe("DRAFT");
    expect((await db.goal.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("ACTIVE");
    await goals.mutate(candidate, { ...cmd("SUBMIT", { controlPointId: point.id }), goalId: changed.id });
    const approval = (await goals.list(candidate)).records.find(r => r.id === changed.id)!.approvals[0];
    await goals.mutate(manager, { ...cmd("DECIDE", { approvalId: approval.id, decision: "APPROVED", reason: "Reviewed material change" }), goalId: changed.id });
    const sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_goal_apply BEFORE INSERT ON AuditEvent WHEN NEW.action = 'nicejobs.goal.apply' BEGIN SELECT RAISE(ABORT, 'Fixture failure'); END;"); sql.close();
    try { await expect(goals.mutate(manager, { ...cmd("APPLY"), goalId: changed.id })).rejects.toThrow(); expect((await db.goal.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("ACTIVE"); expect((await db.goal.findUniqueOrThrow({ where: { id: changed.id } })).status).toBe("DRAFT"); }
    finally { const clean = new DatabaseSync(file); clean.exec("DROP TRIGGER fail_goal_apply"); clean.close(); }
    await goals.mutate(manager, { ...cmd("APPLY"), goalId: changed.id });
    expect((await db.goal.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("ARCHIVED");
    const latest = await db.goal.findUniqueOrThrow({ where: { id: changed.id } });
    const snapshot = JSON.parse(latest.metadata!); snapshot.requestId = null;
    await db.goal.createMany({ data: Array.from({ length: 26 }, (_, i) => ({ organizationId: labs, ownerPersonId: latest.ownerPersonId, title: "Synthetic history " + i, status: "DRAFT" as const, metadata: JSON.stringify(snapshot), createdAt: new Date(clock.getTime() + i + 1) })) });
    const history = await goals.list(candidate);
    expect(history.records[0].id).toBe(changed.id); expect(history.records[0].status).toBe("ACTIVE"); expect(history.truncated).toBe(true);
    expect(await db.niceJobsWalletLedger.count()).toBe(0); expect(await db.niceJobsIncentiveEarning.count()).toBe(0);
  });
  it("rolls back goal creation on audit failure and rejects unavailable SIA", async () => {
    await activate(); const goals = createGoalService(db, () => clock);
    const c = { operation: "PROPOSE", confirmed: true, idempotencyKey: crypto.randomUUID(), outcome: { outcome: "Fixture target", target: 10, unit: "outcomes" } };
    await expect(goals.mutate(candidate, { ...c, siaId: "unconfigured" })).rejects.toThrow();
    const sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_goal_audit BEFORE INSERT ON AuditEvent WHEN NEW.action = 'nicejobs.goal.propose' BEGIN SELECT RAISE(ABORT, 'Fixture failure'); END;"); sql.close();
    try { await expect(goals.mutate(candidate, c)).rejects.toThrow(); expect(await db.goal.count()).toBe(0); }
    finally { const clean = new DatabaseSync(file); clean.exec("DROP TRIGGER fail_goal_audit"); clean.close(); }
    const identity = await agent(), assignment = (await employee.day(candidate)).assignment;
    const task = await workTask(assignment.id);
    const assisted = await goals.mutate(candidate, { ...c, siaId: identity });
    const plan = JSON.parse((await db.goal.findUniqueOrThrow({ where: { id: assisted.id } })).metadata!);
    expect(plan.provider).toBe("DETERMINISTIC_DOMAIN_EVIDENCE"); expect(plan.sourceTasks).toContain(task.id);
  });
  it("rolls back request preparation and rejects manager replacement through generic approvals", async () => {
    await activate(); const goals = createGoalService(db, () => clock);
    const point = await operations.saveControl(manager, { organizationId: labs, name: "Fixture independent goal", kind: "HUMAN_DECISION", requiredPermission: "nicejobs.work.manage", stages: [[{ approverUserId: manager, requiredPermission: "nicejobs.work.manage" }]] });
    const g = await goals.mutate(candidate, { operation: "PROPOSE", confirmed: true, idempotencyKey: crypto.randomUUID(), outcome: { outcome: "Fixture target", target: 10, unit: "outcomes" } });
    const submit = { operation: "SUBMIT", confirmed: true, idempotencyKey: crypto.randomUUID(), goalId: g.id, controlPointId: point.id };
    const before = await db.operationalRequest.count(); const sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_goal_submit BEFORE INSERT ON AuditEvent WHEN NEW.action = 'nicejobs.goal.submit' BEGIN SELECT RAISE(ABORT, 'Fixture failure'); END;"); sql.close();
    try { await expect(goals.mutate(candidate, submit)).rejects.toThrow(); expect(await db.operationalRequest.count()).toBe(before); expect(JSON.parse((await db.goal.findUniqueOrThrow({ where: { id: g.id } })).metadata!).requestId).toBeNull(); }
    finally { const clean = new DatabaseSync(file); clean.exec("DROP TRIGGER fail_goal_submit"); clean.close(); }
    await goals.mutate(candidate, submit);
    const row = (await goals.list(candidate)).records[0];
    await db.niceJobsAssignment.update({ where: { id: (await employee.day(candidate)).assignment.id }, data: { managerId: (await db.user.findUniqueOrThrow({ where: { id: approver } })).personId } });
    await expect(operations.decide(manager, { approvalId: row.approvals[0].id, decision: "APPROVED", comment: "Old manager bypass" })).rejects.toThrow();
    expect((await db.siaApproval.findUniqueOrThrow({ where: { id: row.approvals[0].id } })).status).toBe("PENDING");
  });
  it("rolls back activation and profile creation when canonical audit fails", async () => {
    const ref = await ready(), command = await activationInput(ref), sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_activation_audit BEFORE INSERT ON AuditEvent WHEN NEW.action = 'nicejobs.work.activate' BEGIN SELECT RAISE(ABORT, 'Fixture audit failure'); END;"); sql.close();
    try { await expect(employee.mutate(manager, command)).rejects.toThrow(); expect(await db.niceJobsAssignment.count()).toBe(0); expect(await db.niceJobsWorkerProfile.count()).toBe(0); }
    finally { const clean = new DatabaseSync(file); clean.exec("DROP TRIGGER fail_activation_audit"); clean.close(); }
  });
  it("rolls back task creation when notification persistence fails", async () => {
    const a = await activate(), sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_work_notification BEFORE INSERT ON Notification WHEN NEW.type = 'NICE_JOBS_WORK' BEGIN SELECT RAISE(ABORT, 'Fixture notification failure'); END;"); sql.close();
    try { await expect(workTask(a.assignmentId)).rejects.toThrow(); expect(await db.task.count()).toBe(0); }
    finally { const clean = new DatabaseSync(file); clean.exec("DROP TRIGGER fail_work_notification"); clean.close(); }
  });
  it("revokes live worker access and rejects arbitrary manager identity changes", async () => {
    const a = await activate(), person = (await db.user.findUniqueOrThrow({ where: { id: candidate } })).personId!;
    await expect(workCommand("SET_MANAGER", { assignmentId: a.assignmentId, revision: 0, managerId: person, reason: "Self-supervision" }, manager)).rejects.toThrow();
    await db.membership.updateMany({ where: { personId: person, organizationId: labs }, data: { status: "SUSPENDED" } });
    try { await expect(employee.day(candidate)).rejects.toThrow(); await expect(workTask(a.assignmentId)).rejects.toThrow(); }
    finally { await db.membership.updateMany({ where: { personId: person, organizationId: labs }, data: { status: "ACTIVE" } }); }
  });
  it("validates strict confirmed commands and timezone-aware calendar boundaries", () => {
    expect(employeeCommand.safeParse({ operation: "ACTIVATE", confirmed: true, actorUserId: manager }).success).toBe(false);
    expect(employeeCommand.safeParse({ operation: "TASK_STATE", taskId: "task", revision: 0, to: "COMPLETED", idempotencyKey: crypto.randomUUID(), confirmed: false }).success).toBe(false);
    expect(localDay(new Date("2026-10-08T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-09");
    expect(dayBounds("2026-03-08", "America/New_York").end.getTime() - dayBounds("2026-03-08", "America/New_York").start.getTime()).toBe(23 * 3600000);
  });
  it("activates only a verified ready candidate and retains exact historical assignment evidence", async () => {
    const result = await activate(), a = await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: result.assignmentId } });
    expect(a.status).toBe("ACTIVE"); expect(a.lifecycle).toBe("ACTIVE"); expect(a.versionId).toBe(versionId); expect(a.onboardingId).toBeTruthy(); expect(a.readinessReviewId).toBeTruthy(); expect(a.activatedByUserId).toBe(manager); expect(a.startDate?.getTime()).toBe(clock.getTime()); expect(await db.niceJobsWorkerProfile.count()).toBe(1);
    expect(await db.auditEvent.count({ where: { action: "nicejobs.work.activate", entityId: a.id } })).toBe(1);
  });
  it("rejects non-ready candidates, unauthorized actors and self-activation", async () => {
    const ref = await enroll(), c = await activationInput(ref);
    await expect(employee.mutate(manager, c)).rejects.toThrow();
    const r = await ready(other), command = await activationInput(r);
    for (const user of [other, candidate, outsider, reader]) await expect(employee.mutate(user, command)).rejects.toThrow();
    expect(await db.niceJobsAssignment.count()).toBe(0);
  });
  it("rejects missing readiness audit, forged proof and revoked worker membership", async () => {
    const ref = await ready(), c = await activationInput(ref);
    const r = await db.niceJobsTrainingReview.findFirstOrThrow({ where: { kind: "READINESS", outcome: "READY" } });
    await db.niceJobsTrainingReview.update({ where: { id: r.id }, data: { requirements: "{}" } }); await expect(employee.mutate(manager, c)).rejects.toThrow();
    await db.niceJobsTrainingReview.update({ where: { id: r.id }, data: { requirements: r.requirements } });
    const person = (await db.user.findUniqueOrThrow({ where: { id: candidate } })).personId!;
    await db.membership.updateMany({ where: { personId: person, organizationId: labs }, data: { status: "SUSPENDED" } }); await expect(employee.mutate(manager, c)).rejects.toThrow(); await db.membership.updateMany({ where: { personId: person, organizationId: labs }, data: { status: "ACTIVE" } });
  });
  it("deduplicates activation and refuses mismatched replay and conflicting legacy assignments", async () => {
    const ref = await ready(), c = await activationInput(ref); const first = await employee.mutate(manager, c); expect(await employee.mutate(manager, c)).toEqual(first);
    await expect(employee.mutate(manager, { ...c, startDate: new Date(clock.getTime() - 1000).toISOString() })).rejects.toThrow(); expect(await db.niceJobsAssignment.count()).toBe(1);
    const second = await ready(other), person = (await db.user.findUniqueOrThrow({ where: { id: other } })).personId!;
    await createNiceJobsService(db).assign(manager, { personId: person, versionId, divisionId: labs });
    await expect(employee.mutate(manager, await activationInput(second))).rejects.toThrow(/conflicts/);
  });
  it("requires an active readiness-backed assignment and never manufactures work", async () => {
    await expect(employee.day(candidate)).rejects.toThrow(); await activate(); expect((await employee.day(candidate)).tasks).toEqual([]); expect(await db.task.count()).toBe(0);
    await db.niceJobsAssignment.updateMany({ data: { status: "SUSPENDED", lifecycle: "SUSPENDED" } }); await expect(employee.day(candidate)).rejects.toThrow();
  });
  it("returns only own real tasks with actual overdue and completed states", async () => {
    const first = await activate(), second = await activate(other); await workTask(first.assignmentId, { title: "Own overdue", dueDate: new Date(clock.getTime() - 3600000).toISOString() }); await workTask(second.assignmentId, { title: "OTHER-PRIVATE-TASK" });
    const d = await employee.day(candidate); expect(d.overdue[0].title).toBe("Own overdue"); expect(JSON.stringify(d)).not.toContain("OTHER-PRIVATE-TASK"); expect((await employee.work(candidate, { view: "overdue" })).records).toHaveLength(1);
  });
  it("starts and completes permitted tasks through the canonical task engine", async () => {
    expect(await createExecutionService(db).list(candidate, "tasks")).toEqual([]);
    const a = await activate(), result = await workTask(a.assignmentId), t = await db.task.findUniqueOrThrow({ where: { id: result.id } });
    await workCommand("TASK_STATE", { taskId: t.id, revision: t.revision, to: "IN_PROGRESS" }); const started = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    await workCommand("TASK_STATE", { taskId: t.id, revision: started.revision, to: "COMPLETED" }); expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("COMPLETED"); expect((await employee.day(candidate)).completed).toHaveLength(1);
  });
  it("enforces required evidence in both worker and existing management task paths", async () => {
    const a = await activate(), result = await workTask(a.assignmentId, { evidenceRequired: true }), t = await db.task.findUniqueOrThrow({ where: { id: result.id } });
    await expect(workCommand("TASK_STATE", { taskId: t.id, revision: 0, to: "COMPLETED" })).rejects.toThrow(/evidence/);
    await expect(createExecutionService(db).save(manager, "tasks", { organizationId: labs, title: t.title, status: "COMPLETED", assigneePersonId: t.assigneePersonId }, t.id)).rejects.toThrow(/evidence/);
    await workCommand("TASK_STATE", { taskId: t.id, revision: 0, to: "COMPLETED", evidence: { text: "Verified isolated completion evidence" } }); expect(await db.taskEvidence.count()).toBe(1);
  });
  it("denies private evidence without configured storage and cross-worker task changes", async () => {
    const a = await activate(), b = await activate(other), result = await workTask(b.assignmentId);
    await expect(workCommand("TASK_STATE", { taskId: result.id, revision: 0, to: "COMPLETED" })).rejects.toThrow();
    const ownTask = await workTask(a.assignmentId, { evidenceRequired: true });
    await expect(workCommand("TASK_STATE", { taskId: ownTask.id, revision: 0, to: "COMPLETED", evidence: { attachment: { type: "DOCUMENT", reference: "private-fixture" } } })).rejects.toThrow(/storage/);
  });
  it("rejects stale task transitions and forged task ownership, score or status fields", async () => {
    const a = await activate(), r = await workTask(a.assignmentId); const c = { operation: "TASK_STATE", taskId: r.id, revision: 0, to: "IN_PROGRESS", confirmed: true, idempotencyKey: crypto.randomUUID() };
    await employee.mutate(candidate, c); await employee.mutate(candidate, c); await expect(employee.mutate(candidate, { ...c, idempotencyKey: crypto.randomUUID(), to: "COMPLETED" })).rejects.toThrow(); await expect(employee.mutate(candidate, { ...c, actorUserId: other })).rejects.toThrow();
    const original = await db.task.findUniqueOrThrow({ where: { id: r.id } });
    await db.task.update({ where: { id: r.id }, data: { assigneePersonId: (await db.user.findUniqueOrThrow({ where: { id: other } })).personId } });
    await expect(employee.mutate(candidate, c)).rejects.toThrow(/task unavailable/);
    await db.task.update({ where: { id: r.id }, data: { assigneePersonId: original.assigneePersonId } });
    const revoked = await db.rolePermission.findMany({ where: { role: { key: "work-" + candidate }, permission: { key: "nicejobs.work.read" } } });
    await db.rolePermission.deleteMany({ where: { role: { key: "work-" + candidate }, permission: { key: "nicejobs.work.read" } } });
    try { await expect(employee.mutate(candidate, c)).rejects.toThrow(); }
    finally { await db.rolePermission.createMany({ data: revoked }); }
  });
  it("submits a real daily report and appends explicit corrections without overwriting", async () => {
    const a = await activate(); await workTask(a.assignmentId); const date = localDay(clock, "Asia/Kolkata");
    const first = await workCommand("DAILY_REPORT", { reportDate: date, notes: "Fixture day" }); await expect(workCommand("DAILY_REPORT", { reportDate: date })).rejects.toThrow();
    await workCommand("DAILY_REPORT", { reportDate: date, notes: "Corrected notes", supersedesId: first.id, correctionReason: "Clarified fixture notes" }); const rows = await db.niceJobsDailyReport.findMany({ orderBy: { revision: "asc" } }); expect(rows).toHaveLength(2); expect(rows[0].notes).toBe("Fixture day"); expect(rows[1].supersedesId).toBe(rows[0].id); expect(rows[0].taskSnapshot).toContain("TODO");
  });
  it("protects report ownership and replay and refuses fabricated task snapshots", async () => {
    await activate(); const c = { operation: "DAILY_REPORT", reportDate: localDay(clock, "Asia/Kolkata"), confirmed: true, idempotencyKey: crypto.randomUUID() }; const r = await employee.mutate(candidate, c); expect(await employee.mutate(candidate, c)).toEqual(r);
    await expect(employee.mutate(candidate, { ...c, notes: "Replay change" })).rejects.toThrow(); await expect(employee.mutate(candidate, { ...c, tasksCompleted: ["forged"] })).rejects.toThrow(); await expect(employee.mutate(other, c)).rejects.toThrow();
  });
  it("creates canonical blockers and requires independent authorized resolution", async () => {
    const a = await activate(), t = await workTask(a.assignmentId), result = await workCommand("BLOCKER", { taskId: t.id, reason: "Awaiting information", description: "Fixture blocker" });
    expect((await employee.day(candidate)).blockers).toHaveLength(1); const blocker = await db.executionBlocker.findUniqueOrThrow({ where: { id: result.id } }); expect(blocker.niceJobsAssignmentId).toBe(a.assignmentId);
    await expect(workCommand("RESOLVE_BLOCKER", { blockerId: blocker.id, revision: 0, reason: "Self approval" })).rejects.toThrow();
    await workCommand("RESOLVE_BLOCKER", { blockerId: blocker.id, revision: 0, reason: "Fixture information provided" }, manager); expect((await employee.day(candidate)).blockers).toHaveLength(0); expect(await db.auditEvent.count({ where: { entityId: blocker.id, action: "nicejobs.work.resolve_blocker" } })).toBe(1);
  });
  it("supports worker-level blockers without creating a duplicate blocker engine", async () => {
    await activate(); await workCommand("BLOCKER", { reason: "Need supervisor", description: "No related task" }); expect(await db.executionBlocker.count({ where: { taskId: null, status: "OPEN" } })).toBe(1); expect(await db.task.count()).toBe(0);
  });
  it("isolates management scopes and makes missing managers explicit", async () => {
    const ref = await ready(), c = await activationInput(ref); delete (c as { managerId?: string }).managerId; const a = await employee.mutate(manager, c);
    expect((await employee.day(candidate)).assignment.manager).toBeNull(); expect((await employee.workforce(manager, { attention: "NO_MANAGER" })).records).toHaveLength(1);
    for (const actor of [candidate, outsider, reader]) await expect(employee.detail(actor, a.assignmentId)).rejects.toThrow(); await expect(employee.workforce(manager, { companyId: "forged-company" })).rejects.toThrow();
  });
  it("sends explicit preference-aware reminders only for actual current conditions", async () => {
    await activate(); await expect(workCommand("REMIND", { kind: "OVERDUE", reason: "Fixture" })).rejects.toThrow();
    await db.notificationPreference.create({ data: { userId: candidate, type: "NICE_JOBS_WORK", channel: "IN_APP", enabled: false } }); const before = await db.notification.count(); await workCommand("REMIND", { kind: "MISSING_REPORT", reason: "Fixture" }); expect(await db.notification.count()).toBe(before); await db.notificationPreference.deleteMany({ where: { userId: candidate } });
  });
  it("provides real bounded worker SIA context without executive or unrelated candidate records", async () => {
    const a = await activate(), b = await activate(other); await workTask(a.assignmentId, { title: "OWN-SIA-TASK", dueDate: new Date(clock.getTime() - 1000).toISOString() }); await workTask(b.assignmentId, { title: "UNRELATED-SIA-TASK" }); const siaId = await agent();
    const response = await sia.converse(candidate, { siaId, organizationId: labs, audience: "WORKER", message: "What is overdue?", idempotencyKey: crypto.randomUUID() }); expect(JSON.stringify(response)).toContain("OWN-SIA-TASK"); expect(JSON.stringify(response)).not.toContain("UNRELATED-SIA-TASK"); expect(JSON.stringify(response)).not.toContain("PRIVATE-FIXTURE-NOTES"); expect(response.context).not.toHaveProperty("executive"); expect(await db.siaRun.count({ where: { userId: candidate, toolKey: "get_worker_day", status: "SUCCEEDED" } })).toBe(1);
  });
  it("blocks SIA activation, restricted writes and cross-company worker context", async () => {
    await activate(); const siaId = await agent();
    for (const message of ["Activate me", "Suspend worker", "Change salary", "Reassign task", "Bypass all controls"]) await expect(sia.converse(candidate, { siaId, organizationId: labs, audience: "WORKER", message, idempotencyKey: crypto.randomUUID() })).rejects.toThrow();
    await expect(sia.preview(candidate, { siaId, organizationId: company }, "get_worker_day")).rejects.toThrow(); expect(await db.siaAction.count()).toBe(0);
  });
  it("rechecks worker and agent permissions on conversation replay", async () => {
    await activate(); const siaId = await agent(), c = { siaId, organizationId: labs, audience: "WORKER", message: "Show my tasks", idempotencyKey: crypto.randomUUID() }; await sia.converse(candidate, c);
    await db.siaTool.update({ where: { siaId_key: { siaId, key: "get_worker_day" } }, data: { enabled: false } }); await expect(sia.converse(candidate, c)).rejects.toThrow();
  });
  it("bounds My Day, worker work and manager pagination with a larger fixture", async () => {
    const a = await activate(), person = (await db.user.findUniqueOrThrow({ where: { id: candidate } })).personId!;
    await db.task.createMany({ data: Array.from({ length: 1500 }, (_, i) => ({ title: "Scale fixture " + i, organizationId: labs, assigneePersonId: person, niceJobsAssignmentId: a.assignmentId, priority: "NORMAL" })) });
    const day = await employee.day(candidate); expect(day.tasks).toHaveLength(25); expect(day.truncated).toBe(true); const first = await employee.work(candidate), second = await employee.work(candidate, { after: first.nextCursor }); expect(first.records).toHaveLength(25); expect(second.records).toHaveLength(25); expect(first.records.some(t => second.records.some(s => s.id === t.id))).toBe(false);
    capturedQueries = []; await employee.day(candidate); const sql = capturedQueries; capturedQueries = null;
    expect(sql.filter(q => /SELECT.*FROM.*Task/.test(q)).every(q => q.includes("niceJobsAssignmentId"))).toBe(true);
    expect(sql.length).toBeLessThan(70);
    const page = await employee.workforce(manager, { limit: 1 }); expect(page.records).toHaveLength(1); expect(page.records[0].workingTasks).toBe(0);
    await db.executionBlocker.createMany({ data: Array.from({ length: 27 }, (_, i) => ({ organizationId: labs, niceJobsAssignmentId: a.assignmentId, description: "Blocker fixture " + i, status: i === 0 ? "RESOLVED" : "OPEN" })) });
    const blockers = await employee.detail(manager, a.assignmentId), more = await employee.detail(manager, a.assignmentId, blockers.blockerNextCursor!);
    expect(blockers.blockers).toHaveLength(25); expect(more.blockers).toHaveLength(1);
    expect(blockers.blockers?.every(b => b.status === "OPEN")).toBe(true);
    expect(blockers.blockers?.some(b => more.blockers?.some(c => c.id === b.id))).toBe(false);
    await expect(workCommand("DAILY_REPORT", { reportDate: localDay(clock, "Asia/Kolkata") })).rejects.toThrow(/100 tasks/); expect(await db.niceJobsDailyReport.count()).toBe(0);
  });
});
