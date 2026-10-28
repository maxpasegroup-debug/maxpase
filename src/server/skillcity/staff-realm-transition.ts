import type { PrismaClient } from "@prisma/client";
import { AccessError } from "@/server/authorization/engine";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { hasStaffWorkspaceCapabilities, staffRoleScopes } from "./staff-roles";

const labsRoleKeys = Object.keys(staffRoleScopes).filter(key => staffRoleScopes[key] === "aira-labs");

/** Move a verified legacy Labs password employee to Skill City after a valid password login. */
export async function transitionLegacyLabsStaff(client: PrismaClient, userId: string, expectedPasswordHash: string) {
  return client.$transaction(async db => {
    const user = await db.user.findUnique({ where: { id: userId }, include: { person: true } });
    if (!user?.person || user.status !== "ACTIVE" || user.person.status !== "ACTIVE" || !user.emailVerifiedAt || user.passwordHash !== expectedPasswordHash) throw new AccessError("Employee transition unavailable");
    let metadata: Record<string, unknown>;
    try { metadata = JSON.parse(user.person.metadata ?? "{}"); } catch { throw new AccessError("Employee transition unavailable"); }
    if (metadata.authenticationRealm !== "labs" || metadata.credentialKind !== "STAFF_PASSWORD" || await db.user.count({ where: { personId: user.person.id } }) !== 1) throw new AccessError("Employee transition unavailable");
    const division = await db.organization.findUnique({ where: { slug: "aira-labs" }, select: { id: true, parentId: true, status: true, parent: { select: { slug: true, status: true, company: { select: { status: true } } } } } });
    if (!division || division.status !== "ACTIVE" || division.parent?.slug !== "aira-skill-city" || division.parent.status !== "ACTIVE" || division.parent.company?.status !== "ACTIVE") throw new AccessError("Employee transition unavailable");
    const appointment = await db.membership.findFirst({ where: { organizationId: division.id, personId: user.person.id, status: "ACTIVE", roles: { some: { role: { organizationId: division.id, status: "ACTIVE", principalType: "HUMAN", key: { in: labsRoleKeys } } } } }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
    if (!appointment?.roles.some(item => item.role.organizationId === division.id && item.role.status === "ACTIVE" && item.role.principalType === "HUMAN" && labsRoleKeys.includes(item.role.key) && hasStaffWorkspaceCapabilities(item.role.key, item.role.permissions.map(grant => grant.permission.key)))) throw new AccessError("Employee transition unavailable");
    if ((await db.person.updateMany({ where: { id: user.person.id, metadata: user.person.metadata }, data: { metadata: JSON.stringify({ ...metadata, authenticationRealm: "skillcity", staffRealmTransition: "VERIFIED_PASSWORD_LOGIN" }) } })).count !== 1) throw new AccessError("Employee transition changed");
    await db.session.deleteMany({ where: { userId } });
    await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: user.person.id, organizationId: division.id, action: "staff.realm_migrated", entityType: "User", entityId: userId, result: "SUCCESS", metadata: { from: "labs", to: "skillcity" } }) });
  });
}
