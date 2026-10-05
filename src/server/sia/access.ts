import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { canAccessOrganization } from "@/server/authorization/business-scope";
import { foundationalSiaTools } from "./contracts";
import type { PermissionGrant } from "@/server/authorization/permissions";
import { AuthorizationReadBudget, loadAncestry, loadAgentGrants } from "@/server/authorization/reads";

export async function inspectSiaToolAccess(siaId: string, toolKey: string, organizationId: string, db: Prisma.TransactionClient = prisma) {
  const budget = new AuthorizationReadBudget();
  const sia = await db.siaIdentity.findUnique({ where: { id: siaId }, select: { status: true } });
  const contract = foundationalSiaTools.find(t => t.key === toolKey);
  const nodes = await loadAncestry(db, [organizationId], budget);
  const grants: PermissionGrant[] = await loadAgentGrants(db, siaId, budget, nodes.map(n => n.id));
  const tool = await db.siaTool.findUnique({ where: { siaId_key: { siaId, key: toolKey } }, select: { enabled: true, permissionKey: true } });
  const permissionAllowed = !!sia && sia.status === "ACTIVE" && !!contract && canAccessOrganization(grants, nodes, contract.requiredPermission, organizationId);
  const toolAllowed = !!contract && !!tool?.enabled && tool.permissionKey === contract.requiredPermission;
  return { permissionAllowed, toolAllowed, approvalRequired: contract?.requiresApproval ?? true, executionEnabled: false, reason: permissionAllowed && toolAllowed ? "Capability and tool are scoped; approval/execution remains a later-phase gate" : "Missing active SIA identity, scoped capability or enabled tool" };
}
