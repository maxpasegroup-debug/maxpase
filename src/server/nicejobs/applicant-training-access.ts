import type { Prisma } from "@prisma/client";
import { activeMembershipWhere } from "@/server/authorization/business-scope";
import { operationalEvent } from "@/server/domain/operational-events";
import { NiceJobsError } from "./input";
import { applicantRoleKey } from "./applicant-access";

export const participantRoleKey = "nicejobs-accepted-participant";

// Called inside the reviewed offer acceptance transaction, never from a page read.
export async function enableAcceptedApplicantTraining(db: Prisma.TransactionClient, userId: string, personId: string, careerId: string, applicationId: string, now: Date) {
  const membership = await db.membership.findFirst({ where: { ...activeMembershipWhere(now), personId, organizationId: careerId, projectId: null, scope: "ORGANIZATION", scopeKey: "organization", roles: { some: { role: { key: applicantRoleKey, organizationId: careerId, status: "ACTIVE", principalType: "HUMAN" } } } }, select: { id: true } });
  if (!membership) return;
  const application = await db.niceJobsApplication.findFirst({ where: { id: applicationId, candidateId: personId, status: "OFFER_ACCEPTED", candidate: { status: "ACTIVE", users: { some: { id: userId, status: "ACTIVE" } } } }, select: { id: true, divisionId: true } });
  const proof = application ? await db.operationalEvent.findFirst({ where: { entityId: application.id, entityType: "NiceJobsApplication", eventType: "nicejobs.application.accept_offer", status: "SUCCEEDED", organizationId: application.divisionId, audit: { actorUserId: userId, actorPersonId: personId, result: "SUCCESS" } }, select: { id: true } }) : null;
  if (!proof) throw new NiceJobsError("Audited candidate acceptance required for training access");
  const permission = await db.permission.findUnique({ where: { key: "nicejobs.onboarding.self" }, select: { id: true, scope: true } });
  if (!permission || permission.scope !== "GROUP") throw new NiceJobsError("Participant training access is not configured");
  const role = await db.role.upsert({ where: { organizationId_key: { organizationId: careerId, key: participantRoleKey } }, update: {}, create: { organizationId: careerId, key: participantRoleKey, name: "Accepted Nice Jobs participant", category: "APPLICANT", system: true, description: "Own accepted-offer training only. No worker, wallet, resource or management authority.", permissions: { create: { permissionId: permission.id } } }, include: { permissions: { select: { permissionId: true } } } });
  if (role.status !== "ACTIVE" || role.principalType !== "HUMAN" || role.canonical || !role.system || role.permissions.length !== 1 || role.permissions[0].permissionId !== permission.id) throw new NiceJobsError("Participant training role configuration mismatch");
  const assigned = await db.membershipRole.findUnique({ where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } }, select: { id: true } });
  if (assigned) return;
  await db.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
  await operationalEvent(db, { actorUserId: userId, actorPersonId: personId, organizationId: careerId, action: "nicejobs.participant.training_access", entityType: "Membership", entityId: membership.id, result: "SUCCESS", reference: `nicejobs.participant.training:${membership.id}`, metadata: { applicationId, acceptanceEventId: proof.id, roleId: role.id, permission: "nicejobs.onboarding.self" } });
}
