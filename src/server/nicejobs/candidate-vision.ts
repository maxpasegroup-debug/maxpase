import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { requirePortalAccess } from "@/server/portals/policy";
import { NiceJobsError } from "./input";

export const visionInput = z.object({
  outcome: z.string().trim().min(3).max(160),
  reason: z.string().trim().max(500),
  nextStep: z.string().trim().min(3).max(160)
}).strict();
export type PersonalVision = z.infer<typeof visionInput>;

export function readVisionMetadata(raw: string | null): PersonalVision | null {
  if (!raw) return null;
  try {
    const metadata = JSON.parse(raw);
    return visionInput.safeParse(metadata?.niceJobsVision).data ?? null;
  } catch { return null; }
}

export function createCandidateVision(client: PrismaClient = prisma) {
  async function read(userId: string) {
    return client.$transaction(async db => {
      await requirePortalAccess(db, userId, "jobs");
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, person: { select: { status: true, metadata: true } } } });
      if (user?.status !== "ACTIVE" || user.person?.status !== "ACTIVE") throw new AccessError("Account unavailable");
      return readVisionMetadata(user.person.metadata);
    });
  }
  async function save(userId: string, raw: unknown) {
    const vision = visionInput.parse(raw);
    return client.$transaction(async db => {
      const scope = await requirePortalAccess(db, userId, "jobs");
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, personId: true, person: { select: { status: true, metadata: true } } } });
      if (user?.status !== "ACTIVE" || !user.personId || user.person?.status !== "ACTIVE") throw new AccessError("Account unavailable");
      let metadata: Record<string, unknown>;
      try { metadata = JSON.parse(user.person.metadata ?? "{}"); }
      catch { throw new NiceJobsError("Your profile could not be updated. Please contact support."); }
      if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") throw new NiceJobsError("Your profile could not be updated. Please contact support.");
      const updated = await db.person.updateMany({ where: { id: user.personId, metadata: user.person.metadata }, data: { metadata: JSON.stringify({ ...metadata, niceJobsVision: vision }) } });
      if (updated.count !== 1) throw new NiceJobsError("Your profile changed. Reload and try again.");
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: user.personId, organizationId: scope.divisionId, action: "nicejobs.personal_vision.updated", entityType: "Person", entityId: user.personId, result: "SUCCESS", metadata: { fields: ["outcome", "reason", "nextStep"] } }) });
      return vision;
    });
  }
  return { read, save };
}

export const candidateVision = createCandidateVision();
