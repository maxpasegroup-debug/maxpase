import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { requirePortalAccess } from "@/server/portals/policy";
import { createBossService } from "./boss-service";
import { marketingDivisionSlug } from "./brand-marketing-scope";

export type MarketingAccess = "BOSS" | "SKILLCITY";
const id = z.string().min(1).max(200);
const timestamp = z.iso.datetime({ offset: true });
const asset = z.object({ id: z.uuid(), kind: z.enum(["COPY", "BRIEF"]), title: z.string().trim().min(3).max(160), body: z.string().trim().min(10).max(4000) }).strict();
const campaignPayload = z.object({ brandId: id, objective: z.string().trim().min(10).max(2000), channel: z.enum(["SOCIAL", "EMAIL", "WHATSAPP", "IN_APP", "OTHER"]), startsAt: timestamp.nullable(), endsAt: timestamp.nullable(), preparedByUserId: id, assets: z.array(asset).max(20), schemaVersion: z.literal(1) }).strict();
const campaignInput = z.object({ title: z.string().trim().min(3).max(200), objective: campaignPayload.shape.objective, channel: campaignPayload.shape.channel, ownerPersonId: id.nullable(), startsAt: timestamp.nullable(), endsAt: timestamp.nullable(), reference: z.uuid() }).strict();
const assetInput = asset.omit({ id: true });
const workOrderInput = z.object({ title: z.string().trim().min(3).max(200), description: z.string().trim().min(10).max(2000), assigneePersonId: id, dueAt: timestamp, reference: z.uuid() }).strict();
const decisionInput = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().min(8).max(1000), evidenceReference: z.string().trim().min(8).max(300) }).strict();
const kind = "BRAND_MARKETING_CAMPAIGN";

export function parseCampaignPayload(raw: string) {
  try { return campaignPayload.parse(JSON.parse(raw)); } catch { throw new AccessError("Campaign data unavailable"); }
}
export function canDecideCampaign(row: { status: string; version: number; ownerPersonId: string }, actorPersonId: string | null, preparerPersonId: string | null, version: number) {
  return !!actorPersonId && !!preparerPersonId && row.status === "IN_REVIEW" && row.version === version && actorPersonId !== row.ownerPersonId && actorPersonId !== preparerPersonId;
}
export function campaignReady(row: { ownerPersonId: string; payload: ReturnType<typeof parseCampaignPayload> }, now: Date) {
  const { startsAt, endsAt, assets } = row.payload;
  return !!row.ownerPersonId && !!startsAt && !!endsAt && Date.parse(startsAt) > now.getTime() && Date.parse(endsAt) > Date.parse(startsAt) && assets.length > 0;
}

