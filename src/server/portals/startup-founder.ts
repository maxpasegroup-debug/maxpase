import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { requirePortalAccess } from "./policy";
import { requireStartupStaffAccess } from "./startup-staff-access";
import { assertStartupPilotEnrollmentReady } from "./startup-pilot-register";

const id = z.string().min(1).max(200);
const tier = z.enum(["STARTER", "PRO", "EXTRAORDINARY"]);
const communityFor = { STARTER: "MENTORING", PRO: "MENTORING", EXTRAORDINARY: "TRAINING" } as const;
const milestone = z.object({ key: z.string().regex(/^[a-z0-9-]{2,40}$/), title: z.string().trim().min(3).max(120), practice: z.string().trim().min(20).max(1200), evidencePrompt: z.string().trim().min(10).max(500) }).strict();
export const founderPlanInput = z.object({ tier, termsApprovalRef: z.string().trim().min(8).max(300), milestones: z.array(milestone).min(1).max(24) }).strict().refine(value => new Set(value.milestones.map(item => item.key)).size === value.milestones.length, "Milestone keys must be unique");
const planPayload = founderPlanInput.extend({ batchId: id, programId: id, preparedByUserId: id, community: z.enum(["MENTORING", "TRAINING"]), version: z.literal(1) }).strict();
const evidenceInput = z.object({ batchId: id, milestoneKey: z.string().regex(/^[a-z0-9-]{2,40}$/), text: z.string().trim().min(20).max(4000), version: z.number().int().min(0).optional() }).strict();
const evidencePayload = z.object({ batchId: id, participantId: id, planId: id, milestoneKey: z.string(), text: z.string(), version: z.literal(1) }).strict();
const reviewInput = z.object({ evidenceId: id, version: z.number().int().min(0), decision: z.enum(["ACCEPTED", "REWORK_REQUIRED"]), feedback: z.string().trim().min(10).max(1200) }).strict();
const noteInput = z.object({ batchId: id, title: z.string().trim().min(3).max(120), message: z.string().trim().min(10).max(2000) }).strict();
const notePayload = noteInput.extend({ planId: id, community: z.enum(["MENTORING", "TRAINING"]), version: z.literal(1) }).strict();
const PLAN = "STARTUP_FOUNDER_PLAN", EVIDENCE = "STARTUP_FOUNDER_EVIDENCE", NOTE = "STARTUP_COMMUNITY_NOTE";
const planKey = (batchId: string) => `startup:founder-plan:${batchId}`;
const evidenceKey = (participantId: string, key: string) => `startup:founder-evidence:${participantId}:${key}`;
function parse<T>(schema: z.ZodType<T>, value: string): T { try { return schema.parse(JSON.parse(value)); } catch { throw new AccessError("Founder record unavailable"); } }
function assertCurrentPlan(value: z.infer<typeof planPayload>) { if (value.community !== communityFor[value.tier]) throw new AccessError("Community configuration is inconsistent"); }

