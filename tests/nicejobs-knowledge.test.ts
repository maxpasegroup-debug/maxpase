import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createKnowledgeService } from "@/server/nicejobs/knowledge";
import { knowledgeCommand } from "@/server/nicejobs/knowledge-input";
import { createAccessContext } from "@/server/authorization/engine";
import type { PrismaClient } from "@prisma/client";
import { createPostgresFixture } from "./helpers/postgres-fixture";
import { mkdtempSync, rmSync } from "node:fs";
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
import { createEmployeeService } from "@/server/nicejobs/employee";
import { createLeadService } from "@/server/nicejobs/leads";
import { workerQuestion } from "@/server/sia/worker-context";
import { createSiaService } from "@/server/sia/service";
import { createContentFiles } from "@/server/nicejobs/content-files";
import { privateContentStorage } from "@/server/nicejobs/content-storage";
import { unavailableAttachments } from "@/server/communications/providers";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phase07-"));
const postgres = createPostgresFixture({ log: [{ level: "query", emit: "event" }] });
const db = postgres.db;
let capturedQueries: string[] | null = null;
(db as PrismaClient<{ log: [{ emit: "event"; level: "query" }] }>).$on("query", e => { capturedQueries?.push(e.query); });
const leads = createLeadService(db, () => clock);
const knowledge = createKnowledgeService(db, () => clock);
const employee = createEmployeeService(db, () => clock), sia = createSiaService(db);
const jobs = createNiceJobsService(db), applications = createApplicationService(db), operations = createOperationsService(db);
let clock = new Date();
let contentReviewer: string;
const recruitment = createRecruitmentService(db, () => clock), onboarding = createOnboardingService(db, () => clock);
let company: string, labs: string, career: string, manager: string, approver: string, mentor: string, readyReviewer: string, candidate: string, other: string, outsider: string, reader: string, versionId: string, controlId: string;
const quiz = { form: { fields: [{ key: "safe", label: "Synthetic safety acknowledgement", type: "BOOLEAN", required: true }] }, assessment: { questions: [{ field: "safe", operator: "EQ", value: true, weight: 1, required: true }], passMark: 100 }, maxAttempts: 2 };
const orientation = { modules: [{ key: "introduction", title: "Synthetic introduction", order: 1, lessons: [{ key: "welcome", title: "Synthetic welcome", type: "TEXT", text: "Isolated fixture only, not real training", order: 1, completion: "ACKNOWLEDGE" }, { key: "check", title: "Synthetic quiz", type: "QUIZ", order: 2, completion: "QUIZ", quiz }] }] };
const ojt = { stages: [{ key: "practice", title: "Synthetic practice", order: 1, activities: [{ key: "evidence", title: "Synthetic practice activity", type: "PRACTICE", order: 1, instruction: "Describe the isolated fixture practice", expectedOutcome: "Independent review of fixture evidence", evidenceRequired: true, reviewRequired: true, maxAttempts: 2, dueDays: 1 }] }], assessment: { kind: "HUMAN", criteria: "Verify synthetic practical skill; explicit human rubric", maxAttempts: 2 } };
const training = { orientation, ojt, readiness: { requireAssessment: true, criteria: "Mandatory fixture training and assessment must pass" } };
async function human(name: string, org: string, keys: string[], descendants = false) {
  const person = await db.person.create({ data: { displayName: name } });
  const user = await db.user.create({ data: { email: name + "@phase07.invalid", personId: person.id } });
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
  await postgres.initialize();
  await db.$transaction(initializeGroupStructure);
  for (const p of workforcePermissions) await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  await db.permission.upsert({ where: { key: "notification.manage" }, update: {}, create: { key: "notification.manage", name: "Explicit notification management", scope: "GROUP" } });
  await db.permission.upsert({ where: { key: "organization.read" }, update: {}, create: { key: "organization.read", name: "Read", scope: "GROUP" } });
  const org = async (slug: string) => (await db.organization.findUniqueOrThrow({ where: { slug } })).id;
  company = await org("aira-skill-city"); labs = await org("aira-labs"); career = await org("aira-career-hub");
  const all = [...workforcePermissions.map(p => p.key), "organization.read", "notification.manage"];
  manager = await human("manager", company, all, true); approver = await human("approver", labs, ["nicejobs.application.read", "nicejobs.management.review", "nicejobs.management.approve", "approval.read", "approval.decide", "request.read", "control.read", "notification.read"]);
  mentor = await human("mentor", labs, ["nicejobs.ojt.review", "notification.read"]); readyReviewer = await human("readiness", labs, ["nicejobs.readiness.review", "notification.read"]);
  candidate = await human("candidate", career, ["organization.read", "nicejobs.application.self", "nicejobs.onboarding.self", "notification.read"]); other = await human("other", career, ["organization.read", "nicejobs.application.self", "nicejobs.onboarding.self", "notification.read"]);
  outsider = await human("outsider", await org("pearn"), all, true); reader = await human("reader", labs, ["nicejobs.onboarding.read"]);
  for (const userId of [candidate, other]) {
    const user = await db.user.update({ where: { id: userId }, data: { timezone: "Asia/Kolkata" } });
    const role = await db.role.create({ data: { key: "work-" + userId, name: "Explicit worker fixture", organizationId: labs, permissions: { create: ["nicejobs.sop.read", "nicejobs.resource.read", "nicejobs.message.read", "nicejobs.knowledge.ack", "nicejobs.lead.self.read", "nicejobs.lead.perform", "nicejobs.lead.claim", "nicejobs.workspace.self", "nicejobs.work.perform", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read", "reminder.manage", "sia.access.read"].map(key => ({ permission: { connect: { key } } })) } } });
    await db.membership.create({ data: { personId: user.personId!, organizationId: labs, roles: { create: { roleId: role.id } } } });
  }
  controlId = (await operations.saveControl(manager, { organizationId: labs, name: "Fixture independent approval", kind: "HUMAN_DECISION", requiredPermission: "nicejobs.management.approve", stages: [[{ approverUserId: approver, requiredPermission: "nicejobs.management.approve" }]] })).id;
}, 120000);
beforeEach(async () => {
  await db.niceJobsKnowledgeReceipt.deleteMany(); await db.niceJobsKnowledgeWorkLink.deleteMany(); await db.niceJobsSopStep.deleteMany(); await db.niceJobsKnowledgeVersion.updateMany({data:{relatedVersionId:null}}); await db.niceJobsKnowledgeVersion.deleteMany(); await db.niceJobsKnowledge.deleteMany(); await db.communicationTemplate.deleteMany();
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
afterAll(async () => { await postgres.dispose(); rmSync(directory, { recursive: true, force: true }); }, 30000);
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
async function workCommand(operation: string, extra = {}, actor = candidate) { return employee.mutate(actor, { operation, confirmed: true, idempotencyKey: crypto.randomUUID(), ...extra }); }
async function agent() {
  const identity = await db.siaIdentity.create({ data: { name: "Isolated SIA", title: "Shared worker assistant" } });
  const keys = ["nicejobs.sop.read", "nicejobs.resource.read", "nicejobs.message.read", "nicejobs.lead.self.read", "nicejobs.workspace.self", "nicejobs.report.self", "nicejobs.blocker.self", "nicejobs.work.read", "notification.read"];
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

const contentPayload = (kind = "SOP", extra = {}) => ({ title: "Isolated " + kind + " fixture", summary: "Synthetic test content only", purpose: "Validate authorized content machinery", organizationId: labs, audience: "DIVISION", requiredAck: true, ...(kind === "SOP" ? { steps: [{ title: "Isolated step", instruction: "Record actual test evidence; no official policy" }] } : kind === "RESOURCE" ? { resourceType: "REFERENCE", body: "Authorized isolated reference" } : { communicationType: "ANNOUNCEMENT", body: "Authorized isolated announcement" }), ...extra });
async function draft(kind = "SOP", extra = {}) { return knowledge.mutate(manager, input("CREATE", { kind, payload: contentPayload(kind, extra) })); }
async function contentAct(id: string, operation: string, extra = {}, actor = manager) { const v = await db.niceJobsKnowledgeVersion.findUniqueOrThrow({ where: { id } }); return knowledge.mutate(actor, input(operation, { versionId: id, revision: v.revision, ...extra })); }
async function published(kind = "SOP", extra = {}) { const d = await draft(kind, extra); await contentAct(d.id, "SUBMIT"); await contentAct(d.id, "REVIEW", { reason: "Independent isolated review" }, "organizationId" in extra && extra.organizationId !== labs ? contentReviewer : approver); await contentAct(d.id, "PUBLISH"); return d.id; }
beforeAll(async () => { contentReviewer = await human("content-reviewer", company, ["nicejobs.knowledge.read", "nicejobs.knowledge.review"], true); const membership = await db.membership.findFirstOrThrow({ where: { person: { users: { some: { id: approver } } }, organizationId: labs }, include: { roles: true } }); for (const key of ["nicejobs.knowledge.read", "nicejobs.knowledge.review"]) await db.rolePermission.create({ data: { roleId: membership.roles[0].roleId, permissionId: (await db.permission.findUniqueOrThrow({ where: { key } })).id } }); });
describe("Uploaded worker and trainee resources", () => {
  async function media() {
    const storage = privateContentStorage(join(directory,"secure-files")), files = createContentFiles(db,storage), library = createKnowledgeService(db,()=>clock,unavailableAttachments,storage);
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=","base64");
    const uploaded = await files.upload(manager,{organizationId:labs,idempotencyKey:crypto.randomUUID(),filename:"practice.png",mime:"image/png"},bytes);
    const resource = await library.mutate(manager,input("CREATE",{kind:"RESOURCE",payload:contentPayload("RESOURCE",{body:undefined,resourceType:"IMAGE",privateReference:uploaded.id,captions:"Synthetic practice image"})}));
    await library.mutate(manager,input("SUBMIT",{versionId:resource.id,revision:0}));
    await library.mutate(contentReviewer,input("REVIEW",{versionId:resource.id,revision:1,reason:"Independent isolated file review"}));
    await library.mutate(manager,input("PUBLISH",{versionId:resource.id,revision:2}));
    return {files,library,bytes,id:resource.id!};
  }
  it("delivers only a current authorized active worker's file and denies revoked or archived access",async()=>{
    const resource = await media(); await activate();
    expect((await resource.files.download(candidate,resource.id)).bytes).toEqual(resource.bytes);
    await expect(resource.files.download(other,resource.id)).rejects.toThrow(); await expect(resource.files.download(outsider,resource.id)).rejects.toThrow();
    await resource.library.mutate(manager,input("ARCHIVE",{versionId:resource.id,revision:3,reason:"Retire isolated material"}));
    await expect(resource.files.download(candidate,resource.id)).rejects.toThrow();
  });
  it("permits only files pinned to the candidate's own accepted-offer training, without general resource access",async()=>{
    const resource = await media();
    const target = await publish({orientation:{modules:[{key:"media_module",title:"Synthetic media lesson",order:0,lessons:[{key:"media_lesson",title:"Private practice image",order:0,type:"IMAGE",reference:resource.id,completion:"ACKNOWLEDGE"}]}]}},"MEDIA-TRAINING");
    const ref = await accepted(candidate,target); await act(ref,"ENROLL");
    await expect(resource.files.download(candidate,resource.id)).rejects.toThrow();
    expect((await resource.files.download(candidate,resource.id,false,ref)).bytes).toEqual(resource.bytes);
    await expect(resource.files.download(other,resource.id,false,ref)).rejects.toThrow();
    const d = await onboarding.detail(candidate,ref,true);
    expect(d.progress.find(p=>p.key==="media_lesson")?.resource?.id).toBe(resource.id);
    await act(ref,"START_ORIENTATION"); await act(ref,"COMPLETE_LESSON",{progressId:(await progress(ref,"media_lesson")).id,acknowledged:true});
    const unlinked = await media(); await expect(unlinked.files.download(candidate,unlinked.id,false,ref)).rejects.toThrow();
    await act(ref,"CANCEL",{},manager,false); await expect(resource.files.download(candidate,resource.id,false,ref)).rejects.toThrow();
    expect(await db.niceJobsAssignment.count()).toBe(0);
  });
});

describe("Nice Jobs scoped knowledge and internal communications", () => {
  it("shares only independently published current customer materials in the worker scope", async () => {
    await activate();
    const ordinary = await published("RESOURCE");
    expect((await knowledge.detail(candidate, ordinary)).customerMaterial).toBeNull();
    const d = await draft("RESOURCE", { resourceType: "CUSTOMER_MATERIAL" });
    await expect(knowledge.detail(candidate, d.id)).rejects.toThrow();
    await contentAct(d.id, "SUBMIT");
    await expect(contentAct(d.id, "PUBLISH")).rejects.toThrow();
    await contentAct(d.id, "REVIEW", { reason: "Customer sharing content reviewed" }, approver);
    await contentAct(d.id, "PUBLISH");
    expect((await knowledge.detail(candidate, d.id)).customerMaterial?.text).toBe("Authorized isolated reference");
    await expect(knowledge.detail(outsider, d.id)).rejects.toThrow();
    await contentAct(d.id, "ARCHIVE", { reason: "Withdrawn for customer sharing" });
    expect((await knowledge.detail(candidate, d.id)).customerMaterial).toBeNull();
    await expect(draft("RESOURCE", { resourceType: "CUSTOMER_MATERIAL", visibility: "MANAGEMENT" })).rejects.toThrow("worker-visible");
  });
  it("rejects forged actors, company, receipt ownership and arbitrary status", () => {
    const c = input("CREATE", { kind: "SOP", payload: contentPayload() });
    expect(knowledgeCommand.safeParse(c).success).toBe(true);
    for (const key of ["actorUserId", "companyId", "assignmentId", "status", "permissions"]) expect(knowledgeCommand.safeParse({ ...c, [key]: "forged" }).success).toBe(false);
    expect(knowledgeCommand.safeParse(input("ACK", { versionId: "guess", workerId: "forged" })).success).toBe(false);
  });
  it("creates, edits and independently reviews a draft, then freezes publication", async () => {
    const d = await draft(); await contentAct(d.id, "EDIT", { payload: contentPayload("SOP", { title: "Edited fixture" }) }); await contentAct(d.id, "SUBMIT");
    await expect(contentAct(d.id, "PUBLISH")).rejects.toThrow("Independent review");
    await expect(contentAct(d.id, "REVIEW", { reason: "Self review" })).rejects.toThrow();
    await contentAct(d.id, "REVIEW", { reason: "Independent fixture review" }, approver); await contentAct(d.id, "PUBLISH");
    await expect(contentAct(d.id, "EDIT", { payload: contentPayload() })).rejects.toThrow("Only drafts");
    const v = await db.niceJobsKnowledgeVersion.findUniqueOrThrow({ where: { id: d.id } }); expect(v.title).toBe("Edited fixture"); expect(v.current).toBe(true);
  });
  it("preserves exact historical SOP versions and acknowledgements", async () => {
    const a = await activate(), old = await published(); await knowledge.mutate(candidate, input("ACK", { versionId: old, evidenceReference: "explicit-read-confirmation" }));
    const next = await contentAct(old, "NEW_VERSION"); await contentAct(next.id, "EDIT", { payload: contentPayload("SOP", { title: "Version two fixture" }) }); await contentAct(next.id, "SUBMIT"); await contentAct(next.id, "REVIEW", { reason: "Reviewed changes" }, approver); await contentAct(next.id, "PUBLISH");
    expect((await knowledge.list(candidate, { kind: "SOP" })).records.map(r => r.id)).toEqual([next.id]);
    expect((await knowledge.detail(candidate, old)).version.title).toBe("Isolated SOP fixture");
    expect((await db.niceJobsKnowledgeReceipt.findUniqueOrThrow({ where: { versionId_assignmentId: { versionId: old, assignmentId: a.assignmentId } } })).acknowledgedAt).toBeTruthy();
    expect(await db.niceJobsKnowledgeReceipt.count({ where: { versionId: next.id } })).toBe(0);
  });
  it("denies company/division IDOR, private content and guessed IDs", async () => {
    await activate(); const id = await published(), privateId = await published("SOP", { visibility: "MANAGEMENT", title: "Private management instruction" });
    await expect(knowledge.detail(outsider, id, true)).rejects.toThrow(); await expect(knowledge.detail(reader, id)).rejects.toThrow();
    await expect(knowledge.detail(candidate, privateId)).rejects.toThrow(); await expect(knowledge.detail(candidate, "guess")).rejects.toThrow();
    expect((await knowledge.list(candidate, { kind: "SOP", search: "Private" })).records).toEqual([]);
    await expect(draft("SOP", { organizationId: career, audience: "DIVISION", jobVersionId: versionId })).rejects.toThrow();
    const crossDivision = await published("SOP", { organizationId: career }); await expect(knowledge.detail(candidate, crossDivision)).rejects.toThrow();
  });
  it("uses actual job version and assignment targeting rather than titles", async () => {
    const a = await activate(), byJob = await published("SOP", { audience: "JOB_VERSION", jobVersionId: versionId }), byWorker = await published("SOP", { audience: "ASSIGNMENT", assignmentId: a.assignmentId });
    expect((await knowledge.detail(candidate, byJob)).version.id).toBe(byJob); expect((await knowledge.detail(candidate, byWorker)).version.id).toBe(byWorker);
    await activate(other); await expect(knowledge.detail(other, byWorker)).rejects.toThrow();
    await expect(draft("SOP", { audience: "JOB_VERSION", jobVersionId: "guess" })).rejects.toThrow();
  });
  it("requires scoped capabilities for company content and manager groups", async () => {
    await activate(); const id = await published("SOP", { audience: "COMPANY", organizationId: company });
    await expect(knowledge.detail(candidate, id)).rejects.toThrow(); const group = await published("COMMUNICATION", { audience: "MANAGER_GROUP", managerId: (await db.user.findUniqueOrThrow({ where: { id: manager } })).personId! }); expect((await knowledge.detail(candidate, group)).version.id).toBe(group);
  });
  it("records acknowledgement only for the current worker and exact configured version", async () => {
    const a = await activate(), id = await published(); await expect(knowledge.mutate(candidate, input("ACK", { versionId: id, assignmentId: "forged" }))).rejects.toThrow();
    await knowledge.mutate(candidate, input("ACK", { versionId: id })); expect(await db.niceJobsKnowledgeReceipt.count({ where: { assignmentId: a.assignmentId } })).toBe(1);
    const optional = await published("SOP", { requiredAck: false }); await expect(knowledge.mutate(candidate, input("ACK", { versionId: optional }))).rejects.toThrow("not configured");
    expect((await db.niceJobsAssignment.findUniqueOrThrow({ where: { id: a.assignmentId } })).status).toBe("ACTIVE");
  });
  it("creates versioned resources, filtered search and scoped SOP references", async () => {
    await activate(); const resource = await published("RESOURCE", { title: "Authorized reference long-name fixture" });
    const sop = await published("SOP", { steps: [{ title: "Resource step", instruction: "Use the explicit reference", resourceVersionId: resource }] });
    expect((await knowledge.detail(candidate, sop)).version.steps[0].resource?.id).toBe(resource);
    const found = await knowledge.list(candidate, { kind: "RESOURCE", search: "long-name", resourceType: "REFERENCE" }); expect(found.records.map(r => r.id)).toEqual([resource]);
    const next = await contentAct(resource, "NEW_VERSION"); expect(next.id).not.toBe(resource); expect((await knowledge.detail(candidate, resource)).version.body).toBe("Authorized isolated reference");
  });
  it("fails closed for private storage and unsafe links", async () => {
    await expect(draft("RESOURCE", { body: undefined, privateReference: "opaque-private-file" })).rejects.toThrow();
    await expect(draft("RESOURCE", { body: undefined, url: "javascript:alert(1)" })).rejects.toThrow();
    await expect(draft("RESOURCE", { url: "https://example.invalid/resource" })).rejects.toThrow("exactly one");
  });
  it("reuses canonical immutable communication templates without provider messages", async () => {
    await activate(); const id = await published("COMMUNICATION", { title: "Important isolated announcement", priority: "HIGH" });
    const row = await db.niceJobsKnowledgeVersion.findUniqueOrThrow({ where: { id }, include: { communicationTemplate: true } }); expect(row.body).toBeNull(); expect(row.communicationTemplate?.body).toBe("Authorized isolated announcement"); expect(row.communicationTemplate?.channel).toBe("IN_APP"); expect(await db.communicationMessage.count()).toBe(0);
    await expect(contentAct(id, "EDIT", { payload: contentPayload("COMMUNICATION") })).rejects.toThrow(); await expect(contentAct(id, "NEW_VERSION")).rejects.toThrow();
  });
  it("isolates inbox read/ack/archive state and does not acknowledge on GET", async () => {
    await activate(); await activate(other); const id = await published("COMMUNICATION");
    await knowledge.detail(candidate, id); expect(await db.niceJobsKnowledgeReceipt.count()).toBe(0);
    await knowledge.mutate(candidate, input("READ", { versionId: id })); expect((await knowledge.list(candidate, { kind: "COMMUNICATION", unread: true })).records).toEqual([]); expect((await knowledge.list(other, { kind: "COMMUNICATION", unread: true })).records).toHaveLength(1);
    await expect(knowledge.mutate(candidate, input("INBOX_ARCHIVE", { versionId: id }))).rejects.toThrow("acknowledgement");
    await knowledge.mutate(candidate, input("ACK", { versionId: id })); await knowledge.mutate(candidate, input("INBOX_ARCHIVE", { versionId: id }));
    expect((await knowledge.list(candidate, { kind: "COMMUNICATION" })).records).toEqual([]); expect((await knowledge.list(other, { kind: "COMMUNICATION" })).records).toHaveLength(1);
  });
  it("controls scheduling, expiry and archive without background publication", async () => {
    await activate(); const d = await draft("COMMUNICATION", { expiresAt: new Date(clock.getTime() + 7200000).toISOString() });
    await contentAct(d.id, "SUBMIT"); await contentAct(d.id, "REVIEW", { reason: "Scheduled fixture review" }, approver); await contentAct(d.id, "SCHEDULE", { scheduledAt: new Date(clock.getTime() + 3600000).toISOString() });
    await expect(contentAct(d.id, "PUBLISH")).rejects.toThrow("due"); expect((await knowledge.list(candidate, { kind: "COMMUNICATION" })).records).toEqual([]);
    clock = new Date(clock.getTime() + 3600001); await contentAct(d.id, "PUBLISH"); expect((await knowledge.list(candidate, { kind: "COMMUNICATION" })).records).toHaveLength(1);
    clock = new Date(clock.getTime() + 3600000); expect((await knowledge.list(candidate, { kind: "COMMUNICATION" })).records).toEqual([]); expect((await knowledge.list(manager, { kind: "COMMUNICATION", management: true, status: "EXPIRED" })).records[0].status).toBe("EXPIRED");
    await contentAct(d.id, "ARCHIVE", { reason: "Expired fixture archive" }); expect((await db.niceJobsKnowledgeVersion.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("ARCHIVED");
  });
  it("protects unauthorized publish/archive/visibility changes and stale revisions", async () => {
    await activate(); const d = await draft(); await expect(contentAct(d.id, "SUBMIT", {}, candidate)).rejects.toThrow(); await expect(contentAct(d.id, "ARCHIVE", { reason: "Unauthorized" }, candidate)).rejects.toThrow();
    await expect(contentAct(d.id, "EDIT", { payload: contentPayload("SOP", { visibility: "MANAGEMENT" }) }, candidate)).rejects.toThrow();
    await contentAct(d.id, "EDIT", { payload: contentPayload() }); await expect(knowledge.mutate(manager, input("SUBMIT", { versionId: d.id, revision: 0 }))).rejects.toThrow("changed");
  });
  it("revalidates current independent review authority before publishing", async () => {
    const d = await draft(); await contentAct(d.id, "SUBMIT"); await contentAct(d.id, "REVIEW", { reason: "Initial authorized review" }, approver);
    const role = await db.role.findFirstOrThrow({ where: { memberships: { some: { membership: { person: { users: { some: { id: approver } } } } } } } }), permission = await db.permission.findUniqueOrThrow({ where: { key: "nicejobs.knowledge.review" } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
    try { await expect(contentAct(d.id, "PUBLISH")).rejects.toThrow(); } finally { await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } }); }
  });
  it("protects duplicate/replayed commands and denies replay after revocation", async () => {
    const c = input("CREATE", { kind: "SOP", payload: contentPayload() }); const first = await knowledge.mutate(manager, c); expect((await knowledge.mutate(manager, c)).id).toBe(first.id); expect(await db.niceJobsKnowledge.count()).toBe(1);
    await expect(knowledge.mutate(manager, { ...c, payload: contentPayload("SOP", { title: "Changed replay" }) })).rejects.toThrow("replay");
    await db.user.update({ where: { id: manager }, data: { status: "SUSPENDED" } }); try { await expect(knowledge.mutate(manager, c)).rejects.toThrow(); } finally { await db.user.update({ where: { id: manager }, data: { status: "ACTIVE" } }); }
  });
  it("rolls back content and publication when audit persistence fails", async () => {
    const restoreLegacyTrigger1 = await postgres.rejectInsert("AuditEvent", "nicejobs.knowledge.", "PREFIX");
    try { await expect(draft()).rejects.toThrow(); expect(await db.niceJobsKnowledge.count()).toBe(0); } finally { await restoreLegacyTrigger1(); }
    const d = await draft("COMMUNICATION"); await contentAct(d.id, "SUBMIT"); await contentAct(d.id, "REVIEW", { reason: "Independent fixture review" }, approver);
    const restoreLegacyTrigger2 = await postgres.rejectInsert("AuditEvent", "nicejobs.knowledge.publish");
    try { await expect(contentAct(d.id, "PUBLISH")).rejects.toThrow(); expect(await db.communicationTemplate.count()).toBe(0); expect((await db.niceJobsKnowledgeVersion.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("IN_REVIEW"); } finally { await restoreLegacyTrigger2(); }
  });
  it("links exact SOP versions to assigned tasks, leads, follow-ups and SOP change messages", async () => {
    const fixture = await leadFixture(), sop = await published(), resource = await published("RESOURCE");
    await run("SCHEDULE", fixture.id, { scheduledAt: new Date(clock.getTime() + 3600000).toISOString(), type: "CALL", purpose: "Isolated follow-up" }); const f = await db.niceJobsLeadFollowup.findFirstOrThrow();
    const task = await workCommand("ASSIGN_TASK", { assignmentId: fixture.assignmentId, title: "Isolated SOP task", description: "Recorded instruction", priority: "NORMAL", reason: "Explicit fixture assignment" }, manager);
    for (const [resourceType, resourceId] of [["TASK",task.id],["LEAD",fixture.id],["FOLLOWUP",f.id]]) await contentAct(sop, "LINK", { resourceType, resourceId });
    expect((await knowledge.forWork(candidate, "LEAD", fixture.id))[0].id).toBe(sop); expect((await knowledge.forWork(candidate, "FOLLOWUP", f.id))[0].id).toBe(sop); expect((await knowledge.forWork(candidate, "TASK", task.id))[0].id).toBe(sop);
    const message = await published("COMMUNICATION", { communicationType: "SOP_CHANGE", relatedVersionId: sop }); expect((await knowledge.detail(candidate, message)).version.related?.id).toBe(sop); expect(resource).toBeTruthy(); await transition(fixture.id,"START");
  });
  it("sends only explicit authorized notifications and honors preferences", async () => {
    const a = await activate(), id = await published("COMMUNICATION"); await contentAct(id, "NOTIFY", { assignmentIds: [a.assignmentId] }); expect(await db.notification.count({ where: { recipientUserId: candidate, type: "NICE_JOBS_CONTENT" } })).toBe(1);
    await db.notificationPreference.create({ data: { userId: candidate, type: "NICE_JOBS_CONTENT", channel: "IN_APP", enabled: false } }); try { await contentAct(id, "NOTIFY", { assignmentIds: [a.assignmentId] }); expect(await db.notification.count({ where: { recipientUserId: candidate, type: "NICE_JOBS_CONTENT" } })).toBe(1); } finally { await db.notificationPreference.deleteMany({ where: { userId: candidate, type: "NICE_JOBS_CONTENT" } }); }
    await expect(contentAct(id, "NOTIFY", { assignmentIds: [a.assignmentId, "guess"] })).rejects.toThrow(); expect(await db.notification.count({ where: { recipientUserId: candidate, type: "NICE_JOBS_CONTENT" } })).toBe(1);
  });
  it("grounds SIA knowledge in current human AND agent source capabilities", async () => {
    await activate(); const sop = await published(), resource = await published("RESOURCE"), message = await published("COMMUNICATION"); await published("SOP", { title: "PRIVATE-SOP-SECRET", visibility: "MANAGEMENT" });
    const siaId = await agent(), selection = { siaId, organizationId: labs, audience: "WORKER", message: "Show my SOP and resources and manager instructions", idempotencyKey: crypto.randomUUID() };
    const answer = await sia.converse(candidate, selection); for (const id of [sop,resource,message]) expect(answer.facts.some(f=>f.source==="NICE_JOBS_KNOWLEDGE:"+id)).toBe(true); expect(JSON.stringify(answer)).not.toContain("PRIVATE-SOP-SECRET"); expect(await db.siaAction.count()).toBe(0);
    const role=await db.siaRoleAssignment.findFirstOrThrow({where:{siaId}}), permission=await db.permission.findUniqueOrThrow({where:{key:"nicejobs.sop.read"}}); await db.rolePermission.delete({where:{roleId_permissionId:{roleId:role.roleId,permissionId:permission.id}}});
    const narrowed=await sia.converse(candidate,{...selection,idempotencyKey:crypto.randomUUID()}); expect(narrowed.facts.some(f=>f.source==="NICE_JOBS_KNOWLEDGE:"+sop)).toBe(false);
    for(const q of ["Publish SOP","Acknowledge all messages","Modify resources","Grant content permissions"])expect(workerQuestion(q)).toBe(false);
    expect((await createAccessContext(candidate,db,undefined,{organizationId:company})).active).toBe(true);
  });

  it("requires independent people even when the author has another account", async () => {
    const owner = await db.user.findUniqueOrThrow({ where: { id: manager } });
    const alias = await db.user.create({ data: { personId: owner.personId, email: "owner-alias@phase07.invalid" } });
    const d = await draft(); await contentAct(d.id, "SUBMIT");
    await expect(contentAct(d.id, "REVIEW", { reason: "Same-person account review" }, alias.id)).rejects.toThrow("Independent person");
  });
  it("rechecks human source grants and active assignment before SIA retrieval or receipt replay", async () => {
    const a=await activate(),resource=await published("RESOURCE"),sop=await published(),siaId=await agent();
    const command=input("ACK",{versionId:sop});await knowledge.mutate(candidate,command);
    const role=await db.role.findUniqueOrThrow({where:{organizationId_key:{organizationId:labs,key:"work-"+candidate}}}),permission=await db.permission.findUniqueOrThrow({where:{key:"nicejobs.resource.read"}});
    await db.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}}});
    try {await expect(knowledge.detail(candidate,resource)).rejects.toThrow();const answer=await sia.converse(candidate,{siaId,organizationId:labs,audience:"WORKER",message:"Show my resources",idempotencyKey:crypto.randomUUID()});expect(answer.facts.some(f=>f.source==="NICE_JOBS_KNOWLEDGE:"+resource)).toBe(false);}finally{await db.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});}
    await db.niceJobsAssignment.update({where:{id:a.assignmentId},data:{status:"SUSPENDED"}});
    await expect(knowledge.mutate(candidate,command)).rejects.toThrow();
  });

  it("keeps large resource lists bounded and query count independent of page size", async () => {
    await activate(); const count=1001; await db.niceJobsKnowledge.createMany({data:Array.from({length:count},(_,i)=>({id:"scale-content-"+i,companyId:company,kind:"RESOURCE",createdByUserId:manager}))}); await db.niceJobsKnowledgeVersion.createMany({data:Array.from({length:count},(_,i)=>({id:"scale-version-"+String(i).padStart(4,"0"),contentId:"scale-content-"+i,number:1,organizationId:labs,audience:"DIVISION",ownerUserId:manager,title:"Scale fixture resource "+i,summary:"Scoped fixture",purpose:"Validation",body:"Bounded reference",resourceType:"REFERENCE",status:"PUBLISHED",current:true,publishedAt:clock}))});
    capturedQueries=[];const started=Date.now(),first=await knowledge.list(candidate,{kind:"RESOURCE",search:"Scale fixture",limit:25});const queries25=capturedQueries.length;capturedQueries=[];const large=await knowledge.list(candidate,{kind:"RESOURCE",search:"Scale fixture",limit:100});const queries100=capturedQueries.length;capturedQueries=null;
    expect(first.records).toHaveLength(25);expect(large.records).toHaveLength(100);expect(queries25).toBe(queries100);const next=await knowledge.list(candidate,{kind:"RESOURCE",search:"Scale fixture",after:first.nextCursor!});expect(next.records[0].id).not.toBe(first.records[0].id);
    console.log(JSON.stringify({fixtureResources:count,activatedWorkers:1,queries25,queries100,milliseconds:Date.now()-started}));
  });
});
