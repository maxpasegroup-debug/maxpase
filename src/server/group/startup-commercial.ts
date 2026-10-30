import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { requirePortalAccess } from "@/server/portals/policy";
import { createBossService } from "./boss-service";
import { readStartupDraft } from "./startup-programs";

type DB = Prisma.TransactionClient;
export type CommercialAccess = "BOSS" | "SKILLCITY";
const id = z.string().min(1).max(200);
const reference = z.string().trim().min(8).max(300);
const terms = z.object({ brandId: id, programId: id, issuerCompanyId: id, termsReference: reference, feeMinor: z.number().int().min(0).max(1_000_000_000), currency: z.string().regex(/^[A-Z]{3}$/), taxBasisPoints: z.number().int().min(0).max(10000), preparedByUserId: id, programUpdatedAt: z.iso.datetime({ offset: true }), schemaVersion: z.literal(1) }).strict();
const draft = terms.pick({ programId: true, termsReference: true, feeMinor: true, currency: true, taxBasisPoints: true });
const review = z.object({ evidenceReference: reference, reason: z.string().trim().min(8).max(1000), decision: z.enum(["APPROVED", "REJECTED"]) }).strict();
const KIND = "STARTUP_COMMERCIAL_TERMS";
const sourceKey = (brandId: string, programId: string, termsReference: string) => `startup:commercial:${brandId}:${programId}:${createHash("sha256").update(termsReference).digest("hex")}`;

export function parseCommercialTerms(raw: string) {
  try { return terms.parse(JSON.parse(raw)); } catch { throw new AccessError("Commercial terms record unavailable"); }
}
export function canDecideCommercial(row: { status: string; version: number; ownerPersonId: string }, actorPersonId: string | null, expectedVersion: number) {
  return !!actorPersonId && actorPersonId !== row.ownerPersonId && row.status === "PENDING" && row.version === expectedVersion;
}
export function termsMatchProgram(program: { id: string; updatedAt: Date; metadata: string | null; priceMinor: number | null; currency: string | null }, value: { programId: string; programUpdatedAt: string; termsReference: string; feeMinor: number; currency: string }) {
  return program.id === value.programId && program.updatedAt.toISOString() === value.programUpdatedAt && readStartupDraft(program.metadata)?.writtenTermsReference === value.termsReference && (program.priceMinor == null || program.priceMinor === value.feeMinor) && (!program.currency || program.currency === value.currency);
}

