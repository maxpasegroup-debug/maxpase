import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { linkedTrainingResource } from "./training-resource";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { activeMembershipWhere, ancestry } from "@/server/authorization/business-scope";
import { operationalEvent, notify } from "@/server/domain/operational-events";
import { resolveResource } from "@/server/domain/operations-scope";
import { unavailableAttachments, type PrivateAttachmentResolver } from "@/server/communications/providers";
import { createApplicationService } from "./applications";
import { configuration, NiceJobsError } from "./input";
import { createNiceJobsService } from "./service";
import * as input from "./onboarding-input";
import { learningSummary } from "./learning-summary";
import { curriculumIssues, curriculumSchedule } from "./curriculum";
import { configuredTrainingPlan, programmeOfferSummary, requireOfferProgramme } from "./training-programme";
import { trainingComplete,trainingPhases,trainingToday,completionSignals } from "./training-day";
import { programmeLocalDate,programmeDateBounds } from "./curriculum";
import { trainingControls,validateExtension,TrainingControlError,type TrainingControl } from "./training-control";
import { createOperationsService } from "@/server/domain/operations-service";
import { READ_BUDGET,QueryBudgetError } from "@/server/domain/query-bounds";
import { trainingReminderPrefix } from "./training-reminder";

const include = { reviewer: { select: { person: { select: { displayName: true } } } }, readinessReviewer: { select: { person: { select: { displayName: true } } } }, plan: true, offer: true, application: { include: { candidate: { select: { displayName: true } }, area: { include: { division: { select: { name: true, parentId: true, status: true } }, version: { include: { template: true } } } } } } } satisfies Prisma.NiceJobsOnboardingInclude;
type Enrollment = Prisma.NiceJobsOnboardingGetPayload<{ include: typeof include }>;
type DB = Prisma.TransactionClient;
type Plan = z.infer<typeof input.trainingPlan>;
type Command = z.infer<typeof input.onboardingInput>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function publicEvidence(raw: string) {
  const stored = JSON.parse(raw), evidence = stored.evidence ?? stored;
  return { ...(evidence.text ? { text: evidence.text } : {}), ...(stored.answers ? { answers: stored.answers } : {}), ...(evidence.attachment ? { attachment: { type: evidence.attachment.type, delivery: "NOT_CONFIGURED" } } : {}), ...(evidence.record ? { record: { type: evidence.record.type, access: "REVALIDATED_AT_REVIEW" } } : {}) };
}
export function createOnboardingService(client: PrismaClient = prisma, now: () => Date = () => new Date(), attachments: PrivateAttachmentResolver = unavailableAttachments) {
  const core = createApplicationService(client).internal;
  type Boundary = Awaited<ReturnType<typeof core.boundary>>;
  async function boundary(db: DB, userId: string, own: boolean) {
    const b = await core.boundary(db, userId, own);
    if (own) await b.ctx.requireAccess("nicejobs.onboarding.self", { organizationId: b.product.division!.id });
    return b;
  }
  function validRelation(b: Boundary, e: Enrollment) {
    const a = e.application;
    if (a.companyId !== b.company.id || a.area.version.template.productId !== b.product.id || a.area.version.template.companyId !== a.companyId || a.area.division.parentId !== a.companyId || a.area.division.status !== "ACTIVE" || e.plan.versionId !== a.versionId || e.offer.applicationId !== a.id || e.offer.status !== "ACCEPTED" || !e.offer.acceptedAt || a.status !== "OFFER_ACCEPTED") throw new AccessError("Onboarding unavailable");
  }
  async function readAccess(b: Boundary, e: Enrollment, own: boolean) {
    validRelation(b, e); const scope = { organizationId: e.application.divisionId };
    if (own) { if (e.application.candidateId !== b.personId) throw new AccessError("Onboarding unavailable"); return; }
    if (e.application.candidateId === b.personId) throw new AccessError("Candidates cannot manage their own onboarding");
    if ((await b.ctx.decide("nicejobs.onboarding.read", scope)).allowed) return;
    if (e.reviewerUserId === b.ctx.user!.id && e.reviewerPersonId === b.personId && (await b.ctx.decide("nicejobs.ojt.review", scope)).allowed) return;
    if (e.readinessReviewerUserId === b.ctx.user!.id && e.readinessReviewerPersonId === b.personId && (await b.ctx.decide("nicejobs.readiness.review", scope)).allowed) return;
    throw new AccessError("Onboarding unavailable");
  }
  async function load(db: DB, b: Boundary, reference: string, own: boolean) {
    const e = await db.niceJobsOnboarding.findFirst({ where: { application: { reference, companyId: b.company.id } }, include });
    if (!e) throw new AccessError("Onboarding unavailable"); await readAccess(b, e, own); return e;
  }
  const plan = (e: Enrollment) => input.trainingPlan.parse(JSON.parse(e.plan.configuration));
  async function controls(db:DB,e:Enrollment){
    const rows=await db.niceJobsTrainingReview.findMany({where:{onboardingId:e.id,kind:{in:["CONTROL_PROPOSAL","CONTROL_DECISION"]}},include:{event:{include:{audit:true}}},orderBy:[{reviewedAt:"asc"},{id:"asc"}],take:101});
    if(rows.some(r=>r.event.entityType!=="NiceJobsOnboarding" || r.event.entityId!==e.id || r.event.organizationId!==e.application.divisionId || r.event.status!=="SUCCEEDED" || r.event.eventType!==(r.kind==="CONTROL_PROPOSAL"?"nicejobs.onboarding.propose_control":"nicejobs.onboarding.decide_control") || r.event.audit?.actorUserId!==r.reviewerUserId || r.event.audit?.actorPersonId!==r.reviewerPersonId || r.reviewerPersonId===e.application.candidateId))throw new NiceJobsError("Training control audit proof unavailable");
    try{return trainingControls(rows);}catch(error){if(error instanceof TrainingControlError)throw new NiceJobsError(error.message);throw error;}
  }
  async function validateControl(db:DB,b:Boundary,e:Enrollment,p:Plan,c:TrainingControl,state:Awaited<ReturnType<typeof controls>>){
    if(!["ORIENTATION","OJT","NOT_READY"].includes(e.status))throw new NiceJobsError("Training controls require an active pre-readiness enrollment");
    if(c.kind==="PAUSE" || c.kind==="RESUME"){
      if(p.ojt?.curriculum?.pauseRule!=="HUMAN_REVIEW_FIXED_CALENDAR")throw new NiceJobsError("The accepted programme does not permit pause controls");
      if(state.paused!==(c.kind==="RESUME"))throw new NiceJobsError("Pause state changed; refresh the proposal");
    }
    if(c.kind==="EXTEND"){
      if(p.ojt?.curriculum?.rescheduleRule!=="HUMAN_REVIEW_EXTENSION")throw new NiceJobsError("The accepted programme does not permit deadline extensions");
      const r=await db.niceJobsTrainingProgress.findFirst({where:{id:c.progressId,onboardingId:e.id,phase:"OJT"}});
      if(!r || !e.ojtStartedAt)throw new NiceJobsError("Training requirement unavailable");
      try{validateExtension(r.dueAt,new Date(c.dueAt),now(),trainingComplete(p,r));}catch(error){if(error instanceof TrainingControlError)throw new NiceJobsError(error.message);throw error;}
      const base=curriculumSchedule(p.ojt,e.ojtStartedAt);
      const day=p.ojt.stages.flatMap(s=>s.activities).find(a=>a.key===r.key)?.dayNumber;
      if(!day || new Date(c.dueAt).getTime()-base[day-1].dueAt.getTime()>90*86400000)throw new NiceJobsError("Total extension cannot exceed 90 elapsed days from the accepted deadline");
    }
    if(c.kind==="PROGRAMME_CHANGE"){
      const v=await db.niceJobsVersion.findFirst({where:{id:c.versionId,templateId:e.application.area.version.templateId,status:{in:["APPROVED","PUBLISHED"]},areas:{some:{divisionId:e.application.divisionId}}}});
      if(!v || v.id===e.plan.versionId)throw new NiceJobsError("Select a different approved programme version for this job and division");
      await b.ctx.requireAccess("nicejobs.job.read",{organizationId:e.application.divisionId});
      const next=configuredTrainingPlan(v.configuration);
      if(!next.ojt?.curriculum || curriculumIssues(next.ojt).length)throw new NiceJobsError("Target programme is incomplete");
      return hash(next);
    }
  }
  async function requirePermission(b: Boundary, e: Enrollment, key: string) { await b.ctx.requireAccess(key, { organizationId: e.application.divisionId }); }
  function assigned(b: Boundary, e: Enrollment, readiness = false) {
    if ((readiness ? e.readinessReviewerUserId : e.reviewerUserId) !== b.ctx.user!.id || (readiness ? e.readinessReviewerPersonId : e.reviewerPersonId) !== b.personId || e.application.candidateId === b.personId) throw new AccessError("Review is assigned to a different human");
  }
  async function assignable(db: DB, b: Boundary, e: Enrollment, id: string, readiness: boolean) {
    const ctx = await createAccessContext(id, db, undefined, { organizationId: b.company.id });
    if (!ctx.active || !ctx.user?.personId || ctx.user.personId === e.application.candidateId) throw new AccessError("Independent active reviewer required");
    await ctx.requireAccess(readiness ? "nicejobs.readiness.review" : "nicejobs.ojt.review", { organizationId: e.application.divisionId });
    return ctx.user.personId;
  }
  async function authorizeEvidence(db: DB, b: Boundary, e: Enrollment, evidence: z.infer<typeof input.evidenceInput>) {
    if (evidence.attachment) {
      try { await attachments.authorize(b.ctx.user!.id, e.application.divisionId, evidence.attachment.reference); }
      catch { throw new NiceJobsError("Private evidence storage is not configured or access is unavailable"); }
    }
    if (evidence.record) {
      const resource = await resolveResource(db, b.ctx, evidence.record.type, evidence.record.id);
      if (resource.organizationId !== e.application.divisionId) throw new AccessError("Evidence belongs to another business scope");
    }
  }
  async function authorizeContent(b: Boundary, e: Enrollment, lesson: z.infer<typeof input.lessonConfiguration>, db: DB = client) {
    if (["VIDEO", "AUDIO", "DOCUMENT", "IMAGE"].includes(lesson.type)) {
      const uploaded = await db.niceJobsKnowledgeVersion.findFirst({where:{id:lesson.reference!,content:{companyId:b.company.id,kind:"RESOURCE"}},select:{id:true}});
      if (uploaded) { const resource = await linkedTrainingResource(db,e,uploaded.id); if (resource.file.mediaType !== (lesson.type === "DOCUMENT" ? "PDF" : lesson.type)) throw new NiceJobsError("Training file type does not match the lesson"); return; }
      try { await attachments.authorize(b.ctx.user!.id, e.application.divisionId, lesson.reference!); }
      catch { throw new NiceJobsError("Content storage is not configured or access is unavailable"); }
    }
  }
  async function event(db: DB, b: Boundary, e: Enrollment, data: Command, fingerprint: string, from: string) {
    return operationalEvent(db, { actorUserId: b.ctx.user!.id, actorPersonId: b.personId, organizationId: e.application.divisionId, action: "nicejobs.onboarding." + data.operation.toLowerCase(), entityType: "NiceJobsOnboarding", entityId: e.id, result: "SUCCESS", reference: `onboarding:${e.id}:${data.idempotencyKey}`, metadata: { operation: data.operation, fingerprint, from, to: e.status, revision: e.revision, planFingerprint: e.plan.fingerprint } });
  }
  async function notice(db: DB, b: Boundary, e: Enrollment, title: string, reviewerId?: string) {
    const recipientId = reviewerId ?? e.application.creatorUserId, ctx = await createAccessContext(recipientId, db, undefined, { organizationId: b.company.id });
    const scope = { organizationId: reviewerId ? e.application.divisionId : b.product.division!.id };
    if (!ctx.active || !ctx.user?.personId || !(await ctx.decide("notification.read", scope)).allowed) return;
    if (!reviewerId && (ctx.user.personId !== e.application.candidateId || !(await ctx.decide("nicejobs.onboarding.self", scope)).allowed || !(await ctx.decide("nicejobs.application.self", scope)).allowed || !(await ctx.decide("organization.read", scope)).allowed)) return;
    if (reviewerId && !((e.reviewerUserId === reviewerId && e.reviewerPersonId === ctx.user.personId && (await ctx.decide("nicejobs.ojt.review", scope)).allowed) || (e.readinessReviewerUserId === reviewerId && e.readinessReviewerPersonId === ctx.user.personId && (await ctx.decide("nicejobs.readiness.review", scope)).allowed))) return;
    await notify(db, b.ctx.user!.id, recipientId, { ...scope, resourceType: reviewerId ? "NICE_JOBS_ONBOARDING" : "NICE_JOBS_APPLICATION", resourceId: reviewerId ? e.id : e.applicationId }, "NICE_JOBS_ONBOARDING", title, `${e.application.applicationId}: ${e.status.replaceAll("_", " ")}`, `onboarding:${e.reference}:${e.revision}:${recipientId}`);
  }
  async function requirements(db: DB, e: Enrollment, p: Plan) {
    const rows = await db.niceJobsTrainingProgress.findMany({ where: { onboardingId: e.id, phase:{in:trainingPhases} }, take: 222 });
    const orientation = p.orientation?.modules.flatMap(m => m.lessons.filter(l => m.required && l.required).map(l => l.key)) ?? [];
    const activities = p.ojt?.stages.flatMap(s => s.activities.filter(a => a.required).map(a => a.key)) ?? [];
    const complete = (phase: string, keys: string[]) => !!keys.length && keys.every(key => rows.some(r => r.phase === phase && r.key === key && trainingComplete(p,r)));
    const baseFinish = e.ojtStartedAt && p.ojt?.curriculum ? curriculumSchedule(p.ojt,e.ojtStartedAt).at(-1)!.dueAt.getTime()+1 : e.ojtStartedAt && p.ojt?.durationDays ? e.ojtStartedAt.getTime()+p.ojt.durationDays*86400000 : null;
    const finish=baseFinish===null?null:p.ojt?.curriculum?.rescheduleRule==="HUMAN_REVIEW_EXTENSION"?Math.max(baseFinish,...rows.filter(r=>r.phase==="OJT" && r.dueAt).map(r=>r.dueAt!.getTime()+1)):baseFinish;
    const paused=(await controls(db,e)).paused;
    return { trainingControl:paused?"PAUSED":"ACTIVE", orientation: !p.orientation ? "NOT_CONFIGURED" : e.orientationCompletedAt && complete("ORIENTATION", orientation) ? "PASS" : "INCOMPLETE", ojt: !p.ojt || p.ojt.curriculum && curriculumIssues(p.ojt).length ? "NOT_CONFIGURED" : e.ojtStartedAt && complete("OJT", activities) ? "PASS" : "INCOMPLETE", assessment: !p.readiness ? "NOT_CONFIGURED" : !p.readiness.requireAssessment ? "NOT_REQUIRED" : !p.ojt?.assessment ? "NOT_CONFIGURED" : rows.some(r => r.phase === "ASSESSMENT" && trainingComplete(p,r)) ? "PASS" : "INCOMPLETE", duration: !p.ojt?.durationDays ? "NOT_REQUIRED" : finish && now().getTime() >= finish ? "PASS" : "INCOMPLETE", readiness: p.readiness ? "CONFIGURED" : "NOT_CONFIGURED", reviewer: e.readinessReviewerUserId ? "ASSIGNED" : "NOT_ASSIGNED" };
  }
  function ready(r: Awaited<ReturnType<typeof requirements>>) { return r.trainingControl==="ACTIVE" && r.orientation === "PASS" && r.ojt === "PASS" && ["PASS", "NOT_REQUIRED"].includes(r.assessment) && ["PASS", "NOT_REQUIRED"].includes(r.duration) && r.readiness === "CONFIGURED" && r.reviewer === "ASSIGNED"; }
  function orderedItems(p: Plan, phase: string) {
    return phase === "ORIENTATION" ? [...(p.orientation?.modules ?? [])].sort((a, b) => a.order - b.order).flatMap(m => [...m.lessons].sort((a, b) => a.order - b.order).map(l => ({ ...l, module: m.title, required: m.required && l.required }))) : [...(p.ojt?.stages ?? [])].sort((a, b) => a.order - b.order).flatMap(s => [...s.activities].sort((a, b) => a.order - b.order).map(a => ({ ...a, module: s.title })));
  }
  async function mutate(userId: string, raw: unknown, own: boolean) {
    const data = input.onboardingInput.parse(raw), fingerprint = hash({ data, own, userId });
    if(!!data.control!==(data.operation==="PROPOSE_CONTROL") || !!data.controlDecision!==(data.operation==="DECIDE_CONTROL") || !!data.reminder!==(data.operation==="SCHEDULE_REMINDER"))throw new NiceJobsError("Unexpected or missing training control fields");
    if (own && !["ENROLL", "START_ORIENTATION", "COMPLETE_LESSON", "FINISH_ORIENTATION", "START_OJT", "SUBMIT_ACTIVITY", "SUBMIT_ASSESSMENT", "REQUEST_READINESS", "DAILY_REPORT"].includes(data.operation)) throw new AccessError("Management action required");
    if(data.report && data.operation!=="DAILY_REPORT" || data.operation==="DAILY_REPORT" && (!own || !data.report))throw new NiceJobsError("An owned daily training report is required");
    if ((data.outcome || data.feedback) && !["REVIEW", "DECIDE_READINESS", "PROPOSE_CONTROL", "DECIDE_CONTROL"].includes(data.operation) || (data.answers || data.evidence || data.acknowledged) && !["COMPLETE_LESSON", "SUBMIT_ACTIVITY", "SUBMIT_ASSESSMENT"].includes(data.operation)) throw new NiceJobsError("Unexpected onboarding fields");
    return client.$transaction(async db => {
      const b = await boundary(db, userId, own);
      if (data.operation === "ENROLL") {
        const a = await core.load(db, b, data.applicationReference, own);
        if (!own) { if (a.candidateId === b.personId) throw new AccessError("Independent onboarding administrator required"); await b.ctx.requireAccess("nicejobs.onboarding.manage", { organizationId: a.divisionId }); await b.ctx.requireAccess("nicejobs.onboarding.read", { organizationId: a.divisionId }); }
        const o = await db.niceJobsOffer.findFirst({ where: { applicationId: a.id, status: "ACCEPTED", activeKey: a.id, acceptedAt: { not: null } } });
        if (a.status !== "OFFER_ACCEPTED" || !a.area.version.publishedAt || !o || o.expiresAt && o.acceptedAt! >= o.expiresAt) throw new NiceJobsError("A valid accepted offer is required");
        const acceptance = await db.niceJobsApplicationHistory.findFirst({ where: { applicationId: a.id, action: "ACCEPT_OFFER" } });
        const proof = acceptance ? await db.operationalEvent.findFirst({ where: { id: acceptance.eventId, entityId: a.id, entityType: "NiceJobsApplication", eventType: "nicejobs.application.accept_offer", status: "SUCCEEDED", organizationId: a.divisionId, audit: { actorPersonId: a.candidateId, result: "SUCCESS" } } }) : null;
        if (!proof || JSON.parse(acceptance!.evidence ?? "{}").offerReference !== o.reference) throw new NiceJobsError("Accepted offer audit evidence is required");
        requireOfferProgramme(JSON.parse(o.snapshot),programmeOfferSummary(a.area.version.configuration,a.versionId));
        const existing = await db.niceJobsOnboarding.findUnique({ where: { applicationId: a.id }, include });
        if (existing) { await readAccess(b, existing, own); return { reference: a.reference, status: existing.status }; }
        if (data.revision !== a.revision) throw new NiceJobsError("Application changed. Refresh before retrying.");
        const p = configuredTrainingPlan(a.area.version.configuration);
        if (p.ojt?.curriculum && curriculumIssues(p.ojt).length) throw new NiceJobsError("The pinned 100-day curriculum is incomplete");
        const snapshot = JSON.stringify(p), digest = hash(p);
        const shared = await db.niceJobsTrainingPlan.upsert({ where: { versionId: a.versionId }, create: { versionId: a.versionId, configuration: snapshot, fingerprint: digest }, update: {} });
        if (shared.fingerprint !== digest || shared.configuration !== snapshot) throw new NiceJobsError("Pinned training configuration changed unexpectedly");
        const e = await db.niceJobsOnboarding.create({ data: { applicationId: a.id, offerId: o.id, planId: shared.id }, include });
        const lessons = orderedItems(p, "ORIENTATION");
        if (lessons.length) await db.niceJobsTrainingProgress.createMany({ data: lessons.map(l => ({ onboardingId: e.id, phase: "ORIENTATION", key: l.key })) });
        await event(db, b, e, data, fingerprint, "NOT_ENROLLED"); await notice(db, b, e, "Orientation enrollment created");
        return { reference: a.reference, status: e.status };
      }
      let e = await load(db, b, data.applicationReference, own);
      const p = plan(e);
      const replay = await db.operationalEvent.findUnique({ where: { reference: `onboarding:${e.id}:${data.idempotencyKey}` } });
      if (replay) { if (replay.actorUserId !== userId || JSON.parse(replay.metadata ?? "{}").fingerprint !== fingerprint) throw new NiceJobsError("Replay mismatch"); return { reference: e.application.reference, status: e.status }; }
      if (e.revision !== data.revision) throw new NiceJobsError("Onboarding changed. Refresh before retrying.");
      if (["READY", "CANCELLED"].includes(e.status)) throw new NiceJobsError("Onboarding is already final");
      if (!own && !data.reason) throw new NiceJobsError("A private management reason is required");
      const controlState=await controls(db,e);
      if(controlState.paused && !["PROPOSE_CONTROL","DECIDE_CONTROL","CANCEL","ASSIGN_REVIEWER","REMIND","SCHEDULE_REMINDER"].includes(data.operation))throw new NiceJobsError("Training is paused; independent resume approval is required");
      const from = e.status, patch: Prisma.NiceJobsOnboardingUncheckedUpdateManyInput = { revision: { increment: 1 } };
      let reviewData: Omit<Prisma.NiceJobsTrainingReviewUncheckedCreateInput, "eventId"> | undefined;
      let title = data.operation.replaceAll("_", " "), alertReviewer: string | null = null;
      if(data.operation==="PROPOSE_CONTROL" || data.operation==="DECIDE_CONTROL"){
        if(own)throw new AccessError("Independent human training management required");
        await requirePermission(b,e,"nicejobs.onboarding.manage");
        if(data.operation==="PROPOSE_CONTROL" && controlState.proposals.length*2>=98)throw new NiceJobsError("Training control limit reached; manual review required");
        if(!data.feedback?.trim())throw new NiceJobsError("Participant-visible control guidance is required");
        if(data.operation==="PROPOSE_CONTROL"){
          const c=data.control!;
          if(controlState.proposals.some(r=>r.status==="PENDING"))throw new NiceJobsError("Decide the pending control before proposing another");
          const versionFingerprint=await validateControl(db,b,e,p,c,controlState);
          reviewData={onboardingId:e.id,kind:"CONTROL_PROPOSAL",outcome:"PENDING",privateNotes:data.reason!,feedback:data.feedback,requirements:JSON.stringify({control:c,planFingerprint:e.plan.fingerprint,versionFingerprint}),reviewerUserId:userId,reviewerPersonId:b.personId,reviewedAt:now()};
          title="Training control awaits independent human decision";
        }else{
          await requirePermission(b,e,"nicejobs.readiness.review");
          const d=data.controlDecision!,proposal=controlState.proposals.find(r=>r.id===d.proposalId);
          if(!proposal || proposal.status!=="PENDING" || proposal.requesterUserId===userId || proposal.requesterPersonId===b.personId)throw new AccessError("An independent pending control decision is required");
          if(d.decision==="APPROVED"){
            const requester=await createAccessContext(proposal.requesterUserId,db,undefined,{organizationId:b.company.id});
            if(!requester.active || requester.user?.personId!==proposal.requesterPersonId)throw new AccessError("Control requester identity is no longer active");
            await requester.requireAccess("nicejobs.onboarding.manage",{organizationId:e.application.divisionId});
            const target=await validateControl(db,b,e,p,proposal.control,controlState);
            if(proposal.control.kind==="PROGRAMME_CHANGE" && target!==proposal.versionFingerprint)throw new NiceJobsError("Target programme changed after proposal");
            if(proposal.control.kind==="EXTEND")await db.niceJobsTrainingProgress.update({where:{id:proposal.control.progressId},data:{dueAt:new Date(proposal.control.dueAt),revision:{increment:1}}});
          }
          reviewData={onboardingId:e.id,kind:"CONTROL_DECISION",outcome:d.decision,privateNotes:data.reason!,feedback:data.feedback,requirements:JSON.stringify({proposalId:proposal.id,control:proposal.control,applicationEffect:proposal.control.kind==="PROGRAMME_CHANGE"?"NOT_APPLIED_REQUIRES_NEW_OFFER_AND_ENROLLMENT":"TRAINING_ONLY"}),reviewerUserId:userId,reviewerPersonId:b.personId,reviewedAt:now()};
          title=proposal.control.kind==="PROGRAMME_CHANGE"?"Programme change reviewed; accepted enrollment unchanged":"Training control "+d.decision.toLowerCase();
        }
      }else if(data.operation==="SCHEDULE_REMINDER"){
        if(own)throw new AccessError("Training manager required");await requirePermission(b,e,"nicejobs.onboarding.manage");
        const r=data.reminder!,recipient=r.recipient==="CANDIDATE"?e.application.creatorUserId:r.recipient==="OJT_REVIEWER"?e.reviewerUserId:e.readinessReviewerUserId;
        if(!recipient || new Date(r.remindAt)<=now() || new Date(r.remindAt).getTime()-now().getTime()>90*86400000)throw new NiceJobsError("Select a current recipient and a future UTC reminder within 90 days");
        if(r.recipient!=="CANDIDATE")await assignable(db,b,e,recipient,r.recipient==="READINESS_REVIEWER");
        await createOperationsService(client).saveReminder(userId,{organizationId:r.recipient==="CANDIDATE"?b.product.division!.id:e.application.divisionId,resourceType:r.recipient==="CANDIDATE"?"ORGANIZATION":"NICE_JOBS_ONBOARDING",resourceId:r.recipient==="CANDIDATE"?b.product.division!.id:e.id,recipientUserId:recipient,remindAt:r.remindAt,reason:r.message,reference:r.recipient==="CANDIDATE"?trainingReminderPrefix(e.id)+data.idempotencyKey:data.idempotencyKey},db);
        title="Internal training reminder scheduled";
      }else if(data.operation==="DAILY_REPORT"){
        if(!["ORIENTATION","OJT","READINESS_REVIEW","NOT_READY"].includes(e.status))throw new NiceJobsError("Start training before submitting a daily report");
        const report=data.report!,timezone=p.ojt?.curriculum?.timezone??"UTC";
        if(report.date!==programmeLocalDate(now(),timezone))throw new NiceJobsError("Daily training reports record today's actual state; backdating is not supported");
        const previous=await db.niceJobsTrainingProgress.findUnique({where:{onboardingId_phase_key:{onboardingId:e.id,phase:"DAILY_REPORT",key:report.date}},include:{submissions:{orderBy:{attempt:"desc"},take:1}}});
        const last=previous?.submissions[0];
        if(last && (last.id!==report.supersedesSubmissionId || !report.correctionReason) || !last && (report.supersedesSubmissionId || report.correctionReason))throw new NiceJobsError("Use an explicit correction of the latest daily training report");
        if(previous && previous.attempt>=10)throw new NiceJobsError("Daily report correction limit reached");
        const rows=await db.niceJobsTrainingProgress.findMany({where:{onboardingId:e.id,phase:{in:trainingPhases}},take:222});
        const today=trainingToday(p,rows,e.status,e.ojtStartedAt,now()),bounds=programmeDateBounds(report.date,timezone);
        const snapshot={...today.counts,completedToday:rows.filter(r=>trainingComplete(p,r) && r.completedAt && r.completedAt>=bounds.start && r.completedAt<bounds.end).map(r=>({id:r.id,phase:r.phase,key:r.key})),day:today.day,days:today.days};
        const record=previous?await db.niceJobsTrainingProgress.update({where:{id:previous.id},data:{attempt:{increment:1},revision:{increment:1}}}):await db.niceJobsTrainingProgress.create({data:{onboardingId:e.id,phase:"DAILY_REPORT",key:report.date,status:"SUBMITTED",attempt:1}});
        await db.niceJobsTrainingSubmission.create({data:{progressId:record.id,attempt:record.attempt,data:JSON.stringify({schemaVersion:1,...report,timezone,snapshot,eventReference:`onboarding:${e.id}:${data.idempotencyKey}`}),result:"PENDING",actorUserId:userId,actorPersonId:b.personId}});
        title=last?"Daily training report corrected":"Daily training report recorded";
      } else if (data.operation === "START_ORIENTATION") {
        if (!own || e.status !== "NOT_STARTED" || !p.orientation) throw new NiceJobsError("Orientation not configured or not available"); patch.status = "ORIENTATION"; patch.startedAt = now(); title = "Orientation started";
      } else if (["COMPLETE_LESSON", "SUBMIT_ACTIVITY", "SUBMIT_ASSESSMENT"].includes(data.operation)) {
        if (!own || !data.progressId) throw new AccessError("Candidate completion required");
        const progress = await db.niceJobsTrainingProgress.findFirst({ where: { id: data.progressId, onboardingId: e.id } });
        if (!progress || !["PENDING", "REWORK_REQUIRED", "REJECTED"].includes(progress.status)) throw new NiceJobsError("Activity is not actionable");
        const phase = data.operation === "COMPLETE_LESSON" ? "ORIENTATION" : data.operation === "SUBMIT_ASSESSMENT" ? "ASSESSMENT" : "OJT";
        if (progress.phase !== phase || e.status !== (phase === "ORIENTATION" ? "ORIENTATION" : "OJT")) throw new NiceJobsError("Training phase is locked");
        const items = orderedItems(p, phase), item = items.find(i => i.key === progress.key);
        const all = await db.niceJobsTrainingProgress.findMany({ where: { onboardingId: e.id, phase }, select: { key: true, status: true, phase:true }, take: 121 });
        if (item && items.slice(0, items.findIndex(i => i.key === item.key)).some(i => i.required && !all.some(r => r.key === i.key && trainingComplete(p,r)))) throw new NiceJobsError("Complete preceding mandatory requirements first");
        let maxAttempts = 1, reviewRequired = false, result = "PASS", score: number | null = null, payload: unknown = {};
        if (phase === "ORIENTATION") {
          const lesson = p.orientation?.modules.flatMap(m => m.lessons).find(l => l.key === progress.key);
          if (!lesson) throw new NiceJobsError("Orientation not configured"); await authorizeContent(b, e, lesson, db);
          if (lesson.completion === "QUIZ") { const grade = input.gradeQuiz(lesson.quiz!, data.answers); payload = { answers: grade.answers }; result = grade.result; score = grade.score ?? null; maxAttempts = lesson.quiz!.maxAttempts; }
          else if (lesson.completion === "MENTOR_REVIEW") { if (!data.evidence || data.answers) throw new NiceJobsError("Evidence required"); await authorizeEvidence(db, b, e, data.evidence); payload = data.evidence; reviewRequired = true; maxAttempts = lesson.maxAttempts; }
          else { if (!data.acknowledged || data.answers || data.evidence) throw new NiceJobsError("Explicit acknowledgement required"); payload = { acknowledged: true }; }
        } else if (phase === "OJT") {
          const activity = p.ojt?.stages.flatMap(s => s.activities).find(a => a.key === progress.key);
          if (!activity) throw new NiceJobsError("OJT not configured"); maxAttempts = activity.maxAttempts; reviewRequired = activity.reviewRequired;
          if (p.ojt?.curriculum && e.ojtStartedAt && now()<curriculumSchedule(p.ojt,e.ojtStartedAt).find(d=>d.day===activity.dayNumber)!.startsAt) throw new NiceJobsError("This training day has not opened yet");
          if (activity.reference) {
            const uploaded = await db.niceJobsKnowledgeVersion.findFirst({where:{id:activity.reference,content:{companyId:b.company.id,kind:"RESOURCE"}},select:{id:true}});
            if (uploaded) await linkedTrainingResource(db,e,uploaded.id);
            else {
            try { await attachments.authorize(userId, e.application.divisionId, activity.reference); }
            catch { throw new NiceJobsError("Training content storage is not configured or access is unavailable"); }
            }
          }
          if (activity.evidenceRequired && !data.evidence) throw new NiceJobsError("Evidence required");
          if (data.evidence) await authorizeEvidence(db, b, e, data.evidence);
          if (activity.quiz) { const grade = input.gradeQuiz(activity.quiz, data.answers); payload = { evidence: data.evidence ?? null, answers: grade.answers }; result = grade.result; score = grade.score ?? null; maxAttempts = Math.min(maxAttempts, activity.quiz.maxAttempts); }
          else { if (data.answers || !data.evidence && !data.acknowledged) throw new NiceJobsError("Explicit completion or evidence required"); payload = { evidence: data.evidence ?? null, acknowledged: data.acknowledged ?? false }; }
        } else {
          const assessment = p.ojt?.assessment; if (!assessment) throw new NiceJobsError("OJT assessment not configured"); maxAttempts = assessment.maxAttempts;
          const r = await requirements(db, e, p); if (r.ojt !== "PASS") throw new NiceJobsError("Complete mandatory OJT activities first");
          if (assessment.kind === "QUIZ") { const grade = input.gradeQuiz(assessment, data.answers); payload = { answers: grade.answers }; result = grade.result; score = grade.score ?? null; }
          else { if (!data.evidence || data.answers) throw new NiceJobsError("Assessment evidence required"); await authorizeEvidence(db, b, e, data.evidence); payload = data.evidence; reviewRequired = true; }
        }
        if (progress.attempt >= maxAttempts) throw new NiceJobsError("Configured attempt limit reached");
        const changed = await db.niceJobsTrainingProgress.updateMany({ where: { id: progress.id, revision: progress.revision, status: progress.status }, data: { attempt: { increment: 1 }, revision: { increment: 1 }, status: result === "FAIL" ? "REWORK_REQUIRED" : reviewRequired ? "SUBMITTED" : "COMPLETED", completedAt: result === "PASS" && !reviewRequired ? now() : null } });
        if (changed.count !== 1) throw new NiceJobsError("Submission changed");
        await db.niceJobsTrainingSubmission.create({ data: { progressId: progress.id, attempt: progress.attempt + 1, data: JSON.stringify(payload), result: result === "FAIL" ? "FAIL" : reviewRequired ? "PENDING" : "PASS", score, actorUserId: userId, actorPersonId: b.personId } });
        alertReviewer = reviewRequired && result !== "FAIL" ? e.reviewerUserId : null;
        title = result === "FAIL" ? "Assessment requires another attempt" : reviewRequired ? "Evidence submitted for review" : "Training requirement completed";
      } else if (data.operation === "FINISH_ORIENTATION") {
        const r = await requirements(db, e, p); if (!own || e.status !== "ORIENTATION" || !p.orientation || e.orientationCompletedAt) throw new NiceJobsError("Orientation not configured, complete or unavailable");
        const mandatory = orderedItems(p, "ORIENTATION").filter(l => l.required);
        const rows = await db.niceJobsTrainingProgress.findMany({ where: { onboardingId: e.id, phase: "ORIENTATION" }, take: 121 });
        if (!mandatory.length || mandatory.some(l => !rows.some(r => r.key === l.key && trainingComplete(p,r))) || r.orientation === "NOT_CONFIGURED") throw new NiceJobsError("Orientation requirements are incomplete");
        patch.orientationCompletedAt = now(); title = "Orientation completed";
      } else if (data.operation === "ASSIGN_REVIEWER") {
        if (own || !data.reviewerUserId || !data.reviewerKind) throw new AccessError("Reviewer assignment required");
        await requirePermission(b, e, data.reviewerKind === "READINESS" ? "nicejobs.onboarding.manage" : "nicejobs.ojt.assign");
        const personId = await assignable(db, b, e, data.reviewerUserId, data.reviewerKind === "READINESS");
        if (data.reviewerKind === "READINESS") { patch.readinessReviewerUserId = data.reviewerUserId; patch.readinessReviewerPersonId = personId; }
        else {
          const config=e.application.area.version.configuration?configuration.parse(JSON.parse(e.application.area.version.configuration)):null;
          if(p.ojt?.curriculum && data.reviewerUserId!==config?.programmeSetup?.ojtReviewerUserId) throw new NiceJobsError("Assign the reviewed curriculum's nominated OJT reviewer");
          patch.reviewerUserId = data.reviewerUserId; patch.reviewerPersonId = personId;
        }
        alertReviewer = data.reviewerUserId; title = "Training review assigned";
      } else if (data.operation === "START_OJT") {
        if (!own || e.status !== "ORIENTATION" || !e.orientationCompletedAt || !p.ojt) throw new NiceJobsError("Completed orientation and configured OJT required");
        const r = await requirements(db, e, p); if (r.orientation !== "PASS") throw new NiceJobsError("Orientation requirements changed unexpectedly");
        if(p.ojt.curriculum){if(curriculumIssues(p.ojt).length)throw new NiceJobsError("The 100-day curriculum is incomplete");if(!e.reviewerUserId)throw new NiceJobsError("A manager must assign the nominated OJT reviewer first");await assignable(db,b,e,e.reviewerUserId,false);}
        patch.status = "OJT"; patch.ojtStartedAt = now();
        const activities = p.ojt.stages.flatMap(s => s.activities);
        const schedule=p.ojt.curriculum?curriculumSchedule(p.ojt,now()):null;
        await db.niceJobsTrainingProgress.createMany({ data: [...activities.map(a => ({ onboardingId: e.id, phase: "OJT", key: a.key, dueAt: schedule ? schedule.find(d=>d.day===a.dayNumber)!.dueAt : a.dueDays ? new Date(now().getTime() + a.dueDays * 86400000) : null })), ...(p.ojt.assessment ? [{ onboardingId: e.id, phase: "ASSESSMENT", key: "ojt_assessment", dueAt: null }] : [])] }); title = "OJT assigned";
      } else if (data.operation === "REVIEW") {
        if (own || !data.submissionId || !data.outcome) throw new AccessError("Assigned reviewer required"); assigned(b, e); await requirePermission(b, e, "nicejobs.ojt.review");
        const submission = await db.niceJobsTrainingSubmission.findFirst({ where: { id: data.submissionId, progress: { onboardingId: e.id } }, include: { progress: true, review: true } });
        if (!submission || submission.review || submission.progress.attempt !== submission.attempt || submission.progress.status !== "SUBMITTED" || !["ORIENTATION", "OJT"].includes(e.status)) throw new NiceJobsError("Review is no longer pending");
        const assessment = submission.progress.phase === "ASSESSMENT";
        if(!trainingPhases.includes(submission.progress.phase))throw new NiceJobsError("Daily reports are not training approval submissions");
        if(["REWORK_REQUIRED","REJECTED","FAIL","NEEDS_REVIEW"].includes(data.outcome) && !data.feedback?.trim())throw new NiceJobsError("Provide candidate-visible feedback and rework instructions");
        if (!(assessment ? ["PASS", "FAIL", "NEEDS_REVIEW"] : ["APPROVED", "REWORK_REQUIRED", "REJECTED"]).includes(data.outcome)) throw new NiceJobsError("Invalid review outcome");
        const stored = JSON.parse(submission.data), evidence = stored.evidence ?? stored;
        const parsed = input.evidenceInput.safeParse(evidence); if (parsed.success) await authorizeEvidence(db, b, e, parsed.data);
        await db.niceJobsTrainingProgress.update({ where: { id: submission.progressId }, data: { status: ["APPROVED", "PASS"].includes(data.outcome) ? "APPROVED" : data.outcome === "REJECTED" ? "REJECTED" : "REWORK_REQUIRED", completedAt: ["APPROVED", "PASS"].includes(data.outcome) ? now() : null, revision: { increment: 1 } } });
        reviewData = { onboardingId: e.id, submissionId: submission.id, kind: assessment ? "ASSESSMENT" : "OJT_REVIEW", outcome: data.outcome, privateNotes: data.reason!, feedback: data.feedback ?? null, reviewerUserId: userId, reviewerPersonId: b.personId };
        title = ["APPROVED", "PASS"].includes(data.outcome) ? "Training review approved" : "Training rework requested";
      } else if (data.operation === "REQUEST_READINESS") {
        if (!own || e.status !== "OJT") throw new NiceJobsError("OJT must be complete before readiness review");
        const r = await requirements(db, e, p); if (!ready(r)) throw new NiceJobsError("Readiness requirements are missing: " + Object.entries(r).filter(([, v]) => ["INCOMPLETE", "NOT_CONFIGURED", "NOT_ASSIGNED"].includes(v)).map(([k]) => k).join(", "));
        await assignable(db, b, e, e.readinessReviewerUserId!, true); patch.status = "READINESS_REVIEW"; patch.readinessStatus = "PENDING"; patch.ojtCompletedAt = now(); alertReviewer = e.readinessReviewerUserId; title = "Readiness review required";
      } else if (data.operation === "DECIDE_READINESS") {
        if (own || e.status !== "READINESS_REVIEW" || !data.outcome || !["READY", "NOT_READY", "NEEDS_REVIEW"].includes(data.outcome)) throw new NiceJobsError("Readiness decision unavailable");
        assigned(b, e, true); await requirePermission(b, e, "nicejobs.readiness.review"); const r = await requirements(db, e, p);
        if (data.outcome === "READY" && !ready(r)) throw new NiceJobsError("Incomplete onboarding cannot become ready");
        patch.status = data.outcome === "NEEDS_REVIEW" ? "READINESS_REVIEW" : data.outcome; patch.readinessStatus = data.outcome; patch.completedAt = data.outcome === "READY" ? now() : null;
        const completion = await db.niceJobsTrainingProgress.findMany({ where: { onboardingId: e.id, phase:{in:trainingPhases} }, take: 222, select: { id: true, phase: true, key: true, status: true, attempt: true, completedAt: true, submissions: { orderBy: { attempt: "desc" }, take: 1, select: { id: true, result: true, score: true, review: { select: { id: true, outcome: true, reviewerUserId: true, reviewerPersonId: true, eventId: true } } } } } });
        reviewData = { onboardingId: e.id, kind: "READINESS", outcome: data.outcome, privateNotes: data.reason!, feedback: data.feedback ?? null, requirements: JSON.stringify({ versionId: e.plan.versionId, offerId: e.offerId, planFingerprint: e.plan.fingerprint, checks: r, completion, criteria: p.readiness?.criteria }), reviewerUserId: userId, reviewerPersonId: b.personId }; title = data.outcome === "READY" ? "Ready for activation (not activated)" : "Readiness review update";
      } else if (["REOPEN", "CANCEL", "REMIND"].includes(data.operation)) {
        if (own) throw new AccessError("Onboarding administrator required"); await requirePermission(b, e, "nicejobs.onboarding.manage");
        if (data.operation === "REOPEN") { if (!["NOT_READY", "READINESS_REVIEW"].includes(e.status)) throw new NiceJobsError("Only readiness follow-up may reopen OJT"); patch.status = "OJT"; patch.readinessStatus = "NEEDS_REVIEW"; patch.ojtCompletedAt = null; }
        if (data.operation === "CANCEL") patch.status = "CANCELLED";
        if (data.operation === "REMIND") { if (data.progressId) { const activity = await db.niceJobsTrainingProgress.findFirst({ where: { id: data.progressId, onboardingId: e.id, phase: "OJT", dueAt: { lte: now() }, status: { notIn: ["COMPLETED", "APPROVED"] } } }); if (!activity) throw new NiceJobsError("No overdue training activity selected"); } title = data.progressId ? "OJT task due" : "Orientation or OJT incomplete"; }
      } else throw new NiceJobsError("Unknown onboarding action");
      const changed = await db.niceJobsOnboarding.updateMany({ where: { id: e.id, revision: e.revision, status: from }, data: patch });
      if (changed.count !== 1) throw new NiceJobsError("Onboarding changed. Refresh before retrying.");
      e = await db.niceJobsOnboarding.findUniqueOrThrow({ where: { id: e.id }, include });
      const recorded = await event(db, b, e, data, fingerprint, from);
      if (reviewData) await db.niceJobsTrainingReview.create({ data: { ...reviewData, eventId: recorded.id } });
      await notice(db, b, e, title); if (alertReviewer) await notice(db, b, e, "Review required", alertReviewer);
      return { reference: e.application.reference, status: e.status };
    });
  }
  const pageInput = z.object({ companyId: z.string().max(200).optional(), divisionId: z.string().max(200).optional(), versionId: z.string().max(200).optional(), reviewerUserId: z.string().max(200).optional(), status: z.enum(input.onboardingStates).optional(), readinessStatus: z.enum(["PENDING", "READY", "NOT_READY", "NEEDS_REVIEW"]).optional(), queue:z.enum(["ALL","OVERDUE","REVIEW_REQUIRED","UNASSIGNED","READINESS"]).default("ALL"), activeOnly:z.boolean().default(false),search: z.string().trim().max(120).default(""), after: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).default(25) }).strict();
  function visible(b: Boundary, own: boolean, reviews: boolean): Prisma.NiceJobsOnboardingWhereInput {
    const review: Prisma.NiceJobsOnboardingWhereInput[] = [
      { reviewerUserId: b.ctx.user!.id, reviewerPersonId: b.personId, application: { divisionId: { in: b.ctx.organizationIds("nicejobs.ojt.review") } } },
      { readinessReviewerUserId: b.ctx.user!.id, readinessReviewerPersonId: b.personId, application: { divisionId: { in: b.ctx.organizationIds("nicejobs.readiness.review") } } },
    ];
    return { application: { companyId: b.company.id, candidateId: own ? b.personId : { not: b.personId }, status: "OFFER_ACCEPTED", area: { division: { parentId: b.company.id, status: "ACTIVE" }, version: { template: { companyId: b.company.id, productId: b.product.id } } } }, ...(own ? {} : { OR: reviews ? review : [{ application: { divisionId: { in: b.ctx.organizationIds("nicejobs.onboarding.read") } } }, ...review] }) };
  }
  async function navigation(userId: string) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId, false), scope = { organizationId: b.product.division!.id };
      return { own: (await b.ctx.decide("nicejobs.onboarding.self", scope)).allowed && (await b.ctx.decide("nicejobs.application.self", scope)).allowed && (await b.ctx.decide("organization.read", scope)).allowed, manage: !!b.ctx.organizationIds("nicejobs.onboarding.read").length, reviews: !!b.ctx.organizationIds("nicejobs.ojt.review").length || !!b.ctx.organizationIds("nicejobs.readiness.review").length };
    });
  }
  function queueFilter(queue:string):Prisma.NiceJobsOnboardingWhereInput{
    const active={status:{notIn:["READY","CANCELLED"]}};
    if(queue==="READINESS")return {status:"READINESS_REVIEW"};
    if(queue==="UNASSIGNED")return {...active,OR:[{reviewerUserId:null},{readinessReviewerUserId:null}]};
    if(queue==="REVIEW_REQUIRED")return {...active,progress:{some:{phase:{in:trainingPhases},status:"SUBMITTED"}}};
    if(queue==="OVERDUE")return {...active,progress:{some:{phase:{in:trainingPhases},dueAt:{lt:now()},status:{not:"APPROVED"}}}};
    return {};
  }
  async function list(userId: string, own: boolean, raw: unknown = {}, reviews = false, siaSelection?:{siaId:string;organizationId:string}) {
    const q = pageInput.parse(raw);
    return client.$transaction(async db => {
      const b = await boundary(db, userId, own);
      if(siaSelection){if(own)throw new AccessError("Manager assistance only");b.ctx=await createAccessContext(userId,db,siaSelection);if(!b.ctx.active || b.ctx.user?.personId!==b.personId)throw new AccessError("Assistance unavailable");await b.ctx.requireAccess("nicejobs.onboarding.read",siaSelection);}
      if (q.companyId && q.companyId !== b.company.id) throw new AccessError("Company unavailable");
      const filter: Prisma.NiceJobsOnboardingWhereInput = { AND: [visible(b, own, reviews), queueFilter(q.queue), ...(q.activeOnly?[{status:{notIn:["READY","CANCELLED"]}}]:[]), { ...(q.after ? { id: { gt: q.after } } : {}), ...(q.status ? { status: q.status } : {}), ...(q.readinessStatus ? { readinessStatus: q.readinessStatus } : {}), ...(q.reviewerUserId ? { OR: [{ reviewerUserId: q.reviewerUserId }, { readinessReviewerUserId: q.reviewerUserId }] } : {}), application: { ...(q.divisionId ? { divisionId: q.divisionId } : {}), ...(q.versionId ? { versionId: q.versionId } : {}), ...(q.search ? { OR: [{ applicationId: { contains: q.search } }, { candidate: { displayName: { contains: q.search } } }, { area: { version: { title: { contains: q.search } } } }] } : {}) } }] };
      let rows = await db.niceJobsOnboarding.findMany({ where: filter, include, orderBy: { id: "asc" }, take: q.limit + 1 });
      if(q.queue==="OVERDUE"){
        const matches:Enrollment[]=[],batchSize=q.limit+1;let scanned=0,cursor=q.after;
        while(rows.length){
          scanned+=rows.length;if(scanned>READ_BUDGET)throw new QueryBudgetError();
          const evidence=await db.niceJobsTrainingProgress.findMany({where:{onboardingId:{in:rows.map(r=>r.id)},phase:{in:trainingPhases},dueAt:{lt:now()}},take:batchSize*222});
          for(const row of rows){const p=plan(row);if(evidence.some(r=>r.onboardingId===row.id && !trainingComplete(p,r)))matches.push(row);if(matches.length>=q.limit+1)break;}
          if(matches.length>=q.limit+1 || rows.length<batchSize)break;
          cursor=rows.at(-1)!.id;
          rows=await db.niceJobsOnboarding.findMany({where:{AND:[filter,{id:{gt:cursor}}]},include,orderBy:{id:"asc"},take:batchSize});
        }
        rows=matches;
      }
      const page = rows.slice(0, q.limit), progress = await db.niceJobsTrainingProgress.findMany({ where: { onboardingId: { in: page.map(e => e.id) }, phase:{in:trainingPhases} }, select: { id:true, onboardingId: true, phase: true, key: true, status: true, dueAt: true,submissions:{orderBy:{attempt:"desc"},take:1,select:{submittedAt:true}} }, take: q.limit * 222 });
      const byEnrollment = new Map<string, typeof progress>();
      for (const row of progress) { const items = byEnrollment.get(row.onboardingId) ?? []; items.push(row); byEnrollment.set(row.onboardingId, items); }
      const records = [], plans = new Map<string, Plan>();
      for (const e of page) {
        await readAccess(b, e, own); if (!plans.has(e.planId)) plans.set(e.planId, plan(e)); const p = plans.get(e.planId)!, items = byEnrollment.get(e.id) ?? [];
        const count = (phase: string) => { const keys = orderedItems(p, phase).filter(i => i.required).map(i => i.key); return { required: keys.length, completed: keys.filter(key => items.some(v => v.phase === phase && v.key === key && trainingComplete(p,v))).length }; };
        const controlState=await controls(db,e); const attention = ["READY","CANCELLED"].includes(e.status)?e.status:controlState.paused?"PAUSED": !p.orientation || !p.ojt || !p.readiness || p.readiness.requireAssessment && !p.ojt.assessment ? "NOT_CONFIGURED" : ["READY", "CANCELLED", "NOT_READY"].includes(e.status) ? e.status : items.some(v => !trainingComplete(p,v) && v.dueAt && v.dueAt <= now()) ? "OVERDUE" : e.status === "READINESS_REVIEW" || items.some(v => v.status === "SUBMITTED") ? "REVIEW_REQUIRED" : !e.reviewerUserId || !e.readinessReviewerUserId ? "ASSIGNMENT_REQUIRED" : "ACTION_REQUIRED";
        const pending=items.filter(v=>v.status==="SUBMITTED"); const submitted=pending.flatMap(v=>v.submissions.map(s=>s.submittedAt));
        records.push({ reviewQueue:pending.length,oldestReviewAt:submitted.length?new Date(Math.min(...submitted.map(d=>d.getTime()))):null,pendingMilestones:pending.filter(v=>p.ojt?.stages.some(s=>s.activities.some(a=>a.key===v.key && a.milestone))).length,overdue:items.filter(v=>!trainingComplete(p,v) && v.dueAt && v.dueAt<now()).length, paused:controlState.paused && !["READY","CANCELLED"].includes(e.status),id: e.id, reference: e.application.reference, applicationId: e.application.applicationId, candidate: e.application.candidate.displayName, title: e.application.area.version.title, version: e.application.area.version.number, division: e.application.area.division.name, status: e.status, readinessStatus: e.readinessStatus, updatedAt: e.updatedAt, orientation: count("ORIENTATION"), ojt: count("OJT"), reviewer: e.reviewer?.person?.displayName ?? "Not assigned", readinessReviewer: e.readinessReviewer?.person?.displayName ?? "Not assigned", attention, configuration: { orientation: !!p.orientation, ojt: !!p.ojt, readiness: !!p.readiness } });
      }
      return { company: b.company, records, nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null };
    });
  }
  async function options(userId: string) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId, false), ids = [...new Set(["nicejobs.onboarding.read", "nicejobs.ojt.review", "nicejobs.readiness.review"].flatMap(k => b.ctx.organizationIds(k)))];
      const divisions = await db.organization.findMany({ where: { id: { in: ids }, parentId: b.company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 101 });
      const versions = await db.niceJobsVersion.findMany({ where: { template: { companyId: b.company.id, productId: b.product.id }, trainingPlan: { is: { enrollments: { some: visible(b, false, false) } } }, areas: { some: { divisionId: { in: divisions.map(d => d.id) } } } }, select: { id: true, title: true, number: true }, orderBy: { id: "asc" }, take: 101 });
      const reviewers = await db.user.findMany({ where: { OR: [{ ojtEnrollments: { some: visible(b, false, false) } }, { readinessEnrollments: { some: visible(b, false, false) } }] }, select: { id: true, person: { select: { displayName: true } } }, orderBy: { id: "asc" }, take: 101 });
      return { company: b.company, divisions: divisions.slice(0, 100), versions: versions.slice(0, 100), reviewers: reviewers.slice(0, 100).map(r => ({ id: r.id, name: r.person?.displayName ?? "Recorded reviewer" })), limited: divisions.length > 100 || versions.length > 100 || reviewers.length > 100 };
    });
  }
  async function reviewerOptions(db: DB, b: Boundary, e: Enrollment, readiness: boolean, allowed: boolean, search?: string, after?: string) {
    if (!allowed) return { records: [], nextCursor: null };
    const permission = readiness ? "nicejobs.readiness.review" : "nicejobs.ojt.review";
    const path = ancestry(b.ctx.nodes, e.application.divisionId);
    const users = await db.user.findMany({ where: { status: "ACTIVE", ...(after ? { id: { gt: after } } : {}), person: { status: "ACTIVE", ...(search ? { displayName: { contains: search } } : {}), id: { not: e.application.candidateId }, memberships: { some: { ...activeMembershipWhere(), projectId: null, scopeKey: "organization", OR: path.map(node => ({ organizationId: node.id, ...(node.id !== e.application.divisionId ? { scope: "DESCENDANTS" as const } : {}), roles: { some: { role: { status: "ACTIVE", principalType: "HUMAN", OR: [{ organizationId: null }, { organizationId: node.id }], permissions: { some: { permission: { key: permission, scope: { not: "PROJECT" } } } } } } } })) } } } }, select: { id: true, person: { select: { displayName: true } } }, orderBy: { id: "asc" }, take: 26 });
    // Picker eligibility is not an authorization token: assignable rechecks the selected identity on mutation.
    return { records: users.slice(0, 25).map(u => ({ id: u.id, name: u.person!.displayName })), nextCursor: users.length > 25 ? users[24].id : null };
  }
  async function detail(userId: string, reference: string, own: boolean, after?: string, raw: { reviewerSearch?: string; reviewersAfter?: string; readinessAfter?: string; today?:boolean;reviewOnly?:boolean } = {}) {
    z.string().uuid().parse(reference); if (after) z.string().max(200).parse(after);
    const q = z.object({ reviewerSearch: z.string().trim().max(120).optional(), reviewersAfter: z.string().max(200).optional(), readinessAfter: z.string().max(200).optional(),today:z.boolean().default(false),reviewOnly:z.boolean().default(false) }).strict().parse(raw);
    if(own && q.reviewOnly)throw new AccessError("Manager review queue required");
    return client.$transaction(async db => {
      const b = await boundary(db, userId, own), e = await load(db, b, reference, own), p = plan(e), scope = { organizationId: e.application.divisionId };
      const controlState=await controls(db,e);
      const managementReviews=own?[]:await db.niceJobsTrainingReview.findMany({where:{onboardingId:e.id,kind:{in:["OJT_REVIEW","ASSESSMENT"]}},orderBy:[{reviewedAt:"desc"},{id:"desc"}],take:25,select:{id:true,kind:true,outcome:true,feedback:true,reviewedAt:true,reviewer:{select:{person:{select:{displayName:true}}}},submission:{select:{submittedAt:true,progress:{select:{phase:true,key:true}}}}}});
      const scheduledReminders=own?[]:await db.reminder.findMany({where:{OR:[{resourceType:"NICE_JOBS_ONBOARDING",resourceId:e.id},{resourceType:"ORGANIZATION",resourceId:b.product.division!.id,reference:{startsWith:trainingReminderPrefix(e.id)}}],organizationId:{in:b.ctx.organizationIds("reminder.read")}},orderBy:{remindAt:"desc"},take:20,select:{id:true,status:true,remindAt:true,reason:true,recipientUserId:true}});
      const canReview = !own && e.reviewerUserId === userId && e.reviewerPersonId === b.personId && (await b.ctx.decide("nicejobs.ojt.review", scope)).allowed;
      const canDecide = !own && e.readinessReviewerUserId === userId && e.readinessReviewerPersonId === b.personId && (await b.ctx.decide("nicejobs.readiness.review", scope)).allowed;
      const permissions = { review: canReview && !controlState.paused, decide: canDecide && !controlState.paused, assign: !own && (await b.ctx.decide("nicejobs.ojt.assign", scope)).allowed, manage: !own && (await b.ctx.decide("nicejobs.onboarding.manage", scope)).allowed };
      const controlDecide=permissions.manage && (await b.ctx.decide("nicejobs.readiness.review",scope)).allowed;
      const activate=!own && (await b.ctx.decide("nicejobs.worker.activate",scope)).allowed;
      const programmeVersions=permissions.manage && (await b.ctx.decide("nicejobs.job.read",scope)).allowed?await db.niceJobsVersion.findMany({where:{templateId:e.application.area.version.templateId,id:{not:e.plan.versionId},status:{in:["APPROVED","PUBLISHED"]},areas:{some:{divisionId:e.application.divisionId}}},orderBy:{number:"desc"},take:25,select:{id:true,title:true,number:true}}):[];
      const reviewers = await reviewerOptions(db, b, e, false, permissions.assign, q.reviewerSearch, q.reviewersAfter), readinessReviewers = await reviewerOptions(db, b, e, true, permissions.manage, q.reviewerSearch, q.readinessAfter);
      const reviewerChoices = reviewers.records, readinessChoices = readinessReviewers.records;
      const all = await db.niceJobsTrainingProgress.findMany({ where: { onboardingId: e.id, phase:{in:trainingPhases} }, orderBy: { id: "asc" }, take: 222 });
      const today=trainingToday(p,all,e.status,e.ojtStartedAt,now());
      const nextPhase = e.status === "ORIENTATION" ? "ORIENTATION" : "OJT";
      const nextItem = orderedItems(p, nextPhase).find(i => i.required && all.some(v => v.phase === nextPhase && v.key === i.key && !trainingComplete(p,v)));
      const nextRow = nextItem ? all.find(v => v.phase === nextPhase && v.key === nextItem.key) : e.status === "OJT" && p.readiness?.requireAssessment ? all.find(v => v.phase === "ASSESSMENT" && !trainingComplete(p,v)) : null;
      const rows = await db.niceJobsTrainingProgress.findMany({ where: { onboardingId: e.id, phase:{in:trainingPhases}, ...(q.reviewOnly?{status:"SUBMITTED"}:{}), ...(q.today ? {id:{in:[today.todayProgressId,nextRow?.id].filter((id):id is string=>!!id)}} : after ? { id: { gt: after } } : {}) }, include: { submissions: { orderBy: { attempt: "desc" }, take: 10, include: { review: true } } }, orderBy: { id: "asc" }, take: 26 });
      const displayed = rows.slice(0, 25);
      if (!q.reviewOnly && !after && nextRow && !displayed.some(v => v.id === nextRow.id)) displayed.unshift(await db.niceJobsTrainingProgress.findUniqueOrThrow({ where: { id: nextRow.id }, include: { submissions: { orderBy: { attempt: "desc" }, take: 10, include: { review: true } } } }));
      const resources = new Map<string,Awaited<ReturnType<typeof linkedTrainingResource>>>();
      const refs = new Set(displayed.flatMap(row => row.phase === "ORIENTATION" ? p.orientation?.modules.flatMap(m => m.lessons.filter(l => l.key === row.key && ["VIDEO","AUDIO","IMAGE","DOCUMENT"].includes(l.type)).flatMap(l => l.reference ? [l.reference] : [])) ?? [] : row.phase === "OJT" ? p.ojt?.stages.flatMap(s => s.activities.filter(a => a.key === row.key).flatMap(a => a.reference ? [a.reference] : [])) ?? [] : []));
      for (const ref of refs) {
        try { const resource = await linkedTrainingResource(db,e,ref,now()); if (own || (await b.ctx.decide("nicejobs.knowledge.read",{organizationId:resource.organizationId})).allowed) resources.set(ref,resource); }
        catch (error) { if (!(error instanceof AccessError)) throw error; }
      }
      const daySchedule=p.ojt?.curriculum && e.ojtStartedAt?curriculumSchedule(p.ojt,e.ojtStartedAt):null;
      const progress = displayed.map(r => {
        const lesson = r.phase === "ORIENTATION" ? p.orientation?.modules.flatMap(m => m.lessons).find(l => l.key === r.key) : null;
        const activity = r.phase === "OJT" ? p.ojt?.stages.flatMap(s => s.activities).find(a => a.key === r.key) : null;
        const resource = resources.get(lesson?.reference ?? activity?.reference ?? "") ?? null;
        const assessment = r.phase === "ASSESSMENT" ? p.ojt?.assessment : null;
        const items = orderedItems(p, r.phase), index = items.findIndex(i => i.key === r.key);
        const blocked = items.slice(0, index).some(i => i.required && !all.some(v => v.phase === r.phase && v.key === i.key && trainingComplete(p,v)));
        const quiz = lesson?.quiz ?? activity?.quiz ?? (assessment?.kind === "QUIZ" ? assessment : null);
        const maxAttempts=quiz && activity?Math.min(quiz.maxAttempts,activity.maxAttempts):quiz?.maxAttempts ?? lesson?.maxAttempts ?? activity?.maxAttempts ?? assessment?.maxAttempts ?? 1;
        const scheduled=daySchedule?.find(d=>d.day===activity?.dayNumber);
        return { lockReason:controlState.paused?"Training is paused; contact your manager":blocked?"Complete preceding mandatory requirements and obtain required review first":r.status==="SUBMITTED"?"Awaiting reviewer decision":scheduled && now()<scheduled.startsAt?"This scheduled day has not opened yet":!trainingComplete(p,r) && r.attempt>=maxAttempts?"Attempt limit reached. Contact your reviewer for next steps":null, signals:completionSignals(r.submissions[0]?.data,!!quiz,r.submissions[0]?.result), complete:trainingComplete(p,r), overdue:!trainingComplete(p,r) && !!r.dueAt && r.dueAt<now(), dayNumber:activity?.dayNumber??null, learningText:activity?.learningText??null, evidenceRequirements:activity?.evidenceRequirements??null, milestone:activity?.milestone??false, scheduledDate:scheduled?.date??null, opensAt:scheduled?.startsAt??null, timezone:p.ojt?.curriculum?.timezone??"UTC", resource, id: r.id, phase: r.phase, key: r.key, status: r.status, attempt: r.attempt, dueAt: r.dueAt, completedAt: r.completedAt, title: lesson?.title ?? activity?.title ?? "OJT assessment", text: lesson?.text ?? activity?.instruction ?? (assessment?.kind === "HUMAN" ? assessment.criteria : null), expectedOutcome: activity?.expectedOutcome ?? null, practiceMinutes: activity?.practiceMinutes ?? null, contentType: lesson?.type ?? activity?.type ?? assessment?.kind, link: lesson?.type === "LINK" ? lesson.reference : null, privateContent: !!lesson && ["VIDEO", "AUDIO", "IMAGE", "DOCUMENT"].includes(lesson.type) || !!activity?.reference, form: quiz?.form ?? null, maxAttempts, evidenceRequired: lesson?.completion === "MENTOR_REVIEW" || activity?.evidenceRequired || assessment?.kind === "HUMAN", reviewRequired: lesson?.completion === "MENTOR_REVIEW" || activity?.reviewRequired || assessment?.kind === "HUMAN", actionable: !controlState.paused && (!scheduled || now()>=scheduled.startsAt) && own && r.id === nextRow?.id && !blocked && ["PENDING", "REWORK_REQUIRED", "REJECTED"].includes(r.status) && r.attempt < maxAttempts && e.status === (r.phase === "ORIENTATION" ? "ORIENTATION" : "OJT"), submissions: r.submissions.map(s => ({ id: s.id, attempt: s.attempt, result: s.review?.outcome ?? s.result, score: s.score, submittedAt: s.submittedAt, feedback: s.review?.feedback ?? null, ...(own || canReview ? { evidence: publicEvidence(s.data) } : {}), ...(canReview ? { privateNotes: s.review?.privateNotes ?? null } : {}) })) };
      });
      const reviews = await db.niceJobsTrainingReview.findMany({ where: { onboardingId: e.id, kind: "READINESS" }, orderBy: { reviewedAt: "desc" }, take: 25, select: { id: true, outcome: true, feedback: true, reviewedAt: true, eventId: true, requirements: true } });
      const dailyReports=await db.niceJobsTrainingProgress.findMany({where:{onboardingId:e.id,phase:"DAILY_REPORT"},orderBy:{key:"desc"},take:7,include:{submissions:{orderBy:{attempt:"desc"},take:10,select:{id:true,attempt:true,submittedAt:true,data:true}}}});
      const checks = await requirements(db, e, p);
      const orientationKeys = orderedItems(p, "ORIENTATION").filter(v => v.required).map(v => v.key), ojtKeys = orderedItems(p, "OJT").filter(v => v.required).map(v => v.key);
      const count = (phase: string, keys: string[]) => ({ configured: !!keys.length, required: keys.length, completed: keys.filter(key => all.some(v => v.phase === phase && v.key === key && trainingComplete(p,v))).length });
      return { control: {paused:controlState.paused && !["READY","CANCELLED"].includes(e.status),pauseAllowed:p.ojt?.curriculum?.pauseRule==="HUMAN_REVIEW_FIXED_CALENDAR",extensionAllowed:p.ojt?.curriculum?.rescheduleRule==="HUMAN_REVIEW_EXTENSION",proposals:controlState.proposals.map(r=>({...r,...(own?{requesterUserId:undefined,requesterPersonId:undefined,eventId:undefined}:{})}))}, programmeVersions, managementReviews, scheduledReminders, today, dailyReports:dailyReports.map(report=>({date:report.key,submissions:report.submissions.map(s=>({id:s.id,attempt:s.attempt,submittedAt:s.submittedAt,...JSON.parse(s.data)}))})), learning: learningSummary(p.ojt, all, e.ojtStartedAt, now()), reference: e.application.reference, applicationId: e.application.applicationId, revision: e.revision, status: e.status, readinessStatus: e.readinessStatus, title: e.application.area.version.title, candidate: e.application.candidate.displayName, company: b.company.name, companyId: b.company.id, division: e.application.area.division.name, divisionId: e.application.divisionId, version: e.application.area.version.number, fingerprint: e.plan.fingerprint, nextRequirement: nextRow ? { id: nextRow.id, title: nextItem?.title ?? "OJT assessment", status: nextRow.status } : null, nextReviewers: reviewers.nextCursor, nextReadinessReviewers: readinessReviewers.nextCursor, permissions:{...permissions,controlDecide,activate}, reviewerChoices, readinessChoices, checks, orientation: count("ORIENTATION", orientationKeys), ojt: count("OJT", ojtKeys), orientationCompleted: !!e.orientationCompletedAt, readinessCriteria: p.readiness?.criteria ?? null, reviewerAssigned: !!e.reviewerUserId, readinessReviewerAssigned: !!e.readinessReviewerUserId, progress, nextCursor: !q.today && rows.length > 25 ? rows[24].id : null, reviews: reviews.map(r => ({ id: r.id, outcome: r.outcome, feedback: r.feedback, reviewedAt: r.reviewedAt, ...(!own ? { eventId: r.eventId, requirements: r.requirements } : {}) })) };
    });
  }
  async function configurationAccess(userId: string, versionId: string) {
    const { version, capabilities } = await createNiceJobsService(client).detail(userId, versionId);
    return client.$transaction(async db => {
      const b = await boundary(db, userId, false);
      const can = async (key: string) => capabilities.edit && !version.publishedAt && version.status === "DRAFT" && (await b.ctx.decide(key, { organizationId: b.company.id })).allowed && version.areas.every(a => b.ctx.organizationIds(key).includes(a.divisionId));
      return { orientation: await can("nicejobs.orientation.manage"), ojt: await can("nicejobs.ojt.configure") };
    });
  }
  async function enrollment(userId:string,reference:string){
    z.string().uuid().parse(reference);
    return client.$transaction(async db=>{
      const b=await boundary(db,userId,true),a=await core.load(db,b,reference,true);
      const e=await db.niceJobsOnboarding.findUnique({where:{applicationId:a.id},include});
      if(!e)return null;await readAccess(b,e,true);
      return {status:e.status,version:e.application.area.version.number,fingerprint:e.plan.fingerprint};
    });
  }
  return { mutate, navigation, list, detail, options, configurationAccess, enrollment, internal: { boundary, load, readAccess, plan, requirements, ready, orderedItems, authorizeContent, authorizeEvidence } };
}
export const onboardingService = createOnboardingService();
