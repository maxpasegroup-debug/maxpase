import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { createEmployeeService } from "./employee";
import { NiceJobsError } from "./input";
import { opportunityProfile } from "./opportunity-configuration";

const id = z.string().trim().min(1).max(200);
const admissionInput = z.object({ token: id, externalApplicationId: id.optional(), externalAdmissionId: id, eventReference: id, evidenceReference: id }).strict();
const decisionInput = z.object({ id, decision: z.enum(["VERIFIED", "REJECTED"]), evidenceReference: id }).strict();

export function createReferralService(client: PrismaClient = prisma) {
  const employee = createEmployeeService(client).internal;
  async function own(userId: string) {
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), assignment = await employee.own(db, b);
      const version = await db.niceJobsVersion.findUniqueOrThrow({ where: { id: assignment.versionId }, select: { id: true, engagement: true, configuration: true, template: { select: { status: true, publishedVersionId: true } } } });
      const referral = opportunityProfile(version.configuration)?.referral;
      const link = await db.niceJobsReferralLink.findUnique({ where: { assignmentId: assignment.id } });
      if (link && (link.companyId !== b.company.id || link.versionId !== version.id)) throw new AccessError("Referral configuration changed; ask a manager to review the link");
      const outcomes = link ? await db.niceJobsAdmission.groupBy({ by: ["status"], where: { referralId: link.id, companyId: b.company.id }, _count: { _all: true } }) : [];
      const available = version.template.status === "PUBLISHED" && version.template.publishedVersionId === version.id && referral?.status === "CONFIRMED" && !!referral.evidence && (!link || link.status === "ACTIVE" && link.destination === referral.destination);
      return { assignment, link, available, outcomes: Object.fromEntries(outcomes.map(row => [row.status, row._count._all])) };
    });
  }
  async function create(userId: string) {
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId), assignment = await employee.own(db, b);
      const version = await db.niceJobsVersion.findUniqueOrThrow({ where: { id: assignment.versionId }, select: { id: true, configuration: true, template: { select: { status: true, publishedVersionId: true } } } });
      const referral = opportunityProfile(version.configuration)?.referral;
      if (version.template.status !== "PUBLISHED" || version.template.publishedVersionId !== version.id || referral?.status !== "CONFIRMED" || !referral.evidence) throw new NiceJobsError("The destination platform has no approved referral configuration");
      const existing = await db.niceJobsReferralLink.findUnique({ where: { assignmentId: assignment.id } });
      if (existing) {
        if (existing.companyId !== b.company.id || existing.versionId !== version.id || existing.destination !== referral.destination || existing.status !== "ACTIVE") throw new AccessError("Referral link needs manager review");
        return linkUrl(existing.destination, existing.token);
      }
      const row = await db.niceJobsReferralLink.create({ data: { assignmentId: assignment.id, versionId: version.id, companyId: b.company.id, destination: referral.destination, token: randomBytes(24).toString("base64url") } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: b.personId, organizationId: assignment.divisionId, action: "nicejobs.referral.created", entityType: "NiceJobsReferralLink", entityId: row.id, result: "SUCCESS", metadata: { assignmentId: assignment.id, versionId: version.id } });
      return linkUrl(row.destination, row.token);
    });
  }
  async function record(userId: string, raw: unknown) {
    const data = admissionInput.parse(raw);
    return client.$transaction(async db => {
      const referral = await db.niceJobsReferralLink.findUnique({ where: { token: data.token }, include: { assignment: { select: { divisionId: true, versionId: true } } } });
      if (!referral || referral.status !== "ACTIVE" || referral.assignment.versionId !== referral.versionId) throw new AccessError("Referral unavailable");
      const ctx = await createAccessContext(userId, db, undefined, { organizationId: referral.companyId });
      await ctx.requireAccess("nicejobs.finance.reconcile", { organizationId: referral.assignment.divisionId });
      if (!ctx.user?.personId) throw new AccessError("An identified human reviewer is required");
      const existing = await db.niceJobsAdmission.findUnique({ where: { eventReference: data.eventReference } });
      if (existing) {
        if (existing.referralId !== referral.id || existing.companyId !== referral.companyId || existing.externalAdmissionId !== data.externalAdmissionId || existing.externalApplicationId !== (data.externalApplicationId ?? null) || existing.evidenceReference !== data.evidenceReference) throw new NiceJobsError("Conflicting admission event reference");
        return existing;
      }
      const row = await db.niceJobsAdmission.create({ data: { referralId: referral.id, companyId: referral.companyId, externalApplicationId: data.externalApplicationId, externalAdmissionId: data.externalAdmissionId, eventReference: data.eventReference, evidenceReference: data.evidenceReference, recordedByUserId: userId } });
      // Company events may arrive before the human records the admission. Attach only
      // receipts already matched to this same referral and external admission.
      await db.niceJobsSourceEvent.updateMany({ where: { companyId: referral.companyId, referralId: referral.id, externalAdmissionId: data.externalAdmissionId, admissionId: null }, data: { admissionId: row.id } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user?.personId, organizationId: referral.assignment.divisionId, action: "nicejobs.admission.recorded", entityType: "NiceJobsAdmission", entityId: row.id, result: "SUCCESS", reference: `nicejobs-admission:${row.id}:recorded`, metadata: { referralId: referral.id, status: row.status } });
      return row;
    });
  }
  async function decide(userId: string, raw: unknown) {
    const data = decisionInput.parse(raw);
    return client.$transaction(async db => {
      const row = await db.niceJobsAdmission.findUnique({ where: { id: data.id }, include: { recordedBy: { select: { personId: true } }, referral: { include: { assignment: { select: { divisionId: true, versionId: true } } } } } });
      if (!row || row.companyId !== row.referral.companyId || row.referral.versionId !== row.referral.assignment.versionId) throw new AccessError("Admission unavailable");
      const ctx = await createAccessContext(userId, db, undefined, { organizationId: row.companyId });
      await ctx.requireAccess("nicejobs.finance.reconcile", { organizationId: row.referral.assignment.divisionId });
      if (!ctx.user?.personId || row.recordedByUserId === userId || row.recordedBy.personId === ctx.user.personId) throw new AccessError("An independent human verifier is required");
      if (row.status !== "PENDING_VERIFICATION") throw new NiceJobsError("Admission decision was already recorded");
      const updated = await db.niceJobsAdmission.updateMany({ where: { id: row.id, status: "PENDING_VERIFICATION", verifiedByUserId: null }, data: { status: data.decision, verificationEvidenceReference: data.evidenceReference, verifiedByUserId: userId, verifiedAt: new Date() } });
      if (updated.count !== 1) throw new NiceJobsError("Admission changed; refresh before retrying");
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user?.personId, organizationId: row.referral.assignment.divisionId, action: "nicejobs.admission." + data.decision.toLowerCase(), entityType: "NiceJobsAdmission", entityId: row.id, result: "SUCCESS", reference: `nicejobs-admission:${row.id}:${data.decision.toLowerCase()}`, metadata: { referralId: row.referralId, decision: data.decision, evidenceReference: data.evidenceReference } });
      return db.niceJobsAdmission.findUniqueOrThrow({ where: { id: row.id } });
    });
  }
  async function queue(userId: string) {
    return client.$transaction(async db => {
      const company = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" }, select: { id: true } });
      const ctx = await createAccessContext(userId, db, undefined, { organizationId: company.id });
      const divisionIds = ctx.organizationIds("nicejobs.finance.reconcile");
      if (!ctx.active || !divisionIds.length) throw new AccessError("Admission review is unavailable");
      return db.niceJobsAdmission.findMany({ where: { companyId: company.id, referral: { assignment: { divisionId: { in: divisionIds } } } }, select: { id: true, externalApplicationId: true, externalAdmissionId: true, eventReference: true, evidenceReference: true, verificationEvidenceReference: true, status: true, recordedAt: true, recordedByUserId: true, verifiedAt: true, referral: { select: { assignment: { select: { version: { select: { title: true } } } } } } }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }], take: 50 });
    });
  }
  return { own, create, record, decide, queue };
}

export function linkUrl(destination: string, token: string) {
  const url = new URL(destination);
  if (url.protocol !== "https:" || url.username || url.password || url.searchParams.has("ref")) throw new NiceJobsError("Referral destination unavailable");
  url.searchParams.set("ref", token);
  return url.toString();
}

export const referralService = createReferralService();
