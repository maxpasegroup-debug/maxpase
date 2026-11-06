import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { NiceJobsError } from "./input";
import { opportunityCapacity } from "./capacity";
import { opportunityProfile } from "./opportunity-configuration";

const id = z.string().trim().min(1).max(200);
export const companyEvent = z.object({
  eventId: id, companyId: id, opportunityId: id, participantId: id.optional(),
  type: z.enum(["APPLICATION_CREATED", "APPLICATION_UPDATED", "ADMISSION_APPROVED", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED", "ADMISSION_CANCELLED"]),
  occurredAt: z.iso.datetime(), referralToken: id.optional(), externalApplicationId: id.optional(),
  externalAdmissionId: id.optional(), externalTransactionId: id.optional(),
  amountMinor: z.string().regex(/^[1-9]\d{0,12}$/).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional()
}).strict().superRefine((event, ctx) => {
  if (event.type.startsWith("APPLICATION") && !event.externalApplicationId) ctx.addIssue({ code: "custom", message: "Application reference required" });
  if (["ADMISSION_APPROVED", "ADMISSION_CANCELLED", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED"].includes(event.type) && !event.externalAdmissionId) ctx.addIssue({ code: "custom", message: "Admission reference required" });
  if (event.type.startsWith("PAYMENT_")) {
    if (!event.externalTransactionId || !event.amountMinor || !event.currency) ctx.addIssue({ code: "custom", message: "Payment evidence required" });
  } else if (event.externalTransactionId || event.amountMinor || event.currency) ctx.addIssue({ code: "custom", message: "Unexpected payment fields" });
});
export type CompanyEvent = z.infer<typeof companyEvent>;
const connectionInput = z.object({ companyId: id, name: z.string().trim().min(2).max(120), credentialReference: z.union([z.literal("manual"), z.string().regex(/^env:[A-Z][A-Z0-9_]{2,100}$/)]) }).strict();
const decisionInput = z.object({ id, approvalReference: id }).strict();
const reviewInput = z.object({ id, decision: z.enum(["VERIFIED", "REJECTED"]), evidenceReference: id }).strict();
const reconcileInput = z.object({ id, referralToken: id, evidenceReference: id }).strict();
const manualInput = z.object({ connectionId: id, event: companyEvent, evidenceReference: id }).strict();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function verifyCompanySignature(body: string, timestamp: string, signature: string, secret: string | undefined, at = Date.now()) {
  if (!secret || secret.length < 32 || !/^\d{10}$/.test(timestamp) || Math.abs(at - Number(timestamp) * 1000) > 300000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(timestamp + "." + body).digest(), Buffer.from(signature, "hex"));
}

export function createNiceJobsSourceService(client: PrismaClient = prisma) {
  async function manage(userId: string, companyId: string, db: Prisma.TransactionClient) {
    const company = await db.organization.findFirst({ where: { id: companyId, type: "COMPANY", status: "ACTIVE", company: { status: "ACTIVE" } }, select: { id: true } });
    if (!company) throw new AccessError("Company unavailable");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId: companyId });
    await ctx.requireAccess("integration.manage", { organizationId: companyId });
    if (!ctx.user?.personId) throw new AccessError("Identified human required");
    return ctx;
  }
  async function create(userId: string, raw: unknown) {
    const input = connectionInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await manage(userId, input.companyId, db);
      const row = await db.niceJobsSourceConnection.create({ data: { ...input, creatorUserId: userId } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: "nicejobs.source.created", entityType: "NiceJobsSourceConnection", entityId: row.id, result: "SUCCESS" });
      return { id: row.id, status: row.status };
    });
  }
  async function activate(userId: string, raw: unknown) {
    const input = decisionInput.parse(raw);
    return client.$transaction(async db => {
      const row = await db.niceJobsSourceConnection.findUnique({ where: { id: input.id }, include: { creator: { select: { personId: true } } } });
      if (!row || row.status !== "DRAFT") throw new AccessError("Source connection unavailable");
      const ctx = await manage(userId, row.companyId, db);
      if (row.creatorUserId === userId || row.creator.personId === ctx.user!.personId) throw new AccessError("Independent source approval required");
      const name = row.credentialReference.slice(4);
      if (row.credentialReference !== "manual" && (process.env[`NICEJOBS_SOURCE_BINDING_${row.id}`] !== `${row.companyId}:${name}` || !process.env[name] || process.env[name]!.length < 32)) throw new NiceJobsError("Verified source credential binding is not configured");
      if ((await db.niceJobsSourceConnection.updateMany({ where: { id: row.id, status: "DRAFT" }, data: { status: "ACTIVE", approvalReference: input.approvalReference, approvedByUserId: userId, activatedAt: new Date() } })).count !== 1) throw new NiceJobsError("Source changed; refresh before approving");
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: "nicejobs.source.activated", entityType: "NiceJobsSourceConnection", entityId: row.id, result: "SUCCESS", metadata: { approvalReference: input.approvalReference } });
      return { id: row.id, status: "ACTIVE" as const };
    });
  }
  async function ingest(connectionId: string, body: string, timestamp: string, signature: string) {
    if (Buffer.byteLength(body) > 16384) throw new AccessError("Event rejected");
    const connection = await client.niceJobsSourceConnection.findUnique({ where: { id: connectionId } });
    if (!connection || connection.status !== "ACTIVE" || !connection.approvedByUserId) throw new AccessError("Event rejected");
    const name = connection.credentialReference.slice(4);
    if (!/^env:[A-Z][A-Z0-9_]{2,100}$/.test(connection.credentialReference) || process.env[`NICEJOBS_SOURCE_BINDING_${connection.id}`] !== `${connection.companyId}:${name}` || !verifyCompanySignature(body, timestamp, signature, process.env[name])) throw new AccessError("Event rejected");
    const event = companyEvent.parse(JSON.parse(body));
    if (event.companyId !== connection.companyId || Math.abs(Date.now() - new Date(event.occurredAt).getTime()) > 90 * 86400000) throw new AccessError("Event rejected");
    const fingerprint = digest(body);
    const persist = async () => client.$transaction(async db => {
      const active = await db.niceJobsSourceConnection.findUniqueOrThrow({ where: { id: connection.id } });
      if (active.status !== "ACTIVE" || active.approvalReference !== connection.approvalReference) throw new AccessError("Event rejected");
      const prior = await db.niceJobsSourceEvent.findUnique({ where: { connectionId_externalEventId: { connectionId, externalEventId: event.eventId } } });
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new AccessError("Event replay differs");
        await db.niceJobsSourceEvent.updateMany({ where: { id: prior.id, attempts: { lt: 1000000 } }, data: { attempts: { increment: 1 } } });
        return prior;
      }
      let referral = event.referralToken ? await db.niceJobsReferralLink.findUnique({ where: { token: event.referralToken }, include: { assignment: { select: { profile: { select: { person: { select: { niceJobsId: true } } } } } } } }) : null;
      if (event.referralToken && !referral) throw new AccessError("Event attribution mismatch");
      if (!referral && event.externalApplicationId) {
        const earlier = await db.niceJobsSourceEvent.findFirst({ where: { companyId: connection.companyId, externalApplicationId: event.externalApplicationId, referralId: { not: null } }, orderBy: { receivedAt: "asc" }, select: { referralId: true } });
        if (earlier?.referralId) referral = await db.niceJobsReferralLink.findUnique({ where: { id: earlier.referralId }, include: { assignment: { select: { profile: { select: { person: { select: { niceJobsId: true } } } } } } } });
      }
      // Startup Skool stores the original referral on its permanent applicant record.
      // A later payment or admission event can therefore recover attribution without a cookie.
      if (event.externalApplicationId) {
        const application = await db.executiveRecord.findUnique({ where: { id: event.externalApplicationId }, select: { kind: true, organizationId: true, payload: true } });
        const division = application ? await db.organization.findUnique({ where: { id: application.organizationId }, select: { parentId: true } }) : null;
        if (application?.kind === "STARTUP_APPLICATION" && division?.parentId !== connection.companyId) throw new AccessError("Destination company mismatch");
        if (application?.kind === "STARTUP_APPLICATION" && division?.parentId === connection.companyId) {
          let captured: { referral?: { referralId?: string; companyId?: string; opportunityId?: string } } | null = null;
          try { captured = JSON.parse(application.payload); } catch { /* malformed historical payload stays unmatched */ }
          if (!captured?.referral) throw new AccessError("Destination application has no saved referral");
          if (captured?.referral && (captured.referral.companyId !== connection.companyId || captured.referral.opportunityId !== event.opportunityId || !captured.referral.referralId)) throw new AccessError("Event attribution mismatch");
          if (captured?.referral?.companyId === connection.companyId && captured.referral.opportunityId === event.opportunityId && captured.referral.referralId) {
            if (referral && referral.id !== captured.referral.referralId) throw new AccessError("Event attribution mismatch");
            if (!referral) referral = await db.niceJobsReferralLink.findUnique({ where: { id: captured.referral.referralId }, include: { assignment: { select: { profile: { select: { person: { select: { niceJobsId: true } } } } } } } });
          }
        }
      }
      if (referral && (referral.companyId !== connection.companyId || referral.versionId !== event.opportunityId || event.participantId && referral.assignment.profile.person.niceJobsId !== event.participantId)) throw new AccessError("Event attribution mismatch");
      const admission = event.externalAdmissionId ? await db.niceJobsAdmission.findUnique({ where: { companyId_externalAdmissionId: { companyId: connection.companyId, externalAdmissionId: event.externalAdmissionId } } }) : null;
      if (admission && referral && admission.referralId !== referral.id) throw new AccessError("Admission attribution mismatch");
      const row = await db.niceJobsSourceEvent.create({ data: { connectionId, companyId: connection.companyId, externalEventId: event.eventId, eventType: event.type, referralId: referral?.id ?? admission?.referralId ?? null, admissionId: admission?.id, externalApplicationId: event.externalApplicationId, externalAdmissionId: event.externalAdmissionId, externalTransactionId: event.externalTransactionId, amountMinor: event.amountMinor ? BigInt(event.amountMinor) : null, currency: event.currency, fingerprint, payload: body, status: referral || admission ? "PENDING_REVIEW" : "UNMATCHED", occurredAt: new Date(event.occurredAt) } });
      await operationalEvent(db, { organizationId: connection.companyId, action: "nicejobs.source.event_received", entityType: "NiceJobsSourceEvent", entityId: row.id, result: "SUCCESS", reference: `nicejobs:source:${row.id}`, metadata: { type: row.eventType, status: row.status, connectionId } });
      return row;
    });
    try { return await persist(); } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      const prior = await client.niceJobsSourceEvent.findUnique({ where: { connectionId_externalEventId: { connectionId, externalEventId: event.eventId } } });
      if (!prior || prior.fingerprint !== fingerprint) throw new AccessError("Event replay differs");
      await client.niceJobsSourceEvent.updateMany({ where: { id: prior.id, attempts: { lt: 1000000 } }, data: { attempts: { increment: 1 } } });
      return prior;
    }
  }
  async function submitManual(userId: string, raw: unknown) {
    const input = manualInput.parse(raw);
    return client.$transaction(async db => {
      const connection = await db.niceJobsSourceConnection.findUnique({ where: { id: input.connectionId } });
      if (!connection || connection.status !== "ACTIVE" || connection.credentialReference !== "manual" || connection.companyId !== input.event.companyId) throw new AccessError("Manual source unavailable");
      const referral = input.event.referralToken ? await db.niceJobsReferralLink.findUnique({ where: { token: input.event.referralToken }, include: { assignment: { select: { divisionId: true, profile: { select: { person: { select: { niceJobsId: true } } } } } } } }) : null;
      if (!referral || referral.companyId !== connection.companyId || referral.versionId !== input.event.opportunityId || input.event.participantId && input.event.participantId !== referral.assignment.profile.person.niceJobsId) throw new AccessError("Referral unavailable");
      if (input.event.externalApplicationId) {
        const application = await db.executiveRecord.findUnique({ where: { id: input.event.externalApplicationId }, select: { kind: true, organizationId: true, payload: true } });
        if (application?.kind === "STARTUP_APPLICATION") {
          const division = await db.organization.findUnique({ where: { id: application.organizationId }, select: { parentId: true } });
          let captured: { referral?: { referralId?: string } } | null = null;
          try { captured = JSON.parse(application.payload); } catch { /* invalid attribution stays unverified */ }
          if (division?.parentId !== connection.companyId || captured?.referral?.referralId !== referral.id) throw new AccessError("Destination attribution mismatch");
        }
      }
      const ctx = await createAccessContext(userId, db, undefined, { organizationId: connection.companyId });
      await ctx.requireAccess("nicejobs.finance.reconcile", { organizationId: referral.assignment.divisionId });
      if (!ctx.user?.personId) throw new AccessError("Identified human required");
      const admission = input.event.externalAdmissionId ? await db.niceJobsAdmission.findUnique({ where: { companyId_externalAdmissionId: { companyId: connection.companyId, externalAdmissionId: input.event.externalAdmissionId } } }) : null;
      if (admission && admission.referralId !== referral.id) throw new AccessError("Admission attribution mismatch");
      const body = JSON.stringify(input.event), fingerprint = digest(body);
      const prior = await db.niceJobsSourceEvent.findUnique({ where: { connectionId_externalEventId: { connectionId: connection.id, externalEventId: input.event.eventId } } });
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new AccessError("Conflicting manual event ID");
        return prior;
      }
      const row = await db.niceJobsSourceEvent.create({ data: { connectionId: connection.id, companyId: connection.companyId, referralId: referral.id, admissionId: admission?.id, externalEventId: input.event.eventId, eventType: input.event.type, externalApplicationId: input.event.externalApplicationId, externalAdmissionId: input.event.externalAdmissionId, externalTransactionId: input.event.externalTransactionId, amountMinor: input.event.amountMinor ? BigInt(input.event.amountMinor) : null, currency: input.event.currency, occurredAt: new Date(input.event.occurredAt), fingerprint, payload: body, status: "PENDING_REVIEW", submittedByUserId: userId, reviewEvidence: input.evidenceReference } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user.personId, organizationId: connection.companyId, action: "nicejobs.source.manual_submitted", entityType: "NiceJobsSourceEvent", entityId: row.id, result: "SUCCESS", metadata: { eventType: row.eventType, evidenceReference: input.evidenceReference } });
      return row;
    });
  }
  async function review(userId: string, raw: unknown) {
    const input = reviewInput.parse(raw);
    return client.$transaction(async db => {
      const row = await db.niceJobsSourceEvent.findUnique({ where: { id: input.id }, include: { submittedBy: { select: { personId: true } }, connection: { include: { creator: { select: { personId: true } }, approvedBy: { select: { personId: true } } } }, referral: { select: { assignment: { select: { divisionId: true } } } } } });
      if (!row || row.status !== "PENDING_REVIEW" || !row.referralId || !row.referral) throw new AccessError("Event is not reviewable");
      const ctx = await createAccessContext(userId, db, undefined, { organizationId: row.companyId });
      await ctx.requireAccess("nicejobs.finance.reconcile", { organizationId: row.referral.assignment.divisionId });
      if (!ctx.user?.personId || [row.connection.creator.personId, row.connection.approvedBy?.personId, row.submittedBy?.personId].includes(ctx.user.personId)) throw new AccessError("Independent human verification required");
      if (input.decision === "VERIFIED" && ["ADMISSION_APPROVED", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED", "ADMISSION_CANCELLED"].includes(row.eventType) && !row.admissionId) throw new AccessError("Link the independently recorded admission before verifying this event");
      if (input.decision === "VERIFIED" && (row.eventType === "PAYMENT_REFUNDED" || row.eventType === "ADMISSION_CANCELLED") && row.admissionId) await db.$queryRaw`SELECT id FROM "NiceJobsAdmission" WHERE id = ${row.admissionId} FOR UPDATE`;
      if (input.decision === "VERIFIED" && row.eventType === "PAYMENT_REFUNDED") {
        if (!row.admissionId || !row.amountMinor || !row.currency) throw new AccessError("Linked admission and refund evidence required");
        const previous = await db.niceJobsSourceEvent.findMany({ where: { admissionId: row.admissionId, companyId: row.companyId, currency: row.currency, status: "VERIFIED", eventType: { in: ["PAYMENT_RECEIVED", "PAYMENT_REFUNDED"] } }, select: { eventType: true, amountMinor: true } });
        const net = previous.reduce((sum, item) => sum + (item.eventType === "PAYMENT_RECEIVED" ? 1n : -1n) * (item.amountMinor ?? 0n), 0n);
        if (net < row.amountMinor) throw new NiceJobsError("Refund exceeds independently verified payments");
      }
      if ((await db.niceJobsSourceEvent.updateMany({ where: { id: row.id, status: "PENDING_REVIEW" }, data: { status: input.decision, reviewedByUserId: userId, reviewedAt: new Date(), reviewEvidence: input.evidenceReference } })).count !== 1) throw new NiceJobsError("Event changed; refresh before review");
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user.personId, organizationId: row.companyId, action: "nicejobs.source.event_reviewed", entityType: "NiceJobsSourceEvent", entityId: row.id, result: "SUCCESS", metadata: { decision: input.decision, evidenceReference: input.evidenceReference } });
      return { id: row.id, status: input.decision };
    });
  }
  async function reconcile(userId: string, raw: unknown) {
    const input = reconcileInput.parse(raw);
    return client.$transaction(async db => {
      const row = await db.niceJobsSourceEvent.findUnique({ where: { id: input.id } });
      const referral = await db.niceJobsReferralLink.findUnique({ where: { token: input.referralToken }, include: { assignment: { select: { divisionId: true } } } });
      if (!row || row.status !== "UNMATCHED" || row.referralId || !referral || referral.companyId !== row.companyId) throw new AccessError("Event cannot be reconciled");
      const event = companyEvent.parse(JSON.parse(row.payload));
      if (event.opportunityId !== referral.versionId || event.referralToken && event.referralToken !== referral.token) throw new AccessError("Event attribution differs");
      const admission = row.externalAdmissionId ? await db.niceJobsAdmission.findUnique({ where: { companyId_externalAdmissionId: { companyId: row.companyId, externalAdmissionId: row.externalAdmissionId } } }) : null;
      if (admission && admission.referralId !== referral.id) throw new AccessError("Admission attribution differs");
      const ctx = await createAccessContext(userId, db, undefined, { organizationId: row.companyId });
      await ctx.requireAccess("nicejobs.finance.reconcile", { organizationId: referral.assignment.divisionId });
      if (!ctx.user?.personId) throw new AccessError("Identified human required");
      if ((await db.niceJobsSourceEvent.updateMany({ where: { id: row.id, status: "UNMATCHED", referralId: null }, data: { referralId: referral.id, admissionId: admission?.id, status: "PENDING_REVIEW", reviewEvidence: input.evidenceReference } })).count !== 1) throw new NiceJobsError("Event changed; refresh before reconciliation");
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user.personId, organizationId: row.companyId, action: "nicejobs.source.event_reconciled", entityType: "NiceJobsSourceEvent", entityId: row.id, result: "SUCCESS", metadata: { referralId: referral.id, evidenceReference: input.evidenceReference } });
      return { id: row.id, status: "PENDING_REVIEW" as const };
    });
  }
  async function list(userId: string) {
    return client.$transaction(async db => {
      const company = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" }, select: { id: true } });
      const ctx = await createAccessContext(userId, db, undefined, { organizationId: company.id });
      const scopes = ctx.organizationIds("nicejobs.finance.reconcile");
      const canManage = (await ctx.decide("integration.manage", { organizationId: company.id })).allowed;
      if (!ctx.active || !scopes.length && !canManage) throw new AccessError("Source events unavailable");
      const connections = canManage ? await db.niceJobsSourceConnection.findMany({ where: { companyId: company.id }, select: { id: true, name: true, status: true, credentialReference: true, creatorUserId: true, approvalReference: true, activatedAt: true }, orderBy: { createdAt: "desc" }, take: 25 }) : [];
      const events = await db.niceJobsSourceEvent.findMany({ where: { companyId: company.id, ...(canManage ? {} : { referral: { assignment: { divisionId: { in: scopes } } } }) }, select: { id: true, eventType: true, status: true, externalApplicationId: true, externalAdmissionId: true, externalTransactionId: true, amountMinor: true, currency: true, receivedAt: true, attempts: true, referral: { select: { assignment: { select: { divisionId: true } } } } }, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 50 });
      const versions = await db.niceJobsVersion.findMany({ where: { engagement: "INDEPENDENT_PARTNER", template: { companyId: company.id }, ...(canManage ? {} : { areas: { some: { divisionId: { in: scopes } } } }) }, select: { id: true, title: true, status: true, configuration: true }, orderBy: { id: "asc" }, take: 25 });
      const capacities = [];
      for (const version of versions) {
        const summary = await opportunityCapacity(db, company.id, version.id, opportunityProfile(version.configuration));
        if (summary) capacities.push({ id: version.id, title: version.title, status: version.status, ...summary });
      }
      return { companyId: company.id, canManage, connections, capacities, events: events.map(e => ({ ...e, amountMinor: e.amountMinor?.toString() ?? null, canReview: !!e.referral && scopes.includes(e.referral.assignment.divisionId) })) };
    });
  }
  return { create, activate, ingest, submitManual, review, reconcile, list };
}
export const niceJobsSourceService = createNiceJobsSourceService();
