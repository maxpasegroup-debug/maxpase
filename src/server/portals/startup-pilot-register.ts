import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { requireStartupStaffAccess } from "./startup-staff-access";

const id = z.string().trim().min(1).max(200);
const reference = z.string().trim().min(8).max(300);
const instant = z.iso.datetime({ offset: true });
const optional = <T extends z.ZodType>(schema: T) => z.union([schema, z.null()]);
const participant = z.object({ personId: id, consentAt: optional(instant), consentEvidenceRef: optional(reference) }).strict();
export const pilotRegisterInput = z.object({
  intakeCode: z.string().trim().regex(/^[A-Z0-9-]{5,40}$/),
  tier: optional(z.enum(["STARTER", "PRO", "EXTRAORDINARY"])),
  termsVersion: optional(reference), termsEvidenceRef: optional(reference), termsEffectiveAt: optional(instant), termsApprovedAt: optional(instant), termsApproverUserId: optional(id),
  reviewerUserId: optional(id), reviewerEvidenceRef: optional(reference), mentorUserId: optional(id), mentorEvidenceRef: optional(reference),
  participants: z.array(participant).max(20)
}).strict().refine(value => new Set(value.participants.map(row => row.personId)).size === value.participants.length, "Participant identities must be unique");
const stored = pilotRegisterInput.extend({ batchId: id, programId: id, preparedByUserId: id, version: z.literal(1) }).strict();
const KIND = "STARTUP_KERALA_PILOT_INTAKE";
const sourceKey = (batchId: string) => `startup:kerala-pilot:${batchId}`;
export type PilotRegister = z.infer<typeof pilotRegisterInput>;

