import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { accountPortalRealm } from "./account-realm";
import { hashJobsPin } from "./jobs-pin";
import { jobsPhoneInput, jobsPinInput } from "./jobs-phone";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { NICEJOBS_TERMS_VERSION, NICEJOBS_PRIVACY_VERSION } from "@/server/nicejobs/legal-versions";

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

export function createJobsRegistrationPin(client: PrismaClient = prisma, now = () => new Date()) {
  return async function finish(userId: string, sessionId: string, raw: unknown) {
    const input = z.object({ pin: jobsPinInput, confirmPin: jobsPinInput, acceptLegal: z.literal(true) }).strict().refine(value => value.pin === value.confirmPin).parse(raw);
    const jobsPinHash = await hashJobsPin(input.pin);
    return client.$transaction(async db => {
      const session = await db.session.findUnique({ where: { id: sessionId }, include: { user: { include: { person: true } } } });
      const user = session?.user;
      if (!session || session.userId !== userId || session.createdAt.getTime() < now().getTime() - 600000 || session.expiresAt <= now() || !user?.jobsPhone || user.jobsPinHash || !user.emailVerifiedAt || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || accountPortalRealm(user.person.metadata) !== "jobs" || JSON.parse(user.person.metadata ?? "{}").identitySource !== "SELF_REGISTRATION") throw new AccessError("PIN setup unavailable");
      const scope = await requirePortalAccess(db, userId, "jobs");
      const updated = await db.user.updateMany({ where: { id: userId, jobsPinHash: null, emailVerifiedAt: { not: null } }, data: { jobsPinHash } });
      if (updated.count !== 1) throw new AccessError("PIN setup unavailable");
      const acceptedAt = now();
      const personMetadata = JSON.parse(user.person.metadata ?? "{}");
      personMetadata.legalAcceptance = { termsVersion: NICEJOBS_TERMS_VERSION, privacyVersion: NICEJOBS_PRIVACY_VERSION, acceptedAt: acceptedAt.toISOString() };
      await db.person.update({ where: { id: user.person.id }, data: { metadata: JSON.stringify(personMetadata) } });
      await db.session.deleteMany({ where: { userId } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: user.personId, organizationId: scope.divisionId, action: "nicejobs.registration.completed", entityType: "User", entityId: userId, result: "SUCCESS", metadata: { portal: "jobs", phoneVerified: false, termsVersion: NICEJOBS_TERMS_VERSION, privacyVersion: NICEJOBS_PRIVACY_VERSION, acceptedAt: acceptedAt.toISOString() } }) });
      return user.jobsPhone;
    });
  };
}

export const jobsRegistrationPin = createJobsRegistrationPin();
