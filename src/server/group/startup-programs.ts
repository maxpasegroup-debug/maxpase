import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { createAiraService } from "@/server/domain/aira-service";
import { createBossRegistry } from "./boss-registry";
import { createBossService } from "./boss-service";

const publicationKind = "STARTUP_PROGRAM_PUBLICATION_REQUEST";
const publicationPayload = z.object({ programId: z.string().min(1), programUpdatedAt: z.iso.datetime({ offset: true }), brandId: z.string().min(1), commercialApproval: z.literal(false), writtenTermsReference: z.string().min(1) }).strict();
export function canDecidePublication(request: { status: string; version: number; ownerPersonId: string }, actorPersonId: string | null, expectedVersion: number) {
  return !!actorPersonId && actorPersonId !== request.ownerPersonId && request.status === "PENDING" && request.version === expectedVersion;
}

const draftFields = z.object({
  deliveryFormat: z.string().trim().max(200).nullable(),
  curriculum: z.string().trim().max(4000).nullable(),
  learningOutcomes: z.string().trim().max(4000).nullable(),
  eligibility: z.string().trim().max(2000).nullable(),
  intendedAudience: z.string().trim().max(2000).nullable(),
  tierProposal: z.string().trim().max(4000).nullable(),
  writtenTermsReference: z.string().trim().max(300).nullable(),
  deliveryArrangements: z.string().trim().max(2000).nullable()
}).strict();
export type StartupProgramDraft = z.infer<typeof draftFields>;
export function readStartupDraft(raw: string | null): StartupProgramDraft | null {
  try { return draftFields.parse(JSON.parse(raw ?? "null")?.startupProgramDraft); } catch { return null; }
}
export const lifecycleStatuses = ["DRAFT", "ACTIVE", "PAUSED", "RETIRED", "ARCHIVED"] as const;
export function allowedStartupChange(current: string, next: string): boolean {
  return current === "ACTIVE" && next === "PAUSED" || current !== "ARCHIVED" && next === "ARCHIVED";
}
export function startupProgramWhere(companyId: string, divisionId: string, brandId: string, search = "", status?: string): Prisma.ProgramWhereInput {
  const term = search.trim().slice(0, 100);
  return { companyOrganizationId: companyId, organizationId: divisionId,
    AND: [{ OR: [{ brandId }, { brandId: null }] }, ...(term ? [{ OR: [{ name: { contains: term, mode: "insensitive" as const } }, { slug: { contains: term, mode: "insensitive" as const } }] }] : [])],
    ...(status && lifecycleStatuses.includes(status as typeof lifecycleStatuses[number]) ? { status } : {}) };
}

