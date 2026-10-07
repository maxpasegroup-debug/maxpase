import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { createOperationsService } from "@/server/domain/operations-service";
import { notify } from "@/server/domain/operational-events";
import { createApplicationService } from "./applications";
import { configuration, NiceJobsError } from "./input";
import { formConfiguration } from "./application-configuration";
import { createNiceJobsService } from "./service";
import * as input from "./recruitment-input";
import { z } from "zod";

const interviewInclude = { interviewers: { take: 10, include: { evaluation: true, user: { select: { person: { select: { displayName: true } } } } } } } satisfies Prisma.NiceJobsInterviewInclude;
export function createRecruitmentService(client: PrismaClient = prisma, now: () => Date = () => new Date()) {
  const core = createApplicationService(client).internal, operations = createOperationsService(client);
  type B = Awaited<ReturnType<typeof core.boundary>>;
  type App = Awaited<ReturnType<typeof core.load>>;
  type Interview = Prisma.NiceJobsInterviewGetPayload<{ include: typeof interviewInclude }>;
  const config = (a: App) => a.area.version.configuration ? configuration.parse(JSON.parse(a.area.version.configuration)) : null;
  function interviewConfig(a: App) {
    const parsed = input.interviewConfiguration.safeParse(config(a)?.interview);
    if (!parsed.success) throw new NiceJobsError("Interview not configured"); return parsed.data;
  }
  function offerConfig(a: App) {
    const parsed = input.offerConfiguration.safeParse(config(a)?.offer);
    if (!parsed.success) throw new NiceJobsError("Offer not configured"); return parsed.data;
  }
  function available(a: App) {
    if (a.area.version.status !== "PUBLISHED" || !a.area.version.publishedAt || a.area.version.template.status !== "PUBLISHED" || ["REJECTED", "WITHDRAWN", "CLOSED", "OFFER_DECLINED"].includes(a.status)) throw new NiceJobsError("This application is not available for this action");
  }
  async function permission(b: B, a: App, key: string) { await b.ctx.requireAccess(key, { organizationId: a.divisionId }); }
  async function advance(db: Prisma.TransactionClient, b: B, a: App, operation: string, status = a.status, reason?: string, evidence?: Prisma.InputJsonObject, patch: Prisma.NiceJobsApplicationUncheckedUpdateManyInput = {}) {
    const changed = await db.niceJobsApplication.updateMany({ where: { id: a.id, revision: a.revision, status: a.status }, data: { ...patch, status, revision: { increment: 1 } } });
    if (changed.count !== 1) throw new NiceJobsError("Application changed. Refresh before retrying.");
    const updated = await core.load(db, b, a.reference, a.candidateId === b.personId);
    await core.record(db, b, updated, operation, a.status, reason, evidence);
    return updated;
  }
  async function getInterview(db: Prisma.TransactionClient, a: App, reference?: string) {
    const i = await db.niceJobsInterview.findFirst({ where: { applicationId: a.id }, include: interviewInclude, orderBy: { number: "desc" } });
    if (reference && i?.reference !== reference) throw new NiceJobsError("Only the latest interview round is actionable");
    if (!i) throw new AccessError("Interview unavailable"); return i;
  }
  async function getOffer(db: Prisma.TransactionClient, a: App, reference?: string) {
    const o = await db.niceJobsOffer.findFirst({ where: { applicationId: a.id, ...(reference ? { reference } : {}) }, orderBy: { number: "desc" } });
    if (!o) throw new AccessError("Offer unavailable"); return o;
  }
  async function updateInterview(db: Prisma.TransactionClient, i: Interview, revision: number | undefined, patch: Prisma.NiceJobsInterviewUpdateManyMutationInput) {
    if (revision !== i.revision) throw new NiceJobsError("Interview changed. Refresh before retrying.");
    const changed = await db.niceJobsInterview.updateMany({ where: { id: i.id, revision, status: i.status }, data: { ...patch, revision: { increment: 1 } } });
    if (changed.count !== 1) throw new NiceJobsError("Interview changed. Refresh before retrying.");
  }
  async function panel(db: Prisma.TransactionClient, b: B, a: App, ids: string[], c: ReturnType<typeof interviewConfig>) {
    if (ids.length < c.minInterviewers || ids.length > c.maxInterviewers) throw new NiceJobsError("Check the configured interviewer count");
    const people = new Set<string>();
    const rows = [];
    for (const userId of ids) {
      const ctx = await createAccessContext(userId, db, undefined, { organizationId: b.company.id });
      if (!ctx.active || !ctx.user?.personId || ctx.user.personId === a.candidateId || people.has(ctx.user.personId)) throw new AccessError("Invalid independent interviewer");
      for (const key of ["nicejobs.interview.read", "nicejobs.interview.evaluate", "nicejobs.application.read"]) await ctx.requireAccess(key, { organizationId: a.divisionId });
      people.add(ctx.user.personId); rows.push({ userId, personId: ctx.user.personId });
    }
    return rows;
  }
  function validateEvaluation(c: ReturnType<typeof interviewConfig>, data: z.infer<typeof input.recruitmentInput>) {
    const questions = c.questions.filter(q => q.active), answers = data.answers ?? {}, scores = data.scores ?? {};
    if (!questions.length || !data.recommendation || !data.reason) throw new NiceJobsError("Evaluation not configured or incomplete");
    if (Object.keys(answers).some(k => !questions.some(q => q.key === k)) || Object.keys(scores).some(k => !questions.some(q => q.key === k)) || new TextEncoder().encode(JSON.stringify(answers)).byteLength > 64000) throw new NiceJobsError("Unexpected evaluation fields");
    for (const q of questions) {
      const answer = answers[q.key], score = scores[q.key];
      if (q.required && (answer === undefined || answer === "" || Array.isArray(answer) && !answer.length || score === undefined)) throw new NiceJobsError("Required interview answer and score: " + q.question);
      if (answer === undefined) { if (score !== undefined) throw new NiceJobsError("Score requires an answer"); continue; }
      const valid = q.type === "TEXT" ? typeof answer === "string" : q.type === "YES_NO" ? typeof answer === "boolean" : q.type === "RATING" ? typeof answer === "number" && answer >= 0 && answer <= 10 : q.type === "SINGLE_SELECT" ? typeof answer === "string" && q.options?.includes(answer) : Array.isArray(answer) && new Set(answer).size === answer.length && answer.every(v => q.options?.includes(v));
      if (!valid) throw new NiceJobsError("Invalid interview answer: " + q.question);
    }
    const total = questions.reduce((sum, q) => sum + q.weight, 0);
    return questions.reduce((sum, q) => sum + (scores[q.key] ?? 0) / 10 * q.weight, 0) / total * 100;
  }
  function evaluationComplete(i: Interview, c: ReturnType<typeof interviewConfig>) { return !c.evaluationRequired || i.interviewers.length >= c.minInterviewers && i.interviewers.every(p => p.evaluation); }
  async function policy(db: Prisma.TransactionClient, a: App) {
    const management = input.managementConfiguration.safeParse(config(a)?.management);
    const id = management.success ? management.data.policies.find(p => p.divisionId === a.divisionId)?.controlPointId : undefined;
    const p = id ? await db.controlPoint.findUnique({ where: { id }, include: { rules: { take: 101 } } }) : null;
    if (!p || p.status !== "ACTIVE" || p.organizationId !== a.divisionId || p.projectId || p.allowSelfApproval || !["APPROVAL", "HUMAN_DECISION"].includes(p.kind) || p.requiredPermission !== "nicejobs.management.approve" || !p.rules.length || p.rules.length > 100 || p.rules.some(r => r.requiredPermission !== "nicejobs.management.approve")) throw new NiceJobsError("Independent management approval policy not configured");
    return p;
  }
  async function approvalValid(db: Prisma.TransactionClient, a: App) {
    const p = await policy(db, a);
    const r = a.reviewRequestId ? await db.operationalRequest.findUnique({ where: { id: a.reviewRequestId } }) : null;
    if (!r || r.resourceType !== "NICE_JOBS_RECRUITMENT" || r.resourceId !== a.id || r.organizationId !== a.divisionId || r.controlPointId !== p.id || !await operations.approvedAuthority(db, r.id)) throw new NiceJobsError("Current independent management approval required");
  }
  async function managerNotification(db: Prisma.TransactionClient, b: B, a: App, userId: string, title: string) {
    const ctx = await createAccessContext(userId, db, undefined, { organizationId: b.company.id });
    const scope = { organizationId: a.divisionId };
    if (!ctx.active || !ctx.user?.personId || ctx.user.personId === a.candidateId || !(await ctx.decide("notification.read", scope)).allowed || !(await ctx.decide("nicejobs.application.read", scope)).allowed) return;
    await notify(db, b.ctx.user!.id, userId, { ...scope, resourceType: "NICE_JOBS_RECRUITMENT", resourceId: a.id }, "NICE_JOBS_RECRUITMENT", title, a.applicationId ?? "Application update", `recruitment:${a.reference}:${a.revision}:${userId}`);
  }
  async function mutate(userId: string, raw: unknown) {
    const data = input.recruitmentInput.parse(raw), op = data.operation;
    const own = ["REQUEST_RESCHEDULE", "VIEW_OFFER", "ACCEPT_OFFER", "DECLINE_OFFER"].includes(op);
    if (data.content && !["PREPARE_OFFER", "REVISE_OFFER"].includes(op) || (data.answers || data.scores || data.recommendation) && op !== "EVALUATE" || (data.approvalId || data.decision) && op !== "DECIDE" || data.candidateMessage && !["DECIDE", "RELEASE_DECISION"].includes(op)) throw new NiceJobsError("Unexpected recruitment fields");
    return client.$transaction(async db => {
      const b = await core.boundary(db, userId, own), a = await core.load(db, b, data.reference, own);
      if (!own && a.candidateId === b.personId) throw new AccessError("Candidates cannot manage their own recruitment");
      if (own && ["ACCEPT_OFFER", "DECLINE_OFFER", "VIEW_OFFER"].includes(op)) {
        if (!data.offerReference) throw new NiceJobsError("Select the exact offer version");
        const o = await getOffer(db, a, data.offerReference);
        if (op === "ACCEPT_OFFER" && o.status === "ACCEPTED" && a.status === "OFFER_ACCEPTED" || op === "DECLINE_OFFER" && o.status === "DECLINED" && a.status === "OFFER_DECLINED" && o.declineReason === (data.reason ?? null) || op === "VIEW_OFFER" && o.status === "VIEWED" && a.status === "OFFER" && (!o.expiresAt || o.expiresAt > now())) return { reference: a.reference, status: a.status };
      }
      if (data.revision !== a.revision) throw new NiceJobsError("Application changed. Refresh before retrying.");
      if (!["CANCEL_INTERVIEW", "WITHDRAW_OFFER", "EXPIRE_OFFER"].includes(op)) available(a);
      if (!own && !data.reason) throw new NiceJobsError("A management reason is required");
      let updated: App = a;
      let candidateNotice: string | undefined;
      if (["CREATE_INTERVIEW", "SCHEDULE", "REQUEST_RESCHEDULE", "CANCEL_INTERVIEW", "COMPLETE_INTERVIEW", "NO_SHOW", "EVALUATE"].includes(op)) {
        const c = interviewConfig(a);
        if (!c.enabled) throw new NiceJobsError("This version does not require interviews");
        if (op === "CREATE_INTERVIEW") {
          await permission(b, a, "nicejobs.interview.schedule");
          if (a.status !== "SHORTLISTED" && !(a.status === "MANAGEMENT_REVIEW" && a.reviewNeedsMore)) throw new NiceJobsError("Only shortlisted candidates or explicit further reviews may enter interview");
          if (!data.interviewerIds) throw new NiceJobsError("Choose authorized interviewers");
          const assigned = await panel(db, b, a, data.interviewerIds, c);
          const previous = await db.niceJobsInterview.findFirst({ where: { applicationId: a.id }, orderBy: { number: "desc" }, select: { number: true } });
          const interview = await db.niceJobsInterview.create({ data: { applicationId: a.id, number: (previous?.number ?? 0) + 1, type: c.type, duration: c.duration, createdByUserId: userId, interviewers: { create: assigned } } });
          updated = await advance(db, b, a, op, "INTERVIEW", data.reason, { interviewReference: interview.reference }, { reviewNeedsMore: false, reviewRequestId: null }); candidateNotice = "Interview preparation started";
          for (const person of assigned) await managerNotification(db, b, updated, person.userId, "Interview assigned");
        } else {
          if (a.status !== "INTERVIEW") throw new NiceJobsError("Application is not in interview");
          const i = await getInterview(db, a, data.interviewReference);
          if (op === "REQUEST_RESCHEDULE") {
            if (i.status !== "SCHEDULED" || !data.reason) throw new NiceJobsError("Only a scheduled interview can be rescheduled by request");
            await updateInterview(db, i, data.recordRevision, { status: "RESCHEDULE_REQUESTED" });
            updated = await advance(db, b, a, op, a.status, data.reason, { interviewReference: i.reference }); candidateNotice = "Interview reschedule requested";
            await managerNotification(db, b, updated, i.createdByUserId, "Interview reschedule requested");
          } else if (op === "EVALUATE") {
            await permission(b, a, "nicejobs.interview.read"); await permission(b, a, "nicejobs.interview.evaluate");
            const assignment = i.interviewers.find(p => p.userId === userId && p.personId === b.personId);
            if (!assignment || assignment.evaluation || !["SCHEDULED", "COMPLETED"].includes(i.status) || !i.scheduledAt || i.scheduledAt > now()) throw new AccessError("Evaluation is unavailable to this interviewer");
            const weightedScore = validateEvaluation(c, data);
            await db.niceJobsInterviewEvaluation.create({ data: { interviewId: i.id, userId, answers: JSON.stringify(data.answers ?? {}), scores: JSON.stringify(data.scores ?? {}), weightedScore, notes: data.reason!, recommendation: data.recommendation! } });
            const current = await getInterview(db, a, i.reference);
            updated = await advance(db, b, a, op, current.status === "COMPLETED" && evaluationComplete(current, c) ? "MANAGEMENT_REVIEW" : a.status, "Interview evaluation submitted", { interviewReference: i.reference, submitted: true });
          } else {
            await permission(b, a, "nicejobs.interview.schedule");
            if (!["PENDING", "SCHEDULED", "RESCHEDULE_REQUESTED"].includes(i.status)) throw new NiceJobsError("Interview is no longer actionable");
            if (op === "SCHEDULE") {
              if (!data.scheduledAt || data.scheduledAt <= now()) throw new NiceJobsError("Choose a future interview time");
              await updateInterview(db, i, data.recordRevision, { status: "SCHEDULED", scheduledAt: data.scheduledAt, location: data.location ?? null, instructions: data.instructions ?? null });
              candidateNotice = `Interview ${i.status === "PENDING" ? "scheduled" : "rescheduled"}: ${data.scheduledAt.toISOString()}`;
              updated = await advance(db, b, a, op, a.status, data.reason, { interviewReference: i.reference });
              for (const person of i.interviewers) await managerNotification(db, b, updated, person.userId, "Interview schedule updated");
            } else if (op === "CANCEL_INTERVIEW") {
              await updateInterview(db, i, data.recordRevision, { status: "CANCELLED" }); updated = await advance(db, b, a, op, "SHORTLISTED", data.reason, { interviewReference: i.reference }); candidateNotice = "Interview cancelled";
            } else {
              if (i.status !== "SCHEDULED" || !i.scheduledAt || i.scheduledAt > now()) throw new NiceJobsError("A scheduled interview time must have elapsed");
              await updateInterview(db, i, data.recordRevision, { status: op === "NO_SHOW" ? "NO_SHOW" : "COMPLETED", completedAt: op === "COMPLETE_INTERVIEW" ? now() : null });
              updated = await advance(db, b, a, op, op === "NO_SHOW" ? "SHORTLISTED" : evaluationComplete(i, c) ? "MANAGEMENT_REVIEW" : "INTERVIEW", data.reason, { interviewReference: i.reference }); candidateNotice = op === "NO_SHOW" ? "Interview attendance requires follow-up" : "Interview completed";
            }
          }
        }
      } else if (["START_REVIEW", "MORE_REVIEW", "DECIDE", "RELEASE_DECISION"].includes(op)) {
        await permission(b, a, "nicejobs.management.review");
        if (op === "START_REVIEW") {
          const c = interviewConfig(a);
          if (a.status !== "MANAGEMENT_REVIEW" && !(a.status === "SHORTLISTED" && !c.enabled)) throw new NiceJobsError("Completed interview and evaluations required");
          if (c.enabled) { const i = await getInterview(db, a); if (i.status !== "COMPLETED" || !evaluationComplete(i, c)) throw new NiceJobsError("Interview evidence is incomplete"); }
          if (a.reviewRequestId && !a.reviewNeedsMore) throw new NiceJobsError("A management review already exists");
          const p = await policy(db, a);
          if (a.status !== "MANAGEMENT_REVIEW") updated = await advance(db, b, a, "INTERVIEW_NOT_REQUIRED", "MANAGEMENT_REVIEW", data.reason);
          const r = await operations.createRequest(userId, { organizationId: a.divisionId, resourceType: "NICE_JOBS_RECRUITMENT", resourceId: a.id, title: "Recruitment review " + a.applicationId, controlPointId: p.id, idempotencyKey: `recruitment:${a.reference}:${updated.revision}` }, undefined, db);
          updated = await advance(db, b, updated, op, "MANAGEMENT_REVIEW", data.reason, { requestId: r.id, versionId: a.versionId }, { reviewRequestId: r.id, reviewNeedsMore: false });
          await operations.submitRequest(userId, r.id, db);
        } else {
          if (a.status !== "MANAGEMENT_REVIEW" || !a.reviewRequestId) throw new NiceJobsError("Management review is not pending");
          if (op === "MORE_REVIEW") {
            await operations.cancelRequest(userId, a.reviewRequestId, db);
            updated = await advance(db, b, a, op, a.status, data.reason, { requestId: a.reviewRequestId }, { reviewNeedsMore: true });
          } else {
            if (op === "DECIDE") {
              if (!data.approvalId || !data.decision) throw new NiceJobsError("Select the assigned approval and decision");
              const approval = await db.siaApproval.findFirst({ where: { id: data.approvalId, requestId: a.reviewRequestId }, select: { id: true } });
              if (!approval) throw new AccessError("Approval unavailable");
              await operations.decide(userId, { approvalId: approval.id, decision: data.decision, comment: data.reason }, db);
            }
            const request = await db.operationalRequest.findUniqueOrThrow({ where: { id: a.reviewRequestId } });
            const final = ["APPROVED", "REJECTED"].includes(request.status);
            if (op === "RELEASE_DECISION" && !final) throw new NiceJobsError("Approval chain has not completed");
            if (final) {
              await permission(b, a, request.status === "APPROVED" ? "nicejobs.management.approve" : "nicejobs.management.reject");
              if (request.status === "APPROVED") await approvalValid(db, a);
              updated = await advance(db, b, a, op, request.status, data.reason, { requestId: request.id }, { candidateMessage: data.candidateMessage ?? null, ...(request.status === "REJECTED" && (!config(a)?.application || !("duplicatePolicy" in config(a)!.application!) || (config(a)!.application as { duplicatePolicy?: string }).duplicatePolicy !== "ONE_PER_VERSION") ? { activeKey: null } : {}) }); candidateNotice = request.status === "APPROVED" ? "Management review approved" : "Application not selected";
            } else updated = await advance(db, b, a, op, a.status, data.reason, { requestId: request.id });
          }
        }
      } else {
        if (!own) { await permission(b, a, "nicejobs.offer.read"); await permission(b, a, ["PREPARE_OFFER", "REVISE_OFFER", "READY_OFFER"].includes(op) ? "nicejobs.offer.prepare" : op === "ISSUE_OFFER" ? "nicejobs.offer.issue" : "nicejobs.offer.withdraw"); }
        if (!["APPROVED", "OFFER"].includes(a.status)) throw new NiceJobsError("Approved application required");
        const c = offerConfig(a);
        if (["PREPARE_OFFER", "REVISE_OFFER"].includes(op)) {
          await approvalValid(db, a);
          const active = await db.niceJobsOffer.findFirst({ where: { applicationId: a.id, activeKey: a.id } });
          let prior: Prisma.NiceJobsOfferGetPayload<object> | null = null;
          if (op === "REVISE_OFFER") {
            await permission(b, a, "nicejobs.offer.withdraw"); prior = await getOffer(db, a, data.offerReference);
            if (!active || active.id !== prior.id || !["DRAFT", "READY", "ISSUED", "VIEWED"].includes(prior.status) || data.recordRevision !== prior.revision) throw new NiceJobsError("Only the active unaccepted offer can be revised");
            const changed = await db.niceJobsOffer.updateMany({ where: { id: prior.id, revision: prior.revision, status: prior.status }, data: { status: "WITHDRAWN", activeKey: null, revision: { increment: 1 } } });
            if (changed.count !== 1) throw new NiceJobsError("Offer changed");
          } else if (active) throw new NiceJobsError("An active offer already exists");
          const last = await db.niceJobsOffer.findFirst({ where: { applicationId: a.id }, select: { number: true }, orderBy: { number: "desc" } });
          const snapshot = { title: c.title, reference: c.reference ?? null, company: a.company.name, division: a.area.division.name, jobTitle: a.area.version.title, jobVersion: a.area.version.number, engagement: a.area.version.engagement, ...c.content, ...(prior ? JSON.parse(prior.snapshot) : {}), ...(data.content ?? {}), validityDays: c.validityDays, declineReasonRequired: c.declineReasonRequired };
          const offer = await db.niceJobsOffer.create({ data: { applicationId: a.id, number: (last?.number ?? 0) + 1, snapshot: JSON.stringify(snapshot), activeKey: a.id, createdByUserId: userId } });
          updated = await advance(db, b, a, op, "APPROVED", data.reason, { offerReference: offer.reference, number: offer.number, ...(prior ? { previousOfferReference: prior.reference, previousStatus: "WITHDRAWN" } : {}) });
        } else {
          const o = await getOffer(db, a, data.offerReference);
          if (o.activeKey !== a.id || data.recordRevision !== o.revision) throw new NiceJobsError("Offer changed or is no longer active");
          const snapshot = JSON.parse(o.snapshot);
          const patch: Prisma.NiceJobsOfferUpdateManyMutationInput = { revision: { increment: 1 } };
          let stage = a.status;
          if (op === "READY_OFFER") {
            await approvalValid(db, a);
            if (o.status !== "DRAFT" || !snapshot.terms?.trim()) throw new NiceJobsError("Review configured offer terms before marking ready"); patch.status = "READY";
          } else if (op === "ISSUE_OFFER") {
            await approvalValid(db, a);
            if (o.status !== "READY") throw new NiceJobsError("Reviewed ready offer required"); patch.status = "ISSUED"; patch.issuedAt = now(); patch.expiresAt = snapshot.validityDays ? new Date(now().getTime() + snapshot.validityDays * 86400000) : null; stage = "OFFER"; candidateNotice = "Offer issued. Review your offer.";
          } else if (["VIEW_OFFER", "ACCEPT_OFFER", "DECLINE_OFFER"].includes(op)) {
            if (a.status !== "OFFER" || !["ISSUED", "VIEWED"].includes(o.status) || o.expiresAt && o.expiresAt <= now()) throw new NiceJobsError("Offer is not active or has expired");
            await approvalValid(db, a);
            if (op === "VIEW_OFFER") { patch.status = "VIEWED"; patch.viewedAt = now(); }
            if (op === "ACCEPT_OFFER") { patch.status = "ACCEPTED"; patch.acceptedAt = now(); stage = "OFFER_ACCEPTED"; candidateNotice = "Offer accepted. Enroll in orientation from My Applications."; }
            if (op === "DECLINE_OFFER") { if (snapshot.declineReasonRequired && !data.reason) throw new NiceJobsError("A decline reason is required"); patch.status = "DECLINED"; patch.declinedAt = now(); patch.declineReason = data.reason ?? null; patch.activeKey = null; stage = "OFFER_DECLINED"; candidateNotice = "Offer declined"; }
          } else if (op === "WITHDRAW_OFFER" || op === "EXPIRE_OFFER") {
            if (!["DRAFT", "READY", "ISSUED", "VIEWED"].includes(o.status) || op === "EXPIRE_OFFER" && (!["ISSUED", "VIEWED"].includes(o.status) || !o.expiresAt || o.expiresAt > now())) throw new NiceJobsError("Offer cannot be withdrawn or expired");
            patch.status = op === "WITHDRAW_OFFER" ? "WITHDRAWN" : "EXPIRED"; patch.activeKey = null; candidateNotice = op === "WITHDRAW_OFFER" ? "Offer withdrawn" : "Offer validity expired";
          } else throw new NiceJobsError("Unknown offer action");
          const changed = await db.niceJobsOffer.updateMany({ where: { id: o.id, revision: o.revision, status: o.status, activeKey: a.id }, data: patch });
          if (changed.count !== 1) throw new NiceJobsError("Offer changed. Refresh before retrying.");
          updated = await advance(db, b, a, op, stage, data.reason, { offerReference: o.reference, number: o.number, status: String(patch.status) }, stage === "OFFER_DECLINED" && formConfiguration(config(a)).duplicatePolicy === "ACTIVE_PER_VERSION" ? { activeKey: null } : {});
          if (["READY_OFFER", "ACCEPT_OFFER", "DECLINE_OFFER"].includes(op)) await managerNotification(db, b, updated, o.createdByUserId, op.replaceAll("_", " "));
        }
      }
      if (candidateNotice) await core.notification(db, b, updated, `${a.applicationId}: ${candidateNotice}`, "Nice Jobs update");
      return { reference: updated.reference, status: updated.status };
    });
  }
  async function detail(userId: string, reference: string, own: boolean, raw: { interviewsAfter?: string; offersAfter?: string; interviewerSearch?: string; interviewersAfter?: string } = {}) {
    z.string().uuid().parse(reference); const q = z.object({ interviewsAfter: z.string().max(200).optional(), offersAfter: z.string().max(200).optional(), interviewerSearch: z.string().trim().max(120).optional(), interviewersAfter: z.string().max(200).optional() }).strict().parse(raw);
    return client.$transaction(async db => {
      const b = await core.boundary(db, userId, own), a = await core.load(db, b, reference, own);
      const scope = { organizationId: a.divisionId };
      const can = async (key: string) => !own && a.candidateId !== b.personId && (await b.ctx.decide(key, scope)).allowed;
      const permissions: Record<string, boolean> = {};
      for (const key of ["nicejobs.interview.read", "nicejobs.interview.schedule", "nicejobs.interview.evaluate", "nicejobs.management.review", "nicejobs.management.approve", "nicejobs.management.reject", "nicejobs.offer.read", "nicejobs.offer.prepare", "nicejobs.offer.issue", "nicejobs.offer.withdraw", "approval.decide"]) permissions[key] = await can(key);
      if (q.interviewsAfter && !own && !permissions["nicejobs.interview.read"] || q.offersAfter && !own && !permissions["nicejobs.offer.read"]) throw new AccessError("History unavailable");
      const interviewScope = { applicationId: a.id, ...(!own && !permissions["nicejobs.management.review"] && !permissions["nicejobs.interview.schedule"] ? { interviewers: { some: { userId, personId: b.personId } } } : {}) };
      const offerScope = { applicationId: a.id, ...(own ? { issuedAt: { not: null } } : {}) };
      const interviewCursor = q.interviewsAfter ? await db.niceJobsInterview.findFirst({ where: { ...interviewScope, id: q.interviewsAfter }, select: { number: true } }) : null;
      const offerCursor = q.offersAfter ? await db.niceJobsOffer.findFirst({ where: { ...offerScope, id: q.offersAfter }, select: { number: true } }) : null;
      if (q.interviewsAfter && !interviewCursor || q.offersAfter && !offerCursor) throw new AccessError("History cursor unavailable");
      const interviews = own || permissions["nicejobs.interview.read"] ? await db.niceJobsInterview.findMany({ where: { ...interviewScope, ...(interviewCursor ? { number: { lt: interviewCursor.number } } : {}) }, include: interviewInclude, orderBy: { number: "desc" }, take: 26 }) : [];
      const offers = own || permissions["nicejobs.offer.read"] ? await db.niceJobsOffer.findMany({ where: { ...offerScope, ...(offerCursor ? { number: { lt: offerCursor.number } } : {}) }, orderBy: { number: "desc" }, take: 26 }) : [];
      const interviewParsed = input.interviewConfiguration.safeParse(config(a)?.interview), offerParsed = input.offerConfiguration.safeParse(config(a)?.offer);
      const request = !own && permissions["nicejobs.management.review"] && a.reviewRequestId ? await db.operationalRequest.findUnique({ where: { id: a.reviewRequestId }, select: { status: true, approvals: { take: 100, orderBy: [{ stageIndex: "asc" }, { id: "asc" }], select: { id: true, status: true, approverUserId: true, approver: { select: { person: { select: { displayName: true } } } }, stageIndex: true, comment: true, decidedAt: true } } } }) : null;
      const manager = !own && permissions["nicejobs.management.review"];
      let managementConfigured = false;
      if (manager) { try { await policy(db, a); managementConfigured = true; } catch (e) { if (!(e instanceof NiceJobsError)) throw e; } }
      const account = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
      const panelRows = permissions["nicejobs.interview.schedule"] ? await db.user.findMany({ where: { status: "ACTIVE", ...(q.interviewersAfter ? { id: { gt: q.interviewersAfter } } : {}), person: { status: "ACTIVE", ...(q.interviewerSearch ? { displayName: { contains: q.interviewerSearch } } : {}), id: { not: a.candidateId }, memberships: { some: { status: "ACTIVE", projectId: null, OR: [{ organizationId: a.divisionId }, { organizationId: b.company.id, scope: "DESCENDANTS" }], roles: { some: { role: { status: "ACTIVE", permissions: { some: { permission: { key: "nicejobs.interview.evaluate" } } } } } } } } } }, select: { id: true, person: { select: { displayName: true } } }, orderBy: { id: "asc" }, take: 26 }) : [];
      return { status: a.status, revision: a.revision, timezone: account.timezone, panelOptions: panelRows.slice(0, 25), nextPanel: panelRows.length > 25 ? panelRows[24].id : null, permissions, interviewConfigured: interviewParsed.success, interviewRequired: interviewParsed.success ? interviewParsed.data.enabled : null, offerConfigured: offerParsed.success, review: own ? null : { status: a.reviewNeedsMore ? "NEEDS_REVIEW" : request?.status === "SUBMITTED" ? "PENDING" : request?.status ?? (managementConfigured ? "NOT_REQUESTED" : "NOT_CONFIGURED"), request, actorUserId: userId }, interviews: interviews.slice(0, 25).map(i => ({ reference: i.reference, number: i.number, type: i.type, status: i.status, revision: i.revision, scheduledAt: i.scheduledAt, duration: i.duration, location: i.location, instructions: i.instructions, completedAt: i.completedAt, ...(own ? {} : { questions: interviewParsed.success && (manager || i.interviewers.some(p => p.userId === userId && p.personId === b.personId)) ? interviewParsed.data.questions : [], assigned: i.interviewers.some(p => p.userId === userId && p.personId === b.personId), evaluations: i.interviewers.filter(p => manager || p.userId === userId && p.personId === b.personId).map(p => ({ userId: p.userId, name: p.user.person?.displayName ?? "Recorded interviewer", submitted: !!p.evaluation, evaluation: p.evaluation ? { answers: JSON.parse(p.evaluation.answers), scores: JSON.parse(p.evaluation.scores), notes: p.evaluation.notes, recommendation: p.evaluation.recommendation, weightedScore: p.evaluation.weightedScore, submittedAt: p.evaluation.submittedAt } : null })) }) })), offers: offers.slice(0, 25).map(o => ({ reference: o.reference, number: o.number, status: o.status, revision: o.revision, snapshot: JSON.parse(o.snapshot), issuedAt: o.issuedAt, expiresAt: o.expiresAt, acceptedAt: o.acceptedAt, declinedAt: o.declinedAt, expired: !!o.expiresAt && o.expiresAt <= now() && !["ACCEPTED", "DECLINED", "WITHDRAWN"].includes(o.status), active: o.activeKey === a.id })), nextInterviews: interviews.length > 25 ? interviews[24].id : null, nextOffers: offers.length > 25 ? offers[24].id : null };
    });
  }
  async function configurationChoices(userId: string, versionId: string) {
    const { version, capabilities } = await createNiceJobsService(client).detail(userId, versionId);
    if (!capabilities.edit || version.publishedAt || version.status !== "DRAFT") throw new AccessError("Draft configuration unavailable");
    return client.$transaction(async db => {
      const b = await core.boundary(db, userId, false);
      const controls = await db.controlPoint.findMany({ where: { organizationId: { in: version.areas.map(a => a.divisionId).filter(id => b.ctx.organizationIds("control.read").includes(id)) }, status: "ACTIVE", projectId: null, allowSelfApproval: false, requiredPermission: "nicejobs.management.approve", kind: { in: ["APPROVAL", "HUMAN_DECISION"] } }, select: { id: true, name: true, organizationId: true }, orderBy: { id: "asc" }, take: 100 });
      return { divisions: version.areas.map(a => ({ id: a.divisionId, name: a.division.name })), controls };
    });
  }
  return { mutate, detail, configurationChoices };
}
export const recruitmentService = createRecruitmentService();
