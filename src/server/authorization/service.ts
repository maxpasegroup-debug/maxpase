import { prisma } from "@/server/db";
import type { PermissionGrant } from "@/server/authorization/permissions";
import { activeMembershipWhere, ancestry } from "./business-scope";
import type { Prisma } from "@prisma/client";
import { AuthorizationReadBudget, loadAncestry, type ScopeNode } from "./reads";
import { READ_BUDGET, QueryBudgetError } from "@/server/domain/query-bounds";

export async function getPermissionGrantsForUser(userId: string, db: Prisma.TransactionClient = prisma, existingNodes?: ScopeNode[], budget = new AuthorizationReadBudget()): Promise<PermissionGrant[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, personId: true, person: { select: { status: true } } } });
  if (!user?.personId || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE") return [];
  const memberships = budget.consume(await db.membership.findMany({ where: { ...activeMembershipWhere(), personId: user.personId }, select: { id: true, organizationId: true, projectId: true, scopeKey: true, scope: true, organization: { select: { type: true } }, project: { select: { organizationId: true } } }, take: budget.take, orderBy: { id: "asc" } }));
  const nodes = await loadAncestry(db, memberships.map(m => m.organizationId), budget, existingNodes);
  const valid = memberships.filter(m => {
    const path = ancestry(nodes, m.organizationId);
    return path.length > 0 && path.every(n => n.status === "ACTIVE") && (m.projectId ? !!m.project && m.project.organizationId === m.organizationId && m.scopeKey === "project:" + m.projectId : m.scopeKey === "organization");
  });
  const assignments = budget.consume(await db.membershipRole.findMany({ where: { membershipId: { in: valid.map(m => m.id) }, role: { status: "ACTIVE", principalType: "HUMAN" } }, select: { membershipId: true, roleId: true, role: { select: { organizationId: true, name: true } } }, take: budget.take, orderBy: { id: "asc" } }));
  const permissions = budget.consume(await db.rolePermission.findMany({ where: { roleId: { in: [...new Set(assignments.map(a => a.roleId))] } }, select: { roleId: true, permission: { select: { key: true, scope: true } } }, take: budget.take, orderBy: { id: "asc" } }));
  const byRole = new Map<string, typeof permissions>();
  for (const p of permissions) { const rows = byRole.get(p.roleId) ?? []; rows.push(p); byRole.set(p.roleId, rows); }
  const byMembership = new Map<string, typeof assignments>();
  for (const a of assignments) { const rows = byMembership.get(a.membershipId) ?? []; rows.push(a); byMembership.set(a.membershipId, rows); }
  const grants: PermissionGrant[] = [];
  for (const m of valid) for (const a of byMembership.get(m.id) ?? []) {
    if (a.role.organizationId !== null && a.role.organizationId !== m.organizationId) continue;
    for (const p of byRole.get(a.roleId) ?? []) {
      if (m.projectId && p.permission.scope === "GLOBAL") continue;
      if (grants.length === READ_BUDGET) throw new QueryBudgetError();
      grants.push({ key: p.permission.key, scope: p.permission.scope, organizationId: m.organizationId, organizationType: m.organization.type, includeDescendants: !m.projectId && m.scope === "DESCENDANTS", projectId: m.projectId, membershipId: m.id, roleId: a.roleId, roleName: a.role.name });
    }
  }
  return grants;
}
