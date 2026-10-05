import type { PermissionScope } from "@prisma/client";

export type PermissionGrant = {
  key: string;
  scope: PermissionScope;
  organizationId: string | null;
  organizationType?: string;
  includeDescendants?: boolean;
  projectId?: string | null;
  membershipId?: string;
  roleId?: string;
  roleName?: string;
};

export type AuthorizationRequest = {
  permission: string;
  organizationId?: string | null;
  scope?: PermissionScope;
  projectId?: string | null;
};

export function hasPermission(grants: PermissionGrant[], request: AuthorizationRequest) {
  return grants.some((grant) => {
    if (grant.key !== request.permission) return false;
    if (grant.projectId) return !!request.projectId && grant.projectId === request.projectId && grant.organizationId === request.organizationId;
    if (grant.scope === "PROJECT") return false;
    if (grant.scope === "GLOBAL") return true;
    if (request.organizationId && grant.organizationId === request.organizationId) return true;
    return false;
  });
}

export function requirePermission(grants: PermissionGrant[], request: AuthorizationRequest) {
  if (!hasPermission(grants, request)) {
    throw new Error(`Permission denied: ${request.permission}`);
  }
}
