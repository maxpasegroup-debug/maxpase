import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { createAccessContext, AccessError } from "@/server/authorization/engine";
import { operationalEvent, notify } from "@/server/domain/operational-events";
import { applicationStates, formConfiguration, validateAnswers, evaluate } from "./application-configuration";
import { NiceJobsError, NiceJobsUnavailable, configuration } from "./input";

const include = { candidate: { select: { displayName: true } }, company: { select: { name: true } }, area: { include: { division: { select: { name: true, parentId: true, status: true } }, version: { include: { template: true } } } } } satisfies Prisma.NiceJobsApplicationInclude;
const pageInput = z.object({ companyId: z.string().max(200).optional(), divisionId: z.string().max(200).optional(), versionId: z.string().max(200).optional(), status: z.enum(applicationStates).optional(), interviewFrom: z.string().date().optional(), interviewTo: z.string().date().optional(), search: z.string().trim().max(120).default(""), after: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).default(25) }).strict();
const createInput = z.object({ versionId: z.string().min(1).max(200), divisionId: z.string().min(1).max(200), answers: z.unknown().default({}) }).strict();
const mutationInput = z.object({ reference: z.string().uuid(), revision: z.number().int().min(0), action: z.enum(["SAVE", "SUBMIT", "WITHDRAW", "ELIGIBILITY", "SCREENING", "ELIGIBILITY_REVIEW", "SCREENING_REVIEW", "SHORTLIST", "REJECT", "CLOSE"]), answers: z.unknown().optional(), reason: z.string().trim().max(1000).optional(), candidateMessage: z.string().trim().max(1000).optional(), category: z.string().trim().max(120).optional(), reviewResult: z.enum(["ELIGIBLE", "INELIGIBLE", "PASSED", "FAILED"]).optional() }).strict();
const parseConfig = (raw: string | null) => raw ? configuration.parse(JSON.parse(raw)) : null;
export function createApplicationService(client: PrismaClient = prisma) {
  async function boundary(db: Prisma.TransactionClient, userId: string, own: boolean) {
    const company = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" }, select: { id: true, name: true, type: true, status: true, company: { select: { status: true } } } });
    const product = await db.product.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: company.id, slug: "nice-jobs" } }, include: { division: true } });
    if (company.type !== "COMPANY" || company.status !== "ACTIVE" || company.company?.status !== "ACTIVE" || product.status !== "ACTIVE" || product.division?.slug !== "aira-career-hub" || product.division.parentId !== company.id || product.division.status !== "ACTIVE") throw new NiceJobsUnavailable("Nice Jobs is unavailable");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId: company.id });
    if (!ctx.active || !ctx.user?.personId) throw new AccessError("Access denied");
    if (own) {
      await ctx.requireAccess("organization.read", { organizationId: product.division.id });
      await ctx.requireAccess("nicejobs.application.self", { organizationId: product.division.id });
    }
    return { company, product, ctx, personId: ctx.user.personId };
  }
  type Boundary = Awaited<ReturnType<typeof boundary>>;
  type Row = Prisma.NiceJobsApplicationGetPayload<{ include: typeof include }>;
  function publicRecord(row: Row) {
    return { reference: row.reference, applicationId: row.applicationId, revision: row.revision, status: row.status, eligibilityStatus: row.eligibilityStatus, screeningStatus: row.screeningStatus, submittedAt: row.submittedAt, updatedAt: row.updatedAt, candidateMessage: row.candidateMessage, title: row.area.version.title, company: row.company.name, division: row.area.division.name, nextStep: row.status === "DRAFT" ? "Complete and submit your application" : row.status === "SHORTLISTED" ? "Await interview preparation" : row.status === "INTERVIEW" ? "Check your interview schedule" : row.status === "MANAGEMENT_REVIEW" ? "Await management decision" : row.status === "APPROVED" ? "Await offer preparation" : row.status === "OFFER" ? "Review your offer" : row.status === "OFFER_ACCEPTED" ? "Enroll in orientation from your accepted offer" : row.status === "OFFER_DECLINED" ? "No further action" : ["REJECTED", "WITHDRAWN", "CLOSED"].includes(row.status) ? "No further action" : row.eligibilityStatus === "NOT_CONFIGURED" || row.screeningStatus === "NOT_CONFIGURED" ? "Await configured review criteria" : "Application under review" };
  }
  async function load(db: Prisma.TransactionClient, b: Boundary, reference: string, own: boolean) {
    const row = await db.niceJobsApplication.findFirst({ where: { reference, companyId: b.company.id, ...(own ? { candidateId: b.personId } : { divisionId: { in: b.ctx.organizationIds("nicejobs.application.read") } }), area: { version: { template: { companyId: b.company.id, productId: b.product.id } }, division: { parentId: b.company.id, status: "ACTIVE" } } }, include });
    if (!row) throw new AccessError("Application unavailable");
    if (!own) await b.ctx.requireAccess("nicejobs.application.read", { organizationId: row.divisionId });
    return row;
  }
  async function record(db: Prisma.TransactionClient, b: Boundary, row: Row, action: string, previousState: string, reason?: string, evidence?: unknown) {
    const event = await operationalEvent(db, { actorUserId: b.ctx.user!.id, actorPersonId: b.personId, organizationId: row.divisionId, action: "nicejobs.application." + action.toLowerCase(), entityType: "NiceJobsApplication", entityId: row.id, result: "SUCCESS", metadata: { reference: row.reference, from: previousState, to: row.status, revision: row.revision } });
    await db.niceJobsApplicationHistory.create({ data: { applicationId: row.id, revision: row.revision, eventId: event.id, action, previousState, nextState: row.status, internalReason: reason, candidateMessage: row.candidateMessage, evidence: evidence ? JSON.stringify(evidence) : null } });
  }
  async function notification(db: Prisma.TransactionClient, b: Boundary, row: Row, message?: string, title = "Application update") {
    // Delivery is optional when the reviewed candidate membership lacks notification access.
    const recipient = await createAccessContext(row.creatorUserId, db, undefined, { organizationId: b.product.division!.id });
    if (!recipient.active || recipient.user?.personId !== row.candidateId || !(await recipient.decide("notification.read", { organizationId: b.product.division!.id })).allowed || !(await recipient.decide("organization.read", { organizationId: b.product.division!.id })).allowed || !(await recipient.decide("nicejobs.application.self", { organizationId: b.product.division!.id })).allowed) return;
    await notify(db, b.ctx.user!.id, row.creatorUserId, { organizationId: b.product.division!.id, resourceType: "NICE_JOBS_APPLICATION", resourceId: row.id }, "NICE_JOBS_APPLICATION", title, message ?? `${row.applicationId ?? "Draft application"}: ${row.status.replaceAll("_", " ")}`, `nicejobs:${row.reference}:${row.revision}`);
  }
  async function opportunities(userId: string, raw: unknown = {}) {
    const q = pageInput.parse(raw);
    return client.$transaction(async db => {
      const b = await boundary(db, userId, true);
      if (q.companyId && q.companyId !== b.company.id) throw new AccessError("Access denied");
      const records = await db.niceJobsVersion.findMany({ where: { status: "PUBLISHED", publishedAt: { not: null }, publishedFor: { is: { companyId: b.company.id, productId: b.product.id, status: "PUBLISHED", visibility: "PUBLIC" } }, ...(q.versionId ? { id: q.versionId } : q.after ? { id: { gt: q.after } } : {}), title: { contains: q.search }, areas: { some: { ...(q.divisionId ? { divisionId: q.divisionId } : {}), division: { parentId: b.company.id, type: "DIVISION", status: "ACTIVE" } }, every: { division: { parentId: b.company.id, type: "DIVISION", status: "ACTIVE" } } } }, select: { id: true, title: true, description: true, engagement: true, configuration: true, template: { select: { code: true, company: { select: { name: true } } } }, areas: { take: 12, select: { divisionId: true, division: { select: { name: true } } } } }, orderBy: { id: "asc" }, take: q.limit + 1 });
      return { records: records.slice(0, q.limit).map(v => ({ id: v.id, title: v.title, description: v.description, engagement: v.engagement, code: v.template.code, company: v.template.company.name, areas: v.areas, form: formConfiguration(parseConfig(v.configuration)) })), nextCursor: records.length > q.limit ? records[q.limit - 1].id : null };
    });
  }
  async function create(userId: string, raw: unknown) {
    const data = createInput.parse(raw);
    try { return await client.$transaction(async db => {
      const b = await boundary(db, userId, true);
      const area = await db.niceJobsVersionArea.findFirst({ where: { versionId: data.versionId, divisionId: data.divisionId, division: { parentId: b.company.id, type: "DIVISION", status: "ACTIVE" }, version: { status: "PUBLISHED", publishedAt: { not: null }, publishedFor: { is: { companyId: b.company.id, productId: b.product.id, status: "PUBLISHED", visibility: "PUBLIC" } } } }, include: { version: true } });
      if (!area) throw new NiceJobsError("This job is not receiving applications");
      const config = formConfiguration(parseConfig(area.version.configuration));
      const answers = checkedAnswers(config, data.answers, false);
      const row = await db.niceJobsApplication.create({ data: { candidateId: b.personId, creatorUserId: userId, companyId: b.company.id, versionId: data.versionId, divisionId: data.divisionId, answers: JSON.stringify(answers), activeKey: b.personId + ":" + data.versionId }, include });
      await record(db, b, row, "CREATED", "DRAFT");
      return publicRecord(row);
    }); } catch (e) {
      if (isUnique(e)) throw new NiceJobsError("An application already exists for this job version. Open My Applications.");
      throw e;
    }
  }
  function checkedAnswers(config: ReturnType<typeof formConfiguration>, raw: unknown, submit: boolean) {
    try { return validateAnswers(config, raw, submit); } catch (e) { throw new NiceJobsError(e instanceof Error ? e.message : "Check application fields"); }
  }
  async function mutate(userId: string, raw: unknown) {
    const data = mutationInput.parse(raw), own = ["SAVE", "SUBMIT", "WITHDRAW"].includes(data.action);
    if (!own && data.answers !== undefined || data.action !== "REJECT" && (data.category || data.candidateMessage) || !["ELIGIBILITY_REVIEW", "SCREENING_REVIEW"].includes(data.action) && data.reviewResult) throw new NiceJobsError("Unexpected decision fields");
    return client.$transaction(async db => {
      const b = await boundary(db, userId, own), row = await load(db, b, data.reference, own);
      if (row.revision !== data.revision) throw new NiceJobsError("This application changed. Refresh before retrying.");
      const config = parseConfig(row.area.version.configuration), form = formConfiguration(config), answers = JSON.parse(row.answers);
      const patch: Prisma.NiceJobsApplicationUpdateManyMutationInput = { revision: { increment: 1 } };
      let evidence: unknown;
      if (own && (data.reason || data.category || data.candidateMessage)) throw new NiceJobsError("Unexpected candidate decision fields");
      if (["SAVE", "SUBMIT"].includes(data.action)) {
        if (row.status !== "DRAFT" || row.area.version.status !== "PUBLISHED" || row.area.version.template.status !== "PUBLISHED" || row.area.version.template.publishedVersionId !== row.versionId || row.area.version.template.visibility !== "PUBLIC") throw new NiceJobsError("This draft cannot be submitted or edited");
        patch.answers = JSON.stringify(checkedAnswers(form, data.answers ?? answers, data.action === "SUBMIT"));
        if (data.action === "SUBMIT") {
          const year = new Date().getUTCFullYear();
          const counter = await db.niceJobsApplicationSequence.upsert({ where: { year }, create: { year, value: 1 }, update: { value: { increment: 1 } } });
          patch.applicationId = `NJ-${year}-${String(counter.value).padStart(6, "0")}`;
          patch.status = "SUBMITTED"; patch.submittedAt = new Date();
          patch.eligibilityStatus = evaluate(config, JSON.parse(patch.answers as string), "eligibility").status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "PENDING";
          patch.screeningStatus = evaluate(config, JSON.parse(patch.answers as string), "screening").status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "PENDING";
        }
      } else if (data.action === "WITHDRAW") {
        if (!form.withdrawalStates.includes(row.status as typeof form.withdrawalStates[number])) throw new NiceJobsError("Withdrawal is not permitted at this stage");
        patch.status = "WITHDRAWN";
      } else {
        const key = { ELIGIBILITY: "evaluate", SCREENING: "evaluate", ELIGIBILITY_REVIEW: "evaluate", SCREENING_REVIEW: "evaluate", SHORTLIST: "shortlist", REJECT: "reject", CLOSE: "close" }[data.action as "ELIGIBILITY" | "SCREENING" | "ELIGIBILITY_REVIEW" | "SCREENING_REVIEW" | "SHORTLIST" | "REJECT" | "CLOSE"];
        await b.ctx.requireAccess("nicejobs.application." + key, { organizationId: row.divisionId });
        if (!data.reason) throw new NiceJobsError("A decision reason is required");
        if (data.action === "CLOSE") {
          if (!["REJECTED", "WITHDRAWN"].includes(row.status)) throw new NiceJobsError("Only rejected or withdrawn records can be closed");
          patch.status = "CLOSED";
        } else {
          if (row.area.version.template.status !== "PUBLISHED" || row.area.version.status !== "PUBLISHED" || !row.area.version.publishedAt || !["SUBMITTED", "ELIGIBILITY_REVIEW", "SCREENING"].includes(row.status)) throw new NiceJobsError("This application is not available for a decision");
          switch (data.action) {
            case "ELIGIBILITY_REVIEW":
              if (row.status !== "ELIGIBILITY_REVIEW" || row.eligibilityStatus !== "NEEDS_REVIEW" || !["ELIGIBLE", "INELIGIBLE"].includes(data.reviewResult ?? "")) throw new NiceJobsError("A recorded eligibility review is required");
              patch.eligibilityStatus = data.reviewResult; patch.status = data.reviewResult === "ELIGIBLE" ? "SCREENING" : "ELIGIBILITY_REVIEW"; evidence = { humanReview: true, result: data.reviewResult }; break;
            case "SCREENING_REVIEW":
              if (row.status !== "SCREENING" || row.screeningStatus !== "NEEDS_REVIEW" || !["PASSED", "FAILED"].includes(data.reviewResult ?? "")) throw new NiceJobsError("A recorded screening review is required");
              patch.screeningStatus = data.reviewResult; evidence = { humanReview: true, result: data.reviewResult }; break;
            case "ELIGIBILITY": {
              if (row.status === "SCREENING") throw new NiceJobsError("Eligibility has already been evaluated");
              const result = evaluate(config, answers, "eligibility"); evidence = result;
              patch.eligibilityStatus = result.status; patch.status = result.status === "ELIGIBLE" ? "SCREENING" : "ELIGIBILITY_REVIEW"; break;
            }
            case "SCREENING": {
              if (row.status !== "SCREENING" || row.eligibilityStatus !== "ELIGIBLE") throw new NiceJobsError("Eligible applications only");
              if (row.screeningStatus !== "PENDING" && row.screeningStatus !== "NOT_CONFIGURED") throw new NiceJobsError("Screening has already been evaluated");
              const result = evaluate(config, answers, "screening"); evidence = result; patch.screeningStatus = result.status; break;
            }
            case "SHORTLIST":
              if (row.status !== "SCREENING" || row.eligibilityStatus !== "ELIGIBLE" || row.screeningStatus !== "PASSED" || !await db.niceJobsApplicationHistory.findFirst({ where: { applicationId: row.id, action: { in: ["SCREENING", "SCREENING_REVIEW"] }, evidence: { not: null } } })) throw new NiceJobsError("Verified eligible, passed screening is required");
              patch.status = "SHORTLISTED"; break;
            case "REJECT":
              if (form.rejectionCategories.length && (!data.category || !form.rejectionCategories.includes(data.category))) throw new NiceJobsError("Select a configured rejection category");
              patch.status = "REJECTED"; patch.candidateMessage = data.candidateMessage || null; evidence = { category: data.category ?? null }; break;
          }
        }
      }
      if (["WITHDRAWN", "REJECTED", "CLOSED"].includes(String(patch.status)) && form.duplicatePolicy === "ACTIVE_PER_VERSION") patch.activeKey = null;
      const changed = await db.niceJobsApplication.updateMany({ where: { id: row.id, revision: data.revision, status: row.status }, data: patch });
      if (changed.count !== 1) throw new NiceJobsError("This application changed. Refresh before retrying.");
      const updated = await db.niceJobsApplication.findUniqueOrThrow({ where: { id: row.id }, include });
      await record(db, b, updated, data.action, row.status, data.reason, evidence);
      if (data.action !== "SAVE") await notification(db, b, updated);
      return publicRecord(updated);
    });
  }
  async function list(userId: string, own: boolean, raw: unknown = {}) {
    const q = pageInput.parse(raw);
    return client.$transaction(async db => {
      const b = await boundary(db, userId, own), ids = b.ctx.organizationIds("nicejobs.application.read");
      if (q.companyId && q.companyId !== b.company.id || !own && (!ids.length || q.divisionId && !ids.includes(q.divisionId))) throw new AccessError("Access denied");
      const rows = await db.niceJobsApplication.findMany({ where: { companyId: b.company.id, ...(own ? { candidateId: b.personId, ...(q.divisionId ? { divisionId: q.divisionId } : {}) } : { divisionId: { in: q.divisionId ? [q.divisionId] : ids } }), ...(q.versionId ? { versionId: q.versionId } : {}), ...((q.interviewFrom || q.interviewTo) ? { interviews: { some: { scheduledAt: { ...(q.interviewFrom ? { gte: new Date(q.interviewFrom + "T00:00:00.000Z") } : {}), ...(q.interviewTo ? { lt: new Date(new Date(q.interviewTo + "T00:00:00.000Z").getTime() + 86400000) } : {}) } } } } : {}), ...(q.status ? { status: q.status } : {}), ...(q.after ? { id: { gt: q.after } } : {}), ...(q.search ? { OR: [{ applicationId: { contains: q.search } }, ...(!own ? [{ candidate: { displayName: { contains: q.search } } }] : [])] } : {}), area: { version: { template: { companyId: b.company.id, productId: b.product.id } }, division: { parentId: b.company.id, status: "ACTIVE" } } }, include, orderBy: { id: "asc" }, take: q.limit + 1 });
      return { records: rows.slice(0, q.limit).map(row => own ? publicRecord(row) : { ...publicRecord(row), candidate: row.candidate.displayName, version: row.area.version.number }), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null };
    });
  }
  async function options(userId: string, own: boolean, selectedVersionId?: string) {
    if (selectedVersionId) z.string().max(200).parse(selectedVersionId);
    return client.$transaction(async db => {
      const b = await boundary(db, userId, own), ids = b.ctx.organizationIds("nicejobs.application.read");
      if (!own && !ids.length) throw new AccessError("Access denied");
      const divisions = await db.organization.findMany({ where: { parentId: b.company.id, type: "DIVISION", status: "ACTIVE", ...(!own ? { id: { in: ids } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 12 });
      const versions = await db.niceJobsVersion.findMany({ where: { publishedAt: { not: null }, template: { companyId: b.company.id, productId: b.product.id }, areas: { some: { divisionId: { in: divisions.map(d => d.id) } } } }, select: { id: true, title: true, number: true }, orderBy: { id: "desc" }, take: 50 });
      if (selectedVersionId && !versions.some(v => v.id === selectedVersionId)) {
        const selected = await db.niceJobsVersion.findFirst({ where: { id: selectedVersionId, template: { companyId: b.company.id, productId: b.product.id }, areas: { some: { divisionId: { in: divisions.map(d => d.id) } } } }, select: { id: true, title: true, number: true } });
        if (!selected) throw new AccessError("Access denied"); versions.push(selected);
      }
      return { company: { id: b.company.id, name: b.company.name }, divisions, versions };
    });
  }
  async function navigation(userId: string) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId, false);
      const scope = { organizationId: b.product.division!.id };
      return { own: (await b.ctx.decide("organization.read", scope)).allowed && (await b.ctx.decide("nicejobs.application.self", scope)).allowed, manage: !!b.ctx.organizationIds("nicejobs.application.read").length, templates: !!b.ctx.organizationIds("nicejobs.job.read").length };
    });
  }
  async function detail(userId: string, reference: string, own: boolean, afterRevision?: number) {
    z.string().uuid().parse(reference);
    if (afterRevision !== undefined) z.number().int().min(0).parse(afterRevision);
    return client.$transaction(async db => {
      const b = await boundary(db, userId, own), row = await load(db, b, reference, own);
      const form = formConfiguration(parseConfig(row.area.version.configuration));
      const decisionAvailable = row.area.version.template.status === "PUBLISHED" && row.area.version.status === "PUBLISHED" && !!row.area.version.publishedAt;
      const common = { ...publicRecord(row), candidateName: row.candidate.displayName, answers: JSON.parse(row.answers), form: own ? { ...form, rejectionCategories: [] } : form, canEdit: row.status === "DRAFT" && decisionAvailable && row.area.version.template.publishedVersionId === row.versionId && row.area.version.template.visibility === "PUBLIC", canWithdraw: form.withdrawalStates.includes(row.status as typeof form.withdrawalStates[number]) };
      if (own) return { ...common, management: null };
      const history = await db.niceJobsApplicationHistory.findMany({ where: { applicationId: row.id, ...(afterRevision !== undefined ? { revision: { lt: afterRevision } } : {}) }, orderBy: { revision: "desc" }, take: 26 });
      const events = await db.operationalEvent.findMany({ where: { id: { in: history.map(h => h.eventId) }, entityType: "NiceJobsApplication", entityId: row.id, organizationId: row.divisionId }, select: { id: true, actor: { select: { person: { select: { displayName: true } } } } }, take: 26 });
      const actors = new Map(events.map(e => [e.id, e.actor?.person?.displayName ?? "Recorded actor"]));
      const permissions = await Promise.all(["evaluate", "shortlist", "reject", "close"].map(async action => [action, (decisionAvailable || action === "close") && (await b.ctx.decide("nicejobs.application." + action, { organizationId: row.divisionId })).allowed]));
      return { ...common, management: { candidate: row.candidate.displayName, version: row.area.version.number, history: history.slice(0, 25).map(h => ({ ...h, actor: actors.get(h.eventId) ?? "Audit evidence unavailable" })), nextRevision: history.length > 25 ? history[24].revision : null, permissions: Object.fromEntries(permissions) as Record<string, boolean> } };
    });
  }
  return { create, mutate, list, detail, opportunities, options, navigation, internal: { boundary, load, record, notification } };
}
function isUnique(e: unknown) { return !!e && typeof e === "object" && "code" in e && e.code === "P2002"; }
export const applicationService = createApplicationService();
