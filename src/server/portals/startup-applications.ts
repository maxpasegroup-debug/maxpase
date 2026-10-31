import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { requirePortalAccess } from "./policy";
import { requireStartupStaffAccess } from "./startup-staff-access";
import { createBossService } from "@/server/group/boss-service";
import { assertStartupPilotEnrollmentReady } from "./startup-pilot-register";

const tiers = ["STARTER", "PRO", "EXTRAORDINARY"] as const;
export const startupApplicationInput = z.object({ tier: z.enum(tiers), idea: z.string().trim().min(20).max(1500), goal: z.string().trim().min(20).max(1500), experience: z.string().trim().min(10).max(1000), location: z.string().trim().min(2).max(120), timeCommitment: z.string().trim().min(5).max(250), consent: z.literal(true) }).strict();
const reviewInput = z.object({ id: z.string().min(1).max(200), version: z.number().int().min(0), decision: z.enum(["IN_REVIEW", "APPROVED", "REJECTED"]), reason: z.string().trim().min(5).max(1000) }).strict();
const kind = "STARTUP_APPLICATION";
const statuses = new Set(["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED"]);
export function canReviewStartupApplication(current: { status: string; version: number; ownerPersonId: string }, actorPersonId: string | null, expectedVersion: number, decision: "IN_REVIEW" | "APPROVED" | "REJECTED") {
  return !!actorPersonId && actorPersonId !== current.ownerPersonId && current.version === expectedVersion &&
    ["SUBMITTED", "IN_REVIEW"].includes(current.status) && (decision !== "IN_REVIEW" || current.status === "SUBMITTED");
}
export function canConfirmStartupAdmission(application: { status: string; version: number; ownerPersonId: string; reviewerPersonId: string | null }, actorPersonId: string | null, expectedVersion: number) {
  return !!actorPersonId && application.status === "APPROVED" && application.version === expectedVersion &&
    actorPersonId !== application.ownerPersonId && !!application.reviewerPersonId && actorPersonId !== application.reviewerPersonId;
}
export function startupPbaProgramWhere(programId: string, companyId: string, divisionId: string, brandId: string): Prisma.ProgramWhereInput {
  return { id: programId, companyOrganizationId: companyId, organizationId: divisionId, status: { in: ["DRAFT", "ACTIVE", "PAUSED"] }, OR: [{ brandId }, { brandId: null }], product: { organizationId: companyId, slug: "pba", divisionId } };
}
const storedApplicationInput = startupApplicationInput.extend({ noticeVersion: z.literal(1), programId: z.string().min(1).max(200).optional() });
export type StartupApplicationPayload = z.infer<typeof storedApplicationInput>;
export function parseStartupApplicationPayload(raw: string): StartupApplicationPayload {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new AccessError("Application data unavailable"); }
  const parsed = storedApplicationInput.safeParse(value);
  if (!parsed.success) throw new Error("Application data unavailable");
  return parsed.data;
}
const parsePayload = parseStartupApplicationPayload;
export function createStartupApplications(client: PrismaClient = prisma) {
  async function bossReviewScope(db: Prisma.TransactionClient, userId: string, brandId: string) {
    const { ctx, root } = await createBossService(client).authority(userId, db);
    const brand = await db.brand.findUnique({ where: { id: brandId }, select: { slug: true, status: true, organizationId: true, organization: { select: { slug: true, type: true, status: true, parentId: true, company: { select: { status: true } } } } } });
    if (!brand || brand.slug !== "startup-school" || brand.status !== "ACTIVE" || brand.organization.slug !== "aira-skill-city" || brand.organization.type !== "COMPANY" || brand.organization.parentId !== root.id || brand.organization.status !== "ACTIVE" || brand.organization.company?.status !== "ACTIVE") throw new AccessError("Startup Skool brand unavailable");
    const division = await db.organization.findFirst({ where: { slug: "aira-startup-school", parentId: brand.organizationId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } });
    if (!division) throw new AccessError("Startup Skool scope unavailable");
    await ctx.requireAccess("brand.read", { organizationId: brand.organizationId });
    await ctx.requireAccess("company.read", { organizationId: brand.organizationId });
    await ctx.requireAccess("program.manage", { organizationId: division.id });
    await ctx.requireAccess("person.read", { organizationId: division.id });
    return { divisionId: division.id, companyId: brand.organizationId };
  }
  async function applicant(userId: string) {
    const access = await requirePortalAccess(client, userId, "startup");
    const user = await client.user.findUnique({ where: { id: userId }, select: { personId: true, emailVerifiedAt: true, person: { select: { displayName: true, metadata: true } } } });
    if (!user?.personId || !user.emailVerifiedAt || JSON.parse(user.person?.metadata ?? "{}").authenticationRealm !== "startup") throw new AccessError("Verified applicant account required");
    return { access, personId: user.personId, name: user.person!.displayName };
  }
  async function mine(userId: string) {
    const { access, personId, name } = await applicant(userId);
    const row = await client.executiveRecord.findUnique({ where: { sourceKey: `startup:application:${userId}` }, select: { id: true, organizationId: true, ownerPersonId: true, status: true, payload: true, createdAt: true, updatedAt: true } });
    if (row && (row.organizationId !== access.divisionId || row.ownerPersonId !== personId || !statuses.has(row.status))) throw new AccessError("Application unavailable");
    return { name, application: row ? { id: row.id, status: row.status, tier: parsePayload(row.payload).tier, createdAt: row.createdAt, updatedAt: row.updatedAt } : null };
  }
  async function submit(userId: string, raw: unknown) {
    const input = startupApplicationInput.parse(raw);
    const { access, personId } = await applicant(userId);
    const sourceKey = `startup:application:${userId}`;
    try { return await client.$transaction(async db => {
      await requirePortalAccess(db, userId, "startup");
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerifiedAt: true, personId: true, person: { select: { metadata: true } } } });
      if (!user.emailVerifiedAt || user.personId !== personId || JSON.parse(user.person?.metadata ?? "{}").authenticationRealm !== "startup") throw new AccessError("Applicant identity changed");
      const prior = await db.executiveRecord.findUnique({ where: { sourceKey }, select: { id: true, organizationId: true, ownerPersonId: true } });
      if (prior) {
        if (prior.organizationId !== access.divisionId || prior.ownerPersonId !== personId) throw new AccessError("Application unavailable");
        return { id: prior.id, duplicate: true };
      }
      const row = await db.executiveRecord.create({ data: { kind, organizationId: access.divisionId, ownerPersonId: personId, title: "PBA entrepreneur journey application", status: "SUBMITTED", sourceKey, payload: JSON.stringify({ ...input, noticeVersion: 1 }) } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, toStatus: "SUBMITTED", reason: "Applicant submitted the journey application" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: personId, organizationId: access.divisionId, action: "startup.application.submitted", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { tierPreference: input.tier, noticeVersion: 1 } });
      return { id: row.id, duplicate: false };
    }); } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      const prior = await client.executiveRecord.findUnique({ where: { sourceKey }, select: { id: true, organizationId: true, ownerPersonId: true } });
      if (!prior || prior.organizationId !== access.divisionId || prior.ownerPersonId !== personId) throw new AccessError("Application unavailable");
      return { id: prior.id, duplicate: true };
    }
  }
  async function queue(userId: string) {
    const access = await requireStartupStaffAccess(client, userId);
    const rows = await client.executiveRecord.findMany({ where: { organizationId: access.divisionId, kind, status: { in: ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED"] } }, select: { id: true, status: true, version: true, payload: true, createdAt: true, owner: { select: { displayName: true } }, history: { select: { fromStatus: true, toStatus: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 } }, orderBy: { createdAt: "asc" }, take: 50 });
    return rows.map(row => ({ ...row, payload: parsePayload(row.payload) }));
  }
  async function reviewAuthorized(userId: string, raw: unknown, authority: { kind: "STAFF" } | { kind: "BOSS"; brandId: string }) {
    const input = reviewInput.parse(raw);
    return client.$transaction(async db => {
      let divisionId: string;
      if (authority.kind === "BOSS") {
        divisionId = (await bossReviewScope(db, userId, authority.brandId)).divisionId;
      } else divisionId = (await requireStartupStaffAccess(db, userId)).divisionId;
      const actor = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
      const row = await db.executiveRecord.findFirst({ where: { id: input.id, organizationId: divisionId, kind, sourceKey: { startsWith: "startup:application:" } }, select: { id: true, ownerPersonId: true, version: true, status: true } });
      if (!row || !canReviewStartupApplication(row, actor.personId, input.version, input.decision)) throw new AccessError("Application decision unavailable or already recorded");
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, organizationId: divisionId, kind, sourceKey: { startsWith: "startup:application:" }, version: input.version, status: row.status }, data: { status: input.decision, version: { increment: 1 } } })).count !== 1) throw new AccessError("Application changed. Refresh before deciding");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: input.decision, reason: input.reason } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor.personId, organizationId: divisionId, action: `startup.application.${input.decision.toLowerCase()}`, entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { previousStatus: row.status, nextStatus: input.decision, version: input.version + 1 } });
      return { id: row.id, status: input.decision };
    });
  }
  async function review(userId: string, raw: unknown) { return reviewAuthorized(userId, raw, { kind: "STAFF" }); }
  async function reviewForBoss(userId: string, brandId: string, raw: unknown) { return reviewAuthorized(userId, raw, { kind: "BOSS", brandId }); }
  async function associateProgramForBoss(userId: string, brandId: string, raw: unknown) {
    const input = z.object({ id: z.string().min(1).max(200), version: z.number().int().min(0), programId: z.string().min(1).max(200) }).strict().parse(raw);
    return client.$transaction(async db => {
      const { divisionId, companyId } = await bossReviewScope(db, userId, brandId);
      const program = await db.program.findFirst({ where: startupPbaProgramWhere(input.programId, companyId, divisionId, brandId), select: { id: true } });
      if (!program) throw new AccessError("A verified PBA programme in this brand is required");
      const row = await db.executiveRecord.findFirst({ where: { id: input.id, organizationId: divisionId, kind, sourceKey: { startsWith: "startup:application:" } }, select: { id: true, ownerPersonId: true, status: true, version: true, payload: true } });
      const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
      if (!row || !actor?.personId || actor.personId === row.ownerPersonId || row.version !== input.version || !["SUBMITTED", "IN_REVIEW"].includes(row.status)) throw new AccessError("Application association unavailable or already decided");
      const payload = parseStartupApplicationPayload(row.payload);
      if (payload.programId === program.id) return { id: row.id, duplicate: true };
      if (payload.programId) throw new AccessError("Programme association already recorded");
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, organizationId: divisionId, kind, version: row.version, status: row.status }, data: { payload: JSON.stringify({ ...payload, programId: program.id }), version: { increment: 1 } } })).count !== 1) throw new AccessError("Application changed. Refresh before linking a programme");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: row.status, reason: "PBA programme association recorded for review; no admission or enrolment authority granted" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor.personId, organizationId: divisionId, action: "startup.application.programme_associated", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { programId: program.id, version: row.version + 1 } });
      return { id: row.id, duplicate: false };
    });
  }
  async function confirmAdmissionForBoss(userId: string, brandId: string, raw: unknown) {
    const input = z.object({ applicationId: z.string().min(1).max(200), version: z.number().int().min(0), batchId: z.string().min(1).max(200), reason: z.string().trim().min(8).max(1000) }).strict().parse(raw);
    try { return await client.$transaction(async db => {
      const { divisionId, companyId } = await bossReviewScope(db, userId, brandId);
      await (await createBossService(client).authority(userId, db)).ctx.requireAccess("batch.manage", { organizationId: divisionId });
      const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
      const application = await db.executiveRecord.findFirst({ where: { id: input.applicationId, kind, organizationId: divisionId, sourceKey: { startsWith: "startup:application:" } },
        select: { id: true, ownerPersonId: true, status: true, version: true, payload: true, history: { where: { toStatus: "APPROVED" }, select: { actor: { select: { personId: true } } }, take: 1 } } });
      if (!actor?.personId || !application || !canConfirmStartupAdmission({ ...application, reviewerPersonId: application.history.length === 1 ? application.history[0].actor.personId : null }, actor.personId, input.version)) throw new AccessError("Independent admission decision unavailable");
      const payload = parseStartupApplicationPayload(application.payload);
      if (!payload.programId) throw new AccessError("Associate the approved application with a PBA programme first");
      const batch = await db.batch.findFirst({ where: { id: input.batchId, status: "ACTIVE", programId: payload.programId, program: startupPbaProgramWhere(payload.programId, companyId, divisionId, brandId) }, select: { id: true, program: { select: { id: true, organizationId: true, productId: true, status: true } } } });
      if (!batch || batch.program.status !== "ACTIVE") throw new AccessError("Active PBA programme and intake required");
      await assertStartupPilotEnrollmentReady(db, batch.program, batch.id, application.ownerPersonId, false);
      const sourceKey = `startup:admission:${application.id}`;
      const existing = await db.executiveRecord.findUnique({ where: { sourceKey }, select: { id: true, organizationId: true, kind: true } });
      if (existing) {
        if (existing.organizationId !== divisionId || existing.kind !== "STARTUP_ADMISSION") throw new AccessError("Admission record unavailable");
        return { id: existing.id, duplicate: true };
      }
      const row = await db.executiveRecord.create({ data: { kind: "STARTUP_ADMISSION", organizationId: divisionId, ownerPersonId: application.ownerPersonId, title: "PBA admission confirmed", status: "CONFIRMED", sourceKey, payload: JSON.stringify({ applicationId: application.id, programId: batch.program.id, batchId: batch.id, applicationVersion: input.version }), history: { create: { actorUserId: userId, fromStatus: null, toStatus: "CONFIRMED", reason: input.reason } } } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor.personId, organizationId: divisionId, action: "startup.admission.confirmed", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { applicationId: application.id, batchId: batch.id } });
      return { id: row.id, duplicate: false };
    }); } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      // A concurrent request may win the unique source key. Return only the scoped record.
      const { divisionId } = await client.$transaction(db => bossReviewScope(db, userId, brandId));
      const prior = await client.executiveRecord.findUnique({ where: { sourceKey: `startup:admission:${input.applicationId}` }, select: { id: true, kind: true, organizationId: true } });
      if (!prior || prior.kind !== "STARTUP_ADMISSION" || prior.organizationId !== divisionId) throw new AccessError("Admission record unavailable");
      return { id: prior.id, duplicate: true };
    }
  }
  return { mine, submit, queue, review, reviewForBoss, associateProgramForBoss, confirmAdmissionForBoss };
}
export const startupApplications = createStartupApplications();
