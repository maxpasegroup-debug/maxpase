import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { createNiceJobsService } from "@/server/nicejobs/service";
import { createApplicationService } from "@/server/nicejobs/applications";
import { createRecruitmentService } from "@/server/nicejobs/recruitment";
import { createOperationsService } from "@/server/domain/operations-service";
import { createOnboardingService } from "@/server/nicejobs/onboarding";
import { orientationConfiguration, quizConfiguration, onboardingInput } from "@/server/nicejobs/onboarding-input";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phase04-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const jobs = createNiceJobsService(db), applications = createApplicationService(db), operations = createOperationsService(db);
let clock = new Date("2026-10-08T08:00:00Z");
const recruitment = createRecruitmentService(db, () => clock), onboarding = createOnboardingService(db, () => clock);
let company: string, labs: string, career: string, manager: string, approver: string, mentor: string, readyReviewer: string, candidate: string, other: string, outsider: string, reader: string, versionId: string, controlId: string;
const quiz = { form: { fields: [{ key: "safe", label: "Synthetic safety acknowledgement", type: "BOOLEAN", required: true }] }, assessment: { questions: [{ field: "safe", operator: "EQ", value: true, weight: 1, required: true }], passMark: 100 }, maxAttempts: 2 };
const orientation = { modules: [{ key: "introduction", title: "Synthetic introduction", order: 1, lessons: [{ key: "welcome", title: "Synthetic welcome", type: "TEXT", text: "Isolated fixture only, not real training", order: 1, completion: "ACKNOWLEDGE" }, { key: "check", title: "Synthetic quiz", type: "QUIZ", order: 2, completion: "QUIZ", quiz }] }] };
const ojt = { stages: [{ key: "practice", title: "Synthetic practice", order: 1, activities: [{ key: "evidence", title: "Synthetic practice activity", type: "PRACTICE", order: 1, instruction: "Describe the isolated fixture practice", expectedOutcome: "Independent review of fixture evidence", evidenceRequired: true, reviewRequired: true, maxAttempts: 2, dueDays: 1 }] }], assessment: { kind: "HUMAN", criteria: "Verify synthetic practical skill; explicit human rubric", maxAttempts: 2 } };
const training = { orientation, ojt, readiness: { requireAssessment: true, criteria: "Mandatory fixture training and assessment must pass" } };
async function human(name: string, org: string, keys: string[], descendants = false) {
  const person = await db.person.create({ data: { displayName: name } });
  const user = await db.user.create({ data: { email: name + "@phase04.invalid", personId: person.id } });
  const role = await db.role.create({ data: { key: person.id, name: "Explicit fixture capabilities", organizationId: org, permissions: { create: [...new Set(keys)].map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId: org, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } }); return user.id;
}
async function publish(extra = {}, code = "TEST-04") {
  const v = await jobs.create(manager, { code, title: "Synthetic onboarding job", visibility: "PUBLIC", divisionIds: [labs], configuration: { schemaVersion: 1, application: { fields: [{ key: "experience", label: "Synthetic experience", type: "NUMBER", required: true }] }, eligibility: { rules: [{ field: "experience", operator: "GTE", value: 1 }] }, screening: { questions: [{ field: "experience", operator: "GTE", value: 1, weight: 1 }], passMark: 80 }, interview: { enabled: false, type: "VIDEO", duration: 30, questions: [], evaluationRequired: false }, management: { policies: [{ divisionId: labs, controlPointId: controlId }] }, offer: { title: "Synthetic offer", content: { terms: "Isolated fixture, not employment terms" }, validityDays: 2 }, ...training, ...extra } });
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
async function oriented(ref: string) {
  await act(ref, "START_ORIENTATION"); await act(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "welcome")).id, acknowledged: true });
  await act(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "check")).id, answers: { safe: true } }); await act(ref, "FINISH_ORIENTATION");
}
async function assigned(ref: string) { await act(ref, "ASSIGN_REVIEWER", { reviewerKind: "OJT", reviewerUserId: mentor }, manager, false); await act(ref, "ASSIGN_REVIEWER", { reviewerKind: "READINESS", reviewerUserId: readyReviewer }, manager, false); }
async function reviewed(ref: string, key: string, outcome: string, feedback = "Released fixture feedback") {
  const p = await progress(ref, key), s = await db.niceJobsTrainingSubmission.findFirstOrThrow({ where: { progressId: p.id, attempt: p.attempt } });
  return act(ref, "REVIEW", { submissionId: s.id, outcome, feedback }, mentor, false);
}
async function ojtComplete(ref: string) {
  await oriented(ref); await assigned(ref); await act(ref, "START_OJT");
  await act(ref, "SUBMIT_ACTIVITY", { progressId: (await progress(ref, "evidence")).id, evidence: { text: "Synthetic practice evidence" } }); await reviewed(ref, "evidence", "APPROVED");
  await act(ref, "SUBMIT_ASSESSMENT", { progressId: (await progress(ref, "ojt_assessment")).id, evidence: { text: "Synthetic practical assessment evidence" } }); await reviewed(ref, "ojt_assessment", "PASS");
}
beforeAll(async () => {
  const sql = new DatabaseSync(file); for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8")); sql.close();
  await db.$transaction(initializeGroupStructure);
  for (const p of workforcePermissions) await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  await db.permission.upsert({ where: { key: "organization.read" }, update: {}, create: { key: "organization.read", name: "Read", scope: "GROUP" } });
  const org = async (slug: string) => (await db.organization.findUniqueOrThrow({ where: { slug } })).id;
  company = await org("aira-skill-city"); labs = await org("aira-labs"); career = await org("aira-career-hub");
  const all = [...workforcePermissions.map(p => p.key), "organization.read"];
  manager = await human("manager", company, all, true); approver = await human("approver", labs, ["nicejobs.application.read", "nicejobs.management.review", "nicejobs.management.approve", "approval.read", "approval.decide", "request.read", "control.read", "notification.read"]);
  mentor = await human("mentor", labs, ["nicejobs.ojt.review", "notification.read"]); readyReviewer = await human("readiness", labs, ["nicejobs.readiness.review", "notification.read"]);
  candidate = await human("candidate", career, ["organization.read", "nicejobs.application.self", "nicejobs.onboarding.self", "notification.read"]); other = await human("other", career, ["organization.read", "nicejobs.application.self", "nicejobs.onboarding.self", "notification.read"]);
  outsider = await human("outsider", await org("pearn"), all, true); reader = await human("reader", labs, ["nicejobs.onboarding.read"]);
  controlId = (await operations.saveControl(manager, { organizationId: labs, name: "Fixture independent approval", kind: "HUMAN_DECISION", requiredPermission: "nicejobs.management.approve", stages: [[{ approverUserId: approver, requiredPermission: "nicejobs.management.approve" }]] })).id;
}, 30000);
beforeEach(async () => {
  await db.niceJobsTrainingReview.deleteMany(); await db.niceJobsTrainingSubmission.deleteMany(); await db.niceJobsTrainingProgress.deleteMany(); await db.niceJobsOnboarding.deleteMany(); await db.niceJobsTrainingPlan.deleteMany();
  await db.niceJobsOffer.deleteMany(); await db.niceJobsApplicationHistory.deleteMany(); await db.niceJobsApplication.deleteMany(); await db.siaApproval.deleteMany(); await db.operationalRequest.deleteMany(); await db.notification.deleteMany();
  await db.niceJobsTemplate.updateMany({ data: { publishedVersionId: null } }); await db.niceJobsVersionArea.deleteMany(); await db.niceJobsVersion.deleteMany(); await db.niceJobsTemplate.deleteMany();
  clock = new Date("2026-10-08T08:00:00Z"); versionId = await publish();
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
describe("Nice Jobs orientation, OJT and human readiness", () => {
  it("rejects invalid content, conflicting order, invalid quiz types and forged identity", () => {
    expect(orientationConfiguration.safeParse(orientation).success).toBe(true);
    expect(orientationConfiguration.safeParse({ modules: [] }).success).toBe(false);
    expect(quizConfiguration.safeParse({ ...quiz, assessment: { questions: [{ field: "safe", operator: "GTE", value: 1, weight: 1 }], passMark: 80 } }).success).toBe(false);
    expect(onboardingInput.safeParse({ applicationReference: crypto.randomUUID(), operation: "ENROLL", revision: 0, idempotencyKey: crypto.randomUUID(), actorUserId: manager }).success).toBe(false);
  });
  it("requires accepted offer and immutable candidate acceptance audit evidence", async () => {
    const draft = await applications.create(candidate, { versionId, divisionId: labs }); await expect(act(draft.reference, "ENROLL")).rejects.toThrow();
    const ref = await accepted(other); await db.niceJobsApplicationHistory.deleteMany({ where: { action: "ACCEPT_OFFER" } }); await expect(act(ref, "ENROLL", {}, other)).rejects.toThrow(); expect(await db.niceJobsOnboarding.count()).toBe(0);
  });
  it("shares one immutable plan across workers and deduplicates enrollment", async () => {
    const a = await enroll(); await act(a, "ENROLL"); const b = await accepted(other); await act(b, "ENROLL", {}, other);
    expect(await db.niceJobsTrainingPlan.count()).toBe(1); expect(await db.niceJobsOnboarding.count()).toBe(2); expect(await db.niceJobsTrainingProgress.count()).toBe(4);
    await expect(jobs.edit(manager, versionId, 0, { title: "Mutated", engagement: "PART_TIME", divisionIds: [labs], configuration: training })).rejects.toThrow();
  });
  it("does not mutate progress on reads and prevents premature OJT/readiness", async () => {
    const ref = await enroll(); const d = await onboarding.detail(candidate, ref, true); expect(d.orientation.completed).toBe(0); expect(d.status).toBe("NOT_STARTED");
    for (const op of ["START_OJT", "REQUEST_READINESS", "FINISH_ORIENTATION"]) await expect(act(ref, op)).rejects.toThrow();
    expect((await progress(ref, "welcome")).attempt).toBe(0);
  });
  it("requires explicit ordered completion and server-grades configured quiz attempts", async () => {
    const ref = await enroll(); await act(ref, "START_ORIENTATION"); await expect(act(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "check")).id, answers: { safe: true } })).rejects.toThrow();
    await expect(act(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "welcome")).id })).rejects.toThrow();
    await act(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "welcome")).id, acknowledged: true });
    await act(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "check")).id, answers: { safe: false } }); expect((await progress(ref, "check")).status).toBe("REWORK_REQUIRED");
    await expect(act(ref, "FINISH_ORIENTATION")).rejects.toThrow();
    await act(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "check")).id, answers: { safe: true } }); await act(ref, "FINISH_ORIENTATION");
    expect((await onboarding.detail(candidate, ref, true)).orientation).toMatchObject({ required: 2, completed: 2 });
    await expect(act(ref, "FINISH_ORIENTATION")).rejects.toThrow();
  });
  it("blocks quiz answer/score injection and does not expose answer keys", async () => {
    const ref = await enroll(); await act(ref, "START_ORIENTATION"); await act(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "welcome")).id, acknowledged: true });
    await expect(act(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "check")).id, answers: { safe: true, forged: true } })).rejects.toThrow();
    const d = await onboarding.detail(candidate, ref, true); expect(JSON.stringify(d)).not.toContain('"passMark"'); expect(JSON.stringify(d)).not.toContain('"operator"');
  });
  it("enforces current independent reviewer assignments without requiring hiring-history access", async () => {
    const ref = await enroll(); await oriented(ref);
    for (const id of [candidate, outsider, reader]) await expect(act(ref, "ASSIGN_REVIEWER", { reviewerKind: "OJT", reviewerUserId: id }, manager, false)).rejects.toThrow();
    await assigned(ref); expect((await onboarding.detail(mentor, ref, false)).permissions.review).toBe(true); await expect(applications.detail(mentor, ref, false)).rejects.toThrow();
    await act(ref, "START_OJT"); await act(ref, "SUBMIT_ACTIVITY", { progressId: (await progress(ref, "evidence")).id, evidence: { text: "Private practice evidence" } });
    const s = await db.niceJobsTrainingSubmission.findFirstOrThrow({ where: { progressId: (await progress(ref, "evidence")).id } });
    for (const user of [manager, readyReviewer, outsider, candidate]) await expect(act(ref, "REVIEW", { submissionId: s.id, outcome: "APPROVED" }, user, false)).rejects.toThrow();
    await reviewed(ref, "evidence", "REWORK_REQUIRED"); await act(ref, "SUBMIT_ACTIVITY", { progressId: (await progress(ref, "evidence")).id, evidence: { text: "Corrected fixture practice" } }); await reviewed(ref, "evidence", "APPROVED");
    expect(await db.niceJobsTrainingReview.count()).toBe(2); expect(await db.niceJobsTrainingSubmission.count({ where: { progressId: s.progressId } })).toBe(2);
  });
  it("keeps private evidence and notes separate from released candidate feedback", async () => {
    const ref = await enroll(); await ojtComplete(ref);
    const candidateDTO = JSON.stringify(await onboarding.detail(candidate, ref, true)), readerDTO = JSON.stringify(await onboarding.detail(reader, ref, false));
    for (const dto of [candidateDTO, readerDTO]) { expect(dto).not.toContain("PRIVATE-FIXTURE-NOTES"); expect(dto).not.toContain("Synthetic practice evidence"); }
    expect(candidateDTO).toContain("Released fixture feedback"); expect(JSON.stringify(await onboarding.detail(mentor, ref, false))).toContain("PRIVATE-FIXTURE-NOTES");
  });
  it("completes the full readiness path without activation, production work or worker identity duplication", async () => {
    const ref = await enroll(); await ojtComplete(ref); await act(ref, "REQUEST_READINESS");
    await expect(act(ref, "DECIDE_READINESS", { outcome: "READY" }, manager, false)).rejects.toThrow();
    await act(ref, "DECIDE_READINESS", { outcome: "READY", feedback: "Prepared, not activated" }, readyReviewer, false);
    const d = await onboarding.detail(candidate, ref, true); expect(d.status).toBe("READY"); expect(d.checks.assessment).toBe("PASS");
    expect(await db.niceJobsWorkerProfile.count()).toBe(0); expect(await db.niceJobsAssignment.count()).toBe(0); expect(await db.task.count()).toBe(0);
    expect((await db.niceJobsTrainingReview.findFirstOrThrow({ where: { kind: "READINESS" } })).requirements).toContain(d.fingerprint);
    await expect(act(ref, "START_OJT")).rejects.toThrow();
  });
  it("makes missing configuration explicit and blocks missing required assessments", async () => {
    const missing = await publish({ orientation: null, ojt: null, readiness: null }, "MISSING"), ref = await enroll(await accepted(candidate, missing));
    const d = await onboarding.detail(candidate, ref, true); expect(d.checks).toMatchObject({ orientation: "NOT_CONFIGURED", ojt: "NOT_CONFIGURED", assessment: "NOT_CONFIGURED" }); await expect(act(ref, "START_ORIENTATION")).rejects.toThrow();
    versionId = await publish({ ojt: { ...ojt, assessment: null } }, "NO-ASSESSMENT"); const second = await enroll(); await oriented(second); await assigned(second); await act(second, "START_OJT");
    await act(second, "SUBMIT_ACTIVITY", { progressId: (await progress(second, "evidence")).id, evidence: { text: "Fixture" } }); await reviewed(second, "evidence", "APPROVED"); await expect(act(second, "REQUEST_READINESS")).rejects.toThrow(/assessment/);
  });
  it("allows explicit assessment waivers but never fabricates a passing result", async () => {
    versionId = await publish({ ojt: { ...ojt, assessment: null }, readiness: { requireAssessment: false, criteria: "Explicit fixture assessment waiver" } }, "WAIVER"); const ref = await enroll(); await oriented(ref); await assigned(ref); await act(ref, "START_OJT");
    await act(ref, "SUBMIT_ACTIVITY", { progressId: (await progress(ref, "evidence")).id, evidence: { text: "Fixture" } }); await reviewed(ref, "evidence", "APPROVED"); await act(ref, "REQUEST_READINESS"); expect((await onboarding.detail(candidate, ref, true)).checks.assessment).toBe("NOT_REQUIRED");
  });
  it("supports not-ready, human follow-up and immutable decision history", async () => {
    const ref = await enroll(); await ojtComplete(ref); await act(ref, "REQUEST_READINESS"); await act(ref, "DECIDE_READINESS", { outcome: "NOT_READY" }, readyReviewer, false);
    await expect(act(ref, "REQUEST_READINESS")).rejects.toThrow(); await act(ref, "REOPEN", {}, manager, false); await act(ref, "REQUEST_READINESS"); await act(ref, "DECIDE_READINESS", { outcome: "NEEDS_REVIEW" }, readyReviewer, false);
    expect((await onboarding.detail(candidate, ref, true)).reviews).toHaveLength(2);
  });
  it("rejects stale revision, replay mismatch and duplicate submissions atomically", async () => {
    const ref = await enroll(), c = await command(ref, "START_ORIENTATION"); await onboarding.mutate(candidate, c, true); await onboarding.mutate(candidate, c, true);
    await expect(onboarding.mutate(candidate, { ...c, operation: "START_OJT" }, true)).rejects.toThrow(/Replay/);
    await expect(onboarding.mutate(candidate, { ...c, idempotencyKey: crypto.randomUUID() }, true)).rejects.toThrow(/changed/);
    const complete = await command(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "welcome")).id, acknowledged: true }); await onboarding.mutate(candidate, complete, true); await onboarding.mutate(candidate, complete, true);
    expect(await db.niceJobsTrainingSubmission.count()).toBe(1);
  });
  it("rolls back enrollment, progress and audit when notification persistence fails", async () => {
    const ref = await accepted(), before = await db.auditEvent.count({ where: { action: "nicejobs.onboarding.enroll" } }), sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_training_notification BEFORE INSERT ON Notification WHEN NEW.type = 'NICE_JOBS_ONBOARDING' BEGIN SELECT RAISE(ABORT, 'Fixture notification failure'); END;"); sql.close();
    try { await expect(act(ref, "ENROLL")).rejects.toThrow(); expect(await db.niceJobsOnboarding.count()).toBe(0); expect(await db.niceJobsTrainingPlan.count()).toBe(0); expect(await db.auditEvent.count({ where: { action: "nicejobs.onboarding.enroll" } })).toBe(before); }
    finally { const clean = new DatabaseSync(file); clean.exec("DROP TRIGGER fail_training_notification"); clean.close(); }
  });
  it("fails closed for private content/evidence and cross-scope record references", async () => {
    const ref = await enroll(); await oriented(ref); await assigned(ref); await act(ref, "START_OJT"); const p = await progress(ref, "evidence");
    await expect(act(ref, "SUBMIT_ACTIVITY", { progressId: p.id, evidence: { attachment: { type: "DOCUMENT", reference: "private:fixture" } } })).rejects.toThrow(/not configured/);
    const project = await db.project.create({ data: { organizationId: labs, name: "Private fixture", slug: "fixture" } }); await expect(act(ref, "SUBMIT_ACTIVITY", { progressId: p.id, evidence: { record: { type: "PROJECT", id: project.id } } })).rejects.toThrow();
    await db.project.delete({ where: { id: project.id } }); expect((await progress(ref, "evidence")).attempt).toBe(0);
  });
  it("enforces identity/membership revocation, company isolation and candidate ownership", async () => {
    const ref = await enroll(); for (const [user, own] of [[other, true], [outsider, false]] as const) await expect(onboarding.detail(user, ref, own)).rejects.toThrow();
    await expect(onboarding.list(manager, false, { companyId: "forged" })).rejects.toThrow(); await assigned(ref);
    const person = (await db.user.findUniqueOrThrow({ where: { id: mentor } })).personId!; await db.membership.updateMany({ where: { personId: person }, data: { status: "SUSPENDED" } });
    try { await expect(onboarding.detail(mentor, ref, false)).rejects.toThrow(); } finally { await db.membership.updateMany({ where: { personId: person }, data: { status: "ACTIVE" } }); }
  });
  it("filters real scoped records, paginates deterministically and keeps My Reviews assigned-only", async () => {
    const a = await enroll(), b = await accepted(other); await act(b, "ENROLL", {}, other); await assigned(a);
    expect((await onboarding.list(candidate, true)).records).toHaveLength(1); expect((await onboarding.list(mentor, false, {}, true)).records.map(r => r.reference)).toEqual([a]);
    const first = await onboarding.list(manager, false, { limit: 1 }); expect(first.nextCursor).not.toBeNull(); const second = await onboarding.list(manager, false, { limit: 1, after: first.nextCursor! }); expect(second.records[0].reference).not.toBe(first.records[0].reference);
    expect((await onboarding.list(manager, false, { status: "READY" })).records).toHaveLength(0); expect((await onboarding.list(manager, false, { divisionId: labs, versionId, reviewerUserId: mentor })).records).toHaveLength(1);
  });
  it("records explicit reminders and UTC elapsed duration without schedulers or auto-readiness", async () => {
    versionId = await publish({ ojt: { ...ojt, durationDays: 2 } }, "DURATION"); const ref = await enroll(); await ojtComplete(ref); await expect(act(ref, "REQUEST_READINESS")).rejects.toThrow(/duration/);
    clock = new Date(clock.getTime() + 2 * 86400000); await act(ref, "REMIND", {}, manager, false); await act(ref, "REQUEST_READINESS"); expect((await onboarding.detail(candidate, ref, true)).status).toBe("READINESS_REVIEW");
    expect(await db.operationalEvent.count({ where: { eventType: "nicejobs.onboarding.remind" } })).toBe(1);
  });
});