export function createBrandMarketing(client: PrismaClient = prisma, now = () => new Date()) {
  const boss = createBossService(client);
  async function scope(db: Prisma.TransactionClient, userId: string, brandId: string, access: MarketingAccess) {
    const row = await db.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true, slug: true, status: true, organizationId: true, parentBrand: { select: { slug: true, status: true } }, organization: { select: { slug: true, type: true, parentId: true, status: true, company: { select: { status: true } } } } } });
    if (!row || row.status !== "ACTIVE" || row.parentBrand && row.parentBrand.status !== "ACTIVE" || row.organization.type !== "COMPANY" || row.organization.status !== "ACTIVE" || row.organization.company?.status !== "ACTIVE") throw new AccessError("Brand marketing unavailable");
    const companyId = row.organizationId;
    let ctx: Awaited<ReturnType<typeof createAccessContext>>;
    if (access === "BOSS") {
      const authority = await boss.authority(userId, db);
      if (row.organization.parentId !== authority.root.id) throw new AccessError("Brand marketing unavailable");
      ctx = authority.ctx;
      await ctx.requireAccess("brand.read", { organizationId: companyId });
    } else {
      const gateway = await requirePortalAccess(db, userId, "skillcity");
      if (gateway.companyId !== companyId) throw new AccessError("Brand marketing unavailable");
      ctx = gateway.ctx;
    }
    const mapped = row.organization.slug === "aira-skill-city" ? marketingDivisionSlug(row.slug, row.parentBrand?.slug) : undefined;
    const division = mapped ? await db.organization.findFirst({ where: { parentId: companyId, type: "DIVISION", slug: mapped, status: "ACTIVE" }, select: { id: true } }) : null;
    if (mapped && !division) throw new AccessError("Brand division is not configured");
    const organizationId = division?.id ?? companyId;
    await ctx.requireAccess("executive.read", { organizationId });
    if (access === "SKILLCITY") await ctx.requireAccess("organization.read", { organizationId });
    return { row, ctx, organizationId, companyId, canPlan: (await ctx.decide("task.manage", { organizationId })).allowed, canDecide: (await ctx.decide("decision.decide", { organizationId })).allowed && (await ctx.decide("approval.decide", { organizationId })).allowed };
  }
  async function verifiedPerson(db: Prisma.TransactionClient, personId: string, organizationId: string, companyId: string) {
    const person = await db.person.findFirst({ where: { id: personId, status: "ACTIVE", users: { some: { status: "ACTIVE", emailVerifiedAt: { not: null } } }, memberships: { some: { status: "ACTIVE", OR: [{ organizationId }, { organizationId: companyId, scope: "DESCENDANTS" }] } } }, select: { id: true } });
    if (!person) throw new AccessError("Verified owner or assignee in this scope required");
  }
  async function options(userId: string, access: MarketingAccess) {
    const permitted = await (access === "BOSS" ? boss.authority(userId) : requirePortalAccess(client, userId, "skillcity"));
    const companyIds = access === "BOSS" ? (await client.companyProfile.findMany({ where: { organization: { parentId: "root" in permitted ? permitted.root.id : "" } }, select: { organizationId: true }, take: 50 })).map(row => row.organizationId) : ["companyId" in permitted ? permitted.companyId : ""];
    const brands = await client.brand.findMany({ where: { organizationId: { in: companyIds }, status: "ACTIVE", organization: { status: "ACTIVE", company: { status: "ACTIVE" } } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 150 });
    const visible = [];
    for (const brand of brands) { try { await scope(client, userId, brand.id, access); visible.push(brand); } catch (error) { if (!(error instanceof AccessError)) throw error; } }
    return visible;
  }
  async function list(userId: string, brandId: string, access: MarketingAccess, query: { search?: string; status?: string; recordId?: string } = {}) {
    const s = await scope(client, userId, brandId, access);
    const prefix = `marketing:campaign:${brandId}:`;
    const search = query.search?.trim().slice(0, 100);
    const statuses = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"];
    const where: Prisma.ExecutiveRecordWhereInput = { kind, organizationId: s.organizationId, sourceKey: { startsWith: prefix }, ...(search ? { title: { contains: search, mode: "insensitive" } } : {}), ...(query.status && statuses.includes(query.status) ? { status: query.status } : {}) };
    const rows = await client.executiveRecord.findMany({ where, select: { id: true, title: true, status: true, version: true, ownerPersonId: true, owner: { select: { displayName: true } }, payload: true, createdAt: true, updatedAt: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 101 });
    const chosen = query.recordId ? rows.find(row => row.id === query.recordId) ?? await client.executiveRecord.findFirst({ where: { id: query.recordId, kind, organizationId: s.organizationId, sourceKey: { startsWith: prefix } }, select: { id: true, title: true, status: true, version: true, ownerPersonId: true, owner: { select: { displayName: true } }, payload: true, createdAt: true, updatedAt: true } }) : null;
    const selected = chosen ? { ...chosen, payload: parseCampaignPayload(chosen.payload) } : null;
    if (selected && selected.payload.brandId !== brandId) throw new AccessError("Campaign scope unavailable");
    const history = selected ? await client.executiveHistory.findMany({ where: { recordId: selected.id }, select: { id: true, toStatus: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 }) : [];
    const taskRows = selected && (await s.ctx.decide("task.read", { organizationId: s.organizationId })).allowed ? await client.task.findMany({ where: { organizationId: s.organizationId, metadata: { contains: selected.id } }, select: { id: true, title: true, status: true, dueDate: true, assignee: { select: { displayName: true } }, metadata: true }, orderBy: { createdAt: "desc" }, take: 101 }) : [];
    const workOrders = taskRows.filter(task => { try { const marker = JSON.parse(task.metadata ?? "{}").marketing; return marker?.campaignId === selected?.id && marker?.brandId === brandId; } catch { return false; } }).slice(0, 100);
    const owners = s.canPlan ? await client.person.findMany({ where: { status: "ACTIVE", users: { some: { status: "ACTIVE", emailVerifiedAt: { not: null } } }, memberships: { some: { status: "ACTIVE", OR: [{ organizationId: s.organizationId }, { organizationId: s.companyId, scope: "DESCENDANTS" }] } } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" }, take: 100 }) : [];
    const presented = rows.slice(0, 100).map(row => ({ ...row, payload: parseCampaignPayload(row.payload) }));
    if (presented.some(row => row.payload.brandId !== brandId)) throw new AccessError("Campaign scope unavailable");
    return { brand: s.row, canPlan: s.canPlan, canDecide: s.canDecide, rows: presented, hasMore: rows.length > 100, selected, history, workOrders, owners };
  }
  async function campaign(userId: string, brandId: string, access: MarketingAccess, campaignId: string, db: Prisma.TransactionClient) {
    const s = await scope(db, userId, brandId, access);
    const row = await db.executiveRecord.findFirst({ where: { id: campaignId, kind, organizationId: s.organizationId, sourceKey: { startsWith: `marketing:campaign:${brandId}:` } } });
    if (!row || parseCampaignPayload(row.payload).brandId !== brandId) throw new AccessError("Campaign unavailable");
    return { s, row, payload: parseCampaignPayload(row.payload) };
  }
  async function save(userId: string, brandId: string, access: MarketingAccess, raw: unknown, campaignId?: string, version?: number) {
    const input = campaignInput.parse(raw);
    return client.$transaction(async db => {
      const s = await scope(db, userId, brandId, access);
      if (!s.canPlan || !s.ctx.user?.personId) throw new AccessError("Campaign planning unavailable");
      if (input.ownerPersonId) await verifiedPerson(db, input.ownerPersonId, s.organizationId, s.companyId);
      if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) throw new AccessError("End time must follow start time");
      const prior = campaignId ? await campaign(userId, brandId, access, campaignId, db) : null;
      if (prior && (!["DRAFT", "REJECTED"].includes(prior.row.status) || prior.row.version !== version)) throw new AccessError("Campaign changed; refresh before editing");
      const payload = { brandId, objective: input.objective, channel: input.channel, startsAt: input.startsAt, endsAt: input.endsAt, preparedByUserId: userId, assets: prior?.payload.assets ?? [], schemaVersion: 1 };
      const sourceKey = `marketing:campaign:${brandId}:${input.reference}`;
      if (!prior) {
        const existing = await db.executiveRecord.findUnique({ where: { sourceKey }, select: { id: true, kind: true, organizationId: true, title: true, ownerPersonId: true, payload: true } });
        if (existing) {
          const saved = parseCampaignPayload(existing.payload);
          if (existing.kind !== kind || existing.organizationId !== s.organizationId || existing.title !== input.title || existing.ownerPersonId !== (input.ownerPersonId ?? s.ctx.user.personId) || saved.brandId !== brandId || JSON.stringify(saved) !== JSON.stringify(payload)) throw new AccessError("Campaign reference mismatch");
          return existing.id;
        }
      }
      const row = prior ? await db.executiveRecord.updateMany({ where: { id: prior.row.id, version, status: prior.row.status }, data: { title: input.title, ownerPersonId: input.ownerPersonId ?? s.ctx.user.personId, payload: JSON.stringify(payload), dueAt: input.startsAt ? new Date(input.startsAt) : null, status: "DRAFT", version: { increment: 1 } } }).then(result => { if (result.count !== 1) throw new AccessError("Campaign changed; refresh before editing"); return prior.row.id; }) : await db.executiveRecord.create({ data: { kind, organizationId: s.organizationId, ownerPersonId: input.ownerPersonId ?? s.ctx.user.personId, title: input.title, status: "DRAFT", sourceKey, dueAt: input.startsAt ? new Date(input.startsAt) : null, payload: JSON.stringify(payload) } }).then(record => record.id);
      await db.executiveHistory.create({ data: { recordId: row, actorUserId: userId, fromStatus: prior?.row.status ?? null, toStatus: "DRAFT", reason: prior ? "Campaign draft revised" : "Campaign draft created" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.ctx.user.personId, organizationId: s.organizationId, action: prior ? "marketing.campaign_revised" : "marketing.campaign_created", entityType: "ExecutiveRecord", entityId: row, result: "SUCCESS", metadata: { brandId } });
      return row;
    });
  }
  async function addAsset(userId: string, brandId: string, access: MarketingAccess, campaignId: string, version: number, raw: unknown) {
    const input = assetInput.parse(raw);
    return client.$transaction(async db => {
      const { s, row, payload } = await campaign(userId, brandId, access, campaignId, db);
      if (!s.canPlan || !s.ctx.user?.personId || !["DRAFT", "REJECTED"].includes(row.status) || row.version !== version || payload.assets.length >= 20) throw new AccessError("Draft asset unavailable");
      const assetId = randomUUID();
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, version, status: row.status }, data: { status: "DRAFT", payload: JSON.stringify({ ...payload, preparedByUserId: userId, assets: [...payload.assets, { ...input, id: assetId }] }), version: { increment: 1 } } })).count !== 1) throw new AccessError("Campaign changed; refresh before adding content");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: "DRAFT", reason: `Draft ${input.kind.toLowerCase()} asset added: ${input.title}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.ctx.user.personId, organizationId: s.organizationId, action: "marketing.asset_added", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { brandId, assetId } });
    });
  }
  async function changeAsset(userId: string, brandId: string, access: MarketingAccess, campaignId: string, version: number, raw: unknown) {
    const input = z.discriminatedUnion("action", [z.object({ action: z.literal("REMOVE"), assetId: z.uuid() }).strict(), z.object({ action: z.literal("REVISE"), assetId: z.uuid(), kind: assetInput.shape.kind, title: assetInput.shape.title, body: assetInput.shape.body }).strict()]).parse(raw);
    return client.$transaction(async db => {
      const { s, row, payload } = await campaign(userId, brandId, access, campaignId, db);
      if (!s.canPlan || !s.ctx.user?.personId || !["DRAFT", "REJECTED"].includes(row.status) || row.version !== version) throw new AccessError("Draft asset unavailable");
      const previous = payload.assets.find(item => item.id === input.assetId);
      if (!previous) throw new AccessError("Draft asset unavailable");
      const assets = input.action === "REMOVE" ? payload.assets.filter(item => item.id !== input.assetId) : payload.assets.map(item => item.id === input.assetId ? { id: item.id, kind: input.kind, title: input.title, body: input.body } : item);
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, status: row.status, version }, data: { status: "DRAFT", payload: JSON.stringify({ ...payload, preparedByUserId: userId, assets }), version: { increment: 1 } } })).count !== 1) throw new AccessError("Campaign changed; refresh before editing content");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: "DRAFT", reason: `Draft asset ${input.action === "REMOVE" ? "removed" : "revised"}: ${previous.title}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.ctx.user.personId, organizationId: s.organizationId, action: `marketing.asset_${input.action === "REMOVE" ? "removed" : "revised"}`, entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { brandId, assetId: input.assetId } });
    });
  }
  async function addWorkOrder(userId: string, brandId: string, access: MarketingAccess, campaignId: string, raw: unknown) {
    const input = workOrderInput.parse(raw);
    return client.$transaction(async db => {
      const { s, row } = await campaign(userId, brandId, access, campaignId, db);
      if (!s.canPlan || !s.ctx.user?.personId || row.status === "ARCHIVED") throw new AccessError("Work order unavailable");
      await verifiedPerson(db, input.assigneePersonId, s.organizationId, s.companyId);
      if (Date.parse(input.dueAt) <= now().getTime()) throw new AccessError("Work order due time must be in the future");
      const receiptKey = `marketing:work-order:${brandId}:${input.reference}`;
      const existing = await db.executiveRecord.findUnique({ where: { sourceKey: receiptKey }, select: { kind: true, organizationId: true, payload: true } });
      if (existing) {
        const receipt = z.object({ campaignId: id, taskId: id, input: workOrderInput }).safeParse(JSON.parse(existing.payload));
        if (!receipt.success || existing.kind !== "BRAND_MARKETING_WORK_ORDER_RECEIPT" || existing.organizationId !== s.organizationId || receipt.data.campaignId !== row.id || JSON.stringify(receipt.data.input) !== JSON.stringify(input)) throw new AccessError("Work order reference mismatch");
        return receipt.data.taskId;
      }
      const task = await db.task.create({ data: { organizationId: s.organizationId, title: input.title, description: input.description, status: "TODO", ownerPersonId: row.ownerPersonId, assigneePersonId: input.assigneePersonId, creatorPersonId: s.ctx.user.personId, dueDate: new Date(input.dueAt), metadata: JSON.stringify({ marketing: { brandId, campaignId: row.id, reference: input.reference } }) } });
      await db.executiveRecord.create({ data: { kind: "BRAND_MARKETING_WORK_ORDER_RECEIPT", organizationId: s.organizationId, ownerPersonId: s.ctx.user.personId, title: input.title, status: "CREATED", sourceKey: receiptKey, payload: JSON.stringify({ campaignId: row.id, taskId: task.id, input }) } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: row.status, reason: `Internal work order created: ${input.title}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.ctx.user.personId, organizationId: s.organizationId, action: "marketing.work_order_created", entityType: "Task", entityId: task.id, result: "SUCCESS", metadata: { brandId, campaignId: row.id } });
      return task.id;
    });
  }
  async function requestReview(userId: string, brandId: string, access: MarketingAccess, campaignId: string, version: number) {
    return client.$transaction(async db => {
      const { s, row, payload } = await campaign(userId, brandId, access, campaignId, db);
      if (!s.canPlan || !s.ctx.user?.personId || !["DRAFT", "REJECTED"].includes(row.status) || row.version !== version || !campaignReady({ ownerPersonId: row.ownerPersonId, payload }, now())) throw new AccessError("Complete owner, future schedule and draft content before requesting review");
      await verifiedPerson(db, row.ownerPersonId, s.organizationId, s.companyId);
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, status: row.status, version }, data: { status: "IN_REVIEW", payload: JSON.stringify({ ...payload, preparedByUserId: userId }), version: { increment: 1 } } })).count !== 1) throw new AccessError("Campaign changed; refresh before requesting review");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: "IN_REVIEW", reason: "Campaign and draft assets submitted for independent review; no publication or send authority" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.ctx.user.personId, organizationId: s.organizationId, action: "marketing.review_requested", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { brandId } });
    });
  }
  async function decide(userId: string, brandId: string, access: MarketingAccess, campaignId: string, version: number, raw: unknown) {
    const input = decisionInput.parse(raw);
    return client.$transaction(async db => {
      const { s, row, payload } = await campaign(userId, brandId, access, campaignId, db);
      if (!s.canDecide || !s.ctx.user?.personId) throw new AccessError("Campaign decision unavailable");
      const preparer = await db.user.findUnique({ where: { id: payload.preparedByUserId }, select: { personId: true, status: true } });
      if (!preparer || preparer.status !== "ACTIVE" || !canDecideCampaign(row, s.ctx.user.personId, preparer.personId, version)) throw new AccessError("Independent campaign decision unavailable");
      if (input.decision === "APPROVED") {
        if (!campaignReady({ ownerPersonId: row.ownerPersonId, payload }, now())) throw new AccessError("Campaign schedule or content is no longer ready; reject and revise");
        await verifiedPerson(db, row.ownerPersonId, s.organizationId, s.companyId);
      }
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, status: "IN_REVIEW", version }, data: { status: input.decision, version: { increment: 1 } } })).count !== 1) throw new AccessError("Campaign decision already recorded");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: "IN_REVIEW", toStatus: input.decision, reason: `${input.reason} | Evidence: ${input.evidenceReference}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.ctx.user.personId, organizationId: s.organizationId, action: `marketing.review_${input.decision.toLowerCase()}`, entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { brandId, evidenceReference: input.evidenceReference, published: false, sent: false } });
      return input.decision;
    });
  }
  return { options, list, save, addAsset, changeAsset, addWorkOrder, requestReview, decide };
}
export const brandMarketing = createBrandMarketing();