export function createStartupCommercial(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function scope(db: DB, userId: string, brandId: string, access: CommercialAccess) {
    const brand = await db.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true, slug: true, status: true, organizationId: true, organization: { select: { slug: true, status: true, parentId: true, company: { select: { status: true } } } } } });
    if (!brand || brand.slug !== "startup-school" || brand.status !== "ACTIVE" || brand.organization.slug !== "aira-skill-city" || brand.organization.status !== "ACTIVE" || brand.organization.company?.status !== "ACTIVE") throw new AccessError("Startup commercial workspace unavailable");
    let ctx: Awaited<ReturnType<typeof createAccessContext>>;
    if (access === "BOSS") {
      const authority = await boss.authority(userId, db);
      if (brand.organization.parentId !== authority.root.id) throw new AccessError("Startup commercial workspace unavailable");
      ctx = authority.ctx;
      await ctx.requireAccess("brand.read", { organizationId: brand.organizationId });
    } else {
      const gateway = await requirePortalAccess(db, userId, "skillcity");
      if (gateway.companyId !== brand.organizationId) throw new AccessError("Startup commercial workspace unavailable");
      ctx = gateway.ctx;
    }
    const division = await db.organization.findFirst({ where: { slug: "aira-startup-school", parentId: brand.organizationId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } });
    if (!division) throw new AccessError("Startup commercial scope unavailable");
    await ctx.requireAccess("program.read", { organizationId: division.id });
    await ctx.requireAccess("executive.read", { organizationId: division.id });
    return { brand, divisionId: division.id, companyId: brand.organizationId, ctx,
      canPrepare: (await ctx.decide("program.manage", { organizationId: division.id })).allowed,
      canDecide: (await ctx.decide("decision.decide", { organizationId: division.id })).allowed && (await ctx.decide("approval.decide", { organizationId: division.id })).allowed };
  }
  async function issuerReady(db: DB, companyId: string, taxBasisPoints: number) {
    const company = await db.companyProfile.findUnique({ where: { organizationId: companyId }, select: { status: true, legalName: true, metadata: true } });
    let legal: unknown;
    try { legal = JSON.parse(company?.metadata ?? "null"); } catch { throw new AccessError("Verified issuer configuration required"); }
    const verified = z.object({ legalInformationVerified: z.literal(true), legalVerificationEvidence: reference, registeredAddress: z.string().trim().min(10), taxRegistration: z.string().trim().min(3) }).safeParse(legal);
    if (!company || company.status !== "ACTIVE" || !company.legalName || !verified.success) throw new AccessError("Verified legal issuer and address required");
    const config = await db.systemConfiguration.findUnique({ where: { key: `STARTUP_COMMERCIAL_TAX:${companyId}` }, select: { id: true, value: true } });
    let policy: unknown;
    try { policy = JSON.parse(config?.value ?? "null"); } catch { throw new AccessError("Approved tax policy required"); }
    const tax = z.object({ companyId: id, issuerLegalName: z.string().trim().min(1), taxRegistration: z.string().trim().min(3), approvedByUserId: id, approvalEvidenceReference: reference, allowedBasisPoints: z.array(z.number().int().min(0).max(10000)).min(1) }).strict().safeParse(policy);
    if (!tax.success || tax.data.companyId !== companyId || tax.data.issuerLegalName !== company.legalName || tax.data.taxRegistration !== verified.data.taxRegistration || !tax.data.allowedBasisPoints.includes(taxBasisPoints)) throw new AccessError("Approved issuer tax policy required");
    const approver = await db.user.findUnique({ where: { id: tax.data.approvedByUserId }, select: { status: true, emailVerifiedAt: true, person: { select: { status: true } } } });
    if (!approver || approver.status !== "ACTIVE" || !approver.emailVerifiedAt || approver.person?.status !== "ACTIVE") throw new AccessError("Tax policy authority requires verification");
    const approverContext = await createAccessContext(tax.data.approvedByUserId, db, undefined, { organizationId: companyId });
    await approverContext.requireAccess("decision.decide", { organizationId: companyId });
    await approverContext.requireAccess("approval.decide", { organizationId: companyId });
    const audit = await db.auditEvent.findFirst({ where: { entityType: "SystemConfiguration", entityId: config!.id, action: "startup.commercial_tax_approved", actorUserId: tax.data.approvedByUserId, organizationId: companyId, result: "SUCCESS" }, select: { metadata: true }, orderBy: { createdAt: "desc" } });
    let evidence: unknown;
    try { evidence = JSON.parse(audit?.metadata ?? "null"); } catch { throw new AccessError("Tax policy approval audit required"); }
    const expectedHash = createHash("sha256").update(config!.value).digest("hex");
    if (!z.object({ valueHash: z.literal(expectedHash), approvalEvidenceReference: z.literal(tax.data.approvalEvidenceReference) }).safeParse(evidence).success) throw new AccessError("Tax policy approval audit required");
  }
  async function writtenTermsReady(db: DB, value: z.infer<typeof terms>) {
    const key = `STARTUP_WRITTEN_TERMS:${value.issuerCompanyId}:${createHash("sha256").update(value.termsReference).digest("hex")}`;
    const config = await db.systemConfiguration.findUnique({ where: { key }, select: { id: true, value: true } });
    let raw: unknown;
    try { raw = JSON.parse(config?.value ?? "null"); } catch { throw new AccessError("Approved written terms document required"); }
    const contract = z.object({ companyId: id, brandId: id, programId: id, termsReference: reference, contentHash: z.string().regex(/^[a-f0-9]{64}$/), approvedByUserId: id, approvalEvidenceReference: reference, effectiveAt: z.iso.datetime({ offset: true }) }).strict().safeParse(raw);
    if (!contract.success || contract.data.companyId !== value.issuerCompanyId || contract.data.brandId !== value.brandId || contract.data.programId !== value.programId || contract.data.termsReference !== value.termsReference || Date.parse(contract.data.effectiveAt) > Date.now() || contract.data.approvedByUserId === value.preparedByUserId) throw new AccessError("Approved written terms document required");
    const approver = await db.user.findUnique({ where: { id: contract.data.approvedByUserId }, select: { status: true, emailVerifiedAt: true, person: { select: { status: true } } } });
    if (!approver || approver.status !== "ACTIVE" || !approver.emailVerifiedAt || approver.person?.status !== "ACTIVE") throw new AccessError("Written terms approver requires verification");
    const authority = await createAccessContext(contract.data.approvedByUserId, db, undefined, { organizationId: value.issuerCompanyId });
    await authority.requireAccess("decision.decide", { organizationId: value.issuerCompanyId });
    const audit = await db.auditEvent.findFirst({ where: { entityType: "SystemConfiguration", entityId: config!.id, action: "startup.written_terms_approved", actorUserId: contract.data.approvedByUserId, organizationId: value.issuerCompanyId, result: "SUCCESS" }, select: { metadata: true }, orderBy: { createdAt: "desc" } });
    let evidence: unknown;
    try { evidence = JSON.parse(audit?.metadata ?? "null"); } catch { throw new AccessError("Written terms approval audit required"); }
    if (!z.object({ valueHash: z.literal(createHash("sha256").update(config!.value).digest("hex")), approvalEvidenceReference: z.literal(contract.data.approvalEvidenceReference) }).safeParse(evidence).success) throw new AccessError("Written terms approval audit required");
  }
  async function program(db: DB, companyId: string, divisionId: string, brandId: string, programId: string) {
    const row = await db.program.findFirst({ where: { id: programId, companyOrganizationId: companyId, organizationId: divisionId, OR: [{ brandId }, { brandId: null }] }, select: { id: true, name: true, status: true, updatedAt: true, metadata: true, priceMinor: true, currency: true } });
    if (!row || !["DRAFT", "ACTIVE", "PAUSED"].includes(row.status)) throw new AccessError("Programme unavailable for commercial review");
    return row;
  }
  async function list(userId: string, brandId: string, access: CommercialAccess) {
    const s = await scope(client, userId, brandId, access);
    const rows = await client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: KIND, sourceKey: { startsWith: `startup:commercial:${brandId}:` } }, select: { id: true, sourceKey: true, title: true, status: true, version: true, payload: true, ownerPersonId: true, createdAt: true, history: { select: { toStatus: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 } }, orderBy: { createdAt: "desc" }, take: 101 });
    const programs = s.canPrepare ? await client.program.findMany({ where: { companyOrganizationId: s.companyId, organizationId: s.divisionId, OR: [{ brandId }, { brandId: null }], status: { in: ["DRAFT", "ACTIVE", "PAUSED"] } }, select: { id: true, name: true, status: true }, take: 100 }) : [];
    const presented = rows.slice(0, 100).map(row => ({ ...row, payload: parseCommercialTerms(row.payload) }));
    const programIds = [...new Set(presented.map(row => row.payload.programId))];
    const scopedPrograms = programIds.length ? await client.program.findMany({ where: { id: { in: programIds }, companyOrganizationId: s.companyId, organizationId: s.divisionId, OR: [{ brandId }, { brandId: null }] }, select: { id: true }, take: 101 }) : [];
    const allowed = new Set(scopedPrograms.map(row => row.id));
    if (presented.some(row => row.payload.brandId !== brandId || row.payload.issuerCompanyId !== s.companyId || !allowed.has(row.payload.programId) || row.sourceKey !== sourceKey(brandId, row.payload.programId, row.payload.termsReference))) throw new AccessError("Commercial register scope unavailable");
    return { brand: s.brand, canPrepare: s.canPrepare, canDecide: s.canDecide, programs, hasMore: rows.length > 100, rows: presented };
  }
  async function prepare(userId: string, brandId: string, access: CommercialAccess, raw: unknown) {
    const input = draft.parse(raw);
    return client.$transaction(async db => {
      const s = await scope(db, userId, brandId, access);
      if (!s.canPrepare || !s.ctx.user?.personId) throw new AccessError("Commercial preparation unavailable");
      const p = await program(db, s.companyId, s.divisionId, brandId, input.programId);
      if (!termsMatchProgram(p, { ...input, programUpdatedAt: p.updatedAt.toISOString() })) throw new AccessError("Terms or proposed fee differs from the current programme draft");
      const key = sourceKey(brandId, p.id, input.termsReference);
      const payload = { ...input, brandId, issuerCompanyId: s.companyId, preparedByUserId: userId, programUpdatedAt: p.updatedAt.toISOString(), schemaVersion: 1 as const };
      const existing = await db.executiveRecord.findUnique({ where: { sourceKey: key }, select: { id: true, payload: true, kind: true, organizationId: true } });
      if (existing) {
        if (existing.kind !== KIND || existing.organizationId !== s.divisionId || JSON.stringify(parseCommercialTerms(existing.payload)) !== JSON.stringify(payload)) throw new AccessError("Commercial terms version already used; create a new reference");
        return existing.id;
      }
      const row = await db.executiveRecord.create({ data: { kind: KIND, organizationId: s.divisionId, ownerPersonId: s.ctx.user.personId, title: `${p.name} / ${input.termsReference}`, status: "DRAFT", sourceKey: key, payload: JSON.stringify(payload), history: { create: { actorUserId: userId, fromStatus: null, toStatus: "DRAFT", reason: "Commercial terms proposal recorded; no fee is approved" } } } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.ctx.user.personId, organizationId: s.divisionId, action: "startup.commercial_terms_drafted", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { brandId, programId: p.id, issuerCompanyId: s.companyId } });
      return row.id;
    });
  }
  async function change(userId: string, brandId: string, access: CommercialAccess, recordId: string, version: number, action: "SUBMIT" | "APPROVE" | "REJECT", raw?: unknown) {
    const decision = action === "SUBMIT" ? null : review.parse(raw);
    return client.$transaction(async db => {
      const s = await scope(db, userId, brandId, access);
      const row = await db.executiveRecord.findFirst({ where: { id: recordId, kind: KIND, organizationId: s.divisionId, sourceKey: { startsWith: `startup:commercial:${brandId}:` } } });
      if (!row || row.version !== version || !s.ctx.user?.personId) throw new AccessError("Commercial terms changed or unavailable");
      const payload = parseCommercialTerms(row.payload);
      if (payload.brandId !== brandId || payload.issuerCompanyId !== s.companyId || row.sourceKey !== sourceKey(brandId, payload.programId, payload.termsReference)) throw new AccessError("Commercial scope mismatch");
      const p = await program(db, s.companyId, s.divisionId, brandId, payload.programId);
      if (!termsMatchProgram(p, payload)) throw new AccessError("Programme commercial proposal changed; prepare new terms");
      if (action === "SUBMIT") {
        if (!s.canPrepare || row.ownerPersonId !== s.ctx.user.personId || row.status !== "DRAFT") throw new AccessError("Terms draft unavailable");
        await issuerReady(db, s.companyId, payload.taxBasisPoints);
        await writtenTermsReady(db, payload);
      } else {
        if (!s.canDecide || !canDecideCommercial(row, s.ctx.user.personId, version) || decision!.decision !== (action === "APPROVE" ? "APPROVED" : "REJECTED")) throw new AccessError("Independent commercial decision required");
        if (action === "APPROVE") { await issuerReady(db, s.companyId, payload.taxBasisPoints); await writtenTermsReady(db, payload); }
      }
      const next = action === "SUBMIT" ? "PENDING" : decision!.decision;
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, status: row.status, version }, data: { status: next, version: { increment: 1 } } })).count !== 1) throw new AccessError("Commercial terms already changed");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: next, reason: action === "SUBMIT" ? "Independent commercial review requested" : `${decision!.reason} | Evidence: ${decision!.evidenceReference}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.ctx.user.personId, organizationId: s.divisionId, action: `startup.commercial_terms_${next.toLowerCase()}`, entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { brandId, programId: p.id, issuerCompanyId: s.companyId, approvalEvidence: decision?.evidenceReference ?? null } });
    });
  }
  return { list, prepare, change };
}

export const startupCommercial = createStartupCommercial();