export function missingPilotApprovals(value: PilotRegister): string[] {
  const missing: string[] = [];
  if (!value.tier) missing.push("Approved PBA tier");
  if (!value.termsVersion || !value.termsEvidenceRef || !value.termsEffectiveAt || !value.termsApprovedAt || !value.termsApproverUserId) missing.push("Versioned terms, effective date and approval evidence");
  if (!value.reviewerUserId || !value.reviewerEvidenceRef) missing.push("Admissions reviewer and authorization evidence");
  if (!value.mentorUserId || !value.mentorEvidenceRef) missing.push("Mentor and authorization evidence");
  if (!value.participants.length) missing.push("Consenting pilot participants");
  else if (value.participants.some(row => !row.consentAt || !row.consentEvidenceRef)) missing.push("Participant consent timestamps and evidence");
  return missing;
}
function parse(raw: string) { try { return stored.parse(JSON.parse(raw)); } catch { throw new AccessError("Pilot register unavailable"); } }
function parseEvidenceJson(raw: string | null): unknown { try { return JSON.parse(raw ?? "{}"); } catch { throw new AccessError("Participant evidence is unavailable"); } }
async function scopedBatch(db: Prisma.TransactionClient, userId: string, batchId: string) {
  const access = await requireStartupStaffAccess(db, userId);
  await access.ctx.requireAccess("program.manage", { organizationId: access.divisionId });
  const batch = await db.batch.findFirst({ where: { id: batchId, program: { organizationId: access.divisionId, companyOrganizationId: access.companyId } }, select: { id: true, name: true, status: true, program: { select: { id: true, name: true, status: true, productId: true } } } });
  if (!batch || !access.ctx.user?.personId) throw new AccessError("Pilot batch unavailable");
  return { access, batch, actorPersonId: access.ctx.user.personId };
}
async function currentManager(db: Prisma.TransactionClient, userId: string, organizationId: string) {
  const access = await requireStartupStaffAccess(db, userId);
  if (access.divisionId !== organizationId) throw new AccessError("Pilot scope unavailable");
  await access.ctx.requireAccess("program.manage", { organizationId });
  const account = await db.user.findUnique({ where: { id: userId }, select: { status: true, emailVerifiedAt: true, person: { select: { status: true } } } });
  if (!account || account.status !== "ACTIVE" || account.person?.status !== "ACTIVE" || !account.emailVerifiedAt) throw new AccessError("Verified programme authority required");
}
async function eligibleApplicant(db: Prisma.TransactionClient, personId: string, organizationId: string, tier: NonNullable<PilotRegister["tier"]>) {
  const user = await db.user.findFirst({ where: { personId, status: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true, person: { select: { status: true, metadata: true } } } });
  if (!user || user.person?.status !== "ACTIVE" || z.object({ authenticationRealm: z.literal("startup") }).safeParse(parseEvidenceJson(user.person.metadata)).success === false) throw new AccessError("Verified participant account required");
  const application = await db.executiveRecord.findUnique({ where: { sourceKey: `startup:application:${user.id}` }, select: { kind: true, organizationId: true, ownerPersonId: true, status: true, payload: true } });
  if (!application || application.kind !== "STARTUP_APPLICATION" || application.organizationId !== organizationId || application.ownerPersonId !== personId || application.status !== "APPROVED") throw new AccessError("Human-approved application required");
  const preference = z.object({ tier: z.enum(["STARTER", "PRO", "EXTRAORDINARY"]) }).safeParse(parseEvidenceJson(application.payload));
  if (!preference.success || preference.data.tier !== tier) throw new AccessError("Approved application and intake tier must match");
}
async function validatedPayload(db: Prisma.TransactionClient, organizationId: string, value: z.infer<typeof stored>, personId?: string) {
  if (missingPilotApprovals(value).length) throw new AccessError("Pilot approval evidence is incomplete");
  if (!value.tier || !value.termsApprovedAt || !value.termsEffectiveAt || !value.termsApproverUserId || !value.reviewerUserId || !value.mentorUserId) throw new AccessError("Pilot authority unavailable");
  const now = Date.now(), approved = Date.parse(value.termsApprovedAt), effective = Date.parse(value.termsEffectiveAt);
  if (approved > now || effective > now) throw new AccessError("Terms are not yet effective");
  for (const userId of new Set([value.termsApproverUserId, value.reviewerUserId, value.mentorUserId])) await currentManager(db, userId, organizationId);
  for (const candidate of value.participants) {
    if (!candidate.consentAt || Date.parse(candidate.consentAt) > now || Date.parse(candidate.consentAt) < approved) throw new AccessError("Participant consent evidence is unavailable");
    await eligibleApplicant(db, candidate.personId, organizationId, value.tier);
  }
  if (personId && !value.participants.some(row => row.personId === personId)) throw new AccessError("Participant is outside the approved intake");
}
export async function assertStartupPilotEnrollmentReady(db: Prisma.TransactionClient, program: { id: string; organizationId: string; productId: string | null }, batchId: string, personId: string) {
  const division = await db.organization.findUnique({ where: { id: program.organizationId }, select: { slug: true } });
  if (division?.slug !== "aira-startup-school") return;
  if (!program.productId) throw new AccessError("Approved PBA programme required before enrollment");
  const product = await db.product.findUnique({ where: { id: program.productId }, select: { slug: true, status: true, divisionId: true } });
  if (!product || product.slug !== "pba" || product.status !== "ACTIVE" || product.divisionId !== program.organizationId) throw new AccessError("Approved PBA product required before enrollment");
  const register = await db.executiveRecord.findUnique({ where: { sourceKey: sourceKey(batchId) }, select: { id: true, kind: true, organizationId: true, status: true, payload: true, history: { where: { toStatus: "APPROVED" }, select: { actorUserId: true }, take: 1 } } });
  if (!register || register.kind !== KIND || register.organizationId !== program.organizationId || register.status !== "APPROVED" || register.history.length !== 1) throw new AccessError("Kerala intake is not approved for enrollment");
  const value = parse(register.payload);
  if (value.batchId !== batchId || value.programId !== program.id) throw new AccessError("Intake mapping unavailable");
  await currentManager(db, register.history[0].actorUserId, program.organizationId);
  await validatedPayload(db, program.organizationId, value, personId);
}
export function createStartupPilotRegister(client: PrismaClient = prisma) {
  async function overview(userId: string) {
    const access = await requireStartupStaffAccess(client, userId);
    await access.ctx.requireAccess("program.manage", { organizationId: access.divisionId });
    const batches = await client.batch.findMany({ where: { program: { organizationId: access.divisionId, companyOrganizationId: access.companyId } }, select: { id: true, name: true, status: true, program: { select: { id: true, name: true, productId: true, product: { select: { slug: true, status: true, divisionId: true } } } } }, orderBy: { createdAt: "desc" }, take: 30 });
    const records = await client.executiveRecord.findMany({ where: { kind: KIND, organizationId: access.divisionId, sourceKey: { in: batches.map(batch => sourceKey(batch.id)) } }, select: { id: true, sourceKey: true, status: true, version: true, payload: true, history: { where: { toStatus: "APPROVED" }, select: { actorUserId: true, createdAt: true }, take: 1 } }, take: 30 });
    const staff = await client.membership.findMany({ where: { organizationId: access.divisionId, status: "ACTIVE", roles: { some: { role: { status: "ACTIVE", permissions: { some: { permission: { key: "program.manage" } } } } } } }, select: { person: { select: { displayName: true, users: { where: { status: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true, email: true } } } } }, take: 50 });
    const candidates = await client.executiveRecord.findMany({ where: { kind: "STARTUP_APPLICATION", organizationId: access.divisionId, status: "APPROVED" }, select: { owner: { select: { id: true, displayName: true } } }, take: 50 });
    return { batches: batches.map(batch => { const record = records.find(item => item.sourceKey === sourceKey(batch.id)); const value = record ? parse(record.payload) : null; const missing = value ? missingPilotApprovals(value) : ["Approved PBA tier", "Versioned terms, effective date and approval evidence", "Admissions reviewer and authorization evidence", "Mentor and authorization evidence", "Consenting pilot participants"]; if (!batch.program.product || batch.program.product.slug !== "pba" || batch.program.product.status !== "ACTIVE" || batch.program.product.divisionId !== access.divisionId) missing.push("Active PBA product mapping"); if (batch.status !== "ACTIVE") missing.push("Active pilot batch"); return { batch, record: record ? { id: record.id, status: record.status, version: record.version, approval: record.history[0] ?? null } : null, value, missing }; }), staff: staff.flatMap(item => item.person.users.map(user => ({ ...user, name: item.person.displayName }))), candidates: candidates.map(row => ({ id: row.owner.id, name: row.owner.displayName })) };
  }
  async function save(userId: string, batchId: string, raw: unknown) {
    const input = pilotRegisterInput.parse(raw);
    return client.$transaction(async db => {
      const { access, batch, actorPersonId } = await scopedBatch(db, userId, batchId);
      const prior = await db.executiveRecord.findUnique({ where: { sourceKey: sourceKey(batchId) } });
      if (prior && (prior.kind !== KIND || prior.organizationId !== access.divisionId || prior.status !== "DRAFT")) throw new AccessError("Approved intake register cannot be edited");
      const payload = { ...input, batchId, programId: batch.program.id, preparedByUserId: userId, version: 1 };
      const row = prior ? await db.executiveRecord.update({ where: { id: prior.id, version: prior.version }, data: { payload: JSON.stringify(payload), version: { increment: 1 } } }) : await db.executiveRecord.create({ data: { kind: KIND, organizationId: access.divisionId, ownerPersonId: actorPersonId, title: `Kerala pilot: ${input.intakeCode}`, status: "DRAFT", sourceKey: sourceKey(batchId), payload: JSON.stringify(payload) } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: prior?.status, toStatus: "DRAFT", reason: prior ? "Pilot register draft revised" : "Pilot register draft created" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId, organizationId: access.divisionId, action: "startup.kerala_pilot.drafted", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { intakeCode: input.intakeCode, missing: missingPilotApprovals(input).length } });
      return row.id;
    });
  }
  async function approve(userId: string, batchId: string, version: number) {
    return client.$transaction(async db => {
      const { access, batch, actorPersonId } = await scopedBatch(db, userId, batchId);
      const row = await db.executiveRecord.findUnique({ where: { sourceKey: sourceKey(batchId) } });
      if (!row || row.kind !== KIND || row.organizationId !== access.divisionId || row.status !== "DRAFT" || row.version !== version || row.ownerPersonId === actorPersonId) throw new AccessError("Independent pilot approval required");
      if (batch.status !== "ACTIVE" || batch.program.status !== "ACTIVE" || !batch.program.productId) throw new AccessError("Active PBA batch and product required");
      const product = await db.product.findUnique({ where: { id: batch.program.productId }, select: { slug: true, status: true, divisionId: true } });
      if (!product || product.slug !== "pba" || product.status !== "ACTIVE" || product.divisionId !== access.divisionId) throw new AccessError("Active PBA product required");
      const value = parse(row.payload);
      if (value.batchId !== batchId || value.programId !== batch.program.id || value.preparedByUserId === userId) throw new AccessError("Pilot mapping unavailable");
      await validatedPayload(db, access.divisionId, value);
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, status: "DRAFT", version }, data: { status: "APPROVED", version: { increment: 1 } } })).count !== 1) throw new AccessError("Pilot register changed");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: "DRAFT", toStatus: "APPROVED", reason: "Independent reviewer confirmed referenced terms, authority and consent evidence" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId, organizationId: access.divisionId, action: "startup.kerala_pilot.approved", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { intakeCode: value.intakeCode, tier: value.tier } });
      return row.id;
    });
  }
  return { overview, save, approve };
}
export const startupPilotRegister = createStartupPilotRegister();
