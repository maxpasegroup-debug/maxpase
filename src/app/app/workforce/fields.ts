import type { WorkforceKind } from "@/server/domain/workforce-input";
export type WorkforceField = { key: string; label: string; type?: "text" | "email" | "password" | "date" | "textarea"; source?: string; values?: string[]; required?: boolean };
const org: WorkforceField = { key: "organizationId", label: "Access scope", source: "organizations", required: true };
const person: WorkforceField = { key: "personId", label: "Person", source: "people", required: true };
const status: WorkforceField = { key: "status", label: "Status", values: ["ACTIVE", "SUSPENDED", "INACTIVE", "ARCHIVED"] };
const description: WorkforceField = { key: "description", label: "Description", type: "textarea" };
const structure: WorkforceField[] = [{ key: "name", label: "Name", required: true }, { key: "slug", label: "Reference", required: true }, { key: "parentId", label: "Parent organization", source: "organizations", required: true }, { key: "type", label: "Organization type", values: ["DIVISION", "BUSINESS_UNIT", "DEPARTMENT", "TEAM", "OTHER"] }, description, { ...status, values: ["ACTIVE", "INACTIVE", "ARCHIVED"] }];
export const workforceFields: Partial<Record<WorkforceKind, WorkforceField[]>> = {
  people: [org, { key: "displayName", label: "Display name", required: true }, { key: "legalName", label: "Legal name" }, { key: "email", label: "Contact email", type: "email" }, { key: "phone", label: "Phone" }, { key: "profile", label: "Profile", type: "textarea" }, status],
  users: [org, person, { key: "email", label: "Sign-in email", type: "email", required: true }, { key: "password", label: "New password", type: "password" }, status],
  memberships: [org, person, { key: "projectId", label: "Project scope", source: "projects" }, { key: "title", label: "Business title" }, { key: "scope", label: "Access coverage", values: ["ORGANIZATION", "DESCENDANTS"] }, { ...status, values: ["ACTIVE", "INACTIVE", "INVITED", "SUSPENDED", "ENDED"] }, { key: "startDate", label: "Start date", type: "date" }, { key: "endDate", label: "End date", type: "date" }],
  roles: [org, { key: "key", label: "Reference", required: true }, { key: "name", label: "Designation", required: true }, { key: "category", label: "Category" }, { key: "principalType", label: "Identity type", values: ["HUMAN", "AGENT"] }, { key: "copyRoleId", label: "Copy existing role", source: "roles" }, description, status],
  permissions: [org, { key: "key", label: "Capability reference", required: true }, { key: "name", label: "Capability name", required: true }, description, { key: "scope", label: "Scope type", values: ["COMPANY", "GROUP", "DIVISION", "DEPARTMENT", "TEAM", "PROJECT", "GLOBAL"] }],
  reporting: [org, person, { key: "managerPersonId", label: "Reports to", source: "people", required: true }, status, { key: "startDate", label: "Start date", type: "date" }, { key: "endDate", label: "End date", type: "date" }],
  responsibilities: [org, person, { key: "title", label: "Responsibility", required: true }, { key: "projectId", label: "Project", source: "projects" }, { key: "productId", label: "Product", source: "products" }, { key: "goalId", label: "Goal", source: "goals" }, status],
  organizations: structure,
  departments: structure.map(f => f.key === "type" ? { ...f, values: ["DEPARTMENT"] } : f),
  teams: structure.map(f => f.key === "type" ? { ...f, values: ["TEAM"] } : f)
};

