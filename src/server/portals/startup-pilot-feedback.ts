import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { createSecurityLimiter, securityKey } from "@/server/security/rate-limit";
import { requirePortalAccess } from "./policy";
import { requireStartupStaffAccess } from "./startup-staff-access";

const applicantStages = ["SIGNUP", "APPLICATION", "STATUS"] as const;
const founderStages = ["LEARNING", "EVIDENCE", "MENTOR_FEEDBACK"] as const;
const stage = z.enum([...applicantStages, ...founderStages]);
export const pilotFeedbackInput = z.object({ stage, message: z.string().trim().min(20).max(1200), enrollmentId: z.string().min(1).max(200).optional() }).strict();
const stored = pilotFeedbackInput.extend({ version: z.literal(1) });
export const pilotFeedbackDecision = z.object({ id: z.string().min(1).max(200), version: z.number().int().nonnegative(), status: z.enum(["ACKNOWLEDGED", "RESOLVED"]), note: z.string().trim().min(10).max(1000) }).strict();
const kind = "STARTUP_PILOT_FEEDBACK";

export function createStartupPilotFeedback(client: PrismaClient = prisma) {
  const limit = createSecurityLimiter(client);
  async function submit(userId: string, raw: unknown) {
    const input = pilotFeedbackInput.parse(raw);
    const founder = founderStages.includes(input.stage as typeof founderStages[number]);
    if (founder !== !!input.enrollmentId) throw new AccessError("Feedback context unavailable");
    await limit(securityKey("startup:pilot-feedback", userId), 5, 86400);
    return client.$transaction(async db => {
      const access = await requirePortalAccess(db, userId, "startup");
      const personId = access.ctx.user?.personId;
      if (!personId) throw new AccessError("Account unavailable");
      if (founder) {
        const participant = await db.batchParticipant.findFirst({ where: { id: input.enrollmentId, personId, status: "ACTIVE", batch: { status: "ACTIVE", program: { organizationId: access.divisionId, companyOrganizationId: access.companyId, status: "ACTIVE" } } }, select: { id: true } });
        if (!participant) throw new AccessError("Founder enrollment unavailable");
      } else {
        const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, person: { select: { metadata: true } } } });
        if (!user?.emailVerifiedAt || JSON.parse(user.person?.metadata ?? "{}").authenticationRealm !== "startup") throw new AccessError("Verified applicant account required");
      }
      const row = await db.executiveRecord.create({ data: { kind, organizationId: access.divisionId, ownerPersonId: personId, title: "Startup Skool pilot experience", status: "OPEN", sourceKey: `startup:pilot-feedback:${randomUUID()}`, payload: JSON.stringify({ ...input, version: 1 }) } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, toStatus: "OPEN", reason: "Experience feedback submitted" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: personId, organizationId: access.divisionId, action: "startup.pilot_feedback.submitted", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { stage: input.stage } });
      return row.id;
    });
  }
  async function mine(userId: string) {
    const access = await requirePortalAccess(client, userId, "startup");
    const personId = access.ctx.user?.personId;
    if (!personId) throw new AccessError("Account unavailable");
    const rows = await client.executiveRecord.findMany({ where: { kind, organizationId: access.divisionId, ownerPersonId: personId }, select: { id: true, status: true, payload: true, createdAt: true, history: { select: { toStatus: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 10 });
    return rows.map(row => ({ id: row.id, status: row.status, stage: stored.parse(JSON.parse(row.payload)).stage, createdAt: row.createdAt, response: row.history[0]?.toStatus === "OPEN" ? null : row.history[0]?.reason ?? null }));
  }
  async function queue(userId: string) {
    const access = await requireStartupStaffAccess(client, userId);
    await access.ctx.requireAccess("program.manage", { organizationId: access.divisionId });
    const rows = await client.executiveRecord.findMany({ where: { kind, organizationId: access.divisionId, status: { in: ["OPEN", "ACKNOWLEDGED", "RESOLVED"] } }, select: { id: true, status: true, version: true, payload: true, createdAt: true, owner: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map(row => ({ id: row.id, status: row.status, version: row.version, stage: stored.parse(JSON.parse(row.payload)).stage, message: stored.parse(JSON.parse(row.payload)).message, createdAt: row.createdAt, owner: row.owner.displayName }));
  }
  async function decide(userId: string, raw: unknown) {
    const input = pilotFeedbackDecision.parse(raw);
    return client.$transaction(async db => {
      const access = await requireStartupStaffAccess(db, userId);
      await access.ctx.requireAccess("program.manage", { organizationId: access.divisionId });
      const actor = access.ctx.user?.personId;
      const row = await db.executiveRecord.findFirst({ where: { id: input.id, kind, organizationId: access.divisionId }, select: { id: true, ownerPersonId: true, status: true, version: true } });
      if (!actor || !row || actor === row.ownerPersonId || row.version !== input.version || !(row.status === "OPEN" && ["ACKNOWLEDGED", "RESOLVED"].includes(input.status) || row.status === "ACKNOWLEDGED" && input.status === "RESOLVED")) throw new AccessError("Feedback decision unavailable");
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, kind, organizationId: access.divisionId, status: row.status, version: input.version }, data: { status: input.status, version: { increment: 1 } } })).count !== 1) throw new AccessError("Feedback changed");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: input.status, reason: input.note } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor, organizationId: access.divisionId, action: `startup.pilot_feedback.${input.status.toLowerCase()}`, entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS" });
      return row.id;
    });
  }
  return { submit, mine, queue, decide };
}
export const startupPilotFeedback = createStartupPilotFeedback();
