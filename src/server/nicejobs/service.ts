import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { createAccessContext, AccessError } from "@/server/authorization/engine";
import { activeMembershipWhere, ancestry } from "@/server/authorization/business-scope";
import { operationalEvent } from "@/server/domain/operational-events";
import * as input from "./input";
import { opportunityProfile, publicationIssues, type OpportunityConfiguration } from "./opportunity-configuration";
import { initialOpportunities } from "./initial-opportunities";
import { programmeChecklist, storedConfiguration } from "./programme-checklist";

type DB = Prisma.TransactionClient;
const versionInclude = { template: { include: { company: { select: { id: true, name: true } } } }, areas: { take: 12, include: { division: { select: { id: true, name: true } } } } } satisfies Prisma.NiceJobsVersionInclude;
export function createNiceJobsService(client: PrismaClient = prisma) {
  async function boundary(db: DB, userId: string) {
    const company = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" }, select: { id: true, type: true, status: true, company: { select: { status: true } } } });
    const product = await db.product.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: company.id, slug: "nice-jobs" } }, select: { id: true, status: true, division: { select: { slug: true, parentId: true, status: true } } } });
    if (company.type !== "COMPANY" || company.status !== "ACTIVE" || company.company?.status !== "ACTIVE" || product.status !== "ACTIVE" || product.division?.slug !== "aira-career-hub" || product.division.parentId !== company.id || product.division.status !== "ACTIVE") throw new input.NiceJobsUnavailable("Nice Jobs is unavailable");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId: company.id });
    if (!ctx.active) throw new AccessError("Access denied");
    return { company, product, ctx };
  }
  type Boundary = Awaited<ReturnType<typeof boundary>>;
  async function audit(db: DB, b: Boundary, action: string, type: string, id: string, divisionId: string, metadata: Prisma.InputJsonObject = {}) {
    await operationalEvent(db, { actorUserId: b.ctx.user!.id, actorPersonId: b.ctx.user!.personId, organizationId: divisionId, action: "nicejobs." + action, entityType: type, entityId: id, result: "SUCCESS", metadata });
  }
  async function areas(db: DB, b: Boundary, ids: string[], key: string) {
    const rows = await db.organization.findMany({ where: { id: { in: ids }, type: "DIVISION", parentId: b.company.id, status: "ACTIVE" }, select: { id: true }, take: 13 });
    if (rows.length !== ids.length) throw new AccessError("Invalid business area");
    for (const id of ids) await b.ctx.requireAccess(key, { organizationId: id });
  }
  async function person(db: DB, b: Boundary, personId: string, divisionId: string) {
    await b.ctx.requireAccess("person.read", { organizationId: divisionId });
    const path = ancestry(b.ctx.nodes, divisionId).map(n => n.id);
    const row = await db.person.findFirst({ where: { id: personId, status: "ACTIVE", memberships: { some: { ...activeMembershipWhere(), projectId: null, OR: [{ organizationId: divisionId }, { organizationId: { in: path }, scope: "DESCENDANTS" }] } } }, select: { id: true } });
    if (!row) throw new AccessError("Person must have active membership in the business area");
  }
  function query(b: Boundary, raw: unknown, key: string) {
    const q = input.listInput.parse(raw);
    if (q.companyId && q.companyId !== b.company.id) throw new AccessError("Access denied");
    const ids = b.ctx.organizationIds(key);
    if (!ids.length || q.divisionId && !ids.includes(q.divisionId)) throw new AccessError("Access denied");
    return { q, ids };
  }
  async function getVersion(db: DB, b: Boundary, id: string, key: string) {
    const v = await db.niceJobsVersion.findFirst({ where: { id, template: { companyId: b.company.id, productId: b.product.id }, areas: { some: {}, every: { divisionId: { in: b.ctx.organizationIds(key) }, division: { parentId: b.company.id, type: "DIVISION", status: "ACTIVE" } } } }, include: versionInclude });
    if (!v) throw new AccessError("Access denied");
    await areas(db, b, v.areas.map(a => a.divisionId), key);
    return v;
  }
  async function trainingAuthority(db: DB, b: Boundary, data: { divisionIds: string[]; configuration: unknown }, previous: string | null) {
    const next = data.configuration as Record<string, unknown> | null, old = previous ? JSON.parse(previous) : null;
    if (JSON.stringify(next?.programmeSetup) !== JSON.stringify(old?.programmeSetup)) {
      await b.ctx.requireAccess("nicejobs.ojt.configure", { organizationId: b.company.id });
      await areas(db, b, data.divisionIds, "nicejobs.ojt.configure");
    }
    if (JSON.stringify(next?.preOffer) !== JSON.stringify(old?.preOffer) || next?.preOfferRequired !== old?.preOfferRequired) {
      await b.ctx.requireAccess("nicejobs.orientation.manage", { organizationId: b.company.id });
      await areas(db, b, data.divisionIds, "nicejobs.orientation.manage");
    }
    for (const [section, marker, permission] of [["orientation", "modules", "nicejobs.orientation.manage"], ["ojt", "stages", "nicejobs.ojt.configure"], ["readiness", "criteria", "nicejobs.ojt.configure"]]) {
      const n = next?.[section], p = old?.[section];
      if (JSON.stringify(n) !== JSON.stringify(p) && (n && typeof n === "object" && marker in n || p && typeof p === "object" && marker in p)) {
        await b.ctx.requireAccess(permission, { organizationId: b.company.id });
        await areas(db, b, data.divisionIds, permission);
      }
    }
  }
  async function opportunityReferences(db: DB, b: Boundary, profile: OpportunityConfiguration | null, divisionIds: string[]) {
    if (!profile) return;
    if (profile.legalEmployer.organizationId && profile.legalEmployer.organizationId !== b.company.id) throw new input.NiceJobsError("External employer recruitment authority is not configured. Keep the supplied employer label pending verification.");
    if (profile.legalEmployer.organizationId) {
      const employer = await db.companyProfile.findUnique({ where: { organizationId: b.company.id }, select: { legalName: true } });
      if (profile.legalEmployer.status === "CONFIRMED" && employer?.legalName !== profile.legalEmployer.legalName) throw new input.NiceJobsError("Legal employer name must match the canonical company record");
    }
    if (profile.brandId) {
      const brand = await db.brand.findFirst({ where: { id: profile.brandId, organizationId: b.company.id, status: "ACTIVE" }, select: { name: true } });
      if (!brand || profile.brandLabel !== brand.name) throw new input.NiceJobsError("Brand must belong to the employer company and use its recorded name");
    }
    if (profile.reportingManager.personId) for (const divisionId of divisionIds) await person(db, b, profile.reportingManager.personId, divisionId);
  }
  async function create(userId: string, raw: unknown) {
    const data = input.createInput.parse(raw);
    return client.$transaction(async db => {
      const b = await boundary(db, userId);
      await b.ctx.requireAccess("nicejobs.job.create", { organizationId: b.company.id });
      await areas(db, b, data.divisionIds, "nicejobs.job.create");
      await trainingAuthority(db, b, data, null);
      await opportunityReferences(db, b, data.configuration?.opportunity ?? null, data.divisionIds);
      const t = await db.niceJobsTemplate.create({ data: { companyId: b.company.id, productId: b.product.id, code: data.code, visibility: data.visibility } });
      const v = await db.niceJobsVersion.create({ data: { templateId: t.id, number: 1, title: data.title, description: data.description, engagement: data.engagement, context: data.context, configuration: data.configuration ? JSON.stringify(data.configuration) : null, areas: { create: data.divisionIds.map(divisionId => ({ divisionId })) } } });
      await audit(db, b, "job.created", "NiceJobsTemplate", t.id, b.company.id, { versionId: v.id, number: 1, status: "DRAFT" });
      await audit(db, b, "version.created", "NiceJobsVersion", v.id, b.company.id, { number: 1 });
      return v;
    });
  }
  async function edit(userId: string, id: string, revision: number, raw: unknown) {
    const data = input.versionInput.parse(raw);
    return client.$transaction(async db => {
      const b = await boundary(db, userId), v = await getVersion(db, b, id, "nicejobs.job.edit");
      await b.ctx.requireAccess("nicejobs.job.edit", { organizationId: b.company.id });
      if (v.publishedAt || v.status !== "DRAFT" || v.template.status === "ARCHIVED") throw new input.NiceJobsError("Only an unpublished draft can be edited");
      if (storedConfiguration(v.configuration)?.programmeSetup && !data.configuration?.programmeSetup) throw new input.NiceJobsError("Programme setup cannot be removed after configuration. Keep incomplete requirements in the draft.");
      const previousOjt=storedConfiguration(v.configuration)?.ojt;
      if(previousOjt && "stages" in previousOjt && previousOjt.curriculum && (!data.configuration?.ojt || !("stages" in data.configuration.ojt) || !data.configuration.ojt.curriculum)) throw new input.NiceJobsError("A configured curriculum cannot be removed to bypass review");
      await areas(db, b, data.divisionIds, "nicejobs.job.edit");
      await trainingAuthority(db, b, { ...data, divisionIds: [...new Set([...data.divisionIds, ...v.areas.map(a => a.divisionId)])] }, v.configuration);
      await opportunityReferences(db, b, data.configuration?.opportunity ?? null, data.divisionIds);
      const result = await db.niceJobsVersion.updateMany({ where: { id, revision, status: "DRAFT", publishedAt: null }, data: { title: data.title, description: data.description, engagement: data.engagement, context: data.context, configuration: data.configuration ? JSON.stringify(data.configuration) : null, revision: { increment: 1 } } });
      if (result.count !== 1) throw new input.NiceJobsError("This draft changed. Refresh before retrying");
      await db.niceJobsVersionArea.deleteMany({ where: { versionId: id } });
      await db.niceJobsVersionArea.createMany({ data: data.divisionIds.map(divisionId => ({ versionId: id, divisionId })) });
      await audit(db, b, "job.modified", "NiceJobsVersion", id, b.company.id, { fromRevision: revision, toRevision: revision + 1 });
      return db.niceJobsVersion.findUniqueOrThrow({ where: { id } });
    });
  }
  async function newVersion(userId: string, id: string, revision: number) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId), v = await getVersion(db, b, id, "nicejobs.job.edit");
      await b.ctx.requireAccess("nicejobs.job.edit", { organizationId: b.company.id });
      if (!v.publishedAt || v.template.status === "ARCHIVED") throw new input.NiceJobsError("A new version requires a published history");
      if (await db.niceJobsVersion.findFirst({ where: { templateId: v.templateId, publishedAt: null } })) throw new input.NiceJobsError("This job already has an unpublished version");
      const lock = await db.niceJobsTemplate.updateMany({ where: { id: v.templateId, revision }, data: { revision: { increment: 1 } } });
      if (lock.count !== 1) throw new input.NiceJobsError("This job changed. Refresh before retrying");
      const last = await db.niceJobsVersion.findFirstOrThrow({ where: { templateId: v.templateId }, orderBy: { number: "desc" }, select: { number: true } });
      const next = await db.niceJobsVersion.create({ data: { templateId: v.templateId, number: last.number + 1, title: v.title, description: v.description, engagement: v.engagement, context: v.context, configuration: v.configuration, areas: { create: v.areas.map(a => ({ divisionId: a.divisionId })) } } });
      await audit(db, b, "version.created", "NiceJobsVersion", next.id, b.company.id, { fromVersionId: id, number: next.number });
      return next;
    });
  }
  async function changeJob(userId: string, raw: unknown) {
    const c = input.changeInput.parse(raw);
    return client.$transaction(async db => {
      const b = await boundary(db, userId);
      const key = "nicejobs.job." + ({ REVIEW: "edit", PENDING_VERIFICATION: "edit", APPROVED: "publish", DRAFT: "edit", PUBLISHED: "publish", PAUSED: "pause", ARCHIVED: "archive" }[c.to] ?? "invalid");
      const v = await getVersion(db, b, c.id, key), t = v.template;
      await b.ctx.requireAccess(key, { organizationId: b.company.id });
      if (t.status === "ARCHIVED") throw new input.NiceJobsError("Archived jobs are read-only");
      const setup = await programmeChecklist(db, b.company.id, v);
      if (setup.required) {
        if (["REVIEW", "PENDING_VERIFICATION", "APPROVED", "PUBLISHED"].includes(c.to) && !setup.ready) throw new input.NiceJobsError(setup.issues.join(" "));
        if (!v.publishedAt && (c.to === "APPROVED" && !["REVIEW", "PENDING_VERIFICATION"].includes(v.status) || c.to === "PUBLISHED" && v.status !== "APPROVED")) throw new input.NiceJobsError("Submit the complete draft for review, then approve it before publication");
        if (c.to === "PUBLISHED" && v.publishedAt && t.publishedVersionId !== v.id) throw new input.NiceJobsError("Only the current published version can be resumed");
        if (c.to === "APPROVED") {
          const configured = input.configuration.parse(JSON.parse(v.configuration!));
          if (configured.programmeSetup?.publicationReviewerUserId !== userId) throw new AccessError("Approval is assigned to a different authorized publication reviewer");
        }
      }
      if (["APPROVED", "PUBLISHED"].includes(c.to) && (t.visibility === "PUBLIC" || opportunityProfile(v.configuration))) {
        const configured = v.configuration ? JSON.parse(v.configuration) : null;
        if (configured?.preOfferRequired && !configured.preOffer) throw new input.NiceJobsError("Configure role video, comprehension check and versioned policies before publication");
        const profile = opportunityProfile(v.configuration), issues = publicationIssues(profile, v.description, v.engagement);
        if (issues.length) throw new input.NiceJobsError(issues.join(" "));
        await opportunityReferences(db, b, profile, v.areas.map(area => area.divisionId));
      }
      const draftTransition = !v.publishedAt && (v.status === "DRAFT" && ["REVIEW", "PENDING_VERIFICATION", "APPROVED", "PUBLISHED"].includes(c.to) || ["REVIEW", "PENDING_VERIFICATION"].includes(v.status) && ["DRAFT", "APPROVED", "PUBLISHED"].includes(c.to) || v.status === "APPROVED" && ["DRAFT", "PUBLISHED"].includes(c.to));
      if (["DRAFT", "REVIEW", "PENDING_VERIFICATION", "APPROVED"].includes(c.to) || c.to === "PUBLISHED" && !v.publishedAt) {
        if (!draftTransition) throw new input.NiceJobsError("Invalid job transition");
        const result = await db.niceJobsVersion.updateMany({ where: { id: v.id, revision: c.revision, status: v.status, publishedAt: null }, data: { status: c.to, ...(c.to === "PUBLISHED" ? { publishedAt: new Date() } : {}), revision: { increment: 1 } } });
        if (result.count !== 1) throw new input.NiceJobsError("This version changed. Refresh before retrying");
        if (c.to === "PUBLISHED") await db.niceJobsTemplate.update({ where: { id: t.id }, data: { publishedVersionId: v.id, status: "PUBLISHED", revision: { increment: 1 } } });
        else if (!t.publishedVersionId) await db.niceJobsTemplate.update({ where: { id: t.id }, data: { status: c.to, revision: { increment: 1 } } });
      } else {
        if (!(c.to === "PAUSED" && t.status === "PUBLISHED" || c.to === "PUBLISHED" && t.status === "PAUSED" || c.to === "ARCHIVED")) throw new input.NiceJobsError("Invalid job transition");
        if (t.publishedVersionId) await getVersion(db, b, t.publishedVersionId, key);
        const result = await db.niceJobsTemplate.updateMany({ where: { id: t.id, revision: c.revision, status: t.status }, data: { status: c.to, revision: { increment: 1 } } });
        if (result.count !== 1) throw new input.NiceJobsError("This job changed. Refresh before retrying");
      }
      await audit(db, b, "job." + c.to.toLowerCase(), "NiceJobsVersion", v.id, b.company.id, { from: v.publishedAt ? t.status : v.status, to: c.to, reason: c.reason });
    });
  }
  async function jobs(userId: string, raw: unknown = {}) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId), { q, ids } = query(b, raw, "nicejobs.job.read");
      const template: Prisma.NiceJobsTemplateWhereInput = { companyId: b.company.id, productId: b.product.id, ...(q.jobId ? { id: q.jobId } : {}), ...(q.status && ["PAUSED", "ARCHIVED", "PUBLISHED"].includes(q.status) ? { status: q.status } : q.status ? { status: { not: "ARCHIVED" } } : {}) };
      const rows = await db.niceJobsVersion.findMany({ where: { template, ...(q.status === "PUBLISHED" ? { publishedFor: { is: template } } : {}), ...(q.status && !["PAUSED", "ARCHIVED"].includes(q.status) ? { status: q.status } : {}), title: { contains: q.search }, areas: { some: { ...(q.divisionId ? { divisionId: q.divisionId } : {}) }, every: { divisionId: { in: ids }, division: { parentId: b.company.id, type: "DIVISION", status: "ACTIVE" } } }, ...(q.after ? { id: { gt: q.after } } : {}) }, include: versionInclude, orderBy: { id: "asc" }, take: q.limit + 1 });
      return { records: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null };
    });
  }
  async function detail(userId: string, id: string) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId), v = await getVersion(db, b, id, "nicejobs.job.read");
      const capabilities: Record<string, boolean> = {};
      for (const action of ["edit", "publish", "pause", "archive"]) capabilities[action] = (await b.ctx.decide("nicejobs.job." + action, { organizationId: b.company.id })).allowed && v.areas.every(a => b.ctx.organizationIds("nicejobs.job." + action).includes(a.divisionId));
      capabilities.orientation = (await b.ctx.decide("nicejobs.orientation.manage", { organizationId: b.company.id })).allowed && v.areas.every(a => b.ctx.organizationIds("nicejobs.orientation.manage").includes(a.divisionId));
      capabilities.programme = capabilities.edit && (await b.ctx.decide("nicejobs.ojt.configure", { organizationId: b.company.id })).allowed && v.areas.every(a => b.ctx.organizationIds("nicejobs.ojt.configure").includes(a.divisionId));
      const configured = storedConfiguration(v.configuration);
      capabilities.programmeApproval = configured?.programmeSetup?.publicationReviewerUserId === userId;
      const setup = await programmeChecklist(db, b.company.id, v);
      return { version: v, capabilities, setup, publicationIssues: setup.required ? setup.issues : [...publicationIssues(opportunityProfile(v.configuration), v.description, v.engagement), ...(configured?.preOfferRequired && !configured.preOffer ? ["Role video, comprehension check and versioned policies must be configured."] : [])] };
    });
  }
  async function assign(userId: string, raw: unknown) {
    const data = input.assignInput.parse(raw);
    return client.$transaction(async db => {
      const b = await boundary(db, userId);
      await areas(db, b, [data.divisionId], "nicejobs.worker.assign");
      await b.ctx.requireAccess("nicejobs.job.read", { organizationId: data.divisionId });
      const v = await db.niceJobsVersion.findFirst({ where: { id: data.versionId, status: "PUBLISHED", publishedAt: { not: null }, template: { companyId: b.company.id, productId: b.product.id, status: "PUBLISHED", publishedVersionId: data.versionId }, areas: { some: { divisionId: data.divisionId } } } });
      if (!v) throw new input.NiceJobsError("Assignment requires the current published job in this business area");
      await person(db, b, data.personId, data.divisionId);
      if (data.managerId) { if (data.managerId === data.personId) throw new input.NiceJobsError("A worker cannot supervise themselves"); await person(db, b, data.managerId, data.divisionId); }
      const profile = await db.niceJobsWorkerProfile.upsert({ where: { companyId_personId: { companyId: b.company.id, personId: data.personId } }, update: {}, create: { companyId: b.company.id, personId: data.personId } });
      if (await db.niceJobsAssignment.findFirst({ where: { profileId: profile.id, status: { not: "ENDED" } }, select: { id: true } })) throw new input.NiceJobsError("This person already has an open assignment; multiple-assignment policy is not configured");
      const row = await db.niceJobsAssignment.create({ data: { profileId: profile.id, versionId: v.id, divisionId: data.divisionId, managerId: data.managerId } });
      await audit(db, b, "assignment.created", "NiceJobsAssignment", row.id, data.divisionId, { versionId: v.id, status: row.status, lifecycle: row.lifecycle });
      return row;
    });
  }
  async function transition(userId: string, raw: unknown) {
    const c = input.changeInput.parse(raw);
    return client.$transaction(async db => {
      const b = await boundary(db, userId);
      const row = await db.niceJobsAssignment.findFirst({ where: { id: c.id, profile: { companyId: b.company.id }, version: { template: { companyId: b.company.id, productId: b.product.id } } } });
      if (!row) throw new AccessError("Access denied");
      await areas(db, b, [row.divisionId], "nicejobs.worker.transition");
      const profile = await db.niceJobsWorkerProfile.findUniqueOrThrow({ where: { id: row.profileId }, select: { personId: true } });
      await person(db, b, profile.personId, row.divisionId);
      const allowed: Record<string, string[]> = { APPLICANT: ["APPROVED"], APPROVED: ["OFFERED"], OFFERED: ["OFFER_ACCEPTED"], OFFER_ACCEPTED: ["ORIENTATION"], ORIENTATION: ["OJT"], OJT: ["ACTIVE"], ACTIVE: ["SUSPENDED"], SUSPENDED: ["ACTIVE"] };
      if (!allowed[row.lifecycle]?.includes(c.to)) throw new input.NiceJobsError("Invalid or deferred worker transition");
      const status = c.to === "ACTIVE" ? "ACTIVE" : c.to === "SUSPENDED" ? "SUSPENDED" : row.status;
      const result = await db.niceJobsAssignment.updateMany({ where: { id: row.id, revision: c.revision, lifecycle: row.lifecycle }, data: { lifecycle: c.to, status, revision: { increment: 1 } } });
      if (result.count !== 1) throw new input.NiceJobsError("This assignment changed. Refresh before retrying");
      await audit(db, b, "worker.transitioned", "NiceJobsAssignment", row.id, row.divisionId, { from: row.lifecycle, to: c.to, reason: c.reason });
      if (row.status !== status) await audit(db, b, "assignment.status_changed", "NiceJobsAssignment", row.id, row.divisionId, { from: row.status, to: status });
    });
  }
  async function workforce(userId: string, raw: unknown = {}) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId), { q, ids } = query(b, raw, "nicejobs.worker.read");
      const visible = ids.filter(id => b.ctx.organizationIds("person.read").includes(id));
      if (!visible.length) throw new AccessError("Person visibility is required in this scope");
      const rows = await db.niceJobsAssignment.findMany({ where: { divisionId: q.divisionId ?? { in: visible }, AND: [{ divisionId: { in: visible } }], division: { parentId: b.company.id, type: "DIVISION", status: "ACTIVE" }, profile: { companyId: b.company.id, person: { displayName: { contains: q.search } } }, version: { template: { companyId: b.company.id, productId: b.product.id, ...(q.jobId ? { id: q.jobId } : {}) }, areas: { some: { divisionId: q.divisionId ?? { in: visible } } } }, ...(q.assignmentStatus ? { status: q.assignmentStatus } : {}), ...(q.lifecycle ? { lifecycle: q.lifecycle } : {}), ...(q.after ? { id: { gt: q.after } } : {}) }, select: { id: true, status: true, lifecycle: true, revision: true, startDate: true, endDate: true, createdAt: true, updatedAt: true, division: { select: { id: true, name: true } }, profile: { select: { id: true, person: { select: { id: true, displayName: true } } } }, manager: { select: { displayName: true } }, version: { select: { id: true, title: true, number: true, engagement: true, template: { select: { id: true, code: true, company: { select: { id: true, name: true } } } } } } }, orderBy: { id: "asc" }, take: q.limit + 1 });
      return { records: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null, transitionIds: b.ctx.organizationIds("nicejobs.worker.transition").filter(id => visible.includes(id)) };
    });
  }
  async function options(userId: string) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId), keys = ["nicejobs.job.read", "nicejobs.worker.read", "nicejobs.worker.assign", "nicejobs.job.create"];
      const ids = [...new Set(keys.flatMap(k => b.ctx.organizationIds(k)))];
      if (!ids.length) throw new AccessError("Access denied");
      const divisions = await db.organization.findMany({ where: { id: { in: ids }, parentId: b.company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true, name: true }, take: 12, orderBy: { name: "asc" } });
      const createIds = b.ctx.organizationIds("nicejobs.job.create"), canCreate = (await b.ctx.decide("nicejobs.job.create", { organizationId: b.company.id })).allowed && divisions.some(d => createIds.includes(d.id));
      return { companyId: b.company.id, companyName: "AIRA SKILL CITY PRIVATE LIMITED", divisions, createIds, canCreate, canSeed: canCreate && divisions.filter(d => d.name !== "AIRA Career Hub").every(d => createIds.includes(d.id)) && divisions.length === 4, canSeedOpportunities: canCreate && divisions.length === 4 && divisions.every(d => createIds.includes(d.id)), assignIds: b.ctx.organizationIds("nicejobs.worker.assign").filter(id => b.ctx.organizationIds("person.read").includes(id) && b.ctx.organizationIds("nicejobs.job.read").includes(id)), readJobs: b.ctx.organizationIds("nicejobs.job.read").length > 0, readWorkers: b.ctx.organizationIds("nicejobs.worker.read").length > 0 };
    });
  }
  async function seedKnown(userId: string) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId);
      await b.ctx.requireAccess("nicejobs.job.create", { organizationId: b.company.id });
      const catalogue = [
        { code: "JOB-001", title: "Academic Advisor \u2014 Junior", slugs: ["aira-startup-school", "aira-skill-studio"] },
        { code: "JOB-002", title: "Business Development Manager", slugs: ["aira-labs"] }
      ];
      const versions = [];
      for (const job of catalogue) {
        const divisions = await db.organization.findMany({ where: { slug: { in: job.slugs }, parentId: b.company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true }, take: 12 });
        if (divisions.length !== job.slugs.length) throw new input.NiceJobsError("Canonical business areas are unavailable");
        await areas(db, b, divisions.map(d => d.id), "nicejobs.job.create");
        const existing = await db.niceJobsTemplate.findUnique({ where: { companyId_code: { companyId: b.company.id, code: job.code } }, select: { id: true, productId: true } });
        if (existing) {
          if (existing.productId !== b.product.id) throw new input.NiceJobsError("Catalogue identity conflicts with existing records");
          const first = await db.niceJobsVersion.findUniqueOrThrow({ where: { templateId_number: { templateId: existing.id, number: 1 } }, include: { areas: { take: 13 } } });
          if (first.title !== job.title || first.engagement !== "PART_TIME_INCENTIVE" || first.areas.length !== divisions.length || first.areas.some(a => !divisions.some(d => d.id === a.divisionId))) throw new input.NiceJobsError("Catalogue identity conflicts with existing records; no changes made");
          versions.push(first); continue;
        }
        const t = await db.niceJobsTemplate.create({ data: { code: job.code, companyId: b.company.id, productId: b.product.id } });
        const v = await db.niceJobsVersion.create({ data: { templateId: t.id, title: job.title, number: 1, areas: { create: divisions.map(d => ({ divisionId: d.id })) } } });
        await audit(db, b, "job.created", "NiceJobsTemplate", t.id, b.company.id, { versionId: v.id, status: "DRAFT", source: "USER_SUPPLIED_CATALOGUE" });
        await audit(db, b, "version.created", "NiceJobsVersion", v.id, b.company.id, { number: 1 });
        versions.push(v);
      }
      return versions;
    });
  }
  async function people(userId: string, divisionId: string, search = "", after?: string) {
    const q = input.listInput.parse({ search, after });
    return client.$transaction(async db => {
      const b = await boundary(db, userId);
      await areas(db, b, [divisionId], "nicejobs.worker.assign");
      await b.ctx.requireAccess("person.read", { organizationId: divisionId });
      const path = ancestry(b.ctx.nodes, divisionId).map(n => n.id);
      const rows = await db.person.findMany({ where: { status: "ACTIVE", displayName: { contains: q.search }, ...(q.after ? { id: { gt: q.after } } : {}), memberships: { some: { ...activeMembershipWhere(), projectId: null, OR: [{ organizationId: divisionId }, { organizationId: { in: path }, scope: "DESCENDANTS" }] } } }, select: { id: true, displayName: true }, orderBy: { id: "asc" }, take: 26 });
      return { records: rows.slice(0, 25), nextCursor: rows.length > 25 ? rows[24].id : null };
    });
  }
  async function seedInitialOpportunities(userId: string) {
    return client.$transaction(async db => {
      const b = await boundary(db, userId);
      await b.ctx.requireAccess("nicejobs.job.create", { organizationId: b.company.id });
      const legalName = (await db.companyProfile.findUniqueOrThrow({ where: { organizationId: b.company.id } })).legalName;
      const brand = await db.brand.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: b.company.id, slug: "aira-labs" } } });
      if (!legalName || brand.slug !== "aira-labs" || brand.status !== "ACTIVE") throw new input.NiceJobsUnavailable("Canonical employer or brand unavailable");
      const rows = [];
      for (const job of initialOpportunities(b.company.id, legalName, brand.id)) {
        const divisions = await db.organization.findMany({ where: { slug: { in: job.slugs }, parentId: b.company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true }, take: 12 });
        if (divisions.length !== job.slugs.length) throw new input.NiceJobsUnavailable("Canonical opportunity scope unavailable");
        await areas(db, b, divisions.map(division => division.id), "nicejobs.job.create");
        const template = await db.niceJobsTemplate.findUnique({ where: { companyId_code: { companyId: b.company.id, code: job.code } } });
        if (template && template.productId !== b.product.id) throw new input.NiceJobsError("Initial catalogue code conflicts with an existing product");
        const previous = template ? await db.niceJobsVersion.findFirst({ where: { templateId: template.id }, orderBy: { number: "desc" } }) : null;
        if (previous && opportunityProfile(previous.configuration)) { rows.push(previous); continue; }
        const legacyStub = previous?.title === "Academic Advisor \u2014 Junior" && previous.status === "DRAFT" && previous.revision === 0 && !previous.publishedAt && !previous.description && !previous.configuration && !previous.context;
        if (previous && !legacyStub && !previous.publishedAt) throw new input.NiceJobsError("An existing draft contains work. Review it before initializing this catalogue entry.");
        const configuration = JSON.stringify(input.configuration.parse({ schemaVersion: 1, preOfferRequired: true, preOffer: null, opportunity: job.opportunity, application: { fields: [{ key: "motivation", label: "Why are you interested in this opportunity?", type: "TEXTAREA", required: true }, { key: "availability", label: "What is your availability?", type: "TEXT", required: true }] } }));
        let row;
        if (legacyStub && previous && template) {
          await b.ctx.requireAccess("nicejobs.job.edit", { organizationId: b.company.id });
          await areas(db, b, divisions.map(division => division.id), "nicejobs.job.edit");
          const changed = await db.niceJobsVersion.updateMany({ where: { id: previous.id, revision: 0, status: "DRAFT", publishedAt: null }, data: { title: job.title, description: job.description, engagement: job.engagement, configuration, revision: { increment: 1 } } });
          if (changed.count !== 1) throw new input.NiceJobsError("Catalogue draft changed. Refresh before retrying.");
          row = await db.niceJobsVersion.findUniqueOrThrow({ where: { id: previous.id } });
        } else {
          const target = template ?? await db.niceJobsTemplate.create({ data: { companyId: b.company.id, productId: b.product.id, code: job.code, visibility: "PUBLIC" } });
          row = await db.niceJobsVersion.create({ data: { templateId: target.id, number: (previous?.number ?? 0) + 1, title: job.title, description: job.description, engagement: job.engagement, configuration, areas: { create: divisions.map(division => ({ divisionId: division.id })) } } });
          if (!template) await audit(db, b, "job.created", "NiceJobsTemplate", target.id, b.company.id, { source: "OWNER_SUPPLIED_OPPORTUNITY", status: "DRAFT" });
        }
        await audit(db, b, "opportunity.draft_configured", "NiceJobsVersion", row.id, b.company.id, { source: "OWNER_SUPPLIED_OPPORTUNITY", pendingPublication: true });
        rows.push(row);
      }
      return rows;
    });
  }
  async function opportunityOptions(userId: string, versionId: string, search = "") {
    const q = input.listInput.parse({ search });
    return client.$transaction(async db => {
      const b = await boundary(db, userId), version = await getVersion(db, b, versionId, "nicejobs.job.edit");
      const company = await db.companyProfile.findUniqueOrThrow({ where: { organizationId: b.company.id }, select: { legalName: true } });
      const brands = await db.brand.findMany({ where: { organizationId: b.company.id, status: "ACTIVE" }, select: { id: true, name: true }, take: 50, orderBy: { name: "asc" } });
      const divisionIds = version.areas.map(area => area.divisionId);
      const readable = divisionIds.every(id => b.ctx.organizationIds("person.read").includes(id));
      const paths = divisionIds.map(id => ancestry(b.ctx.nodes, id).map(node => node.id));
      const profile = opportunityProfile(version.configuration);
      const managerWhere: Prisma.PersonWhereInput = { status: "ACTIVE", AND: divisionIds.map((id, index) => ({ memberships: { some: { ...activeMembershipWhere(), projectId: null, OR: [{ organizationId: id }, { organizationId: { in: paths[index] }, scope: "DESCENDANTS" }] } } })) };
      const managers = readable ? await db.person.findMany({ where: { ...managerWhere, displayName: { contains: q.search } }, select: { id: true, displayName: true }, take: 25, orderBy: { displayName: "asc" } }) : [];
      if (readable && profile?.reportingManager.personId && !managers.some(person => person.id === profile.reportingManager.personId)) {
        const selected = await db.person.findFirst({ where: { ...managerWhere, id: profile.reportingManager.personId }, select: { id: true, displayName: true } });
        if (selected) managers.push(selected);
      }
      const saved = storedConfiguration(version.configuration);
      const selected = saved?.programmeSetup ? [saved.programmeSetup.managerUserId, saved.programmeSetup.publicationReviewerUserId, saved.programmeSetup.ojtReviewerUserId, saved.programmeSetup.readinessReviewerUserId].filter((id): id is string => !!id) : [];
      const accounts = readable ? await db.user.findMany({ where: { status: "ACTIVE", person: { ...managerWhere, displayName: { contains: q.search } } }, select: { id: true, person: { select: { displayName: true } } }, orderBy: { id: "asc" }, take: 25 }) : [];
      if (readable) for (const id of new Set(selected)) if (!accounts.some(account => account.id === id)) {
        const account = await db.user.findFirst({ where: { id, status: "ACTIVE", person: managerWhere }, select: { id: true, person: { select: { displayName: true } } } });
        if (account) accounts.push(account);
      }
      return { companyId: b.company.id, legalName: company.legalName, brands, managers, accounts: accounts.map(account => ({ id: account.id, displayName: account.person!.displayName })) };
    });
  }
  async function visibility(userId: string, raw: unknown) {
    const c = input.changeInput.parse(raw);
    if (!["PUBLIC", "INTERNAL"].includes(c.to)) throw new input.NiceJobsError("Invalid audience");
    return client.$transaction(async db => {
      const b = await boundary(db, userId), v = await getVersion(db, b, c.id, "nicejobs.job.publish");
      await b.ctx.requireAccess("nicejobs.job.publish", { organizationId: b.company.id });
      if (v.publishedAt || v.template.publishedVersionId || !["DRAFT", "REVIEW", "PENDING_VERIFICATION"].includes(v.template.status)) throw new input.NiceJobsError("Only an unpublished job audience can be changed");
      const changed = await db.niceJobsTemplate.updateMany({ where: { id: v.templateId, revision: c.revision, publishedVersionId: null, visibility: v.template.visibility }, data: { visibility: c.to, revision: { increment: 1 } } });
      if (changed.count !== 1) throw new input.NiceJobsError("This job changed. Refresh before retrying");
      await audit(db, b, "job.audience_changed", "NiceJobsTemplate", v.templateId, b.company.id, { from: v.template.visibility, to: c.to, reason: c.reason });
    });
  }
  async function trainingResources(userId: string, versionId: string) {
    return client.$transaction(async db => {
      const b = await boundary(db,userId), v = await getVersion(db,b,versionId,"nicejobs.job.edit"), now = new Date();
      const orgs = [b.company.id,...v.areas.map(a=>a.divisionId)].filter(id=>b.ctx.organizationIds("nicejobs.knowledge.read").includes(id));
      const records = await db.niceJobsKnowledgeVersion.findMany({where:{content:{companyId:b.company.id,kind:"RESOURCE"},organizationId:{in:orgs},visibility:"WORKER",status:"PUBLISHED",current:true,privateReference:{not:null},resourceType:{in:["PDF","IMAGE","VIDEO","AUDIO"]},AND:[{OR:[{effectiveAt:null},{effectiveAt:{lte:now}}]},{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}],OR:[{audience:"COMPANY",organizationId:b.company.id},{audience:"DIVISION",organizationId:{in:v.areas.map(a=>a.divisionId)}},{audience:"JOB",jobId:v.templateId},{audience:"JOB_VERSION",jobVersionId:v.id}]},select:{id:true,title:true,number:true,resourceType:true,privateReference:true,organizationId:true},orderBy:{title:"asc"},take:50});
      const files = await db.niceJobsContentFile.findMany({where:{id:{in:records.flatMap(r=>r.privateReference?[r.privateReference]:[])},companyId:b.company.id,organizationId:{in:orgs}},select:{id:true,organizationId:true},take:50});
      return records.filter(r=>files.some(f=>f.id===r.privateReference && f.organizationId===r.organizationId)).map(r=>({id:r.id,name:r.title+" / v"+r.number,type:r.resourceType!}));
    });
  }
  return { create, edit, newVersion, changeJob, jobs, detail, assign, transition, workforce, options, seedKnown, seedInitialOpportunities, opportunityOptions, people, visibility, trainingResources };
}
export const niceJobsService = createNiceJobsService();
