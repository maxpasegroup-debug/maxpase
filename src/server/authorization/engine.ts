import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { getPermissionGrantsForUser } from "./service";
import { ancestry, canAccessOrganization, indexAncestry } from "./business-scope";
import type { PermissionGrant } from "./permissions";
import { AuthorizationReadBudget, loadAncestry, loadDescendants, loadAgentGrants } from "./reads";
import { READ_BUDGET, QueryBudgetError } from "@/server/domain/query-bounds";

export class AccessError extends Error {}
export type ResourceScope = { organizationId: string; projectId?: string | null };
export type AccessDecision = { allowed: boolean; reason: string; permission: string; scope: ResourceScope; via?: Pick<PermissionGrant, "membershipId" | "roleId" | "roleName" | "organizationId" | "projectId"> };
export type AgentConstraint = { siaId: string; organizationId?: string; projectId?: string };
export async function createAccessContext(userId: string, db: Prisma.TransactionClient = prisma, constraint?: AgentConstraint, requestedScope?: ResourceScope) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, personId: true, status: true, person: { select: { status: true } } } });
  const budget = new AuthorizationReadBudget();
  let grants = await getPermissionGrantsForUser(userId, db, undefined, budget);
  const window = constraint?.organizationId ? { organizationId: constraint.organizationId, projectId: constraint.projectId } : requestedScope;
  let nodes = await loadAncestry(db, [...new Set([...grants.map(g => g.organizationId!).filter(Boolean), ...(window ? [window.organizationId] : [])])], budget);
  const windowPath = window ? ancestry(nodes, window.organizationId) : [];
  const roots = grants.filter(g => !g.projectId && g.includeDescendants && g.scope !== "PROJECT").flatMap(g => !window ? [g.organizationId!] : window.projectId ? [] : g.scope === "GLOBAL" || windowPath.some(n => n.id === g.organizationId) ? [window.organizationId] : ancestry(nodes, g.organizationId!).some(n => n.id === window.organizationId) ? [g.organizationId!] : []);
  if (!window && grants.some(g => g.scope === "GLOBAL" && !g.projectId)) nodes = budget.consume(await db.organization.findMany({ select: { id: true, parentId: true, type: true, status: true }, take: budget.take, orderBy: { id: "asc" } }));
  else {
    if (window && !window.projectId && grants.some(g => g.scope === "GLOBAL" && !g.projectId)) roots.push(window.organizationId);
    nodes = await loadDescendants(db, roots, nodes, budget);
  }
  const pathFor = indexAncestry(nodes);
  if (constraint) {
    const agentGrants: PermissionGrant[] = await loadAgentGrants(db, constraint.siaId, budget, nodes.map(n => n.id));
    const inScope = (id: string) => !constraint.organizationId || pathFor(id).some(n => n.id === constraint.organizationId);
    // Materialize only the intersection, before domain queries or aggregate calculations.
    const intersection: PermissionGrant[] = [];
    const projects = budget.consume(await db.project.findMany({ where: { id: constraint.projectId ?? { in: grants.filter(g => g.projectId).map(g => g.projectId!) } }, select: { id: true, organizationId: true }, take: budget.take, orderBy: { id: "asc" } }));
    for (const key of new Set(grants.map(g => g.key))) {
      if (!constraint.projectId) for (const node of nodes) if (inScope(node.id) && canAccessOrganization(grants, nodes, key, node.id, pathFor) && canAccessOrganization(agentGrants, nodes, key, node.id, pathFor)) { if (intersection.length === READ_BUDGET) throw new QueryBudgetError(); intersection.push({ key, scope: "GROUP", organizationId: node.id, includeDescendants: false }); }
      for (const p of projects) if (inScope(p.organizationId) && canAccessOrganization(agentGrants, nodes, key, p.organizationId, pathFor) && grants.some(g => g.key === key && (g.projectId ? g.projectId === p.id && g.organizationId === p.organizationId : canAccessOrganization([g], nodes, key, p.organizationId, pathFor)))) { if (intersection.length === READ_BUDGET) throw new QueryBudgetError(); intersection.push({ key, scope: "PROJECT", organizationId: p.organizationId, projectId: p.id, includeDescendants: false }); }
    }
    grants = intersection;
    if (grants.length > READ_BUDGET) throw new QueryBudgetError();
  }
  const active = !!user && user.status === "ACTIVE" && (!user.person || user.person.status === "ACTIVE");
  async function decide(permission: string, scope: ResourceScope): Promise<AccessDecision> {
    const denied = (reason: string): AccessDecision => ({ allowed: false, reason, permission, scope });
    if (!active) return denied("Account or person is not active");
    const path = pathFor(scope.organizationId);
    if (!path.length || path.some(n => n.status !== "ACTIVE")) return denied("Organization scope is unavailable");
    if (window && (!path.some(n => n.id === window.organizationId) || window.projectId && scope.projectId && scope.projectId !== window.projectId)) return denied("Resource is outside requested scope");
    if (scope.projectId) {
      const project = await db.project.findUnique({ where: { id: scope.projectId }, select: { organizationId: true, status: true } });
      if (!project || project.organizationId !== scope.organizationId) return denied("Project does not belong to this scope");
    }
    const grant = grants.find(g => g.key === permission && (g.projectId
      ? g.projectId === scope.projectId && g.organizationId === scope.organizationId
      : canAccessOrganization([g], nodes, permission, scope.organizationId, pathFor)));
    if (!grant) return denied("No explicit permission covers this resource");
    return { allowed: true, reason: "Explicit permission through active membership and role", permission, scope, via: { membershipId: grant.membershipId, roleId: grant.roleId, roleName: grant.roleName, organizationId: grant.organizationId, projectId: grant.projectId } };
  }
  async function requireAccess(permission: string, scope: ResourceScope) {
    const decision = await decide(permission, scope);
    if (!decision.allowed) throw new AccessError("Access denied");
    return decision;
  }
  const idsByPermission = new Map<string, string[]>();
  const organizationIds = (permission: string) => {
    if (!active) return [];
    if (!idsByPermission.has(permission)) idsByPermission.set(permission, nodes.filter(n => (!window || pathFor(n.id).some(a => a.id === window.organizationId)) && canAccessOrganization(grants, nodes, permission, n.id, pathFor)).map(n => n.id));
    return [...idsByPermission.get(permission)!];
  };
  function requireGlobal(permission: string) {
    if (!active || !grants.some(g => g.key === permission && g.scope === "GLOBAL" && !g.projectId && ancestry(nodes, g.organizationId ?? "").every(n => n.status === "ACTIVE"))) throw new AccessError("Global capability required");
  }
  async function requireDelegation(permission: { key: string; scope: string }, scope: ResourceScope, descendants = false) {
    await requireAccess(permission.key, scope);
    if (permission.scope === "GLOBAL") { requireGlobal(permission.key); if (scope.projectId) throw new AccessError("Global access cannot be assigned to a project"); return; }
    if (descendants && !grants.some(g => g.key === permission.key && !g.projectId && (g.scope === "GLOBAL" || g.includeDescendants === true && ancestry(nodes, scope.organizationId).some(n => n.id === g.organizationId)))) throw new AccessError("Cannot delegate broader descendant access");
  }
  return { user, active, nodes, grants, decide, requireAccess, requireGlobal, requireDelegation, organizationIds };
}
