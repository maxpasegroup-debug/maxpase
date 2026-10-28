import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { requirePortalAccess } from "./policy";
import { requireStartupStaffAccess } from "./startup-staff-access";

const tiers = ["STARTER", "PRO", "EXTRAORDINARY"] as const;
export const startupApplicationInput = z.object({ tier: z.enum(tiers), idea: z.string().trim().min(20).max(1500), goal: z.string().trim().min(20).max(1500), experience: z.string().trim().min(10).max(1000), location: z.string().trim().min(2).max(120), timeCommitment: z.string().trim().min(5).max(250), consent: z.literal(true) }).strict();
const reviewInput = z.object({ id: z.string().min(1).max(200), version: z.number().int().min(0), decision: z.enum(["IN_REVIEW", "APPROVED", "REJECTED"]), reason: z.string().trim().min(5).max(1000) }).strict();
const kind = "STARTUP_APPLICATION";
const statuses = new Set(["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED"]);
export type StartupApplicationPayload = z.infer<typeof startupApplicationInput> & { noticeVersion: 1 };
function parsePayload(raw: string): StartupApplicationPayload {
  const parsed = startupApplicationInput.extend({ noticeVersion: z.literal(1) }).safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("Application data unavailable");
  return parsed.data;
}
export function createStartupApplications(client: PrismaClient = prisma) {
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
  async function review(userId: string, raw: unknown) {
    const input = reviewInput.parse(raw);
    return client.$transaction(async db => {
      const access = await requireStartupStaffAccess(db, userId);
      const actor = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
      const row = await db.executiveRecord.findFirst({ where: { id: input.id, organizationId: access.divisionId, kind }, select: { id: true, ownerPersonId: true, version: true, status: true } });
      if (!row || !actor.personId || actor.personId === row.ownerPersonId || row.version !== input.version || !(["SUBMITTED", "IN_REVIEW"].includes(row.status)) || input.decision === "IN_REVIEW" && row.status !== "SUBMITTED") throw new AccessError("Application decision unavailable or already recorded");
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, organizationId: access.divisionId, kind, version: input.version, status: row.status }, data: { status: input.decision, version: { increment: 1 } } })).count !== 1) throw new AccessError("Application changed. Refresh before deciding");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: input.decision, reason: input.reason } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor.personId, organizationId: access.divisionId, action: `startup.application.${input.decision.toLowerCase()}`, entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { previousStatus: row.status, nextStatus: input.decision, version: input.version + 1 } });
      return { id: row.id, status: input.decision };
    });
  }
  return { mine, submit, queue, review };
}
export const startupApplications = createStartupApplications();
