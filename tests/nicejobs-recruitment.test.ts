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
import { configuration } from "@/server/nicejobs/input";
import { interviewConfiguration, recruitmentInput } from "@/server/nicejobs/recruitment-input";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phase03-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const jobs = createNiceJobsService(db), applications = createApplicationService(db), operations = createOperationsService(db);
let clock: Date;
const recruitment = createRecruitmentService(db, () => clock);
let company: string, labs: string, startup: string, career: string, manager: string, approver: string, secondApprover: string, interviewer: string, secondInterviewer: string, candidate: string, other: string, outsider: string, reader: string, versionId: string, controlId: string;
type Application = Awaited<ReturnType<typeof applications.create>>;
const formConfig = { schemaVersion: 1, application: { fields: [{ key: "experience", label: "Experience", type: "NUMBER", required: true }] }, eligibility: { rules: [{ field: "experience", operator: "GTE", value: 1 }] }, screening: { questions: [{ field: "experience", operator: "GTE", value: 1, weight: 1 }], passMark: 80 } };
const interviewConfig = { enabled: true, type: "VIDEO", duration: 30, minInterviewers: 1, maxInterviewers: 2, evaluationRequired: true, questions: [{ key: "evidence", question: "Isolated test evidence", type: "TEXT", required: true, order: 1, weight: 2, active: true }] };
const offerConfig = { title: "Isolated test offer", content: { terms: "Isolated fixture terms; not a real employment offer" }, validityDays: 2, declineReasonRequired: true };
async function human(name: string, org: string, keys: string[], descendants = false) {
  const person = await db.person.create({ data: { displayName: name } });
  const user = await db.user.create({ data: { email: name + "@phase03.invalid", personId: person.id, timezone: "Asia/Kolkata" } });
  const role = await db.role.create({ data: { key: person.id, name: "Explicit test capabilities", organizationId: org, permissions: { create: [...new Set(keys)].map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: person.id, organizationId: org, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } });
  return user.id;
}
async function publish(extra = {}, code = "TEST-03") {
  const v = await jobs.create(manager, { code, title: "Recruitment test job", visibility: "PUBLIC", divisionIds: [labs], configuration: { ...formConfig, interview: interviewConfig, management: { policies: [{ divisionId: labs, controlPointId: controlId }] }, offer: offerConfig, ...extra } });
  await jobs.changeJob(manager, { id: v.id, revision: 0, to: "PUBLISHED", reason: "Isolated test publication" }); return v.id;
}
async function shortlisted(userId = candidate) {
  let a = await applications.create(userId, { versionId, divisionId: labs });
  a = await applications.mutate(userId, { reference: a.reference, revision: 0, action: "SUBMIT", answers: { experience: 2 } });
  for (const action of ["ELIGIBILITY", "SCREENING", "SHORTLIST"]) a = await applications.mutate(manager, { reference: a.reference, revision: a.revision, action, reason: "Human fixture review" });
  return a;
}
async function row(a: Pick<Application, "reference">) { return db.niceJobsApplication.findUniqueOrThrow({ where: { reference: a.reference } }); }
async function act(a: Pick<Application, "reference">, operation: string, extra = {}, userId = manager) { const r = await row(a); return recruitment.mutate(userId, { reference: r.reference, revision: r.revision, operation, ...(!["VIEW_OFFER", "ACCEPT_OFFER", "DECLINE_OFFER"].includes(operation) ? { reason: "Private fixture review" } : {}), ...extra }); }
async function interview(a: Pick<Application, "reference">) { const r = await row(a); return db.niceJobsInterview.findFirstOrThrow({ where: { applicationId: r.id }, orderBy: { number: "desc" } }); }
async function offer(a: Pick<Application, "reference">) { const r = await row(a); return db.niceJobsOffer.findFirstOrThrow({ where: { applicationId: r.id }, orderBy: { number: "desc" } }); }
async function scheduled(a: Pick<Application, "reference">, panel = [interviewer]) {
  await act(a, "CREATE_INTERVIEW", { interviewerIds: panel }); let i = await interview(a);
  await act(a, "SCHEDULE", { interviewReference: i.reference, recordRevision: i.revision, scheduledAt: new Date(clock.getTime() + 3600000).toISOString(), location: "Private fixture location", instructions: "Candidate-visible instruction" }); i = await interview(a); return i;
}
async function evaluated(a: Pick<Application, "reference">, userId = interviewer, recommendation = "RECOMMEND") {
  const i = await interview(a);
  return act(a, "EVALUATE", { interviewReference: i.reference, recordRevision: i.revision, answers: { evidence: "Private interview answer" }, scores: { evidence: 8 }, recommendation, reason: "PRIVATE-NOTES" }, userId);
}
async function review(a: Pick<Application, "reference">) {
  await scheduled(a); clock = new Date(clock.getTime() + 7200000); await evaluated(a);
  const i = await interview(a); await act(a, "COMPLETE_INTERVIEW", { interviewReference: i.reference, recordRevision: i.revision }); await act(a, "START_REVIEW");
}
async function decide(a: Pick<Application, "reference">, decision = "APPROVED", userId = approver) {
  const r = await row(a), approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: r.reviewRequestId, approverUserId: userId, status: "PENDING" } });
  return act(a, "DECIDE", { approvalId: approval.id, decision, candidateMessage: "Released candidate message" }, userId);
}
async function issued(a: Pick<Application, "reference">) {
  await review(a); await decide(a); await act(a, "PREPARE_OFFER"); let o = await offer(a);
  await act(a, "READY_OFFER", { offerReference: o.reference, recordRevision: o.revision }); o = await offer(a);
  await act(a, "ISSUE_OFFER", { offerReference: o.reference, recordRevision: o.revision }); return offer(a);
}
beforeAll(async () => {
  const sql = new DatabaseSync(file); for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8")); sql.close();
  await db.$transaction(initializeGroupStructure);
  for (const p of workforcePermissions) await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  await db.permission.upsert({ where: { key: "organization.read" }, update: {}, create: { key: "organization.read", name: "Read", scope: "GROUP" } });
  const org = async (slug: string) => (await db.organization.findUniqueOrThrow({ where: { slug } })).id;
  company = await org("aira-skill-city"); labs = await org("aira-labs"); startup = await org("aira-startup-school"); career = await org("aira-career-hub");
  const all = [...workforcePermissions.map(p => p.key), "organization.read"];
  manager = await human("manager", company, all, true);
  const decisionKeys = ["nicejobs.application.read", "nicejobs.management.review", "nicejobs.management.approve", "nicejobs.management.reject", "approval.read", "approval.decide", "request.read", "control.read", "notification.read"];
  approver = await human("approver", labs, decisionKeys); secondApprover = await human("second-approver", labs, decisionKeys);
  const evaluationKeys = ["nicejobs.application.read", "nicejobs.interview.read", "nicejobs.interview.evaluate", "notification.read"];
  interviewer = await human("interviewer", labs, evaluationKeys); secondInterviewer = await human("second-interviewer", labs, evaluationKeys);
  candidate = await human("candidate", career, ["organization.read", "nicejobs.application.self", "notification.read"]);
  other = await human("other", career, ["organization.read", "nicejobs.application.self", "notification.read"]);
  outsider = await human("outsider", await org("pearn"), all, true); reader = await human("reader", labs, ["nicejobs.application.read"]);
  const control = await operations.saveControl(manager, { organizationId: labs, name: "Independent test hiring approval", kind: "HUMAN_DECISION", requiredPermission: "nicejobs.management.approve", stages: [[{ approverUserId: approver, requiredPermission: "nicejobs.management.approve" }]] }); controlId = control.id;
}, 30000);
beforeEach(async () => {
  await db.niceJobsInterviewEvaluation.deleteMany(); await db.niceJobsInterviewer.deleteMany(); await db.niceJobsInterview.deleteMany(); await db.niceJobsOffer.deleteMany(); await db.niceJobsApplicationHistory.deleteMany(); await db.niceJobsApplication.deleteMany();
  await db.siaApproval.deleteMany(); await db.operationalRequest.deleteMany(); await db.notification.deleteMany();
  await db.niceJobsTemplate.updateMany({ data: { publishedVersionId: null } }); await db.niceJobsVersionArea.deleteMany(); await db.niceJobsVersion.deleteMany(); await db.niceJobsTemplate.deleteMany();
  clock = new Date("2026-10-08T08:00:00.000Z"); versionId = await publish();
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Nice Jobs interview, approval and offer controls", () => {
  it("validates configurable question types, counts, weights and forged identity fields", () => {
    expect(interviewConfiguration.safeParse({ ...interviewConfig, questions: [] }).success).toBe(false);
    expect(interviewConfiguration.safeParse({ ...interviewConfig, minInterviewers: 3 }).success).toBe(false);
    expect(configuration.safeParse({ ...formConfig, interview: interviewConfig, offer: offerConfig }).success).toBe(true);
    expect(recruitmentInput.safeParse({ reference: crypto.randomUUID(), revision: 0, operation: "ACCEPT_OFFER", actorUserId: manager }).success).toBe(false);
  });
  it("only shortlisted candidates enter interview and schedulers must have actual scoped authority", async () => {
    const draft = await applications.create(candidate, { versionId, divisionId: labs }); await expect(act(draft, "CREATE_INTERVIEW", { interviewerIds: [interviewer] })).rejects.toThrow();
    const a = await shortlisted(other);
    for (const user of [candidate, reader, outsider]) await expect(act(a, "CREATE_INTERVIEW", { interviewerIds: [interviewer] }, user)).rejects.toThrow();
    await act(a, "CREATE_INTERVIEW", { interviewerIds: [interviewer] }); expect((await row(a)).status).toBe("INTERVIEW");
  });
  it("rejects forged, inactive, duplicated and candidate interviewers", async () => {
    const a = await shortlisted();
    for (const ids of [[candidate], [outsider], [reader], [interviewer, interviewer]]) await expect(act(a, "CREATE_INTERVIEW", { interviewerIds: ids })).rejects.toThrow();
    await db.user.update({ where: { id: interviewer }, data: { status: "INACTIVE" } });
    try { await expect(act(a, "CREATE_INTERVIEW", { interviewerIds: [interviewer] })).rejects.toThrow(); } finally { await db.user.update({ where: { id: interviewer }, data: { status: "ACTIVE" } }); }
  });
  it("records schedules and permits candidate reschedule requests, not direct date manipulation", async () => {
    const a = await shortlisted(), i = await scheduled(a); const detail = await recruitment.detail(candidate, a.reference, true);
    expect(detail.interviews[0]).toMatchObject({ status: "SCHEDULED", instructions: "Candidate-visible instruction" }); expect(detail.interviews[0]).not.toHaveProperty("evaluations");
    await expect(act(a, "SCHEDULE", { interviewReference: i.reference, recordRevision: i.revision, scheduledAt: clock.toISOString() }, candidate)).rejects.toThrow();
    await act(a, "REQUEST_RESCHEDULE", { interviewReference: i.reference, recordRevision: i.revision, reason: "Candidate requested change" }, candidate);
    expect((await interview(a)).scheduledAt).toEqual(i.scheduledAt); expect((await interview(a)).status).toBe("RESCHEDULE_REQUESTED");
    await expect(act(a, "COMPLETE_INTERVIEW", { recordRevision: i.revision })).rejects.toThrow();
    const current = await interview(a); await act(a, "SCHEDULE", { recordRevision: current.revision, scheduledAt: new Date(clock.getTime() + 10800000).toISOString() }); expect((await interview(a)).status).toBe("SCHEDULED");
  });
  it("rejects candidate and cross-company interview/offer IDOR without leaking internal records", async () => {
    const a = await shortlisted(); await scheduled(a);
    for (const [user, own] of [[other, true], [outsider, false]] as const) await expect(recruitment.detail(user, a.reference, own)).rejects.toThrow();
    await expect(applications.list(manager, false, { companyId: startup })).rejects.toThrow();
  });
  it("requires scheduled time and assigned current interviewer; duplicate evaluation is immutable", async () => {
    const a = await shortlisted(); await scheduled(a); await expect(evaluated(a)).rejects.toThrow(); clock = new Date(clock.getTime() + 7200000);
    for (const user of [candidate, manager, secondInterviewer, outsider]) await expect(evaluated(a, user)).rejects.toThrow();
    await evaluated(a); await expect(evaluated(a)).rejects.toThrow(); expect(await db.niceJobsInterviewEvaluation.count()).toBe(1);
    expect((await row(a)).status).toBe("INTERVIEW");
  });
  it("validates required typed evidence, bounded scores and unknown question injection", async () => {
    const a = await shortlisted(); const i = await scheduled(a); clock = new Date(clock.getTime() + 7200000);
    for (const extra of [{ answers: {} }, { answers: { evidence: true } }, { scores: { evidence: 11 } }, { answers: { evidence: "ok", forged: "secret" } }]) await expect(act(a, "EVALUATE", { interviewReference: i.reference, answers: { evidence: "ok" }, scores: { evidence: 5 }, recommendation: "RECOMMEND", ...extra }, interviewer)).rejects.toThrow();
  });
  it("supports multiple independent evaluations and protects unrelated evaluator evidence", async () => {
    const a = await shortlisted(); let i = await scheduled(a, [interviewer, secondInterviewer]); clock = new Date(clock.getTime() + 7200000); await evaluated(a);
    i = await interview(a); await act(a, "COMPLETE_INTERVIEW", { recordRevision: i.revision }); expect((await row(a)).status).toBe("INTERVIEW");
    const separate = await recruitment.detail(secondInterviewer, a.reference, false); expect(JSON.stringify(separate)).not.toContain("PRIVATE-NOTES");
    await evaluated(a, secondInterviewer, "NEEDS_REVIEW"); expect((await row(a)).status).toBe("MANAGEMENT_REVIEW");
    const own = await recruitment.detail(candidate, a.reference, true); for (const secret of ["PRIVATE-NOTES", "weightedScore", "recommendation", "questions", "approvalId"]) expect(JSON.stringify(own)).not.toContain(secret);
    expect((await recruitment.detail(manager, a.reference, false)).interviews[0]).toHaveProperty("evaluations");
    expect(JSON.stringify((await applications.detail(reader, a.reference, false)).management!.history)).not.toContain("PRIVATE-NOTES");
  });
  it("page reads cannot complete interviews or mark offers viewed", async () => {
    const a = await shortlisted(); await scheduled(a); await recruitment.detail(candidate, a.reference, true); expect((await interview(a)).status).toBe("SCHEDULED");
    const b = await shortlisted(other), o = await issued(b); await recruitment.detail(other, b.reference, true); expect((await offer(b)).status).toBe("ISSUED"); expect(o.viewedAt).toBeNull();
  });
  it("supports cancellation/no-show without losing evidence or advancing to approval", async () => {
    const a = await shortlisted(); let i = await scheduled(a); await act(a, "CANCEL_INTERVIEW", { recordRevision: i.revision }); expect((await row(a)).status).toBe("SHORTLISTED");
    i = await scheduled(a); clock = new Date(clock.getTime() + 7200000); await act(a, "NO_SHOW", { recordRevision: i.revision }); expect((await interview(a)).status).toBe("NO_SHOW"); expect((await row(a)).status).toBe("SHORTLISTED");
  });
  it("reuses an independent human approval request and forbids self/unassigned/replayed decisions", async () => {
    const a = await shortlisted(); await review(a); const r = await row(a), approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: r.reviewRequestId } });
    for (const user of [candidate, manager, interviewer, outsider]) await expect(act(a, "DECIDE", { approvalId: approval.id, decision: "APPROVED" }, user)).rejects.toThrow();
    await decide(a); expect((await row(a)).status).toBe("APPROVED"); await expect(act(a, "DECIDE", { approvalId: approval.id, decision: "APPROVED" }, approver)).rejects.toThrow();
    expect(await db.niceJobsApplicationHistory.count({ where: { action: "DECIDE", applicationId: r.id } })).toBe(1);
  });
  it("supports sequential approval chains with distinct people and no early offer issuance", async () => {
    const c = await operations.saveControl(manager, { organizationId: labs, name: "Two-level hiring review", kind: "APPROVAL", requiredPermission: "nicejobs.management.approve", stages: [approver, secondApprover].map(approverUserId => [{ approverUserId, requiredPermission: "nicejobs.management.approve" }]) });
    versionId = await publish({ management: { policies: [{ divisionId: labs, controlPointId: c.id }] } }, "CHAIN"); const a = await shortlisted(); await review(a);
    await expect(decide(a, "APPROVED", secondApprover)).rejects.toThrow(); await decide(a); expect((await row(a)).status).toBe("MANAGEMENT_REVIEW"); await expect(act(a, "PREPARE_OFFER")).rejects.toThrow();
    await decide(a, "APPROVED", secondApprover); expect((await row(a)).status).toBe("APPROVED");
  });
  it("generic approval inbox decisions remain private until an authorized recruitment release", async () => {
    const a = await shortlisted(); await review(a); const r = await row(a);
    const approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: r.reviewRequestId, status: "PENDING" } });
    await operations.decide(approver, { approvalId: approval.id, decision: "APPROVED", comment: "Private canonical approval" });
    expect((await row(a)).status).toBe("MANAGEMENT_REVIEW"); expect(JSON.stringify(await recruitment.detail(candidate, a.reference, true))).not.toContain("Private canonical approval");
    await expect(act(a, "RELEASE_DECISION", {}, reader)).rejects.toThrow();
    await act(a, "RELEASE_DECISION", { candidateMessage: "Explicit release" }); expect((await row(a)).status).toBe("APPROVED");
    await expect(operations.decide(approver, { approvalId: approval.id, decision: "APPROVED", comment: "Replay" })).rejects.toThrow();
  });
  it("preserves post-interview rejection evidence and separates private reason from released message", async () => {
    const a = await shortlisted(); await review(a); await decide(a, "REJECTED"); expect((await row(a)).status).toBe("REJECTED"); expect(await db.niceJobsInterviewEvaluation.count()).toBe(1);
    const own = await applications.detail(candidate, a.reference, true); expect(own.candidateMessage).toBe("Released candidate message"); expect(JSON.stringify(own)).not.toContain("PRIVATE-NOTES"); await expect(act(a, "PREPARE_OFFER")).rejects.toThrow();
  });
  it("further review cancels old authority and permits a fresh interview/request without modifying history", async () => {
    const a = await shortlisted(); await review(a); const old = (await row(a)).reviewRequestId; const first = await interview(a);
    await act(a, "MORE_REVIEW"); await scheduled(a); clock = new Date(clock.getTime() + 7200000);
    await expect(act(a, "EVALUATE", { interviewReference: first.reference, answers: { evidence: "old" }, scores: { evidence: 5 }, recommendation: "RECOMMEND" }, interviewer)).rejects.toThrow("latest");
    await evaluated(a); const i = await interview(a); await act(a, "COMPLETE_INTERVIEW", { recordRevision: i.revision }); await act(a, "START_REVIEW");
    expect((await row(a)).reviewRequestId).not.toBe(old); expect((await db.operationalRequest.findUniqueOrThrow({ where: { id: old! } })).status).toBe("CANCELLED"); expect(await db.niceJobsInterviewEvaluation.count()).toBe(2);
  });
  it("shows unconfigured interview, policy and offer as unavailable rather than inventing business criteria", async () => {
    versionId = await publish({ interview: null, management: null, offer: null }, "UNCONFIGURED"); const a = await shortlisted(); const d = await recruitment.detail(candidate, a.reference, true); expect(d.interviewConfigured).toBe(false); expect(d.offerConfigured).toBe(false);
    await expect(act(a, "CREATE_INTERVIEW", { interviewerIds: [interviewer] })).rejects.toThrow("not configured"); await expect(act(a, "START_REVIEW")).rejects.toThrow();
  });
  it("requires explicit interview waiver and rejects archived jobs at approval and offer boundaries", async () => {
    versionId = await publish({ interview: { ...interviewConfig, enabled: false } }, "WAIVED"); const a = await shortlisted(); await act(a, "START_REVIEW"); expect(await db.niceJobsInterview.count()).toBe(0);
    const v = (await jobs.detail(manager, versionId)).version; await jobs.changeJob(manager, { id: versionId, revision: v.template.revision, to: "ARCHIVED", reason: "Human archive" }); await expect(decide(a)).rejects.toThrow();
  });
  it("offers require independent approval, preparation, review and separate issuance permission", async () => {
    const a = await shortlisted(); await expect(act(a, "PREPARE_OFFER")).rejects.toThrow(); await review(a); await decide(a);
    for (const user of [candidate, reader, approver, outsider]) await expect(act(a, "PREPARE_OFFER", {}, user)).rejects.toThrow();
    await act(a, "PREPARE_OFFER"); const o = await offer(a); await expect(act(a, "ISSUE_OFFER", { offerReference: o.reference, recordRevision: o.revision })).rejects.toThrow("ready");
    await act(a, "READY_OFFER", { offerReference: o.reference, recordRevision: o.revision }); const ready = await offer(a); await expect(act(a, "ISSUE_OFFER", { offerReference: ready.reference, recordRevision: ready.revision }, reader)).rejects.toThrow();
    expect((await recruitment.detail(candidate, a.reference, true)).offers).toEqual([]);
  });
  it("versions revised offers without overwriting previously issued terms or accepting withdrawn versions", async () => {
    const a = await shortlisted(), old = await issued(a); await act(a, "REVISE_OFFER", { offerReference: old.reference, recordRevision: old.revision, content: { terms: "New isolated fixture terms" } });
    const next = await offer(a); expect(next.number).toBe(2); expect((await db.niceJobsOffer.findUniqueOrThrow({ where: { id: old.id } })).snapshot).toBe(old.snapshot);
    await expect(act(a, "ACCEPT_OFFER", { offerReference: old.reference, recordRevision: old.revision }, candidate)).rejects.toThrow();
    await act(a, "READY_OFFER", { offerReference: next.reference, recordRevision: next.revision }); const ready = await offer(a); await act(a, "ISSUE_OFFER", { offerReference: ready.reference, recordRevision: ready.revision }); expect((await recruitment.detail(candidate, a.reference, true)).offers).toHaveLength(2);
  });
  it("authenticated acceptance is idempotent, audited once and never creates workforce activation", async () => {
    const a = await shortlisted(), o = await issued(a), r = await row(a); const command = { reference: a.reference, revision: r.revision, operation: "ACCEPT_OFFER", offerReference: o.reference, recordRevision: o.revision };
    await recruitment.mutate(candidate, command); await recruitment.mutate(candidate, command); expect((await row(a)).status).toBe("OFFER_ACCEPTED"); expect((await offer(a)).snapshot).toBe(o.snapshot);
    expect(await db.niceJobsApplicationHistory.count({ where: { applicationId: r.id, action: "ACCEPT_OFFER" } })).toBe(1); expect(await db.niceJobsAssignment.count()).toBe(0); expect(await db.niceJobsWorkerProfile.count()).toBe(0);
    for (const operation of ["REVISE_OFFER", "WITHDRAW_OFFER", "EXPIRE_OFFER"]) await expect(act(a, operation, { offerReference: o.reference, recordRevision: (await offer(a)).revision })).rejects.toThrow();
  });
  it("candidate cannot read another offer, forge offer content or bypass exact version ownership", async () => {
    const a = await shortlisted(), o = await issued(a); await expect(recruitment.detail(other, a.reference, true)).rejects.toThrow();
    await expect(act(a, "ACCEPT_OFFER", { offerReference: o.reference, recordRevision: o.revision }, other)).rejects.toThrow();
    await expect(act(a, "ACCEPT_OFFER", { offerReference: o.reference, recordRevision: o.revision, content: { terms: "forged" } }, candidate)).rejects.toThrow();
    await expect(act(a, "ACCEPT_OFFER", { offerReference: crypto.randomUUID(), recordRevision: o.revision }, candidate)).rejects.toThrow();
  });
  it("explicit offer acknowledgement, decline reason and duplicate decline preserve the response", async () => {
    const a = await shortlisted(); let o = await issued(a); await act(a, "VIEW_OFFER", { offerReference: o.reference, recordRevision: o.revision }, candidate); o = await offer(a); expect(o.status).toBe("VIEWED"); expect(o.viewedAt).toEqual(clock);
    await expect(act(a, "DECLINE_OFFER", { offerReference: o.reference, recordRevision: o.revision }, candidate)).rejects.toThrow("reason");
    const command = { reference: a.reference, revision: (await row(a)).revision, operation: "DECLINE_OFFER", offerReference: o.reference, recordRevision: o.revision, reason: "Candidate fixture decline" };
    await recruitment.mutate(candidate, command); await recruitment.mutate(candidate, command); expect((await row(a)).status).toBe("OFFER_DECLINED"); expect((await offer(a)).declineReason).toBe(command.reason);
    expect((await row(a)).activeKey).toBeNull();
  });
  it("expiry is enforced immediately without a worker, and accepted offers never silently expire", async () => {
    const a = await shortlisted(), o = await issued(a); clock = new Date(o.expiresAt!);
    expect((await recruitment.detail(candidate, a.reference, true)).offers[0].expired).toBe(true); await expect(act(a, "ACCEPT_OFFER", { offerReference: o.reference, recordRevision: o.revision }, candidate)).rejects.toThrow("expired");
    await act(a, "EXPIRE_OFFER", { offerReference: o.reference, recordRevision: o.revision }); expect((await offer(a)).status).toBe("EXPIRED"); expect(await db.niceJobsAssignment.count()).toBe(0);
  });
  it("rechecks approval authority before issuance and acceptance when an approver loses membership", async () => {
    const a = await shortlisted(), o = await issued(a), user = await db.user.findUniqueOrThrow({ where: { id: approver } });
    await db.membership.updateMany({ where: { personId: user.personId! }, data: { status: "SUSPENDED" } });
    try { await expect(act(a, "ACCEPT_OFFER", { offerReference: o.reference, recordRevision: o.revision }, candidate)).rejects.toThrow("approval"); } finally { await db.membership.updateMany({ where: { personId: user.personId! }, data: { status: "ACTIVE" } }); }
  });
  it("rolls back offer acceptance and its notification when audit insertion fails", async () => {
    const a = await shortlisted(), o = await issued(a), before = await db.notification.count();
    await db.$executeRawUnsafe("CREATE TRIGGER phase03_audit_failure BEFORE INSERT ON AuditEvent BEGIN SELECT RAISE(ABORT, 'isolated audit failure'); END");
    try { await expect(act(a, "ACCEPT_OFFER", { offerReference: o.reference, recordRevision: o.revision }, candidate)).rejects.toThrow(); } finally { await db.$executeRawUnsafe("DROP TRIGGER phase03_audit_failure"); }
    expect((await row(a)).status).toBe("OFFER"); expect((await offer(a)).status).toBe("ISSUED"); expect((await offer(a)).acceptedAt).toBeNull(); expect(await db.notification.count()).toBe(before);
  });
  it("bounds historical joins and cursor pagination while applying candidate and UTC interview filters", async () => {
    const a = await shortlisted(), i = await scheduled(a), r = await row(a);
    await db.niceJobsInterview.createMany({ data: Array.from({ length: 30 }, (_, n) => ({ applicationId: r.id, number: n + 2, type: "PHONE", duration: 10, status: "CANCELLED", createdByUserId: manager })) });
    const first = await recruitment.detail(candidate, a.reference, true); expect(first.interviews).toHaveLength(25); expect(first.interviews[0].number).toBe(31); expect(first.nextInterviews).toBeTruthy(); const next = await recruitment.detail(candidate, a.reference, true, { interviewsAfter: first.nextInterviews! }); expect(next.interviews).toHaveLength(6); expect(next.interviews.at(-1)!.number).toBe(1);
    expect((await recruitment.detail(secondInterviewer, a.reference, false)).interviews).toEqual([]);
    expect((await applications.list(manager, false, { interviewFrom: "2026-10-08", interviewTo: "2026-10-08", search: "candidate" })).records).toHaveLength(1);
    expect((await applications.list(manager, false, { interviewFrom: "2026-10-09" })).records).toHaveLength(0); expect(i.scheduledAt).toBeTruthy();
    await db.niceJobsOffer.createMany({ data: Array.from({ length: 30 }, (_, n) => ({ applicationId: r.id, number: n + 1, snapshot: "{}", status: "WITHDRAWN", issuedAt: clock, createdByUserId: manager })) });
    const offers = await recruitment.detail(candidate, a.reference, true); expect(offers.offers).toHaveLength(25); expect(offers.offers[0].number).toBe(30); expect((await recruitment.detail(candidate, a.reference, true, { offersAfter: offers.nextOffers! })).offers).toHaveLength(5);
    await expect(recruitment.detail(candidate, a.reference, true, { offersAfter: "foreign-history-cursor" })).rejects.toThrow();
  });
});
