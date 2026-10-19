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
import { createLeadService, LeadDuplicateError } from "@/server/nicejobs/leads";
import { createWorkforceCommandCenter } from "@/server/nicejobs/command-center";
import { createPerformanceService } from "@/server/nicejobs/performance";
import { createFinanceService } from "@/server/nicejobs/finance";
import { leadCommand } from "@/server/nicejobs/lead-input";
import { followupState } from "@/server/nicejobs/lead-sources";
import { workerQuestion } from "@/server/sia/worker-context";
import { createSiaService } from "@/server/sia/service";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phase06-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/"), log: [{ level: "query", emit: "event" }] });
let capturedQueries: string[] | null = null;
db.$on("query", e => { capturedQueries?.push(e.query); });
const leads = createLeadService(db, () => clock);
const workforceCommand = createWorkforceCommandCenter(db, () => clock);
const performanceService = createPerformanceService(db, () => clock), finance = createFinanceService(db, () => clock);
const employee = createEmployeeService(db, () => clock), sia = createSiaService(db);
const jobs = createNiceJobsService(db), applications = createApplicationService(db), operations = createOperationsService(db);
let clock = new Date();
const recruitment = createRecruitmentService(db, () => clock), onboarding = createOnboardingService(db, () => clock);
let company: string, labs: string, career: string, manager: string, approver: string, mentor: string, readyReviewer: string, candidate: string, other: string, outsider: string, reader: string, versionId: string, controlId: string;
const quiz = { form: { fields: [{ key: "safe", label: "Synthetic safety acknowledgement", type: "BOOLEAN", required: true }] }, assessment: { questions: [{ field: "safe", operator: "EQ", value: true, weight: 1, required: true }], passMark: 100 }, maxAttempts: 2 };
const orientation = { modules: [{ key: "introduction", title: "Synthetic introduction", order: 1, lessons: [{ key: "welcome", title: "Synthetic welcome", type: "TEXT", text: "Isolated fixture only, not real training", order: 1, completion: "ACKNOWLEDGE" }, { key: "check", title: "Synthetic quiz", type: "QUIZ", order: 2, completion: "QUIZ", quiz }] }] };
const ojt = { stages: [{ key: "practice", title: "Synthetic practice", order: 1, activities: [{ key: "evidence", title: "Synthetic practice activity", type: "PRACTICE", order: 1, instruction: "Describe the isolated fixture practice", expectedOutcome: "Independent review of fixture evidence", evidenceRequired: true, reviewRequired: true, maxAttempts: 2, dueDays: 1 }] }], assessment: { kind: "HUMAN", criteria: "Verify synthetic practical skill; explicit human rubric", maxAttempts: 2 } };
const training = { orientation, ojt, readiness: { requireAssessment: true, criteria: "Mandatory fixture training and assessment must pass" } };
async function human(name: string, org: string, keys: string[], descendants = false) {
  const person = await db.person.create({ data: { displayName: name } });
  const user = await db.user.create({ data: { email: name + "@phase06.invalid", personId: person.id } });
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
async function _enroll(reference?: string) { const ref = reference ?? await accepted(); await act(ref, "ENROLL"); return ref; }
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
  const all = [...workforcePermissions.map(p => p.key), "organization.read"];
  manager = await human("manager", company, all, true); approver = await human("approver", labs, ["nicejobs.application.read", "nicejobs.management.review", "nicejobs.management.approve", "approval.read", "approval.decide", "request.read", "control.read", "notification.read"]);
  mentor = await human("mentor", labs, ["nicejobs.ojt.review", "notification.read"]); readyReviewer = await human("readiness", labs, ["nicejobs.readiness.review", "notification.read"]);
  candidate = await human("candidate", career, ["organization.read", "nicejobs.application.self", "nicejobs.onboarding.self", "notification.read"]); other = await human("other", career, ["organization.read", "nicejobs.application.self", "nicejobs.onboarding.self", "notification.read"]);
  outsider = await human("outsider", await org("pearn"), all, true); reader = await human("reader", labs, ["nicejobs.onboarding.read"]);
  for (const userId of [candidate, other]) {
    const user = await db.user.update({ where: { id: userId }, data: { timezone: "Asia/Kolkata" } });
    const role = await db.role.create({ data: { key: "work-" + userId, name: "Explicit worker fixture", organizationId: labs, permissions: { create: ["nicejobs.lead.self.read", "nicejobs.lead.perform", "nicejobs.lead.claim", "nicejobs.workspace.self", "nicejobs.work.perform", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read", "reminder.manage", "sia.access.read"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId: user.personId!, organizationId: labs, roles: { create: { roleId: role.id } } } });
  }
  controlId = (await operations.saveControl(manager, { organizationId: labs, name: "Fixture independent approval", kind: "HUMAN_DECISION", requiredPermission: "nicejobs.management.approve", stages: [[{ approverUserId: approver, requiredPermission: "nicejobs.management.approve" }]] })).id;
}, 30000);
beforeEach(async () => {
  await db.siaApproval.deleteMany({ where: { request: { resourceType: "NICE_JOBS_LEAD" } } });
  await db.operationalRequest.deleteMany({ where: { resourceType: "NICE_JOBS_LEAD" } });
  await db.controlCheck.deleteMany();
  await db.executionBlocker.deleteMany(); await db.niceJobsLeadFollowup.deleteMany(); await db.niceJobsLeadActivity.deleteMany(); await db.niceJobsLeadAssignment.deleteMany(); await db.niceJobsLead.deleteMany(); await db.niceJobsLeadEligibility.deleteMany(); await db.niceJobsLeadPolicy.deleteMany();
  await db.workflowHistory.deleteMany(); await db.workflowInstance.deleteMany(); await db.workflowTransition.deleteMany(); await db.workflowState.deleteMany(); await db.workflowDefinition.deleteMany();
  await db.niceJobsDailyReport.updateMany({ data: { supersedesId: null } });
  await db.niceJobsDailyReport.deleteMany(); await db.taskEvidence.deleteMany(); await db.executionBlocker.deleteMany(); await db.task.deleteMany(); await db.niceJobsAssignment.deleteMany(); await db.niceJobsWorkerProfile.deleteMany();
  await db.niceJobsTrainingReview.deleteMany(); await db.niceJobsTrainingSubmission.deleteMany(); await db.niceJobsTrainingProgress.deleteMany(); await db.niceJobsOnboarding.deleteMany(); await db.niceJobsTrainingPlan.deleteMany();
  await db.niceJobsOffer.deleteMany(); await db.niceJobsApplicationHistory.deleteMany(); await db.niceJobsApplication.deleteMany(); await db.siaApproval.deleteMany(); await db.operationalRequest.deleteMany(); await db.notification.deleteMany();
  await db.niceJobsTemplate.updateMany({ data: { publishedVersionId: null } }); await db.niceJobsVersionArea.deleteMany(); await db.niceJobsVersion.deleteMany(); await db.niceJobsTemplate.deleteMany();
  clock = new Date(); versionId = await publish();
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
async function completeReadiness(ref: string, user = candidate) {
  await act(ref, "ENROLL", {}, user, true);
  const run = async (operation: string, extra = {}) => act(ref, operation, extra, user, true);
  await run("START_ORIENTATION"); await run("COMPLETE_LESSON", { progressId: (await progress(ref, "welcome")).id, acknowledged: true }); await run("COMPLETE_LESSON", { progressId: (await progress(ref, "check")).id, answers: { safe: true } }); await run("FINISH_ORIENTATION");
  await assigned(ref); await run("START_OJT"); await run("SUBMIT_ACTIVITY", { progressId: (await progress(ref, "evidence")).id, evidence: { text: "Isolated practice" } }); await reviewed(ref, "evidence", "APPROVED"); await run("SUBMIT_ASSESSMENT", { progressId: (await progress(ref, "ojt_assessment")).id, evidence: { text: "Isolated assessment" } }); await reviewed(ref, "ojt_assessment", "PASS"); await run("REQUEST_READINESS"); await act(ref, "DECIDE_READINESS", { outcome: "READY" }, readyReviewer, false);
  return ref;
}
async function ready(user = candidate) { return completeReadiness(await accepted(user), user); }
async function activationInput(ref: string, extra = {}) {
  const e = await db.niceJobsOnboarding.findFirstOrThrow({ where: { application: { reference: ref } } });
  return { operation: "ACTIVATE", confirmed: true, idempotencyKey: crypto.randomUUID(), applicationReference: ref, revision: e.revision, startDate: clock.toISOString(), managerId: (await db.user.findUniqueOrThrow({ where: { id: manager } })).personId!, reason: "Authorized fixture activation", ...extra };
}
async function activate(user = candidate) { return employee.mutate(manager, await activationInput(await ready(user))); }
async function workCommand(operation: string, extra = {}, actor = candidate) { return employee.mutate(actor, { operation, confirmed: true, idempotencyKey: crypto.randomUUID(), ...extra }); }
async function agent() {
  const identity = await db.siaIdentity.create({ data: { name: "Isolated SIA", title: "Shared worker assistant" } });
  const keys = ["nicejobs.lead.self.read", "nicejobs.workspace.self", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read"];
  const role = await db.role.create({ data: { key: "agent-" + identity.id, name: "Explicit scoped agent", principalType: "AGENT", organizationId: labs, permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.siaRoleAssignment.create({ data: { siaId: identity.id, roleId: role.id, organizationId: labs } });
  await db.siaTool.create({ data: { siaId: identity.id, key: "get_worker_day", name: "Worker day", permissionKey: "nicejobs.workspace.self", enabled: true } });
  return identity.id;
}
const input = (operation: string, data = {}) => ({ operation, confirmed: true, idempotencyKey: crypto.randomUUID(), ...data });
async function leadPolicy(extra = {}, controlPointId?: string, permission = "nicejobs.lead.perform") {
  const def = await operations.saveWorkflow(manager, { organizationId: labs, key: "LEAD_" + crypto.randomUUID().replaceAll("-", "").toUpperCase(), version: 1, name: "Isolated lead workflow", states: [{ key: "NEW", name: "New", initial: true }, { key: "WORKING", name: "Working" }, { key: "FOLLOW_UP", name: "Follow up" }, { key: "DONE", name: "Done", terminal: true }], transitions: [{ key: "START", from: "NEW", to: "WORKING", requiredPermission: permission, ...(controlPointId ? { controlPointId } : {}) }, { key: "FOLLOWUP", from: "WORKING", to: "FOLLOW_UP", requiredPermission: "nicejobs.lead.perform" }, { key: "CLOSE", from: "FOLLOW_UP", to: "DONE", requiredPermission: "nicejobs.lead.perform" }] });
  await operations.publishWorkflow(manager, def.id);
  return leads.mutate(manager, input("POLICY", { name: "Isolated policy", divisionId: labs, definitionId: def.id, versionIds: [versionId], allowedSources: ["MANUAL", "IMPORT"], followupRequiredStates: ["FOLLOW_UP"], ...extra }));
}
async function leadFixture(extra = {}, actor = candidate) {
  const a = await activate(actor), p = await leadPolicy(), l = await leads.mutate(manager, input("CREATE", { policyId: p.id, name: "Isolated contact", phone: "+91 90000 00001", source: "MANUAL", workerAssignmentId: a.assignmentId, ...extra })); return { id: l.id, assignmentId: a.assignmentId, policyId: p.id };
}
async function run(operation: string, leadId: string, extra = {}, actor = candidate) { const l = await db.niceJobsLead.findUniqueOrThrow({ where: { id: leadId } }); return leads.mutate(actor, input(operation, { leadId, revision: l.revision, ...extra })); }
async function transition(id: string, key: string, extra = {}) { const d = await leads.detail(candidate, id); const t = d.transitions.find(t => t.key === key)!; return run("TRANSITION", id, { transitionId: t.id, reason: "Explicit fixture decision", ...extra }); }
describe("Nice Jobs daily lead work and follow-ups", () => {
  const lifecycleTest = async () => {
    clock = new Date(Date.now() - 7200000);
    const jobVersionId = await publish({ interview: { enabled: true, type: "VIDEO", duration: 30, minInterviewers: 1, maxInterviewers: 1, evaluationRequired: true, questions: [{ key: "evidence", question: "Synthetic interview evidence", type: "TEXT", required: true, order: 1, weight: 2, active: true }] } }, "WAVE1-LIFECYCLE");
    const interviewer = await human("interviewer-" + crypto.randomUUID(), labs, ["nicejobs.application.read", "nicejobs.interview.read", "nicejobs.interview.evaluate", "notification.read"]);
    let application = await applications.create(candidate, { versionId: jobVersionId, divisionId: labs });
    application = await applications.mutate(candidate, { reference: application.reference, revision: 0, action: "SUBMIT", answers: { experience: 2 } });
    for (const action of ["ELIGIBILITY", "SCREENING", "SHORTLIST"]) application = await applications.mutate(manager, { reference: application.reference, revision: application.revision, action, reason: "Synthetic human screening" });
    const recruit = async (operation: string, extra = {}, actor = manager) => { const row = await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: application.reference } }); return recruitment.mutate(actor, { reference: row.reference, revision: row.revision, operation, reason: "Synthetic human decision", ...extra }); };
    await recruit("CREATE_INTERVIEW", { interviewerIds: [interviewer] });
    let interview = await db.niceJobsInterview.findFirstOrThrow({ where: { application: { reference: application.reference } } });
    await recruit("SCHEDULE", { interviewReference: interview.reference, recordRevision: interview.revision, scheduledAt: new Date(clock.getTime() + 3600000).toISOString(), location: "Synthetic private location", instructions: "Synthetic candidate instructions" });
    clock = new Date(clock.getTime() + 7200000);
    interview = await db.niceJobsInterview.findUniqueOrThrow({ where: { id: interview.id } });
    await recruit("EVALUATE", { interviewReference: interview.reference, recordRevision: interview.revision, answers: { evidence: "Synthetic response" }, scores: { evidence: 8 }, recommendation: "RECOMMEND" }, interviewer);
    interview = await db.niceJobsInterview.findUniqueOrThrow({ where: { id: interview.id } });
    await recruit("COMPLETE_INTERVIEW", { interviewReference: interview.reference, recordRevision: interview.revision });
    await recruit("START_REVIEW");
    const review = await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: application.reference } });
    const approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: review.reviewRequestId, status: "PENDING" } });
    await recruit("DECIDE", { approvalId: approval.id, decision: "APPROVED" }, approver);
    await recruit("PREPARE_OFFER");
    let offer = await db.niceJobsOffer.findFirstOrThrow({ where: { applicationId: review.id } });
    await recruit("READY_OFFER", { offerReference: offer.reference, recordRevision: offer.revision });
    offer = await db.niceJobsOffer.findUniqueOrThrow({ where: { id: offer.id } });
    await recruit("ISSUE_OFFER", { offerReference: offer.reference, recordRevision: offer.revision });
    offer = await db.niceJobsOffer.findUniqueOrThrow({ where: { id: offer.id } });
    await recruit("ACCEPT_OFFER", { offerReference: offer.reference, recordRevision: offer.revision }, candidate);
    await completeReadiness(application.reference);
    const activated = await employee.mutate(manager, await activationInput(application.reference));
    const assignmentId = activated.assignmentId;
    const periodStart = clock.toISOString();
    const effectiveAt = periodStart.slice(0, 10) + "T00:00:00Z";
    const task = await workCommand("ASSIGN_TASK", { assignmentId, title: "Synthetic measured task", description: "Test-only work", priority: "NORMAL", reason: "Authorized synthetic assignment" }, manager);
    const taskRow = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    await workCommand("TASK_STATE", { taskId: task.id, revision: taskRow.revision, to: "COMPLETED", evidence: { text: "Synthetic completion evidence" } });
    await workCommand("DAILY_REPORT", { reportDate: (await employee.day(candidate)).date, notes: "Synthetic daily report" });
    const metric = { key: "DONE", name: "Synthetic completion", description: "Test-only evidence", unit: "count", category: "COMPLETION", direction: "HIGHER", source: "TASK_COMPLETED", method: "COUNT", visibility: "WORKER", active: true, target: { min: 1 } };
    const fin = (operation: string, data = {}) => finance.mutate(manager, input(operation, { ...(!["POLICY_CREATE", "POLICY_EDIT"].includes(operation) ? { reason: "Synthetic financial test" } : {}), ...data }));
    const framework = await performanceService.mutate(manager, input("FRAMEWORK_CREATE", { payload: { name: "Synthetic lifecycle framework", divisionId: labs, jobVersionId, period: "CUSTOM", timezone: "UTC", effectiveAt, metrics: [metric] } }));
    await performanceService.mutate(manager, input("FRAMEWORK_PUBLISH", { versionId: framework.id, revision: 0, reason: "Synthetic publication" }));
    const completedTask = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    const periodUntil = new Date(completedTask.completionDate!.getTime() + 1000).toISOString();
    clock = new Date(new Date(periodUntil).getTime() + 1000);
    const snapshot = await performanceService.mutate(manager, input("SNAPSHOT", { assignmentId, frameworkVersionId: framework.id, from: periodStart, until: periodUntil }));
    const financeReviewer = await human("finance-reviewer-" + crypto.randomUUID(), labs, workforcePermissions.map(permission => permission.key));
    const control = async (permission: string) => (await operations.saveControl(manager, { organizationId: labs, name: "Synthetic independent finance decision", kind: "HUMAN_DECISION", requiredPermission: permission, stages: [[{ approverUserId: financeReviewer, requiredPermission: permission }]] })).id;
    const policy = await fin("POLICY_CREATE", { payload: { name: "Test-only incentive, not compensation", divisionId: labs, jobVersionId, frameworkVersionId: framework.id, currency: "INR", effectiveAt, metricKey: "DONE", eligibility: { requireActive: true, minimumActual: "1", allowedStatuses: ["ON_TRACK"], excludedPipStatuses: [] }, rule: { type: "PER_UNIT", rateMinor: "12345" }, rounding: "HALF_UP", approvalControlPointId: await control("nicejobs.finance.incentive.approve"), settlementControlPointId: await control("nicejobs.finance.settlement.approve"), settlement: { minimumMinor: "1", allowAdjustments: false } } });
    await fin("POLICY_SUBMIT", { versionId: policy.id, revision: 0 });
    await finance.mutate(financeReviewer, input("POLICY_REVIEW", { versionId: policy.id, revision: 1, reason: "Independent synthetic review" }));
    await fin("POLICY_PUBLISH", { versionId: policy.id, revision: 2 });
    const wallet = await fin("WALLET_OPEN", { assignmentId, policyVersionId: policy.id });
    const earning = await fin("CALCULATE", { snapshotId: snapshot.id, policyVersionId: policy.id });
    const calculated = await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: earning.id } });
    expect(JSON.parse(calculated.calculation).reason).toBe("Configured eligibility passed");
    expect({ amountMinor: calculated.amountMinor, eligibility: calculated.eligibility, calculation: JSON.parse(calculated.calculation) }).toMatchObject({ amountMinor: 12345n, eligibility: "ELIGIBLE" });
    await expect(fin("EARNING_POST", { earningId: earning.id, revision: 0 })).rejects.toThrow();
    await fin("EARNING_SUBMIT", { earningId: earning.id, revision: 0 });
    const earningRow = await db.niceJobsIncentiveEarning.findUniqueOrThrow({ where: { id: earning.id } });
    const earningApproval = await db.siaApproval.findFirstOrThrow({ where: { requestId: earningRow.requestId, status: "PENDING" } });
    await operations.decide(financeReviewer, { approvalId: earningApproval.id, decision: "APPROVED", comment: "Independent synthetic incentive decision" });
    await fin("EARNING_POST", { earningId: earning.id, revision: 2 });
    expect(await db.niceJobsWalletLedger.count({ where: { walletId: wallet.id, earningId: earning.id } })).toBe(1);
    const postedLedger = await db.niceJobsWalletLedger.findFirstOrThrow({ where: { walletId: wallet.id, earningId: earning.id } });
    const settlementFrom = postedLedger.createdAt.toISOString().slice(0, 10) + "T00:00:00Z";
    const settlementUntil = new Date(new Date(settlementFrom).getTime() + 86400000).toISOString();
    clock = new Date(new Date(settlementUntil).getTime() + 1000);
    const settlement = await fin("SETTLEMENT_CREATE", { policyVersionId: policy.id, from: settlementFrom, until: settlementUntil });
    const statement = await fin("STATEMENT_GENERATE", { periodId: settlement.id, revision: 0, walletId: wallet.id });
    await fin("SETTLEMENT_SUBMIT", { periodId: settlement.id, revision: 1 });
    const period = await db.niceJobsSettlementPeriod.findUniqueOrThrow({ where: { id: settlement.id } });
    const settlementApproval = await db.siaApproval.findFirstOrThrow({ where: { requestId: period.requestId, status: "PENDING" } });
    await operations.decide(financeReviewer, { approvalId: settlementApproval.id, decision: "APPROVED", comment: "Independent synthetic settlement decision" });
    await fin("SETTLEMENT_POST", { periodId: settlement.id, revision: 3 });
    const payout = await fin("PAYOUT_REQUEST", { statementId: statement.id });
    expect(await db.niceJobsPayoutIntent.findUniqueOrThrow({ where: { id: payout.id } })).toMatchObject({ status: "PROVIDER_NOT_CONFIGURED", providerReference: null, amountMinor: 12345n });
    expect(await db.niceJobsPayoutIntent.count({ where: { statementId: statement.id } })).toBe(1);
  };
  it("rejects forged identity, scope, ownership and lifecycle fields", () => {
    const c = input("CREATE", { policyId: "policy", name: "Contact", phone: "+919000000001", source: "MANUAL" });
    expect(leadCommand.safeParse(c).success).toBe(true);
    for (const key of ["actorUserId", "companyId", "divisionId", "status", "currentWorkerAssignmentId"]) expect(leadCommand.safeParse({ ...c, [key]: "forged" }).success).toBe(false);
    expect(leadCommand.safeParse({ ...c, phone: "9000000001" }).success).toBe(false);
    expect(leadCommand.safeParse({ ...c, confirmed: false }).success).toBe(false);
  });
  it("creates normalized leads with canonical workflow, source and transactional history", async () => {
    const f = await leadFixture(), d = await leads.detail(candidate, f.id);
    expect(d.lead.phone).toBe("+919000000001"); expect(d.lead.status).toBe("NEW"); expect(d.history).toHaveLength(1); expect(d.activity.map(a => a.kind)).toEqual(["CREATE", "ASSIGN"]);
    expect((await db.workflowInstance.findFirstOrThrow()).resourceType).toBe("NICE_JOBS_LEAD");
    expect(await db.auditEvent.count({ where: { action: "nicejobs.lead.create", entityId: f.id } })).toBe(1);
  });
  it("requires published area/job policy and refuses unconfigured source and forged eligible worker", async () => {
    const f = await leadFixture();
    for (const extra of [{ source: "META" }, { workerAssignmentId: "missing" }, { policyId: "missing" }]) await expect(leads.mutate(manager, input("CREATE", { policyId: f.policyId, name: "Other", phone: "+919000000002", source: "MANUAL", ...extra }))).rejects.toThrow();
    const a = await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: f.assignmentId } }); await db.niceJobsAssignment.update({ where: { id: a.id }, data: { lifecycle: "SUSPENDED" } }); await expect(run("ASSIGN", f.id, { workerAssignmentId: a.id, reason: "Invalid assignment" }, manager)).rejects.toThrow();
  });
  it("warns about scoped duplicates and requires a signed explicit separate-record decision", async () => {
    const f = await leadFixture(), c = input("CREATE", { policyId: f.policyId, name: "Separate business enquiry", phone: "+919000000001", source: "MANUAL" });
    let warning: LeadDuplicateError | undefined;
    try { await leads.mutate(manager, c); } catch (e) { expect(e).toBeInstanceOf(LeadDuplicateError); warning = e as LeadDuplicateError; }
    expect(warning!.matches.map(m => m.id)).toEqual([f.id]); expect(await db.niceJobsLead.count()).toBe(1);
    await expect(leads.mutate(manager, { ...c, duplicateDecision: { token: "forged", reason: "Separate enquiry" } })).rejects.toBeInstanceOf(LeadDuplicateError);
    const r = await leads.mutate(manager, { ...c, duplicateDecision: { token: warning!.token, reason: "Explicitly reviewed separate enquiry" } }); expect(r.id).not.toBe(f.id); expect(await db.niceJobsLead.count()).toBe(2);
  });
  it("invalidates duplicate reviews when input changes or review expires", async () => {
    const f = await leadFixture(), c = input("CREATE", { policyId: f.policyId, name: "Duplicate", phone: "+919000000001", source: "MANUAL" });
    let token = ""; try { await leads.mutate(manager, c); } catch (e) { token = (e as LeadDuplicateError).token; }
    await expect(leads.mutate(manager, { ...c, name: "Changed", duplicateDecision: { token, reason: "Reviewed" } })).rejects.toBeInstanceOf(LeadDuplicateError);
    clock = new Date(clock.getTime() + 600001); await expect(leads.mutate(manager, { ...c, duplicateDecision: { token, reason: "Reviewed" } })).rejects.toBeInstanceOf(LeadDuplicateError);
  });
  it("isolates companies, divisions, workers and missing lead references", async () => {
    const f = await leadFixture(); await activate(other);
    for (const user of [other, outsider, reader]) { await expect(leads.detail(user, f.id)).rejects.toThrow(); await expect(run("NOTE", f.id, { notes: "Unauthorized" }, user)).rejects.toThrow(); }
    await expect(leads.list(manager, { companyId: "forged" })).rejects.toThrow(); await expect(leads.list(candidate, { divisionId: career }, true)).rejects.toThrow(); await expect(leads.detail(candidate, "missing")).rejects.toThrow();
  });
  it("deduplicates exact mutations, rejects mismatched replay and stale revision", async () => {
    const f = await leadFixture(), c = input("CONTACT", { leadId: f.id, revision: 0, type: "CALL", outcome: "Discussed", nextAction: "Schedule review" });
    expect(await leads.mutate(candidate, c)).toEqual(await leads.mutate(candidate, c)); expect(await db.niceJobsLeadActivity.count({ where: { kind: "CONTACT" } })).toBe(1);
    await expect(leads.mutate(candidate, { ...c, outcome: "Changed" })).rejects.toThrow(/Replay/); await expect(leads.mutate(candidate, { ...c, idempotencyKey: crypto.randomUUID() })).rejects.toThrow(/changed/);
  });
  it("preserves reassignment history, cancels old follow-ups and revokes former owner including replay", async () => {
    const f = await leadFixture(), second = await activate(other), c = input("NOTE", { leadId: f.id, revision: 0, notes: "Owner note" }); await leads.mutate(candidate, c);
    await run("SCHEDULE", f.id, { scheduledAt: new Date(clock.getTime() + 3600000).toISOString(), type: "CALL", purpose: "Follow up" });
    await run("ASSIGN", f.id, { workerAssignmentId: second.assignmentId, reason: "Explicit transfer" }, manager);
    expect((await leads.detail(other, f.id)).history).toHaveLength(2); expect((await db.niceJobsLeadFollowup.findFirstOrThrow()).status).toBe("CANCELLED");
    await expect(leads.detail(candidate, f.id)).rejects.toThrow(); await expect(leads.mutate(candidate, c)).rejects.toThrow(); await expect(run("UNASSIGN", f.id, { reason: "Not configured" }, manager)).rejects.toThrow();
  });
  it("allows self-claim only with explicit policy, permission, eligibility and unassigned revision", async () => {
    const a = await activate(), p = await leadPolicy({ claimAllowed: true, unassignAllowed: true }), l = await leads.mutate(manager, input("CREATE", { policyId: p.id, name: "Claimable", phone: "+919000000003", source: "MANUAL" }));
    expect((await leads.list(candidate, { queue: "available" }, true)).records[0].id).toBe(l.id);
    await expect(run("ASSIGN", l.id, { workerAssignmentId: a.assignmentId, reason: "Worker forged assignment" })).rejects.toThrow();
    await run("CLAIM", l.id, { reason: "Explicit self-claim" }); expect((await leads.detail(candidate, l.id)).own).toBe(true);
    await run("UNASSIGN", l.id, { reason: "Authorized unassignment" }, manager); await expect(leads.detail(candidate, l.id)).rejects.toThrow();
  });
  it("validates controlled states and blocks generic workflow bypass, follow-up ambiguity and stale transition", async () => {
    const f = await leadFixture(), l = await db.niceJobsLead.findUniqueOrThrow({ where: { id: f.id } }); await transition(f.id, "START");
    const restrictedPolicy = await leadPolicy({}, undefined, "workflow.transition"), restrictedLead = await leads.mutate(manager, input("CREATE", { policyId: restrictedPolicy.id, name: "Restricted transition", phone: "+919000000010", source: "MANUAL", workerAssignmentId: f.assignmentId }));
    await expect(transition(restrictedLead.id, "START")).rejects.toThrow();
    await expect(transition(f.id, "FOLLOWUP")).rejects.toThrow(/Schedule/);
    const t = await db.workflowTransition.findFirstOrThrow({ where: { key: "FOLLOWUP" } }); await expect(operations.transition(manager, { instanceId: l.workflowInstanceId, transitionId: t.id, expectedVersion: 1, idempotencyKey: crypto.randomUUID() })).rejects.toThrow(/lead operation/);
    await run("SCHEDULE", f.id, { scheduledAt: new Date(clock.getTime() + 3600000).toISOString(), type: "CALL", purpose: "Next review" }); await transition(f.id, "FOLLOWUP");
    await expect(transition(f.id, "CLOSE")).rejects.toThrow(/confirm/); await transition(f.id, "CLOSE", { cancelScheduled: true }); expect((await leads.detail(candidate, f.id)).lead.status).toBe("DONE");
    await expect(run("NOTE", f.id, { notes: "Closed lead change" })).rejects.toThrow(/closed/);
  });
  it("derives due/missed state on server and completes/cancels only current-owner follow-ups", async () => {
    const f = await leadFixture(); await run("SCHEDULE", f.id, { scheduledAt: new Date(clock.getTime() + 1000).toISOString(), type: "CALL", purpose: "Review" });
    let follow = (await leads.detail(candidate, f.id)).followups[0]; expect(follow.state).toBe("SCHEDULED"); clock = new Date(clock.getTime() + 2000); expect((await leads.detail(candidate, f.id)).followups[0].state).toBe("DUE");
    await activate(other); await expect(run("COMPLETE", f.id, { followupId: follow.id, followupRevision: 0, outcome: "Reviewed", nextAction: "Done" }, other)).rejects.toThrow();
    await run("COMPLETE", f.id, { followupId: follow.id, followupRevision: 0, outcome: "Reviewed", nextAction: "Prepare next meeting" }); follow = (await leads.detail(candidate, f.id)).followups[0]; expect(follow.status).toBe("COMPLETED");
    await run("SCHEDULE", f.id, { scheduledAt: new Date(clock.getTime() + 3600000).toISOString(), type: "CALL", purpose: "Cancel test", notes: "Preserved original notes" });
    const pending = (await leads.detail(candidate, f.id)).followups.find(f => f.status === "SCHEDULED")!; await run("CANCEL", f.id, { followupId: pending.id, followupRevision: pending.revision, reason: "Explicit cancellation reason" });
    const cancelled = (await leads.detail(candidate, f.id)).followups.find(f => f.id === pending.id)!; expect(cancelled.status).toBe("CANCELLED"); expect(cancelled.notes).toBe("Preserved original notes");
    expect(followupState({ status: "SCHEDULED", scheduledAt: new Date("2026-01-01Z") }, clock, dayBounds(localDay(clock, "Asia/Kolkata"), "Asia/Kolkata").start)).toBe("MISSED");
  });
  it("shows an authorized manager both overdue follow-up count and actionable item without exposing it to other users", async () => {
    const f = await leadFixture();
    await run("SCHEDULE", f.id, { scheduledAt: new Date(clock.getTime() + 1000).toISOString(), type: "CALL", purpose: "Overdue fixture review" });
    clock = new Date(clock.getTime() + 2000);
    const visible = await workforceCommand.overview(manager, { divisionId: labs });
    expect(visible.metrics.find(m => m.key === "followups")).toMatchObject({ state: "AVAILABLE", value: 1 });
    expect(visible.items.filter(item => item.kind === "FOLLOWUP")).toEqual([expect.objectContaining({ title: "Overdue fixture review", href: expect.stringContaining(`leadId=${f.id}`) })]);
    const limited = await human("command-only-" + crypto.randomUUID(), labs, ["nicejobs.command.read"]);
    const hidden = await workforceCommand.overview(limited, { divisionId: labs });
    expect(hidden.metrics.find(m => m.key === "followups")).toMatchObject({ state: "NOT_AUTHORIZED", value: null });
    expect(hidden.items.some(item => item.kind === "FOLLOWUP")).toBe(false);
    await expect(workforceCommand.overview(outsider, { divisionId: labs })).rejects.toThrow();
    const sibling = await workforceCommand.overview(manager, { divisionId: career });
    expect(sibling.items.some(item => item.kind === "FOLLOWUP")).toBe(false);
    expect(sibling.metrics.find(m => m.key === "followups")?.value).toBeNull();
  });
  it("links assistance to canonical blockers and respects notification preferences", async () => {
    const f = await leadFixture(); await run("ASSIST", f.id, { reason: "Need guidance", description: "Review this enquiry" }); expect((await db.executionBlocker.findFirstOrThrow()).niceJobsLeadId).toBe(f.id);
    await db.notificationPreference.create({ data: { userId: candidate, type: "NICE_JOBS_LEAD", channel: "IN_APP", enabled: false } });
    try { await run("SCHEDULE", f.id, { scheduledAt: new Date(clock.getTime() + 1000).toISOString(), type: "CALL", purpose: "Reminder test" }); const follow = (await leads.detail(candidate, f.id)).followups[0]; clock = new Date(clock.getTime() + 2000); const before = await db.notification.count(); await run("REMIND", f.id, { followupId: follow.id }); expect(await db.notification.count()).toBe(before); } finally { await db.notificationPreference.deleteMany(); }
  });
  it("derives daily report counts and My Day from recorded activity, not client totals", async () => {
    const f = await leadFixture(); await run("CONTACT", f.id, { type: "CALL", outcome: "Discussed", nextAction: "Review" });
    const day = await employee.day(candidate); expect(day.leads.counts?.assigned).toBe(1); expect(day.leads.activity.some(a => a.kind === "CONTACT")).toBe(true);
    await workCommand("DAILY_REPORT", { reportDate: day.date, notes: "Actual recorded work" }); const report = await db.niceJobsDailyReport.findFirstOrThrow(); expect(JSON.parse(report.operationalSnapshot!).contactsRecorded).toBe(1);
    await expect(workCommand("DAILY_REPORT", { reportDate: day.date, contactsRecorded: 999 })).rejects.toThrow();
  });
  it("keeps private management notes out of worker history and SIA human-agent intersection", async () => {
    const f = await leadFixture(); await run("NOTE", f.id, { visibility: "MANAGEMENT", notes: "PRIVATE-MANAGEMENT-LEAD-NOTE" }, manager); await run("CONTACT", f.id, { type: "CALL", outcome: "Reviewed", nextAction: "Next meeting" });
    expect(JSON.stringify(await leads.detail(candidate, f.id))).not.toContain("PRIVATE-MANAGEMENT"); expect(JSON.stringify(await leads.detail(manager, f.id))).toContain("PRIVATE-MANAGEMENT");
    const siaId = await agent(), response = await sia.converse(candidate, { siaId, organizationId: labs, audience: "WORKER", message: "Show my leads and overdue follow-ups", idempotencyKey: crypto.randomUUID() });
    expect(JSON.stringify(response)).toContain(f.id); expect(JSON.stringify(response)).not.toContain("PRIVATE-MANAGEMENT"); expect(JSON.stringify(response)).not.toContain("+919000000001");
    for (const question of ["Reassign this lead", "Send an email", "Terminate worker", "Change salary", "Execute SQL"]) expect(workerQuestion(question)).toBe(false);
    await expect(leads.mutate(candidate, input("NOTE", { leadId: f.id, revision: 2, notes: "Private", visibility: "MANAGEMENT" }))).rejects.toThrow();
  });
  it("rolls back all lead, workflow, ownership and notification writes when audit persistence fails", async () => {
    const a = await activate(), p = await leadPolicy(), sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_lead_audit BEFORE INSERT ON AuditEvent WHEN NEW.action = 'nicejobs.lead.create' BEGIN SELECT RAISE(ABORT, 'Fixture failure'); END;"); sql.close();
    try { await expect(leads.mutate(manager, input("CREATE", { policyId: p.id, name: "Rollback", phone: "+919000000005", source: "MANUAL", workerAssignmentId: a.assignmentId }))).rejects.toThrow(); expect(await db.niceJobsLead.count()).toBe(0); expect(await db.niceJobsLeadAssignment.count()).toBe(0); expect(await db.workflowInstance.count()).toBe(0); } finally { const clean = new DatabaseSync(file); clean.exec("DROP TRIGGER fail_lead_audit"); clean.close(); }
  });
  it("provides a bounded no-write import preview with in-batch and stored duplicates", async () => {
    const f = await leadFixture(), r = await leads.previewImport(manager, { policyId: f.policyId, records: [{ name: "Import one", phone: "+919000000001", source: "IMPORT" }, { name: "Import two", phone: "+919000000001", source: "IMPORT" }] });
    expect(r.writes).toBe(0); expect(r.records[0].duplicateIds).toEqual([f.id]); expect(r.records[0].duplicateRows).toEqual([1]); expect(await db.niceJobsLead.count()).toBe(1);
    await expect(leads.previewImport(outsider, { policyId: f.policyId, records: [] })).rejects.toThrow(); expect((await leads.communicationIntent(candidate, f.id)).providerExecution).toBe(false);
  });
  it("rolls back lead creation and assignment when recipient notification persistence fails", async () => {
    const a = await activate(), p = await leadPolicy(), sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_lead_notice BEFORE INSERT ON Notification WHEN NEW.type = 'NICE_JOBS_LEAD' BEGIN SELECT RAISE(ABORT, 'Fixture failure'); END;"); sql.close();
    try { await expect(leads.mutate(manager, input("CREATE", { policyId: p.id, name: "Notification rollback", phone: "+919000000006", source: "MANUAL", workerAssignmentId: a.assignmentId }))).rejects.toThrow(); expect(await db.niceJobsLead.count()).toBe(0); expect(await db.niceJobsLeadAssignment.count()).toBe(0); expect(await db.workflowInstance.count()).toBe(0); }
    finally { const clean = new DatabaseSync(file); clean.exec("DROP TRIGGER fail_lead_notice"); clean.close(); }
  });
  it("filters and paginates an isolated 2000-lead fixture without N+1 queries or unbounded histories", async () => {
    const f = await leadFixture(), base = await db.niceJobsLead.findUniqueOrThrow({ where: { id: f.id } });
    const instance = await db.workflowInstance.findUniqueOrThrow({ where: { id: base.workflowInstanceId! } });
    await db.workflowInstance.createMany({ data: Array.from({ length: 2000 }, (_, i) => ({ id: "scale-workflow-" + i, definitionId: instance.definitionId, organizationId: labs, resourceType: "NICE_JOBS_LEAD", resourceId: "scale-" + String(i).padStart(5, "0"), creatorUserId: manager, title: "Isolated scale", currentStateId: instance.currentStateId, fingerprint: "isolated-scale-only", idempotencyKey: "00000000-0000-4000-8000-" + String(i).padStart(12, "0") })) });
    await db.niceJobsLead.createMany({ data: Array.from({ length: 2000 }, (_, i) => ({ id: "scale-" + String(i).padStart(5, "0"), companyId: company, divisionId: labs, policyId: f.policyId, workflowInstanceId: "scale-workflow-" + i, name: "Isolated scale " + i, phone: "+918" + String(i).padStart(9, "0"), source: i % 2 ? "IMPORT" : "MANUAL", priority: i % 3 ? "NORMAL" : "HIGH", currentWorkerAssignmentId: base.currentWorkerAssignmentId })) });
    capturedQueries = []; const start = performance.now(); const first = await leads.list(manager, { source: "IMPORT", priority: "HIGH", limit: 25 }); const second = await leads.list(manager, { source: "IMPORT", priority: "HIGH", limit: 25, after: first.nextCursor! }); const managerRows = await employee.workforce(manager); const duration = performance.now() - start;
    expect(first.records).toHaveLength(25); expect(second.records).toHaveLength(25); expect(second.records[0].id > first.records.at(-1)!.id).toBe(true); expect(managerRows.records[0].leadCounts?.assigned).toBe(2001); const queries = capturedQueries.length; expect(queries).toBeLessThan(100); capturedQueries = []; await leads.list(manager, { limit: 100 }); const largePageQueries = capturedQueries.length; capturedQueries = []; await leads.list(manager, { limit: 25 }); expect(capturedQueries.length).toBe(largePageQueries); process.stdout.write(JSON.stringify({ fixtureLeads: 2001, queries, listQueries: largePageQueries, milliseconds: Math.round(duration) }) + "\n"); capturedQueries = null;
  });
  it("denies default self-claim and unauthorized pool access, with honest unconfigured worker sources", async () => {
    await activate(); expect((await employee.day(candidate)).leads.status).toBe("NOT_CONFIGURED"); const p = await leadPolicy(); const l = await leads.mutate(manager, input("CREATE", { policyId: p.id, name: "Unassigned", phone: "+919000000009", source: "MANUAL" }));
    await expect(run("CLAIM", l.id, { reason: "No configured authority" })).rejects.toThrow(); await expect(leads.list(candidate)).rejects.toThrow();
  });
  it("preserves canonical human approval controls and rolls back a blocked lead transition", async () => {
    const a = await activate(), control = await operations.saveControl(manager, { organizationId: labs, name: "Explicit lead human decision", kind: "HUMAN_DECISION", requiredPermission: "nicejobs.management.approve", stages: [[{ approverUserId: approver, requiredPermission: "nicejobs.management.approve" }]] }), p = await leadPolicy({}, control.id);
    const l = await leads.mutate(manager, input("CREATE", { policyId: p.id, name: "Controlled lead", phone: "+919000000008", source: "MANUAL", workerAssignmentId: a.assignmentId }));
    const workerPerson = (await db.user.findUniqueOrThrow({ where: { id: candidate } })).personId!;
    const role = await db.role.create({ data: { key: "control-worker-" + workerPerson, name: "Explicit fixture control read", organizationId: labs, permissions: { create: { permission: { connect: { key: "control.read" } } } } } });
    const membership = await db.membership.findFirstOrThrow({ where: { personId: workerPerson, organizationId: labs } });
    await db.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
    try {
      await expect(transition(l.id, "START")).rejects.toThrow(/human approval/); expect((await leads.detail(candidate, l.id)).lead.status).toBe("NEW"); expect((await db.niceJobsLead.findUniqueOrThrow({ where: { id: l.id } })).revision).toBe(0);
      const approverPerson = (await db.user.findUniqueOrThrow({ where: { id: approver } })).personId!, approverRole = await db.role.findFirstOrThrow({ where: { key: approverPerson } }), pool = await db.permission.findUniqueOrThrow({ where: { key: "nicejobs.lead.pool.read" } });
      await db.rolePermission.create({ data: { roleId: approverRole.id, permissionId: pool.id } });
      try { const current = await db.niceJobsLead.findUniqueOrThrow({ where: { id: l.id } }); const request = await operations.createRequest(manager, { organizationId: labs, resourceType: "NICE_JOBS_LEAD", resourceId: l.id, title: "Explicit lead decision", controlPointId: control.id, workflowInstanceId: current.workflowInstanceId, idempotencyKey: crypto.randomUUID() }); await operations.submitRequest(manager, request.id); const approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: request.id } }); await operations.decide(approver, { approvalId: approval.id, decision: "APPROVED", comment: "Independent authorized human decision" }); expect((await leads.detail(candidate, l.id)).lead.status).toBe("NEW"); await transition(l.id, "START"); expect((await leads.detail(candidate, l.id)).lead.status).toBe("WORKING"); }
      finally { await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: approverRole.id, permissionId: pool.id } } }); }
    }
    finally { await db.membershipRole.deleteMany({ where: { roleId: role.id } }); }
  });
  it("revalidates independent human verification without inheriting worker workflow delegation", async () => {
    const a = await activate(), control = await operations.saveControl(manager, { organizationId: labs, name: "Explicit lead verification", kind: "VERIFICATION", requiredPermission: "nicejobs.lead.manage" }), p = await leadPolicy({}, control.id), l = await leads.mutate(manager, input("CREATE", { policyId: p.id, name: "Verified lead", phone: "+919000000011", source: "MANUAL", workerAssignmentId: a.assignmentId }));
    const actorRole = await db.role.findFirstOrThrow({ where: { key: "work-" + candidate } }), read = await db.permission.findUniqueOrThrow({ where: { key: "control.read" } }); await db.rolePermission.create({ data: { roleId: actorRole.id, permissionId: read.id } });
    try { const lead = await db.niceJobsLead.findUniqueOrThrow({ where: { id: l.id } }); await operations.checkControl(manager, lead.workflowInstanceId!, control.id, true, "Independent verification evidence");
      const person = (await db.user.findUniqueOrThrow({ where: { id: manager } })).personId!, managerRole = await db.role.findFirstOrThrow({ where: { key: person } }), required = await db.permission.findUniqueOrThrow({ where: { key: "nicejobs.lead.manage" } });
      await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: managerRole.id, permissionId: required.id } } });
      try { await expect(transition(l.id, "START")).rejects.toThrow(); } finally { await db.rolePermission.create({ data: { roleId: managerRole.id, permissionId: required.id } }); }
      await transition(l.id, "START"); expect((await leads.detail(candidate, l.id)).lead.status).toBe("WORKING");
    } finally { await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: actorRole.id, permissionId: read.id } } }); }
  });
  it("rechecks revoked human and agent source authority, including recorded-mutation replay", async () => {
    const f = await leadFixture(), c = input("NOTE", { leadId: f.id, revision: 0, notes: "Recorded before revocation" }); await leads.mutate(candidate, c); const siaId = await agent();
    const person = (await db.user.findUniqueOrThrow({ where: { id: candidate } })).personId!; await db.membership.updateMany({ where: { personId: person, organizationId: labs }, data: { status: "SUSPENDED" } });
    try { await expect(leads.mutate(candidate, c)).rejects.toThrow(); await expect(sia.converse(candidate, { siaId, organizationId: labs, audience: "WORKER", message: "Show my leads", idempotencyKey: crypto.randomUUID() })).rejects.toThrow(); } finally { await db.membership.updateMany({ where: { personId: person, organizationId: labs }, data: { status: "ACTIVE" } }); }
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "nicejobs.lead.self.read" } }); const role = await db.siaRoleAssignment.findFirstOrThrow({ where: { siaId } }); await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.roleId, permissionId: permission.id } } });
    const response = await sia.converse(candidate, { siaId, organizationId: labs, audience: "WORKER", message: "Show my leads", idempotencyKey: crypto.randomUUID() }); expect(JSON.stringify(response)).not.toContain(f.id);
  });
  it("takes one synthetic candidate through interviewed recruitment, readiness, work, performance and payout-ready intent", lifecycleTest, 120000);
});
