import type { Prisma } from "@prisma/client";
import { createAccessContext, AccessError } from "./engine";
import { buildAuditEventData } from "@/server/audit/audit-service";
type Context = Awaited<ReturnType<typeof createAccessContext>>;

export async function validateMembershipAuthority(db: Prisma.TransactionClient, ctx: Context, membershipId: string, scope: { organizationId: string; projectId?: string | null; scope: string }) {
  const assignments = await db.membershipRole.findMany({ where: { membershipId }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
  for (const assignment of assignments) {
    if (assignment.role.organizationId !== scope.organizationId || assignment.role.principalType !== "HUMAN") throw new AccessError("Membership contains an incompatible role");
    for (const { permission } of assignment.role.permissions) await ctx.requireDelegation(permission, scope, scope.scope === "DESCENDANTS");
  }
}

export async function setHumanMembershipRole(db: Prisma.TransactionClient, ctx: Context, membershipId: string, roleId: string, enabled: boolean) {
  const membership = await db.membership.findUnique({ where: { id: membershipId } });
  if (!membership) throw new AccessError("Access denied");
  await ctx.requireAccess("membership.assign_role", membership);
  const role = await db.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  if (!role || role.organizationId !== membership.organizationId) throw new AccessError("Role must belong to the membership organization");
  if (role.principalType !== "HUMAN" || enabled && role.status !== "ACTIVE") throw new AccessError("Only active human roles may be assigned to people");
  if (enabled) for (const { permission } of role.permissions) {
    try { await ctx.requireDelegation(permission, membership, membership.scope === "DESCENDANTS"); }
    catch { throw new AccessError("Cannot delegate permissions you do not hold at this scope"); }
  }
  if (enabled) await db.membershipRole.upsert({ where: { membershipId_roleId: { membershipId, roleId } }, create: { membershipId, roleId }, update: {} });
  else await db.membershipRole.deleteMany({ where: { membershipId, roleId } });
  await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: ctx.user!.id, actorPersonId: ctx.user!.personId, organizationId: membership.organizationId, action: enabled ? "membership.role_assigned" : "membership.role_removed", entityType: "Membership", entityId: membership.id, result: "SUCCESS", metadata: { roleId, projectId: membership.projectId } }) });
}
