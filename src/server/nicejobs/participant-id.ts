import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { requirePortalAccess } from "@/server/portals/policy";
import { AccessError } from "@/server/authorization/engine";

// A public reference, not a credential or a sequential count of participants.
export function newNiceJobsId(at: Date = new Date(), bytes: () => Buffer = () => randomBytes(10)) {
  return `NJ-${at.getUTCFullYear()}-${bytes().toString("hex").toUpperCase()}`;
}

export async function ownNiceJobsId(userId: string, client: PrismaClient = prisma) {
  return client.$transaction(async db => {
    await requirePortalAccess(db, userId, "jobs");
    const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, jobsPhone: true, emailVerifiedAt: true, person: { select: { status: true, niceJobsId: true } } } });
    if (user?.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || !user.jobsPhone || !user.emailVerifiedAt || !user.person.niceJobsId) throw new AccessError("Participant identity unavailable");
    return user.person.niceJobsId;
  });
}
