import type { Prisma } from "@prisma/client";
import { buildAuditEventData, type AuditEventInput } from "@/server/audit/audit-service";
import { validRecipient, type Resource } from "./operations-scope";
import { AccessError } from "@/server/authorization/engine";
export async function operationalEvent(db: Prisma.TransactionClient, input: AuditEventInput & { organizationId: string; entityId: string; projectId?: string | null; reference?: string; correlationId?: string; eventStatus?: string }) {
  const audit = await db.auditEvent.create({ data: buildAuditEventData(input) });
  return db.operationalEvent.create({ data: { eventType: input.action, actorUserId: input.actorUserId, organizationId: input.organizationId, projectId: input.projectId, entityType: input.entityType, entityId: input.entityId, status: input.eventStatus ?? (input.result === "SUCCESS" ? "SUCCEEDED" : "FAILED"), reference: input.reference ?? "audit:" + audit.id, correlationId: input.correlationId, metadata: input.metadata ? JSON.stringify(input.metadata) : null, auditId: audit.id } });
}
export async function notify(db: Prisma.TransactionClient, actorUserId: string, recipientUserId: string, resource: Resource, type: string, title: string, message: string, reference: string, priority = "NORMAL", expiresAt?: Date | null) {
  await validRecipient(db, recipientUserId, resource);
  const preference = await db.notificationPreference.findUnique({ where: { userId_type_channel: { userId: recipientUserId, channel: "IN_APP", type } } }) ?? await db.notificationPreference.findUnique({ where: { userId_type_channel: { userId: recipientUserId, channel: "IN_APP", type: "ALL" } } });
  if (preference?.enabled === false) return null;
  const existing = await db.notification.findUnique({ where: { recipientUserId_reference: { recipientUserId, reference } } });
  if (existing) {
    if (existing.organizationId !== resource.organizationId || existing.projectId !== (resource.projectId ?? null) || existing.resourceId !== resource.resourceId || existing.resourceType !== resource.resourceType || existing.type !== type || existing.title !== title || existing.message !== message || existing.priority !== priority) throw new AccessError("Notification replay mismatch");
    return existing;
  }
  const row = await db.notification.create({ data: { organizationId: resource.organizationId, projectId: resource.projectId, resourceType: resource.resourceType, resourceId: resource.resourceId, recipientUserId, type, title, message, reference, priority, expiresAt } });
  await operationalEvent(db, { actorUserId, organizationId: resource.organizationId, projectId: resource.projectId, action: "notification.generated", entityType: "Notification", entityId: row.id, result: "SUCCESS" });
  return row;
}
