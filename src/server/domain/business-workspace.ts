import { prisma } from "@/server/db";
import { getPermissionGrantsForUser } from "@/server/authorization/service";
import { canAccessOrganization } from "@/server/authorization/business-scope";
import type { BusinessKind } from "./business-input";
export async function getBusinessManagementScopes(userId: string, kind: BusinessKind) {
  const grants = await getPermissionGrantsForUser(userId);
  const nodes = await prisma.organization.findMany({ select: { id: true, parentId: true, type: true, status: true } });
  const domain = { groups: "organization", companies: "company", organizations: "organization", relationships: "company", ownership: "ownership", people: "membership", memberships: "membership", brands: "brand", products: "product", projects: "project", goals: "goal" }[kind];
  return nodes.filter(n => canAccessOrganization(grants, nodes, domain + ".manage", n.id)).map(n => n.id);
}

