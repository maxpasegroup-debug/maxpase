import type { Organization, Prisma } from "@prisma/client";
import type { PermissionGrant } from "./permissions";
import { READ_BUDGET, QueryBudgetError } from "@/server/domain/query-bounds";

export type ScopeNode = Pick<Organization, "id" | "parentId" | "type" | "status">;
const nodeSelect = { id: true, parentId: true, type: true, status: true } as const;
export class AuthorizationReadBudget {
  private remaining = READ_BUDGET;
  get take() { return this.remaining + 1; }
  consume<T>(rows: T[]): T[] {
    if (rows.length > this.remaining) throw new QueryBudgetError();
    this.remaining -= rows.length;
    return rows;
  }
}

// Only grant anchors, their ancestors and explicitly requested descendants are read.
export async function loadAncestry(db: Prisma.TransactionClient, ids: string[], budget = new AuthorizationReadBudget(), existing: ScopeNode[] = []) {
  const nodes = new Map(existing.map(n => [n.id, n]));
  let pending = [...new Set(ids)].filter(id => !nodes.has(id));
  while (pending.length) {
    const next = new Set<string>();
    for (let i = 0; i < pending.length; i += 250) {
      const rows = budget.consume(await db.organization.findMany({ where: { id: { in: pending.slice(i, i + 250) } }, select: nodeSelect, take: budget.take, orderBy: { id: "asc" } }));
      for (const row of rows) { nodes.set(row.id, row); if (row.parentId && !nodes.has(row.parentId)) next.add(row.parentId); }
    }
    pending = [...next].filter(id => !nodes.has(id));
  }
  return [...nodes.values()];
}

export async function loadDescendants(db: Prisma.TransactionClient, roots: string[], nodes: ScopeNode[], budget: AuthorizationReadBudget) {
  const result = new Map(nodes.map(n => [n.id, n]));
  const visited = new Set<string>();
  let pending = [...new Set(roots)];
  while (pending.length) {
    const next: string[] = [];
    for (let i = 0; i < pending.length; i += 250) {
      const parents = pending.slice(i, i + 250).filter(id => !visited.has(id));
      parents.forEach(id => visited.add(id));
      if (!parents.length) continue;
      const rows = budget.consume(await db.organization.findMany({ where: { parentId: { in: parents } }, select: nodeSelect, take: budget.take, orderBy: { id: "asc" } }));
      for (const row of rows) { result.set(row.id, row); if (row.status === "ACTIVE" && !visited.has(row.id)) next.push(row.id); }
    }
    pending = next;
  }
  return [...result.values()];
}

export async function loadAgentGrants(db: Prisma.TransactionClient, siaId: string, budget: AuthorizationReadBudget, organizationIds?: string[]) {
  const agent = await db.siaIdentity.findUnique({ where: { id: siaId }, select: { status: true } });
  if (agent?.status !== "ACTIVE") return [];
  const assignments = budget.consume(await db.siaRoleAssignment.findMany({ where: { siaId, ...(organizationIds ? { organizationId: { in: organizationIds } } : {}), role: { status: "ACTIVE", principalType: "AGENT" } }, select: { organizationId: true, includeDescendants: true, roleId: true, role: { select: { organizationId: true } } }, take: budget.take, orderBy: { id: "asc" } }));
  const valid = assignments.filter(a => a.role.organizationId === a.organizationId);
  const permissions = budget.consume(await db.rolePermission.findMany({ where: { roleId: { in: [...new Set(valid.map(a => a.roleId))] }, permission: { scope: { not: "GLOBAL" } } }, select: { roleId: true, permission: { select: { key: true, scope: true } } }, take: budget.take, orderBy: { id: "asc" } }));
  const byRole = new Map<string, typeof permissions>();
  for (const p of permissions) { const rows = byRole.get(p.roleId) ?? []; rows.push(p); byRole.set(p.roleId, rows); }
  const grants: PermissionGrant[] = [];
  for (const a of valid) for (const p of byRole.get(a.roleId) ?? []) {
    if (grants.length === READ_BUDGET) throw new QueryBudgetError();
    grants.push({ key: p.permission.key, scope: p.permission.scope, organizationId: a.organizationId, includeDescendants: a.includeDescendants });
  }
  return grants;
}
