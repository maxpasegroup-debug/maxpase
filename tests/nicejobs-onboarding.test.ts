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
import { createApplicantAccess } from "@/server/nicejobs/applicant-access";
import { createAccessContext } from "@/server/authorization/engine";
import { orientationConfiguration, quizConfiguration, onboardingInput } from "@/server/nicejobs/onboarding-input";
import { fixtureProgramme } from "./fixtures/nicejobs-programme";
import { curriculumSchedule } from "@/server/nicejobs/curriculum";
import { createPreOfferService } from "@/server/nicejobs/pre-offer";
import { createSiaService } from "@/server/sia/service";
import { deterministicProvider } from "@/server/sia/provider";
import { createNiceJobsControlPanel } from "@/server/nicejobs/control-panel";
import { createOfferDocumentService } from "@/server/nicejobs/offer-document";
import { initialOpportunities } from "@/server/nicejobs/initial-opportunities";
import { performance } from "node:perf_hooks";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phase04-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/"),log:[{emit:"event",level:"query"}] });
let captureQueries=false,queryCount=0,databaseMs=0;
db.$on("query",event=>{if(captureQueries){queryCount++;databaseMs+=event.duration;}});
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
  const v = await jobs.create(manager, { code, title: "Synthetic onboarding job", description: "Synthetic onboarding opportunity", visibility: "PUBLIC", divisionIds: [labs], configuration: { schemaVersion: 1, opportunity: await fixtureOpportunity(db, manager), application: { fields: [{ key: "experience", label: "Synthetic experience", type: "NUMBER", required: true }] }, eligibility: { rules: [{ field: "experience", operator: "GTE", value: 1 }] }, screening: { questions: [{ field: "experience", operator: "GTE", value: 1, weight: 1 }], passMark: 80 }, interview: { enabled: false, type: "VIDEO", duration: 30, questions: [], evaluationRequired: false }, management: { policies: [{ divisionId: labs, controlPointId: controlId }] }, offer: { title: "Synthetic offer", content: { terms: "Isolated fixture, not employment terms" }, validityDays: 2 }, ...training, ...extra } });
  await jobs.changeJob(manager, { id: v.id, revision: 0, to: "PUBLISHED", reason: "Fixture publication" }); return v.id;
}
async function accepted(userId = candidate, version = versionId, beforeAccept?: () => Promise<void>) {
  let a = await applications.create(userId, { versionId: version, divisionId: labs });
  a = await applications.mutate(userId, { reference: a.reference, revision: 0, action: "SUBMIT", answers: { experience: 2 } });
  for (const action of ["ELIGIBILITY", "SCREENING", "SHORTLIST"]) a = await applications.mutate(manager, { reference: a.reference, revision: a.revision, action, reason: "Fixture human review" });
  const act = async (operation: string, extra = {}, actor = manager) => { const r = await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: a.reference } }); return recruitment.mutate(actor, { reference: r.reference, revision: r.revision, operation, reason: "Fixture decision", ...extra }); };
  await act("START_REVIEW");
  const r = await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: a.reference } }), approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: r.reviewRequestId, status: "PENDING" } });
  await act("DECIDE", { approvalId: approval.id, decision: "APPROVED" }, approver); await act("PREPARE_OFFER");
  let offer = await db.niceJobsOffer.findFirstOrThrow({ where: { applicationId: r.id } }); await act("READY_OFFER", { offerReference: offer.reference, recordRevision: offer.revision });
  const preOffer=createPreOfferService(db),pre=await preOffer.detail(userId,a.reference);
  if(pre){await preOffer.mutate(userId,{reference:a.reference,revision:pre.revision,fingerprint:pre.fingerprint,action:"COMPLETE_ORIENTATION",acknowledged:true,answers:{understood:true},idempotencyKey:crypto.randomUUID()});const checked=(await preOffer.detail(userId,a.reference))!;await preOffer.mutate(userId,{reference:a.reference,revision:checked.revision,fingerprint:checked.fingerprint,action:"ACCEPT_POLICIES",acknowledged:true,idempotencyKey:crypto.randomUUID()});}
  offer = await db.niceJobsOffer.findUniqueOrThrow({ where: { id: offer.id } }); await act("ISSUE_OFFER", { offerReference: offer.reference, recordRevision: offer.revision });
  offer = await db.niceJobsOffer.findUniqueOrThrow({ where: { id: offer.id } });
  if (beforeAccept) await beforeAccept();
  await act("ACCEPT_OFFER", { offerReference: offer.reference, recordRevision: offer.revision }, userId);
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
async function controlledCurriculum(code="CONTROLLED-CURRICULUM",title="Synthetic reviewed control programme"){
  const curriculum=fixtureProgramme(manager);curriculum.programmeSetup.ojtReviewerUserId=mentor;
  curriculum.ojt.curriculum!.pauseRule="HUMAN_REVIEW_FIXED_CALENDAR";curriculum.ojt.curriculum!.rescheduleRule="HUMAN_REVIEW_EXTENSION";
  const v=await jobs.create(manager,{code,title,description:"Isolated fixture only",visibility:"PUBLIC",divisionIds:[labs],configuration:{schemaVersion:1,opportunity:await fixtureOpportunity(db,manager),...curriculum,orientation,application:{fields:[{key:"experience",label:"Experience",type:"NUMBER",required:true}]},eligibility:{rules:[{field:"experience",operator:"GTE",value:1}]},screening:{questions:[{field:"experience",operator:"GTE",value:1,weight:1}],passMark:80},interview:{enabled:false,type:"VIDEO",duration:30,questions:[],evaluationRequired:false},management:{policies:[{divisionId:labs,controlPointId:controlId}]},offer:{title:"Synthetic controlled offer",content:{terms:"Not real employment"},validityDays:2}}});
  for(const [revision,to] of [[0,"PENDING_VERIFICATION"],[1,"APPROVED"],[2,"PUBLISHED"]] as const)await jobs.changeJob(manager,{id:v.id,revision,to,reason:"Isolated reviewed programme"});
  return v.id;
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
  await db.reminder.deleteMany();
  await db.niceJobsTrainingReview.deleteMany(); await db.niceJobsTrainingSubmission.deleteMany(); await db.niceJobsTrainingProgress.deleteMany(); await db.niceJobsOnboarding.deleteMany(); await db.niceJobsTrainingPlan.deleteMany();
  await db.niceJobsOffer.deleteMany(); await db.niceJobsApplicationHistory.deleteMany(); await db.niceJobsApplication.deleteMany(); await db.siaApproval.deleteMany(); await db.operationalRequest.deleteMany(); await db.notification.deleteMany();
  await db.niceJobsTemplate.updateMany({ data: { publishedVersionId: null } }); await db.niceJobsVersionArea.deleteMany(); await db.niceJobsVersion.deleteMany(); await db.niceJobsTemplate.deleteMany();
  clock = new Date("2026-10-08T08:00:00Z"); versionId = await publish();
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
describe("Nice Jobs orientation, OJT and human readiness", () => {
  // Role labels exercise shared mechanics, not the unapproved employer/content/terms for real jobs.
  it.each(initialOpportunities("fixture-company","NOT A VERIFIED PILOT EMPLOYER","fixture-brand").map(r=>({code:r.code,title:r.title})))("rehearses all 100 days for isolated $code without employment activation",async({code,title})=>{
    const version=await controlledCurriculum("PILOT-"+code,"ISOLATED / "+title+" / Not a real job");
    const ref=await accepted(candidate,version),enrollment=await command(ref,"ENROLL");
    await onboarding.mutate(candidate,enrollment,true);await onboarding.mutate(candidate,enrollment,true);
    const enrolled=await db.niceJobsOnboarding.findFirstOrThrow({where:{application:{reference:ref}},include:{plan:true,offer:true}});
    expect(await db.niceJobsOnboarding.count({where:{applicationId:enrolled.applicationId}})).toBe(1);
    const document=await createOfferDocumentService(db).download(candidate,enrolled.offer.reference);expect(document.html).toContain("ISOLATED");
    await expect(createOfferDocumentService(db).download(other,enrolled.offer.reference)).rejects.toThrow();
    await oriented(ref);await assigned(ref);await act(ref,"START_OJT");
    const controller=await human("pilot-control-"+crypto.randomUUID(),company,[...workforcePermissions.map(p=>p.key),"organization.read"],true);
    const decide=async(kind:"PAUSE"|"RESUME"|"EXTEND",extra={})=>{
      await act(ref,"PROPOSE_CONTROL",{control:{kind,...extra},feedback:"Isolated pilot control; not a real business decision"},manager,false);
      const pending=(await onboarding.detail(manager,ref,false)).control.proposals.find(p=>p.status==="PENDING")!;
      await act(ref,"DECIDE_CONTROL",{controlDecision:{proposalId:pending.id,decision:"APPROVED"},feedback:"Independent isolated decision"},controller,false);
    };
    const days=curriculumSchedule(fixtureProgramme(manager).ojt,clock);
    await decide("PAUSE");
    await expect(act(ref,"SUBMIT_ACTIVITY",{progressId:(await progress(ref,"day_1")).id,evidence:{text:"Paused evidence"}})).rejects.toThrow("paused");
    await decide("RESUME");
    const extended=new Date(days[99].dueAt.getTime()+86400000);
    await decide("EXTEND",{progressId:(await progress(ref,"day_100")).id,dueAt:extended.toISOString()});
    for(const day of days){
      clock=day.startsAt;
      const row=await progress(ref,"day_"+day.day);
      await act(ref,"SUBMIT_ACTIVITY",{progressId:row.id,evidence:{text:"Isolated practice day "+day.day}});
      await reviewed(ref,row.key,"APPROVED","Reviewed isolated day "+day.day);
      if([1,10,100].includes(day.day)){
        const d=await onboarding.detail(candidate,ref,true,undefined,{today:true});
        await act(ref,"DAILY_REPORT",{report:{date:d.today.date,notes:"Isolated reflection, not proof of competence"}});
      }
    }
    await act(ref,"SUBMIT_ASSESSMENT",{progressId:(await progress(ref,"ojt_assessment")).id,evidence:{text:"Isolated final practical assessment"}});
    await reviewed(ref,"ojt_assessment","PASS");
    clock=new Date(days[99].dueAt.getTime()+1);
    await expect(act(ref,"REQUEST_READINESS")).rejects.toThrow("duration");
    clock=new Date(extended.getTime()+1);await act(ref,"REQUEST_READINESS");
    await expect(act(ref,"DECIDE_READINESS",{outcome:"READY"},manager,false)).rejects.toThrow();
    await act(ref,"DECIDE_READINESS",{outcome:"READY",feedback:"Synthetic readiness only; not worker activation"},readyReviewer,false);
    const d=await onboarding.detail(candidate,ref,true);
    expect(d.status).toBe("READY");expect(d.ojt).toMatchObject({required:100,completed:100});
    expect(d.learning.milestones.every(m=>m.completed===m.required)).toBe(true);
    expect(await db.niceJobsTrainingProgress.count({where:{onboardingId:enrolled.id,phase:"DAILY_REPORT"}})).toBe(3);
    expect(await db.niceJobsTrainingReview.count({where:{onboardingId:enrolled.id,kind:"OJT_REVIEW",outcome:"APPROVED"}})).toBe(100);
    expect((await db.niceJobsOnboarding.findUniqueOrThrow({where:{id:enrolled.id},include:{plan:true,offer:true}})).plan).toEqual(enrolled.plan);
    expect(await db.niceJobsAssignment.count()).toBe(0);
    const samples:{elapsedMs:number;queryCount:number;databaseMs:number;responseBytes:number}[]=[];
    for(let i=0;i<20;i++){
      queryCount=0;databaseMs=0;captureQueries=true;const started=performance.now();
      try{const result=await onboarding.detail(manager,ref,false,undefined,{today:true});samples.push({elapsedMs:performance.now()-started,queryCount,databaseMs,responseBytes:Buffer.byteLength(JSON.stringify(result))});}
      finally{captureQueries=false;}
    }
    const times=samples.map(s=>s.elapsedMs).sort((a,b)=>a-b);
    process.stdout.write("PHASE7_LOCAL_SERVICE_SAMPLE "+JSON.stringify({role:code,samples:samples.length,p95Ms:Math.round(times[Math.ceil(times.length*.95)-1]),p99Ms:Math.round(times.at(-1)!),maxQueries:Math.max(...samples.map(s=>s.queryCount)),maxDatabaseMs:Math.max(...samples.map(s=>s.databaseMs)),maxResponseBytes:Math.max(...samples.map(s=>s.responseBytes))})+"\\n");
  },120000);
  it("schedules participant reminders without granting application access and revalidates training scope at processing",async()=>{
    const ref=await enroll();await oriented(ref);await assigned(ref);await act(ref,"START_OJT");
    clock=new Date();
    const r=await command(ref,"SCHEDULE_REMINDER",{reminder:{recipient:"CANDIDATE",remindAt:new Date(clock.getTime()+3600000).toISOString(),message:"Please review your current practice"}},manager,false);
    await onboarding.mutate(manager,r,false);await onboarding.mutate(manager,r,false);
    const e=await db.niceJobsOnboarding.findFirstOrThrow({where:{application:{reference:ref}}});
    const row=await db.reminder.findFirstOrThrow({where:{reference:"nicejobs-training:"+e.id+":"+r.idempotencyKey}});
    expect(row.resourceType).toBe("ORGANIZATION");expect(row.organizationId).toBe(career);expect(row.recipientUserId).toBe(candidate);
    expect((await onboarding.detail(manager,ref,false)).scheduledReminders.some(s=>s.id===row.id)).toBe(true);
    await db.reminder.update({where:{id:row.id},data:{remindAt:new Date(Date.now()-1000)}});
    const processed=await operations.processDue(manager);expect(processed.failures).toHaveLength(0);expect(processed.succeeded).toBe(1);
    expect((await db.reminder.findUniqueOrThrow({where:{id:row.id}})).status).toBe("SUCCEEDED");
    expect(await db.notification.findFirst({where:{recipientUserId:candidate,reference:"reminder:"+row.id}})).not.toBeNull();
    const next=await command(ref,"SCHEDULE_REMINDER",{reminder:{recipient:"CANDIDATE",remindAt:new Date(clock.getTime()+3600000).toISOString(),message:"Revocation must stop delivery"}},manager,false);await onboarding.mutate(manager,next,false);
    const pending=await db.reminder.findFirstOrThrow({where:{reference:"nicejobs-training:"+e.id+":"+next.idempotencyKey}});
    await db.reminder.update({where:{id:pending.id},data:{remindAt:new Date(Date.now()-1000)}});
    const user=await db.user.findUniqueOrThrow({where:{id:candidate}});await db.membership.updateMany({where:{personId:user.personId!},data:{status:"INACTIVE"}});
    try{const result=await operations.processDue(manager);expect(result.failures).toHaveLength(1);expect(await db.notification.findFirst({where:{reference:"reminder:"+pending.id}})).toBeNull();}
    finally{await db.membership.updateMany({where:{personId:user.personId!},data:{status:"ACTIVE"}});}
    expect((await db.reminder.findUniqueOrThrow({where:{id:pending.id}})).status).toBe("FAILED");
  });
  it("audits read-only training guidance through human/agent intersection and refuses replay after revocation",async()=>{
    const ref=await enroll();await oriented(ref);await assigned(ref);await act(ref,"START_OJT");
    const keys=["organization.read","sia.access.read","executive.read","nicejobs.onboarding.read"];
    for(const key of keys)await db.permission.upsert({where:{key},update:{},create:{key,name:key,scope:"GROUP"}});
    const boss=await human("training-boss-"+crypto.randomUUID(),labs,keys);
    const identity=await db.siaIdentity.create({data:{name:"Isolated training assistant",title:"Read-only guidance"}});
    const role=await db.role.create({data:{key:"training-agent-"+identity.id,name:"Explicit scoped training read",principalType:"AGENT",organizationId:labs,permissions:{create:keys.map(key=>({permission:{connect:{key}}}))}}});
    const grant=await db.siaRoleAssignment.create({data:{siaId:identity.id,roleId:role.id,organizationId:labs}});
    await db.siaTool.create({data:{siaId:identity.id,key:"get_training_management",name:"Read-only training review",permissionKey:"nicejobs.onboarding.read",enabled:true}});
    expect((await createNiceJobsControlPanel(db).assistance(boss,{divisionId:labs},true)).state).toBe("AVAILABLE");
    const sia=createSiaService(db,deterministicProvider),request={siaId:identity.id,organizationId:labs,message:"Prepare training management summary",idempotencyKey:crypto.randomUUID()};
    const before=await db.niceJobsOnboarding.findFirstOrThrow({where:{application:{reference:ref}}});
    const result=await sia.converse(boss,request);expect(result.facts).toHaveLength(1);expect(result.context.authority).toBe("READ_ONLY_HUMAN_AGENT_INTERSECTION");
    expect(JSON.stringify(result)).not.toContain("PRIVATE-FIXTURE-NOTES");expect(JSON.stringify(result)).not.toContain("experience");
    expect((await db.niceJobsOnboarding.findUniqueOrThrow({where:{id:before.id}})).revision).toBe(before.revision);
    expect(await db.siaAction.count({where:{requesterUserId:boss}})).toBe(0);expect(await db.niceJobsAssignment.count()).toBe(0);
    const run=await db.siaRun.findUniqueOrThrow({where:{id:String(result.context.runId)}});expect(run.status).toBe("SUCCEEDED");expect(run.auditId).toBe(result.context.auditId);
    await expect(sia.converse(outsider,{...request,idempotencyKey:crypto.randomUUID()})).rejects.toThrow();
    await db.siaRoleAssignment.delete({where:{id:grant.id}});await expect(sia.converse(boss,request)).rejects.toThrow();
    expect((await createNiceJobsControlPanel(db).assistance(boss,{divisionId:labs},true)).state).toBe("NOT_AUTHORIZED");
  });
  it("requires independent human pause/resume decisions, preserves the accepted plan and blocks paused work",async()=>{
    const version=await controlledCurriculum(),ref=await enroll(await accepted(candidate,version));await oriented(ref);await assigned(ref);await act(ref,"START_OJT");
    const controller=await human("controller-"+crypto.randomUUID(),company,[...workforcePermissions.map(p=>p.key),"organization.read"],true);
    const before=await db.niceJobsOnboarding.findFirstOrThrow({where:{application:{reference:ref}},include:{plan:true,offer:true}});
    const request=await command(ref,"PROPOSE_CONTROL",{control:{kind:"PAUSE"},feedback:"Pause practice pending independent decision"},manager,false);
    await onboarding.mutate(manager,request,false);await onboarding.mutate(manager,request,false);
    let d=await onboarding.detail(manager,ref,false);expect(d.control.paused).toBe(false);expect(d.control.proposals).toHaveLength(1);
    const proposalId=d.control.proposals[0].id;
    await expect(act(ref,"DECIDE_CONTROL",{controlDecision:{proposalId,decision:"APPROVED"},feedback:"Approved pause"},manager,false)).rejects.toThrow("independent");
    for(const actor of [candidate,reader,outsider])await expect(act(ref,"DECIDE_CONTROL",{controlDecision:{proposalId,decision:"APPROVED"},feedback:"Forged approval"},actor,false)).rejects.toThrow();
    await act(ref,"DECIDE_CONTROL",{controlDecision:{proposalId,decision:"APPROVED"},feedback:"Take a break; calendar remains fixed"},controller,false);
    d=await onboarding.detail(candidate,ref,true);expect(d.control.paused).toBe(true);expect(d.progress.some(p=>p.actionable)).toBe(false);expect(d.checks.trainingControl).toBe("PAUSED");
    await expect(act(ref,"SUBMIT_ACTIVITY",{progressId:(await progress(ref,"day_1")).id,evidence:{text:"Must not bypass pause"}})).rejects.toThrow("paused");
    await expect(act(ref,"DAILY_REPORT",{report:{date:d.today.date,notes:"Must not bypass pause"}})).rejects.toThrow("paused");
    await expect(act(ref,"REQUEST_READINESS")).rejects.toThrow("paused");
    await act(ref,"PROPOSE_CONTROL",{control:{kind:"RESUME"},feedback:"Resume training on fixed calendar"},manager,false);
    const resumed=(await onboarding.detail(manager,ref,false)).control.proposals.find(p=>p.status==="PENDING")!;
    await act(ref,"DECIDE_CONTROL",{controlDecision:{proposalId:resumed.id,decision:"APPROVED"},feedback:"Resume approved"},controller,false);
    const after=await db.niceJobsOnboarding.findUniqueOrThrow({where:{id:before.id},include:{plan:true,offer:true}});expect(after.plan).toEqual(before.plan);expect(after.offer.snapshot).toBe(before.offer.snapshot);
    expect((await onboarding.detail(candidate,ref,true)).control.paused).toBe(false);expect(await db.niceJobsAssignment.count()).toBe(0);
    const departed=await human("departed-"+crypto.randomUUID(),company,[...workforcePermissions.map(p=>p.key),"organization.read"],true);
    await act(ref,"PROPOSE_CONTROL",{control:{kind:"PAUSE"},feedback:"Pending request before staff departure"},departed,false);
    const stale=(await onboarding.detail(manager,ref,false)).control.proposals.find(p=>p.status==="PENDING")!;
    await db.user.update({where:{id:departed},data:{status:"INACTIVE"}});
    await expect(act(ref,"DECIDE_CONTROL",{controlDecision:{proposalId:stale.id,decision:"APPROVED"},feedback:"Revoked requester must not be approved"},controller,false)).rejects.toThrow("no longer active");
    await act(ref,"DECIDE_CONTROL",{controlDecision:{proposalId:stale.id,decision:"REJECTED"},feedback:"Close the stale request without applying it"},controller,false);
    expect((await onboarding.detail(candidate,ref,true)).control.paused).toBe(false);
    await act(ref,"PROPOSE_CONTROL",{control:{kind:"PAUSE"},feedback:"Second pause proposal"},manager,false);
    const again=(await onboarding.detail(manager,ref,false)).control.proposals.find(p=>p.status==="PENDING")!;
    await act(ref,"DECIDE_CONTROL",{controlDecision:{proposalId:again.id,decision:"APPROVED"},feedback:"Second pause approved"},controller,false);
    await act(ref,"CANCEL",{},manager,false);
    expect((await onboarding.detail(candidate,ref,true)).control.paused).toBe(false);
    expect((await onboarding.list(manager,false,{status:"CANCELLED"})).records[0].attention).toBe("CANCELLED");
  });
  it("extends only reviewed incomplete deadlines without opening lessons early, and rolls back on audit failure",async()=>{
    const version=await controlledCurriculum(),ref=await enroll(await accepted(candidate,version));await oriented(ref);await assigned(ref);await act(ref,"START_OJT");
    const controller=await human("extension-"+crypto.randomUUID(),company,[...workforcePermissions.map(p=>p.key),"organization.read"],true);
    const row=await progress(ref,"day_2"),dueAt=new Date(row.dueAt!.getTime()+86400000).toISOString();
    await act(ref,"PROPOSE_CONTROL",{control:{kind:"EXTEND",progressId:row.id,dueAt},feedback:"Extra time for evidence"},manager,false);
    const p=(await onboarding.detail(manager,ref,false)).control.proposals[0],decision=await command(ref,"DECIDE_CONTROL",{controlDecision:{proposalId:p.id,decision:"APPROVED"},feedback:"Approved extension"},controller,false),rev=(await onboarding.detail(manager,ref,false)).revision;
    await db.$executeRawUnsafe("CREATE TRIGGER fail_training_control BEFORE INSERT ON OperationalEvent WHEN NEW.eventType = 'nicejobs.onboarding.decide_control' BEGIN SELECT RAISE(ABORT, 'control audit unavailable'); END");
    try{await expect(onboarding.mutate(controller,decision,false)).rejects.toThrow();}finally{await db.$executeRawUnsafe("DROP TRIGGER IF EXISTS fail_training_control");}
    expect((await progress(ref,"day_2")).dueAt).toEqual(row.dueAt);expect((await onboarding.detail(manager,ref,false)).revision).toBe(rev);
    await onboarding.mutate(controller,decision,false);await onboarding.mutate(controller,decision,false);
    expect((await progress(ref,"day_2")).dueAt?.toISOString()).toBe(dueAt);
    await expect(act(ref,"SUBMIT_ACTIVITY",{progressId:row.id,evidence:{text:"Must not open the next scheduled day early"}})).rejects.toThrow();
    await expect(act(ref,"DECIDE_CONTROL",{controlDecision:{proposalId:p.id,decision:"APPROVED"},feedback:"Duplicate new decision"},controller,false)).rejects.toThrow();
  });
  it("reviews programme changes without replacing the accepted offer, enrollment or completed evidence",async()=>{
    const version=await controlledCurriculum(),ref=await enroll(await accepted(candidate,version));await oriented(ref);await assigned(ref);await act(ref,"START_OJT");
    const before=await db.niceJobsOnboarding.findFirstOrThrow({where:{application:{reference:ref}},include:{plan:true,offer:true,progress:true}});
    const v=await db.niceJobsVersion.findUniqueOrThrow({where:{id:version},include:{template:true}});
    const next=await jobs.newVersion(manager,v.id,v.template.revision);
    await expect(act(ref,"PROPOSE_CONTROL",{control:{kind:"PROGRAMME_CHANGE",versionId:next.id},feedback:"Unreviewed target must fail"},manager,false)).rejects.toThrow("approved programme");
    await jobs.changeJob(manager,{id:next.id,revision:0,to:"PENDING_VERIFICATION",reason:"Isolated target review"});await jobs.changeJob(manager,{id:next.id,revision:1,to:"APPROVED",reason:"Isolated target approval"});
    await act(ref,"PROPOSE_CONTROL",{control:{kind:"PROGRAMME_CHANGE",versionId:next.id},feedback:"Request human review; new offer still required"},manager,false);
    const controller=await human("programme-"+crypto.randomUUID(),company,[...workforcePermissions.map(p=>p.key),"organization.read"],true),p=(await onboarding.detail(manager,ref,false)).control.proposals[0];
    await act(ref,"DECIDE_CONTROL",{controlDecision:{proposalId:p.id,decision:"APPROVED"},feedback:"Approved proposal only; do not transfer training or employment"},controller,false);
    const after=await db.niceJobsOnboarding.findUniqueOrThrow({where:{id:before.id},include:{plan:true,offer:true,progress:true}});
    expect(after.plan).toEqual(before.plan);expect(after.offer.snapshot).toBe(before.offer.snapshot);expect(after.progress).toEqual(before.progress);
    expect(await db.niceJobsOnboarding.count()).toBe(1);expect(await db.niceJobsAssignment.count()).toBe(0);
    const recorded=await db.niceJobsTrainingReview.findFirstOrThrow({where:{onboardingId:before.id,kind:"CONTROL_DECISION"}});expect(JSON.parse(recorded.requirements!).applicationEffect).toBe("NOT_APPLIED_REQUIRES_NEW_OFFER_AND_ENROLLMENT");
  });
  it("keeps fixed programmes immutable, schedules only validated internal recipients, and filters review queues before pagination",async()=>{
    const ref=await enroll();await oriented(ref);await assigned(ref);await act(ref,"START_OJT");
    await expect(act(ref,"PROPOSE_CONTROL",{control:{kind:"PAUSE"},feedback:"Cannot change accepted fixed terms"},manager,false)).rejects.toThrow("does not permit");
    const r=await command(ref,"SCHEDULE_REMINDER",{reminder:{recipient:"OJT_REVIEWER",remindAt:new Date(clock.getTime()+86400000).toISOString(),message:"Review isolated evidence"}},manager,false);
    await onboarding.mutate(manager,r,false);await onboarding.mutate(manager,r,false);
    const reminders=await db.reminder.findMany({where:{reference:r.idempotencyKey}});expect(reminders).toHaveLength(1);expect(reminders[0].recipientUserId).toBe(mentor);expect(reminders[0].status).toBe("PENDING");
    await expect(act(ref,"SCHEDULE_REMINDER",{reminder:{recipient:"OJT_REVIEWER",recipientUserId:outsider,remindAt:new Date(clock.getTime()+86400000).toISOString(),message:"Forged recipient"}},manager,false)).rejects.toThrow();
    expect((await onboarding.list(manager,false,{queue:"REVIEW_REQUIRED"})).records).toHaveLength(0);
    await act(ref,"SUBMIT_ACTIVITY",{progressId:(await progress(ref,"evidence")).id,evidence:{text:"Pending isolated evidence"}});
    const queue=await onboarding.list(manager,false,{queue:"REVIEW_REQUIRED",limit:1});expect(queue.records).toHaveLength(1);expect(queue.records[0].reviewQueue).toBe(1);expect(queue.records[0].oldestReviewAt).not.toBeNull();
    expect((await onboarding.list(outsider,false,{queue:"REVIEW_REQUIRED"})).records).toHaveLength(0);
    await expect(onboarding.list(manager,false,{companyId:"forged-company"})).rejects.toThrow();
    expect((await onboarding.list(manager,false,{queue:"READINESS"})).records).toHaveLength(0);
    await db.niceJobsTrainingProgress.update({where:{id:(await progress(ref,"evidence")).id},data:{status:"COMPLETED"}});
    clock=new Date(clock.getTime()+2*86400000);
    expect((await onboarding.list(manager,false,{queue:"OVERDUE",limit:1})).records).toHaveLength(1);
  });
  it("records and corrects own daily reports without inflating training completion, and blocks forged snapshots",async()=>{
    const ref=await enroll();await act(ref,"START_ORIENTATION");await assigned(ref);
    const report={date:"2026-10-08",notes:"Synthetic learning notes",blocker:"Need trainer help",nextPractice:"Repeat the practice"};
    const c=await command(ref,"DAILY_REPORT",{report});await onboarding.mutate(candidate,c,true);await onboarding.mutate(candidate,c,true);
    const detail=await onboarding.detail(candidate,ref,true,undefined,{today:true});expect(detail.orientation.completed).toBe(0);expect(detail.progress.some(p=>p.phase==="DAILY_REPORT")).toBe(false);
    expect(detail.dailyReports[0].submissions).toHaveLength(1);expect(detail.dailyReports[0].submissions[0].snapshot.completed).toBe(0);
    await expect(act(ref,"DAILY_REPORT",{report:{...report,completed:100}})).rejects.toThrow();await expect(act(ref,"DAILY_REPORT",{report:{...report,date:"2026-10-09"}})).rejects.toThrow("backdating");
    await expect(onboarding.mutate(other,{...c,idempotencyKey:crypto.randomUUID()},true)).rejects.toThrow();await expect(act(ref,"DAILY_REPORT",{report},manager,false)).rejects.toThrow();
    await expect(act(ref,"DAILY_REPORT",{report:{...report,notes:"Silent overwrite"}})).rejects.toThrow("explicit correction");
    const prior=detail.dailyReports[0].submissions[0];await act(ref,"DAILY_REPORT",{report:{...report,notes:"Corrected notes",supersedesSubmissionId:prior.id,correctionReason:"Corrected reflection"}});
    const corrected=await onboarding.detail(candidate,ref,true);expect(corrected.dailyReports[0].submissions).toHaveLength(2);expect(corrected.dailyReports[0].submissions[1].notes).toBe(report.notes);
    await expect(act(ref,"REVIEW",{submissionId:corrected.dailyReports[0].submissions[0].id,outcome:"APPROVED"},mentor,false)).rejects.toThrow("not training approval");
    expect(await db.niceJobsAssignment.count()).toBe(0);
  });
  it("rolls back daily report and revision if its mandatory audit fails",async()=>{
    const ref=await enroll();await act(ref,"START_ORIENTATION");const before=(await onboarding.detail(candidate,ref,true)).revision;
    await db.$executeRawUnsafe("CREATE TRIGGER fail_daily_training_report BEFORE INSERT ON OperationalEvent WHEN NEW.eventType = 'nicejobs.onboarding.daily_report' BEGIN SELECT RAISE(ABORT, 'report audit unavailable'); END");
    try{await expect(act(ref,"DAILY_REPORT",{report:{date:"2026-10-08",notes:"Must roll back"}})).rejects.toThrow();}finally{await db.$executeRawUnsafe("DROP TRIGGER IF EXISTS fail_daily_training_report");}
    expect(await db.niceJobsTrainingProgress.count({where:{phase:"DAILY_REPORT"}})).toBe(0);expect((await onboarding.detail(candidate,ref,true)).revision).toBe(before);
  });
  it("requires visible rework instructions and records acknowledgement and comprehension as separate signals",async()=>{
    const ref=await enroll();await oriented(ref);await assigned(ref);await act(ref,"START_OJT");
    let detail=await onboarding.detail(candidate,ref,true);expect(detail.progress.find(p=>p.key==="welcome")?.signals.acknowledgement).toBe("RECORDED");expect(detail.progress.find(p=>p.key==="check")?.signals.comprehension).toBe("PASSED");
    await act(ref,"SUBMIT_ACTIVITY",{progressId:(await progress(ref,"evidence")).id,evidence:{text:"Synthetic submitted evidence"}});const p=await progress(ref,"evidence"),s=await db.niceJobsTrainingSubmission.findFirstOrThrow({where:{progressId:p.id}});
    await expect(act(ref,"REVIEW",{submissionId:s.id,outcome:"REWORK_REQUIRED"},mentor,false)).rejects.toThrow("feedback");
    await reviewed(ref,"evidence","REWORK_REQUIRED","Repeat the practice with clearer evidence");detail=await onboarding.detail(candidate,ref,true,undefined,{today:true});expect(detail.ojt.completed).toBe(0);expect(detail.progress.find(p=>p.key==="evidence")?.submissions[0].feedback).toContain("clearer evidence");
    await act(ref,"SUBMIT_ACTIVITY",{progressId:p.id,evidence:{text:"Reviewed correction"}});await reviewed(ref,"evidence","APPROVED");expect((await onboarding.detail(candidate,ref,true)).ojt.completed).toBe(1);
  });
  it("keeps Today attempt limits aligned with the lower activity/quiz budget",async()=>{
    const bounded=await publish({ojt:{...ojt,stages:[{...ojt.stages[0],activities:[{...ojt.stages[0].activities[0],quiz,maxAttempts:1}]}]}} ,"BOUNDED-QUIZ");
    const ref=await enroll(await accepted(candidate,bounded));await oriented(ref);await assigned(ref);await act(ref,"START_OJT");
    const p=await progress(ref,"evidence");await act(ref,"SUBMIT_ACTIVITY",{progressId:p.id,answers:{safe:false},evidence:{text:"Synthetic failed quiz practice"}});
    const detail=await onboarding.detail(candidate,ref,true,undefined,{today:true}),row=detail.progress.find(p=>p.key==="evidence");expect(row?.maxAttempts).toBe(1);expect(row?.actionable).toBe(false);expect(row?.lockReason).toContain("Attempt limit reached");expect(row?.signals.comprehension).toBe("FAILED");
  });
  it("instantiates all 100 dated activities, preserves the frozen plan, and blocks early days and unauthorized reviewer changes",async()=>{
    const curriculum=fixtureProgramme(manager);
    curriculum.programmeSetup.ojtReviewerUserId=mentor;
    curriculum.ojt.curriculum!.dayMode="WORKING";curriculum.ojt.curriculum!.workingWeekdays=[1,2,3,4,5];
    const v=await jobs.create(manager,{code:"CURRICULUM-TEST",title:"Synthetic curriculum",description:"Isolated full curriculum",visibility:"PUBLIC",divisionIds:[labs],configuration:{schemaVersion:1,opportunity:await fixtureOpportunity(db,manager),...curriculum,orientation,application:{fields:[{key:"experience",label:"Experience",type:"NUMBER",required:true}]},eligibility:{rules:[{field:"experience",operator:"GTE",value:1}]},screening:{questions:[{field:"experience",operator:"GTE",value:1,weight:1}],passMark:80},interview:{enabled:false,type:"VIDEO",duration:30,questions:[],evaluationRequired:false},management:{policies:[{divisionId:labs,controlPointId:controlId}]},offer:{title:"Synthetic offer",content:{terms:"Isolated test only"},validityDays:2}}});
    await jobs.changeJob(manager,{id:v.id,revision:0,to:"PENDING_VERIFICATION",reason:"Synthetic full curriculum review"});
    await jobs.changeJob(manager,{id:v.id,revision:1,to:"APPROVED",reason:"Synthetic curriculum approval"});
    await jobs.changeJob(manager,{id:v.id,revision:2,to:"PUBLISHED",reason:"Synthetic publication only"});
    const ref=await enroll(await accepted(candidate,v.id));await oriented(ref);
    await expect(act(ref,"START_OJT")).rejects.toThrow("assign the nominated");
    await expect(act(ref,"ASSIGN_REVIEWER",{reviewerKind:"OJT",reviewerUserId:manager},manager,false)).rejects.toThrow("nominated");
    await assigned(ref);await act(ref,"START_OJT");
    const e=await db.niceJobsOnboarding.findFirstOrThrow({where:{application:{reference:ref}},include:{plan:true}});
    const rows=await db.niceJobsTrainingProgress.findMany({where:{onboardingId:e.id,phase:"OJT"}});expect(rows).toHaveLength(100);
    const dates=curriculumSchedule(curriculum.ojt,clock);expect(rows.find(r=>r.key==="day_100")!.dueAt).toEqual(dates[99].dueAt);
    const detail=await onboarding.detail(candidate,ref,true);expect(detail.progress.find(p=>p.key==="day_1")).toMatchObject({dayNumber:1,learningText:"Isolated test learning only",milestone:false});
    await act(ref,"SUBMIT_ACTIVITY",{progressId:(await progress(ref,"day_1")).id,evidence:{text:"Synthetic day one practice"}});await reviewed(ref,"day_1","APPROVED");
    await expect(act(ref,"SUBMIT_ACTIVITY",{progressId:(await progress(ref,"day_2")).id,evidence:{text:"Early test evidence"}})).rejects.toThrow("has not opened");
    expect((await onboarding.detail(candidate,ref,true)).progress.find(p=>p.key==="day_2")?.actionable).toBe(false);
    await expect(act(ref,"REQUEST_READINESS")).rejects.toThrow("requirements are missing");
    clock=dates[1].startsAt;await act(ref,"SUBMIT_ACTIVITY",{progressId:(await progress(ref,"day_2")).id,evidence:{text:"Synthetic day two practice"}});
    clock=dates[69].startsAt;
    const focused=await onboarding.detail(candidate,ref,true,undefined,{today:true});expect(focused.progress.some(p=>p.key==="day_70")).toBe(true);expect(focused.progress.some(p=>p.key==="day_2")).toBe(true);expect(focused.progress).toHaveLength(2);
    const reviewQueue=await onboarding.detail(mentor,ref,false,undefined,{reviewOnly:true});expect(reviewQueue.progress).toHaveLength(1);expect(reviewQueue.progress[0].key).toBe("day_2");expect(reviewQueue.progress[0].status).toBe("SUBMITTED");
    expect(focused.progress.find(p=>p.key==="day_70")?.lockReason).toContain("preceding mandatory");expect(focused.today.counts.awaitingReview).toBe(1);expect(focused.today.days.completed).toBe(1);
    await act(ref,"DAILY_REPORT",{report:{date:focused.today.date,notes:"Synthetic current-day reflection"}});expect((await onboarding.detail(candidate,ref,true,undefined,{today:true})).today.days.completed).toBe(1);
    await expect(onboarding.mutate(candidate,{...(await command(ref,"PAUSE")),operation:"PAUSE"},true)).rejects.toThrow();
    expect((await db.niceJobsOnboarding.findUniqueOrThrow({where:{id:e.id},include:{plan:true}})).plan.configuration).toBe(e.plan.configuration);
    await expect(onboarding.detail(other,ref,true)).rejects.toThrow();await expect(onboarding.detail(outsider,ref,false)).rejects.toThrow();
  });
  it("opens owned training for a public applicant only after audited offer acceptance, without worker grants", async () => {
    for (const key of ["notification.read", "sia.access.read"]) await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key, scope: "GROUP" } });
    process.env.NICEJOBS_PIN_PEPPER = "isolated-test-pepper-at-least-thirty-two-characters";
    const user = await createApplicantAccess(db).register({ displayName: "Public trainee", email: "trainee@phase03.invalid", country: "IN", nationalNumber: "9876543213", pin: "123456", confirmPin: "123456", acknowledge: true });
    expect((await onboarding.navigation(user.userId)).own).toBe(false);
    const ref = await accepted(user.userId);
    expect((await onboarding.navigation(user.userId)).own).toBe(true);
    const ctx = await createAccessContext(user.userId, db);
    for (const key of ["nicejobs.workspace.self", "nicejobs.work.perform", "nicejobs.finance.self.read", "nicejobs.resource.read", "nicejobs.knowledge.manage", "nicejobs.management.approve"]) expect((await ctx.decide(key, { organizationId: labs })).allowed).toBe(false);
    const a = await db.niceJobsApplication.findUniqueOrThrow({ where: { reference: ref } });
    await onboarding.mutate(user.userId, { operation: "ENROLL", applicationReference: ref, revision: a.revision, idempotencyKey: crypto.randomUUID() }, true);
    expect((await onboarding.detail(user.userId, ref, true)).status).toBe("NOT_STARTED");
    await expect(onboarding.detail(candidate, ref, true)).rejects.toThrow();
    expect(await db.operationalEvent.count({ where: { eventType: "nicejobs.participant.training_access" } })).toBe(1);
    expect(await db.niceJobsAssignment.count()).toBe(0);
    await db.membershipRole.deleteMany({ where: { membership: { personId: a.candidateId }, role: { key: "nicejobs-accepted-participant" } } });
    const offer = await db.niceJobsOffer.findFirstOrThrow({ where: { applicationId: a.id, status: "ACCEPTED" } });
    await recruitment.mutate(user.userId, { reference: ref, revision: 0, operation: "ACCEPT_OFFER", offerReference: offer.reference, recordRevision: 0 });
    expect((await onboarding.navigation(user.userId)).own).toBe(false);
  });
  it("rolls back accepted offer and training role assignment if the training access audit fails", async () => {
    for (const key of ["notification.read", "sia.access.read"]) await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key, scope: "GROUP" } });
    process.env.NICEJOBS_PIN_PEPPER = "isolated-test-pepper-at-least-thirty-two-characters";
    const user = await createApplicantAccess(db).register({ displayName: "Rollback trainee", email: "rollback-trainee@phase03.invalid", country: "IN", nationalNumber: "9876543214", pin: "123456", confirmPin: "123456", acknowledge: true });
    try {
      await expect(accepted(user.userId, versionId, async () => {
        await db.$executeRawUnsafe("CREATE TRIGGER fail_training_access BEFORE INSERT ON OperationalEvent WHEN NEW.eventType = 'nicejobs.participant.training_access' BEGIN SELECT RAISE(ABORT, 'training audit unavailable'); END");
      })).rejects.toThrow();
    } finally { await db.$executeRawUnsafe("DROP TRIGGER IF EXISTS fail_training_access"); }
    const app = await db.niceJobsApplication.findFirstOrThrow({ where: { candidate: { users: { some: { id: user.userId } } } } });
    expect(app.status).toBe("OFFER");
    expect(await db.niceJobsOffer.count({ where: { applicationId: app.id, status: "ACCEPTED" } })).toBe(0);
    expect(await db.operationalEvent.count({ where: { entityId: app.id, eventType: "nicejobs.application.accept_offer" } })).toBe(0);
    expect((await onboarding.navigation(user.userId)).own).toBe(false);
  });
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
    for (const dto of [candidateDTO, readerDTO]) expect(dto).not.toContain("PRIVATE-FIXTURE-NOTES");
    expect(readerDTO).not.toContain("Synthetic practice evidence");
    expect(candidateDTO).toContain("Synthetic practice evidence");
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
    const measured = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/"), log: [{ emit: "event", level: "query" }] }); let reads = 0; measured.$on("query", () => reads++);
    try { const projected = createOnboardingService(measured); await projected.list(manager, false, { limit: 1 }); const single = reads; reads = 0; await projected.list(manager, false, { limit: 25 }); expect(reads).toBeLessThanOrEqual(single + 2); }
    finally { await measured.$disconnect(); }
  });
  it("records explicit reminders and UTC elapsed duration without schedulers or auto-readiness", async () => {
    versionId = await publish({ ojt: { ...ojt, durationDays: 2 } }, "DURATION"); const ref = await enroll(); await ojtComplete(ref); await expect(act(ref, "REQUEST_READINESS")).rejects.toThrow(/duration/);
    clock = new Date(clock.getTime() + 2 * 86400000); await act(ref, "REMIND", {}, manager, false); await act(ref, "REQUEST_READINESS"); expect((await onboarding.detail(candidate, ref, true)).status).toBe("READINESS_REVIEW");
    expect(await db.operationalEvent.count({ where: { eventType: "nicejobs.onboarding.remind" } })).toBe(1);
  });
  it("keeps enrolled plans stable after a new Job Version is configured and published", async () => {
    const ref = await enroll(), before = await onboarding.detail(candidate, ref, true), old = await db.niceJobsVersion.findUniqueOrThrow({ where: { id: versionId }, include: { template: true } });
    const v = await jobs.newVersion(manager, old.id, old.template.revision);
    await jobs.edit(manager, v.id, v.revision, { title: v.title, description: v.description, engagement: v.engagement, divisionIds: [labs], configuration: { ...JSON.parse(v.configuration!), orientation: { modules: [{ key: "new", title: "New fixture version", order: 1, lessons: [{ key: "new_lesson", title: "New fixture lesson", type: "TEXT", text: "New isolated fixture content", completion: "ACKNOWLEDGE", order: 1 }] }] } } });
    const updated = await db.niceJobsVersion.findUniqueOrThrow({ where: { id: v.id } }); await jobs.changeJob(manager, { id: v.id, revision: updated.revision, to: "PUBLISHED", reason: "Fixture new version" });
    const after = await onboarding.detail(candidate, ref, true); expect(after.fingerprint).toBe(before.fingerprint); expect(after.version).toBe(1); expect(after.progress.map(p => p.key)).toEqual(before.progress.map(p => p.key)); await act(ref, "START_ORIENTATION");
  });
  it("enforces configured attempt limits without changing a failed attempt", async () => {
    const ref = await enroll(); await act(ref, "START_ORIENTATION"); await act(ref, "COMPLETE_LESSON", { progressId: (await progress(ref, "welcome")).id, acknowledged: true }); const p = await progress(ref, "check");
    for (let n = 0; n < 2; n++) await act(ref, "COMPLETE_LESSON", { progressId: p.id, answers: { safe: false } });
    await expect(act(ref, "COMPLETE_LESSON", { progressId: p.id, answers: { safe: true } })).rejects.toThrow(/limit/);
    const attempts = await db.niceJobsTrainingSubmission.findMany({ where: { progressId: p.id }, orderBy: { attempt: "asc" } }); expect(attempts.map(a => a.result)).toEqual(["FAIL", "FAIL"]); expect((await progress(ref, "check")).status).toBe("REWORK_REQUIRED");
  });
  it("rolls back status and audit when canonical audit persistence fails", async () => {
    const ref = await enroll(), before = (await onboarding.detail(candidate, ref, true)).revision, sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER fail_training_audit BEFORE INSERT ON AuditEvent WHEN NEW.action = 'nicejobs.onboarding.start_orientation' BEGIN SELECT RAISE(ABORT, 'Fixture audit failure'); END;"); sql.close();
    try { await expect(act(ref, "START_ORIENTATION")).rejects.toThrow(); expect(await onboarding.detail(candidate, ref, true)).toMatchObject({ status: "NOT_STARTED", revision: before }); }
    finally { const clean = new DatabaseSync(file); clean.exec("DROP TRIGGER fail_training_audit"); clean.close(); }
  });
  it("requires separate company and area training capabilities when editing a draft", async () => {
    const editor = await human("plain-job-editor", company, ["nicejobs.job.create", "nicejobs.job.read", "nicejobs.job.edit"], true), v = await jobs.create(editor, { code: "PLAIN", title: "Plain draft", divisionIds: [labs] });
    await expect(jobs.edit(editor, v.id, v.revision, { title: v.title, engagement: v.engagement, divisionIds: [labs], configuration: { schemaVersion: 1, ...training } })).rejects.toThrow();
    expect((await db.niceJobsVersion.findUniqueOrThrow({ where: { id: v.id } })).configuration).toBeNull();
    const ref = await enroll(); for (let n = 0; n < 28; n++) await human("picker-" + n, labs, ["nicejobs.ojt.review"]);
    const page = await onboarding.detail(manager, ref, false); expect(page.reviewerChoices).toHaveLength(25); expect(page.nextReviewers).not.toBeNull();
    const searched = await onboarding.detail(manager, ref, false, undefined, { reviewerSearch: "picker-27" }); expect(searched.reviewerChoices.map(u => u.name)).toEqual(["picker-27"]);
    const next = await onboarding.detail(manager, ref, false, undefined, { reviewersAfter: page.nextReviewers! }); expect(next.reviewerChoices.length).toBeGreaterThan(0); expect(next.reviewerChoices[0].id).not.toBe(page.reviewerChoices[0].id);
  });
  it("binds assignment to the captured human identity and rejects post-assignment remapping", async () => {
    const ref = await enroll(); await assigned(ref); const original = (await db.user.findUniqueOrThrow({ where: { id: mentor } })).personId!, replacement = await db.person.create({ data: { displayName: "Replacement fixture identity" } });
    await db.user.update({ where: { id: mentor }, data: { personId: replacement.id } });
    try { await expect(onboarding.detail(mentor, ref, false)).rejects.toThrow(); }
    finally { await db.user.update({ where: { id: mentor }, data: { personId: original } }); await db.person.delete({ where: { id: replacement.id } }); }
  });
});
