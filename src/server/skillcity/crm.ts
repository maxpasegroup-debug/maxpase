import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";
import { resolveCrmContact } from "./contact-identity";

export const advisorProducts = [
  { slug: "pba", divisionSlug: "aira-startup-school", label: "PBA" },
  { slug: "genz-builder", divisionSlug: "aira-skill-studio", label: "GenZ Builder" }
] as const;
const productKey = z.enum(["pba", "genz-builder"]);
const identity = z.object({ name: z.string().trim().min(2).max(160), email: z.email().max(254).transform(value => value.toLowerCase()), phone: z.string().trim().max(30), need: z.string().trim().min(10).max(3000), consent: z.literal(true) });
const createInput = identity.extend({ product: productKey, ownerUserId: z.string().min(1), reference: z.string().min(8).max(120) }).strict();
const updateInput = z.object({ id: z.string().min(1), version: z.number().int().min(0), reference: z.string().min(8).max(120), status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "LOST"]), outcome: z.string().trim().min(1).max(3000), qualification: z.string().trim().max(3000), nextFollowUp: z.string().datetime().nullable() }).strict();
const payload = identity.extend({ product: productKey, contactId: z.string().optional(), ownerUserId: z.string(), outcome: z.string(), qualification: z.string(), nextFollowUp: z.string().datetime().nullable(), lastContact: z.string().datetime().nullable() });
export const crmLeadPayload = payload;
const transitions: Record<string, string[]> = { NEW: ["NEW", "CONTACTED", "LOST"], CONTACTED: ["CONTACTED", "QUALIFIED", "LOST"], QUALIFIED: ["QUALIFIED", "LOST"], LOST: [] };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createAdvisorCrm(client: PrismaClient = prisma, now = () => new Date()) {
  async function scope(db: Prisma.TransactionClient, userId: string, product: typeof advisorProducts[number]) {
    const gateway = await requirePortalAccess(db, userId, "skillcity");
    const division = await db.organization.findUnique({ where: { slug: product.divisionSlug }, select: { id: true, parentId: true, type: true, status: true } });
    if (!division || division.parentId !== gateway.companyId || division.type !== "DIVISION" || division.status !== "ACTIVE") throw new AccessError("Pipeline unavailable");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId: division.id });
    await ctx.requireAccess("organization.read", { organizationId: division.id });
    return { ctx, division, companyId: gateway.companyId };
  }
  async function advisor(db: Prisma.TransactionClient, userId: string, organizationId: string) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { personId: true, status: true, emailVerifiedAt: true } });
    if (!user?.personId || user.status !== "ACTIVE" || !user.emailVerifiedAt) throw new AccessError("Verified advisor required");
    const division = await db.organization.findUnique({ where: { id: organizationId }, select: { parentId: true } });
    const membership = await db.membership.findFirst({ where: { personId: user.personId, status: "ACTIVE", OR: [{ organizationId }, { organizationId: division?.parentId ?? "", scope: "DESCENDANTS" }], roles: { some: { role: { status: "ACTIVE", principalType: "HUMAN", name: { in: ["Senior Academic Advisor", "Junior Academic Advisor"] } } } } } });
    if (!membership) throw new AccessError("Advisor appointment required");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId });
    await ctx.requireAccess("aira.crm.self", { organizationId });
    return { user, ctx };
  }
  async function list(userId: string, productSlug: string) {
    const product = advisorProducts.find(item => item.slug === productSlug);
    if (!product) throw new AccessError("Pipeline unavailable");
    const { ctx, division, companyId } = await scope(client, userId, product);
    const manager = (await ctx.decide("aira.crm.manage", { organizationId: division.id })).allowed;
    if (!manager) await advisor(client, userId, division.id);
    const personId = ctx.user!.personId;
    const productRecord = await client.product.findUnique({ where: { organizationId_slug: { organizationId: companyId, slug: product.slug } }, select: { id: true, status: true, lifecycle: true, divisionId: true } });
    const base = { organizationId: division.id, kind: "AIRA_CRM_LEAD", status: { not: "LOST" }, ...(!manager ? { ownerPersonId: personId! } : {}) };
    const select = { id: true, title: true, status: true, version: true, dueAt: true, payload: true } as const;
    const dated = await client.executiveRecord.findMany({ where: { ...base, dueAt: { not: null } }, select, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 50 });
    const undated = dated.length < 50 ? await client.executiveRecord.findMany({ where: { ...base, dueAt: null }, select, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 50 - dated.length }) : [];
    const rows = [...dated, ...undated];
    const visible = rows.flatMap(row => {
      try {
        const parsed = payload.safeParse(JSON.parse(row.payload));
        if (!parsed.success || parsed.data.product !== product.slug) return [];
        return [{ id: row.id, title: row.title, status: row.status, version: row.version, dueAt: row.dueAt, ownerUserId: parsed.data.ownerUserId, outcome: parsed.data.outcome, qualification: parsed.data.qualification, nextFollowUp: parsed.data.nextFollowUp }];
      } catch { return []; }
    });
    return { divisionId: division.id, product: productRecord?.divisionId === division.id ? productRecord : null, canCreate: manager, canUpdate: (await ctx.decide("aira.crm.perform", { organizationId: division.id })).allowed, rows: visible, unavailableRecords: rows.length - visible.length };
  }
  async function eligibleOwners(userId: string, productSlug: string) {
    const product = advisorProducts.find(item => item.slug === productSlug);
    if (!product) throw new AccessError("Pipeline unavailable");
    const { ctx, division } = await scope(client, userId, product);
    await ctx.requireAccess("aira.crm.manage", { organizationId: division.id });
    const candidates = await client.user.findMany({ where: { status: "ACTIVE", emailVerifiedAt: { not: null }, person: { memberships: { some: { status: "ACTIVE", OR: [{ organizationId: division.id }, { organizationId: (await client.organization.findUnique({ where: { id: division.id }, select: { parentId: true } }))?.parentId ?? "", scope: "DESCENDANTS" }] } } } }, select: { id: true, email: true }, take: 100, orderBy: { email: "asc" } });
    const owners = [];
    for (const candidate of candidates) {
      try { await advisor(client, candidate.id, division.id); owners.push(candidate); }
      catch (error) { if (!(error instanceof AccessError)) throw error; }
    }
    return owners;
  }
  async function create(userId: string, raw: unknown) {
    const data = createInput.parse(raw), product = advisorProducts.find(item => item.slug === data.product)!;
    return client.$transaction(async db => {
      const { ctx, division, companyId } = await scope(db, userId, product);
      await ctx.requireAccess("aira.crm.manage", { organizationId: division.id });
      const record = await db.product.findUnique({ where: { organizationId_slug: { organizationId: companyId, slug: product.slug } }, select: { divisionId: true } });
      if (!record || record.divisionId !== division.id) throw new AccessError("Product pipeline is not configured");
      const owner = await advisor(db, data.ownerUserId, division.id);
      const sourceKey = "aira-crm:" + digest([division.id, data.product, data.email]);
      const existing = await db.executiveRecord.findUnique({ where: { sourceKey } });
      if (existing) { const previous = payload.parse(JSON.parse(existing.payload)); if (previous.email !== data.email || previous.name !== data.name || previous.phone !== data.phone || previous.need !== data.need || previous.product !== data.product || existing.ownerPersonId !== owner.user.personId) throw new AccessError("Lead replay mismatch"); return existing; }
      const contactId = await resolveCrmContact(db, companyId, data.email, owner.user.personId!);
      const row = await db.executiveRecord.create({ data: { kind: "AIRA_CRM_LEAD", organizationId: division.id, ownerPersonId: owner.user.personId!, title: `${data.name} / ${product.label}`, status: "NEW", sourceKey, payload: JSON.stringify({ product: data.product, contactId, name: data.name, email: data.email, phone: data.phone, need: data.need, consent: true, ownerUserId: data.ownerUserId, outcome: "", qualification: "", nextFollowUp: null, lastContact: null }) } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: division.id, action: "aira.crm.lead_created", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { product: product.slug, ownerUserId: data.ownerUserId } });
      return row;
    });
  }
  async function update(userId: string, raw: unknown) {
    const data = updateInput.parse(raw);
    return client.$transaction(async db => {
      const row = await db.executiveRecord.findUnique({ where: { id: data.id } });
      if (!row || row.kind !== "AIRA_CRM_LEAD") throw new AccessError("Lead unavailable");
      const prior = payload.parse(JSON.parse(row.payload));
      const product = advisorProducts.find(item => item.slug === prior.product)!;
      const { ctx, division } = await scope(db, userId, product);
      if (row.organizationId !== division.id) throw new AccessError("Lead unavailable");
      const manager = (await ctx.decide("aira.crm.manage", { organizationId: division.id })).allowed;
      if (!manager) {
        const active = await advisor(db, userId, division.id);
        if (row.ownerPersonId !== active.user.personId) throw new AccessError("Lead unavailable");
        await ctx.requireAccess("aira.crm.perform", { organizationId: division.id });
      }
      const reference = "aira-crm:update:" + digest([row.id, userId, data.reference]);
      const fingerprint = digest(data);
      const replay = await db.operationalEvent.findUnique({ where: { reference } });
      if (replay) { if (JSON.parse(replay.metadata ?? "{}").fingerprint !== fingerprint) throw new AccessError("Lead replay mismatch"); return; }
      if (row.version !== data.version || !transitions[row.status]?.includes(data.status)) throw new AccessError("Lead changed or transition unavailable");
      if (data.status === "QUALIFIED" && data.qualification.length < 10) throw new AccessError("Qualification evidence required");
      if (data.nextFollowUp && new Date(data.nextFollowUp) <= now()) throw new AccessError("Choose a future follow-up");
      if (data.status === "LOST" && data.nextFollowUp) throw new AccessError("Closed leads cannot have follow-ups");
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, version: data.version, status: row.status }, data: { status: data.status, version: { increment: 1 }, payload: JSON.stringify({ ...prior, outcome: data.outcome, qualification: data.qualification, nextFollowUp: data.nextFollowUp, lastContact: now().toISOString() }), dueAt: data.nextFollowUp ? new Date(data.nextFollowUp) : null } })).count !== 1) throw new AccessError("Lead changed; refresh before retrying");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: data.status, reason: data.outcome } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: division.id, action: "aira.crm.lead_updated", entityType: "ExecutiveRecord", entityId: row.id, reference, result: "SUCCESS", metadata: { product: product.slug, fingerprint } });
    });
  }
  return { list, eligibleOwners, create, update };
}

export const advisorCrm = createAdvisorCrm();