export function createStartupFounderService(client: PrismaClient = prisma) {
  async function enrollment(db: Prisma.TransactionClient, userId: string, batchId: string, active = false) {
    const access = await requirePortalAccess(db, userId, "startup");
    const personId = access.ctx.user?.personId;
    if (!personId) throw new AccessError("Student identity unavailable");
    const participant = await db.batchParticipant.findFirst({ where: { batchId, personId, status: active ? "ACTIVE" : { in: ["PLANNED", "ACTIVE"] }, batch: { status: active ? "ACTIVE" : { in: ["PLANNED", "ACTIVE"] }, program: { organizationId: access.divisionId, companyOrganizationId: access.companyId, status: "ACTIVE" } } }, include: { batch: { include: { program: { select: { id: true, name: true, productId: true, organizationId: true } } } } } });
    if (!participant) throw new AccessError("Founder enrollment unavailable");
    if (active) await assertStartupPilotEnrollmentReady(db, participant.batch.program, batchId, personId);
    return { access, personId, participant };
  }
  async function managedBatch(db: Prisma.TransactionClient, userId: string, batchId: string) {
    const access = await requireStartupStaffAccess(db, userId);
    await access.ctx.requireAccess("program.manage", { organizationId: access.divisionId });
    const batch = await db.batch.findFirst({ where: { id: batchId, program: { organizationId: access.divisionId, companyOrganizationId: access.companyId, status: "ACTIVE" } }, include: { program: { select: { id: true, name: true } } } });
    if (!batch) throw new AccessError("Programme unavailable");
    const actor = access.ctx.user?.personId;
    if (!actor) throw new AccessError("Reviewer identity unavailable");
    return { access, batch, actor };
  }
  async function approvedPlan(db: Prisma.TransactionClient, batchId: string, organizationId: string) {
    const row = await db.executiveRecord.findUnique({ where: { sourceKey: planKey(batchId) } });
    if (!row || row.kind !== PLAN || row.organizationId !== organizationId || row.status !== "APPROVED") return null;
    const payload = parse(planPayload, row.payload);
    if (payload.batchId !== batchId) throw new AccessError("Founder plan unavailable");
    assertCurrentPlan(payload);
    return { row, payload };
  }
  async function dashboard(userId: string) {
    const access = await requirePortalAccess(client, userId, "startup");
    const personId = access.ctx.user?.personId;
    if (!personId) throw new AccessError("Student identity unavailable");
    const rows = await client.batchParticipant.findMany({ where: { personId, status: { in: ["PLANNED", "ACTIVE"] }, batch: { status: { in: ["PLANNED", "ACTIVE"] }, program: { organizationId: access.divisionId, companyOrganizationId: access.companyId, status: "ACTIVE" } } }, include: { batch: { include: { program: { select: { id: true, name: true, productId: true, organizationId: true } } } } }, orderBy: { createdAt: "desc" }, take: 30 });
    return Promise.all(rows.map(async participant => {
      const batch = participant.batch;
      const plan = await approvedPlan(client, batch.id, access.divisionId);
      let open = participant.status === "ACTIVE" && batch.status === "ACTIVE" && !!plan;
      if (open) {
        try { await assertStartupPilotEnrollmentReady(client, batch.program, batch.id, personId); }
        catch (error) { if (!(error instanceof AccessError)) throw error; open = false; }
      }
      const submissions = open ? await client.executiveRecord.findMany({ where: { kind: EVIDENCE, organizationId: access.divisionId, ownerPersonId: personId, sourceKey: { startsWith: `startup:founder-evidence:${participant.id}:` } }, select: { id: true, sourceKey: true, status: true, version: true, payload: true, history: { select: { reason: true, toStatus: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 } }, take: 24 }) : [];
      const notes = open && plan ? await client.executiveRecord.findMany({ where: { kind: NOTE, organizationId: access.divisionId, sourceKey: { startsWith: `startup:community:${plan.row.id}:` }, status: "PUBLISHED" }, select: { id: true, payload: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 }) : [];
      return { participantId: participant.id, batchId: batch.id, batch: batch.name, program: batch.program.name, status: participant.status, plan: open && plan ? { id: plan.row.id, tier: plan.payload.tier, community: plan.payload.community, milestones: plan.payload.milestones.map(m => ({ ...m, submission: submissions.find(s => s.sourceKey === evidenceKey(participant.id, m.key)) ? (() => { const s = submissions.find(item => item.sourceKey === evidenceKey(participant.id, m.key))!; const payload = parse(evidencePayload, s.payload); if (payload.planId !== plan.row.id || payload.participantId !== participant.id) throw new AccessError("Founder evidence unavailable"); return { id: s.id, status: s.status, version: s.version, text: payload.text, feedback: s.history.filter(h => h.toStatus === "ACCEPTED" || h.toStatus === "REWORK_REQUIRED").map(h => ({ status: h.toStatus, text: h.reason, at: h.createdAt })) }; })() : null })), notes: notes.map(n => { const value = parse(notePayload, n.payload); if (value.planId !== plan.row.id || value.batchId !== batch.id || value.community !== plan.payload.community) throw new AccessError("Community note unavailable"); return { id: n.id, title: value.title, message: value.message, createdAt: n.createdAt }; }) } : null };
    }));
  }
  async function savePlan(userId: string, batchId: string, raw: unknown) {
    const input = founderPlanInput.parse(raw);
    return client.$transaction(async db => {
      const { access, batch, actor } = await managedBatch(db, userId, batchId);
      if (!["PLANNED", "ACTIVE"].includes(batch.status)) throw new AccessError("Batch unavailable");
      const existing = await db.executiveRecord.findUnique({ where: { sourceKey: planKey(batchId) } });
      if (existing && (existing.kind !== PLAN || existing.organizationId !== access.divisionId || existing.status !== "DRAFT")) throw new AccessError("Approved plan cannot be changed");
      const payload = { ...input, batchId, programId: batch.program.id, community: communityFor[input.tier], preparedByUserId: userId, version: 1 };
      const row = existing ? await db.executiveRecord.update({ where: { id: existing.id, version: existing.version }, data: { payload: JSON.stringify(payload), version: { increment: 1 } } }) : await db.executiveRecord.create({ data: { kind: PLAN, organizationId: access.divisionId, ownerPersonId: actor, title: `${batch.name} founder plan`, status: "DRAFT", sourceKey: planKey(batchId), payload: JSON.stringify(payload) } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: existing?.status, toStatus: "DRAFT", reason: existing ? "Founder plan draft revised" : "Founder plan draft created" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor, organizationId: access.divisionId, action: "startup.founder_plan.drafted", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS" });
      return row.id;
    });
  }
  async function approvePlan(userId: string, batchId: string, version: number) {
    return client.$transaction(async db => {
      const { access, batch, actor } = await managedBatch(db, userId, batchId);
      if (batch.status !== "ACTIVE") throw new AccessError("Active batch required");
      const row = await db.executiveRecord.findUnique({ where: { sourceKey: planKey(batchId) } });
      if (!row || row.kind !== PLAN || row.organizationId !== access.divisionId || row.status !== "DRAFT" || row.version !== version) throw new AccessError("Plan changed or unavailable");
      const payload = parse(planPayload, row.payload);
      assertCurrentPlan(payload);
      if (payload.programId !== batch.program.id || payload.preparedByUserId === userId || row.ownerPersonId === actor) throw new AccessError("Independent plan review required");
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, status: "DRAFT", version }, data: { status: "APPROVED", version: { increment: 1 } } })).count !== 1) throw new AccessError("Plan changed or unavailable");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: "DRAFT", toStatus: "APPROVED", reason: `Reviewed plan against terms approval reference ${payload.termsApprovalRef}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor, organizationId: access.divisionId, action: "startup.founder_plan.approved", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { tier: payload.tier, termsApprovalRef: payload.termsApprovalRef } });
      return row.id;
    });
  }
  async function submit(userId: string, raw: unknown) {
    const input = evidenceInput.parse(raw);
    return client.$transaction(async db => {
      const { access, personId, participant } = await enrollment(db, userId, input.batchId, true);
      const plan = await approvedPlan(db, input.batchId, access.divisionId);
      if (!plan || !plan.payload.milestones.some(m => m.key === input.milestoneKey)) throw new AccessError("Milestone unavailable");
      const stepIndex = plan.payload.milestones.findIndex(m => m.key === input.milestoneKey);
      if (stepIndex > 0) {
        const previous = await db.executiveRecord.findUnique({ where: { sourceKey: evidenceKey(participant.id, plan.payload.milestones[stepIndex - 1].key) }, select: { status: true, organizationId: true, ownerPersonId: true } });
        if (!previous || previous.status !== "ACCEPTED" || previous.organizationId !== access.divisionId || previous.ownerPersonId !== personId) throw new AccessError("Complete the previous milestone first");
      }
      const sourceKey = evidenceKey(participant.id, input.milestoneKey);
      const prior = await db.executiveRecord.findUnique({ where: { sourceKey } });
      if (prior && (prior.kind !== EVIDENCE || prior.organizationId !== access.divisionId || prior.ownerPersonId !== personId || prior.status !== "REWORK_REQUIRED" || prior.version !== input.version)) throw new AccessError("Evidence is awaiting review or already accepted");
      const payload = { batchId: input.batchId, participantId: participant.id, planId: plan.row.id, milestoneKey: input.milestoneKey, text: input.text, version: 1 };
      const row = prior ? await db.executiveRecord.update({ where: { id: prior.id, version: prior.version }, data: { payload: JSON.stringify(payload), status: "SUBMITTED", version: { increment: 1 } } }) : await db.executiveRecord.create({ data: { kind: EVIDENCE, organizationId: access.divisionId, ownerPersonId: personId, title: `Founder practice: ${input.milestoneKey}`, status: "SUBMITTED", sourceKey, payload: JSON.stringify(payload) } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: prior?.status, toStatus: "SUBMITTED", reason: prior ? "Revised evidence submitted" : "Practice evidence submitted" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: personId, organizationId: access.divisionId, action: "startup.founder_evidence.submitted", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS" });
      return row.id;
    });
  }
  async function review(userId: string, raw: unknown) {
    const input = reviewInput.parse(raw);
    return client.$transaction(async db => {
      const access = await requireStartupStaffAccess(db, userId);
      await access.ctx.requireAccess("program.manage", { organizationId: access.divisionId });
      const actor = access.ctx.user?.personId;
      const row = await db.executiveRecord.findFirst({ where: { id: input.evidenceId, kind: EVIDENCE, organizationId: access.divisionId }, select: { id: true, ownerPersonId: true, payload: true, status: true, version: true } });
      if (!row || !actor || row.ownerPersonId === actor || row.status !== "SUBMITTED" || row.version !== input.version) throw new AccessError("Evidence unavailable or already reviewed");
      const payload = parse(evidencePayload, row.payload);
      const { batch } = await managedBatch(db, userId, payload.batchId);
      const plan = await approvedPlan(db, payload.batchId, access.divisionId);
      const participant = await db.batchParticipant.findFirst({ where: { id: payload.participantId, batchId: batch.id, personId: row.ownerPersonId, status: "ACTIVE" } });
      if (!participant || plan?.row.id !== payload.planId || !plan.payload.milestones.some(m => m.key === payload.milestoneKey)) throw new AccessError("Evidence context unavailable");
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, version: input.version, status: "SUBMITTED" }, data: { status: input.decision, version: { increment: 1 } } })).count !== 1) throw new AccessError("Evidence changed");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: "SUBMITTED", toStatus: input.decision, reason: input.feedback } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor, organizationId: access.divisionId, action: `startup.founder_evidence.${input.decision.toLowerCase()}`, entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS" });
      return row.id;
    });
  }
  async function management(userId: string) {
    const access = await requireStartupStaffAccess(client, userId);
    await access.ctx.requireAccess("program.manage", { organizationId: access.divisionId });
    const batches = await client.batch.findMany({ where: { status: { in: ["PLANNED", "ACTIVE"] }, program: { organizationId: access.divisionId, companyOrganizationId: access.companyId, status: "ACTIVE" } }, select: { id: true, name: true, status: true, program: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 });
    const plans = await client.executiveRecord.findMany({ where: { kind: PLAN, organizationId: access.divisionId, sourceKey: { in: batches.map(b => planKey(b.id)) } }, select: { id: true, sourceKey: true, status: true, version: true, payload: true }, take: 30 });
    const pending = await client.executiveRecord.findMany({ where: { kind: EVIDENCE, organizationId: access.divisionId, status: "SUBMITTED" }, select: { id: true, owner: { select: { displayName: true } }, payload: true, version: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 50 });
    const decisions = await client.executiveHistory.findMany({ where: { record: { organizationId: access.divisionId, kind: { in: [PLAN, EVIDENCE] } }, toStatus: { in: ["APPROVED", "ACCEPTED", "REWORK_REQUIRED"] } }, select: { id: true, toStatus: true, reason: true, createdAt: true, actor: { select: { person: { select: { displayName: true } } } }, record: { select: { kind: true, title: true } } }, orderBy: { createdAt: "desc" }, take: 10 });
    return { batches: batches.map(batch => { const row = plans.find(p => p.sourceKey === planKey(batch.id)); return { ...batch, plan: row ? { id: row.id, status: row.status, ...parse(planPayload, row.payload), planVersion: row.version } : null }; }), pending: pending.map(row => ({ ...row, ...parse(evidencePayload, row.payload) })), decisions };
  }
  async function postNote(userId: string, raw: unknown) {
    const input = noteInput.parse(raw);
    return client.$transaction(async db => {
      const { access, actor, batch } = await managedBatch(db, userId, input.batchId);
      if (batch.status !== "ACTIVE") throw new AccessError("Active batch required");
      const plan = await approvedPlan(db, input.batchId, access.divisionId);
      if (!plan) throw new AccessError("Approved founder plan required");
      const row = await db.executiveRecord.create({ data: { kind: NOTE, organizationId: access.divisionId, ownerPersonId: actor, title: input.title, status: "PUBLISHED", sourceKey: `startup:community:${plan.row.id}:${randomUUID()}`, payload: JSON.stringify({ ...input, planId: plan.row.id, community: plan.payload.community, version: 1 }) } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, toStatus: "PUBLISHED", reason: "Mentor community update published" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor, organizationId: access.divisionId, action: "startup.community_note.published", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS" });
      return row.id;
    });
  }
  return { dashboard, management, savePlan, approvePlan, submit, review, postNote };
}
export const startupFounderService = createStartupFounderService();
