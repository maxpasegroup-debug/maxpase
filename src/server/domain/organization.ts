import type { OrganizationType } from "@prisma/client";

const allowedChildTypes: Record<OrganizationType, OrganizationType[]> = {
  GROUP: ["COMPANY", "DIVISION", "BUSINESS_UNIT", "DEPARTMENT", "TEAM", "OTHER"],
  COMPANY: ["DIVISION", "BUSINESS_UNIT", "DEPARTMENT", "TEAM", "OTHER"],
  DIVISION: ["BUSINESS_UNIT", "DEPARTMENT", "TEAM", "OTHER"],
  BUSINESS_UNIT: ["DEPARTMENT", "TEAM", "OTHER"],
  DEPARTMENT: ["TEAM", "OTHER"],
  TEAM: ["OTHER"],
  OTHER: ["OTHER"]
};

export function canNestOrganization(parentType: OrganizationType, childType: OrganizationType) {
  return allowedChildTypes[parentType].includes(childType);
}
