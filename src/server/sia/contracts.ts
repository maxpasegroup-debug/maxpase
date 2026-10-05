import type { PermissionScope } from "@prisma/client";
import { siaToolRegistry } from "./registry";

export type SiaActionRisk = "LOW" | "MEDIUM" | "HIGH";

export type SiaToolContract = {
  key: string;
  name: string;
  description: string;
  requiredPermission: string;
  scope: PermissionScope;
  risk: SiaActionRisk;
  requiresApproval: boolean;
};

export type SiaExecutionContext = {
  actorUserId: string;
  organizationId: string;
  permissionGrants: Array<{
    key: string;
    scope: PermissionScope;
    organizationId: string | null;
  }>;
};

export const foundationalSiaTools: SiaToolContract[] = [
  ...siaToolRegistry.filter(t => t.category === "COMMUNICATION").map(t => ({ key: t.key, name: t.name, description: t.description, requiredPermission: t.requiredPermission, scope: t.scope, risk: "HIGH" as const, requiresApproval: true })),
  ...siaToolRegistry.filter(t => t.risk === "READ_ONLY").map(t => ({ key: t.key, name: t.name, description: t.description, requiredPermission: t.requiredPermission, scope: t.scope, risk: "LOW" as const, requiresApproval: false })),
  { key: "create_task", name: "Create a task", description: "Create one non-destructive task after independent approval and human confirmation.", requiredPermission: "task.manage", scope: "GROUP", risk: "MEDIUM", requiresApproval: true },
  {
    key: "organization.read",
    name: "Read organization context",
    description: "Allows SIA to inspect approved organization structure.",
    requiredPermission: "organization.read",
    scope: "GROUP",
    risk: "LOW",
    requiresApproval: false
  },
  {
    key: "recommendation.create",
    name: "Create recommendation",
    description: "Allows SIA to draft recommendations without executing business actions.",
    requiredPermission: "sia.approve_action",
    scope: "GROUP",
    risk: "MEDIUM",
    requiresApproval: true
  }
];
