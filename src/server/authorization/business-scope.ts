import type { Organization, Prisma } from "@prisma/client";
import type { PermissionGrant } from "./permissions";

type Node = Pick<Organization, "id" | "parentId" | "type" | "status">;
export function ancestry(nodes: Node[], id: string): Node[] {
  const result: Node[] = [];
  const seen = new Set<string>();
  let current = nodes.find(n => n.id === id);
  while (current && !seen.has(current.id)) {
    result.push(current);
    seen.add(current.id);
    current = nodes.find(n => n.id === current!.parentId);
  }
  return result.length && result[result.length - 1].parentId === null ? result : [];
}
export function indexAncestry(nodes: Node[]) {
  const index = new Map(nodes.map(n => [n.id, n]));
  const paths = new Map<string, Node[]>();
  return (id: string): Node[] => {
    if (!paths.has(id)) {
      const result: Node[] = [], seen = new Set<string>();
      let current = index.get(id);
      while (current && !seen.has(current.id)) { result.push(current); seen.add(current.id); current = current.parentId ? index.get(current.parentId) : undefined; }
      paths.set(id, result.length && result.at(-1)!.parentId === null ? result : []);
    }
    return paths.get(id)!;
  };
}
export function canAccessOrganization(grants: PermissionGrant[], nodes: Node[], permission: string, id: string, pathFor: (id: string) => Node[] = id => ancestry(nodes, id)) {
  const path = pathFor(id);
  if (!path.length || path.some(n => n.status !== "ACTIVE")) return false;
  return grants.some(g => g.key === permission && !g.projectId && g.scope !== "PROJECT" && (
    g.scope === "GLOBAL" || path.some(n => n.id === g.organizationId &&
      (n.id === id || g.includeDescendants !== false))
  ));
}
export const activeMembershipWhere = (now = new Date()): Prisma.MembershipWhereInput => ({
  status: "ACTIVE", organization: { status: "ACTIVE" }, person: { status: "ACTIVE" },
  AND: [{ OR: [{ startDate: null }, { startDate: { lte: now } }] }, { OR: [{ endDate: null }, { endDate: { gt: now } }] }]
});
