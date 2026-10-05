import type { AuditResult, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export type AuditEventInput = {
  actorUserId?: string | null;
  actorPersonId?: string | null;
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  result: AuditResult;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export function buildAuditEventData(input: AuditEventInput): Prisma.AuditEventCreateInput {
  return {
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    result: input.result,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    actorUser: input.actorUserId ? { connect: { id: input.actorUserId } } : undefined,
    actorPerson: input.actorPersonId ? { connect: { id: input.actorPersonId } } : undefined,
    organization: input.organizationId ? { connect: { id: input.organizationId } } : undefined
  };
}

export async function createAuditEvent(input: AuditEventInput) {
  return prisma.auditEvent.create({
    data: buildAuditEventData(input)
  });
}
