import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { accountPortalRealm } from "./account-realm";
import { hashJobsPin } from "./jobs-pin";
import { jobsPhoneInput, jobsPinInput } from "./jobs-phone";
import { AccessError } from "@/server/authorization/engine";

const activationInput = z.object({ country: z.string(), nationalNumber: z.string(), pin: jobsPinInput, confirmPin: jobsPinInput }).strict().refine(value => value.pin === value.confirmPin);

export function createJobsPinActivation(client: PrismaClient = prisma, now = () => new Date()) {
  return async function activate(userId: string, sessionId: string, raw: unknown) {
    const input = activationInput.parse(raw);
    const phone = jobsPhoneInput.parse({ country: input.country, nationalNumber: input.nationalNumber });
    const jobsPinHash = await hashJobsPin(input.pin);
    await client.$transaction(async db => {
      const current = await db.session.findUnique({ where: { id: sessionId }, include: { user: { include: { person: true } } } });
      if (!current || current.userId !== userId || current.createdAt.getTime() < now().getTime() - 600000 || current.expiresAt <= now() || current.user.jobsPinHash || current.user.jobsPhone || !current.user.passwordHash || !current.user.emailVerifiedAt || current.user.status !== "ACTIVE" || current.user.person?.status !== "ACTIVE" || accountPortalRealm(current.user.person?.metadata) !== "jobs" || JSON.parse(current.user.person?.metadata ?? "{}").identitySource !== "SELF_REGISTRATION") throw new AccessError("Activation unavailable");
      if (await db.user.findUnique({ where: { jobsPhone: phone } })) throw new AccessError("Activation unavailable");
      await db.user.update({ where: { id: userId }, data: { jobsPhone: phone, jobsPinHash, passwordHash: null, person: current.user.personId ? { update: { phone } } : undefined } });
      await db.session.deleteMany({ where: { userId } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: current.user.personId, action: "auth.jobs_pin_activated", entityType: "User", entityId: userId, result: "SUCCESS", metadata: { portal: "jobs", phoneVerified: false } }) });
    });
  };
}

export const jobsPinActivation = createJobsPinActivation();