export function createStartupPrograms(client: PrismaClient = prisma) {
  const registry = createBossRegistry(client), aira = createAiraService(client), boss = createBossService(client);
  async function brand(userId: string, brandId: string, manage = false) {
    const context = await registry.brand(userId, brandId);
    if (!context.startupDivision || context.programs === null || (manage && !context.canManagePrograms)) throw new AccessError("Startup programme unavailable");
    return context;
  }
  async function scopedProgram(userId: string, brandId: string, programId: string, manage = false) {
    const context = await brand(userId, brandId, manage);
    const row = await client.program.findFirst({ where: { id: programId, organizationId: context.startupDivision!, companyOrganizationId: context.row.organizationId, OR: [{ brandId }, { brandId: null }] } });
    if (!row) throw new AccessError("Startup programme unavailable");
    return { context, row };
  }
  async function list(userId: string, brandId: string, query: { search?: string; status?: string } = {}) {
    const context = await brand(userId, brandId);
    const rows = await client.program.findMany({ where: startupProgramWhere(context.row.organizationId, context.startupDivision!, brandId, query.search, query.status), orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 101 });
    const requests = await client.executiveRecord.findMany({ where: { kind: publicationKind, organizationId: context.startupDivision!, sourceKey: { in: rows.map(row => `startup:program-publication:${row.id}:${row.updatedAt.toISOString()}`) } }, select: { id: true, sourceKey: true, status: true, version: true, ownerPersonId: true }, take: 101 });
    const requestByKey = new Map(requests.map(request => [request.sourceKey, request]));
    return { brand: context.row, divisionId: context.startupDivision!, canManage: context.canManagePrograms, rows: rows.slice(0, 100).map(row => ({ ...row, draft: readStartupDraft(row.metadata), publicationRequest: requestByKey.get(`startup:program-publication:${row.id}:${row.updatedAt.toISOString()}`) ?? null })), hasMore: rows.length > 100 };
  }
  async function saveDraft(userId: string, brandId: string, raw: unknown, programId?: string) {
    const context = await brand(userId, brandId, true);
    const data = z.object({ name: z.string().trim().min(1).max(200), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120), description: z.string().max(4000).nullable(), durationDays: z.number().int().positive().nullable(), capacity: z.number().int().positive().nullable(), priceMinor: z.number().int().min(0).nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable(), draft: draftFields }).strict().parse(raw);
    const previous = programId ? await scopedProgram(userId, brandId, programId, true) : null;
    if (previous && !["DRAFT", "PAUSED"].includes(previous.row.status)) throw new AccessError("Only draft or paused programmes can be edited here");
    let metadata: Record<string, unknown> = {};
    if (previous?.row.metadata) { try { metadata = JSON.parse(previous.row.metadata) as Record<string, unknown>; } catch { throw new AccessError("Existing programme configuration is unavailable"); } }
    const { draft, ...fields } = data;
    return aira.save(userId, "programs", { organizationId: context.startupDivision!, brandId: previous ? previous.row.brandId : brandId, productId: previous?.row.productId ?? null, kind: previous?.row.kind ?? "PROGRAM", status: previous?.row.status ?? "DRAFT", ...fields, metadata: { ...metadata, startupProgramDraft: draft } }, programId);
  }
  async function changeStatus(userId: string, brandId: string, programId: string, next: "PAUSED" | "ARCHIVED") {
    const { row } = await scopedProgram(userId, brandId, programId, true);
    if (!allowedStartupChange(row.status, next)) throw new AccessError("Programme transition unavailable");
    return aira.save(userId, "programs", { organizationId: row.organizationId, name: row.name, slug: row.slug, description: row.description, kind: row.kind, status: next, durationDays: row.durationDays, capacity: row.capacity, priceMinor: row.priceMinor, currency: row.currency, brandId: row.brandId, productId: row.productId, metadata: row.metadata ? JSON.parse(row.metadata) : null }, row.id);
  }
  async function requestPublication(userId: string, brandId: string, programId: string) {
    const { context, row } = await scopedProgram(userId, brandId, programId, true);
    if (context.row.status !== "ACTIVE" || context.row.organization.status !== "ACTIVE" || !context.startupDivisionActive) throw new AccessError("Startup School scope is inactive");
    if (row.status !== "DRAFT" && row.status !== "PAUSED") throw new AccessError("Only draft or paused programmes can request publication");
    const termsReference = readStartupDraft(row.metadata)?.writtenTermsReference;
    if (!row.name || !row.description || !row.durationDays || !termsReference) throw new AccessError("Complete the programme description, duration and proposed terms reference first");
    const sourceKey = `startup:program-publication:${row.id}:${row.updatedAt.toISOString()}`;
    return client.$transaction(async db => {
      const current = await db.program.findUnique({ where: { id: row.id }, select: { updatedAt: true, status: true } });
      if (!current || current.status !== row.status || current.updatedAt.getTime() !== row.updatedAt.getTime()) throw new AccessError("Programme changed; reload before requesting review");
      const existing = await db.executiveRecord.findUnique({ where: { sourceKey }, select: { id: true, status: true } });
      if (existing) {
        if (existing.status !== "PENDING") throw new AccessError("Revise the draft before requesting another publication review");
        return existing;
      }
      const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
      if (!actor?.personId) throw new AccessError("Programme requester unavailable");
      const request = await db.executiveRecord.create({ data: { kind: publicationKind, organizationId: context.startupDivision!, ownerPersonId: actor.personId, title: `Publication review: ${row.name}`, status: "PENDING", sourceKey, payload: JSON.stringify({ programId: row.id, programUpdatedAt: row.updatedAt.toISOString(), brandId, commercialApproval: false, writtenTermsReference: termsReference }), history: { create: { actorUserId: userId, fromStatus: null, toStatus: "PENDING", reason: "Publication review requested; proposed written terms are not commercial approval" } } } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor.personId, organizationId: context.startupDivision!, action: "program.publication_requested", entityType: "Program", entityId: row.id, result: "SUCCESS", metadata: { requestId: request.id } });
      return request;
    });
  }
  async function decidePublication(userId: string, brandId: string, programId: string, raw: unknown) {
    const input = z.object({ requestId: z.string().min(1), version: z.number().int().min(0), decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().min(8).max(1000), evidenceReference: z.string().trim().min(8).max(300) }).strict().parse(raw);
    const { context } = await scopedProgram(userId, brandId, programId, true);
    if (context.row.status !== "ACTIVE" || context.row.organization.status !== "ACTIVE" || !context.startupDivisionActive) throw new AccessError("Startup School scope is inactive");
    return client.$transaction(async db => {
      const { ctx } = await boss.authority(userId, db);
      await ctx.requireAccess("program.manage", { organizationId: context.startupDivision! });
      const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
      const program = await db.program.findFirst({ where: { id: programId, organizationId: context.startupDivision!, companyOrganizationId: context.row.organizationId, OR: [{ brandId }, { brandId: null }] } });
      const request = await db.executiveRecord.findFirst({ where: { id: input.requestId, kind: publicationKind, organizationId: context.startupDivision! } });
      if (!program || !request || !canDecidePublication(request, actor?.personId ?? null, input.version)) throw new AccessError("Independent publication decision unavailable");
      let payload: z.infer<typeof publicationPayload>;
      try { payload = publicationPayload.parse(JSON.parse(request.payload)); } catch { throw new AccessError("Publication evidence unavailable"); }
      if (payload.programId !== program.id || payload.brandId !== brandId || request.sourceKey !== `startup:program-publication:${program.id}:${payload.programUpdatedAt}` ||
        program.updatedAt.toISOString() !== payload.programUpdatedAt || !["DRAFT", "PAUSED"].includes(program.status) ||
        readStartupDraft(program.metadata)?.writtenTermsReference !== payload.writtenTermsReference) throw new AccessError("Programme changed; request a new review");
      if (input.decision === "APPROVED" && (await db.program.updateMany({ where: { id: program.id, status: program.status, updatedAt: program.updatedAt }, data: { status: "ACTIVE" } })).count !== 1) throw new AccessError("Programme changed; request a new review");
      if ((await db.executiveRecord.updateMany({ where: { id: request.id, status: "PENDING", version: input.version }, data: { status: input.decision, version: { increment: 1 } } })).count !== 1) throw new AccessError("Publication decision already recorded");
      await db.executiveHistory.create({ data: { recordId: request.id, actorUserId: userId, fromStatus: "PENDING", toStatus: input.decision, reason: `${input.reason} | Evidence: ${input.evidenceReference}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor!.personId, organizationId: context.startupDivision!, action: `program.publication_${input.decision.toLowerCase()}`, entityType: "Program", entityId: program.id, result: "SUCCESS", metadata: { requestId: request.id, evidenceReference: input.evidenceReference, commercialApproval: false } });
      return { status: input.decision };
    });
  }
  return { list, scopedProgram, saveDraft, changeStatus, requestPublication, decidePublication };
}
export const startupPrograms = createStartupPrograms();
