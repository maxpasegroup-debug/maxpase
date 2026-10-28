export const labsDeveloperRoleKeys = ["labs-software-developer", "labs-full-stack-developer", "labs-junior-developer"] as const;
export const labsStaffRoleKeys = [...labsDeveloperRoleKeys, "labs-business-development-manager"] as const;
export function labsStaffViewsForRole(key: string): readonly string[] {
  if (labsDeveloperRoleKeys.some(role => role === key)) return ["developer"];
  if (key === "labs-business-development-manager") return ["overview", "sales", "people"];
  return [];
}

export const staffRoleScopes: Record<string, string> = {
  "aira-03": "aira-skill-city",
  "aira-26": "aira-skill-city",
  "labs-division-director": "aira-labs",
  "startup-division-director": "aira-startup-school",
  "studio-division-director": "aira-skill-studio",
  "career-division-director": "aira-career-hub",
  "labs-junior-academic-advisor": "aira-labs",
  "startup-junior-academic-advisor": "aira-startup-school",
  "studio-junior-academic-advisor": "aira-skill-studio",
  "labs-full-stack-developer": "aira-labs",
  "labs-software-developer": "aira-labs",
  "labs-junior-developer": "aira-labs",
  "labs-business-development-manager": "aira-labs"
};

const requiredCapabilities: Record<string, string[]> = {
  "aira-03": ["organization.read", "executive.read", "decision.decide", "person.create", "membership.assign_role"],
  "aira-26": ["organization.read", "product.read", "labs.sales.self", "aira.crm.self"],
  "labs-division-director": ["organization.read", "executive.read", "decision.decide", "person.create", "membership.assign_role", "labs.sales.manage"],
  "startup-division-director": ["organization.read", "executive.read", "decision.decide", "person.create", "membership.assign_role", "aira.crm.manage"],
  "studio-division-director": ["organization.read", "executive.read", "decision.decide", "person.create", "membership.assign_role", "aira.crm.manage"],
  "career-division-director": ["organization.read", "executive.read", "decision.decide", "person.create", "membership.assign_role"],
  "labs-junior-academic-advisor": ["organization.read", "labs.sales.self"],
  "startup-junior-academic-advisor": ["organization.read", "aira.crm.self"],
  "studio-junior-academic-advisor": ["organization.read", "aira.crm.self"],
  "labs-full-stack-developer": ["organization.read", "labs.delivery.assignee", "project.read", "task.read"],
  "labs-software-developer": ["organization.read", "labs.delivery.assignee", "project.read", "task.read"],
  "labs-junior-developer": ["organization.read", "labs.delivery.assignee", "project.read", "task.read"],
  "labs-business-development-manager": ["organization.read", "notification.read", "labs.sales.self", "labs.sales.read", "labs.sales.manage"]
};

export function staffPortalForRole(_key: string): "skillcity" {
  return "skillcity";
}

export function isPreparedStaffRole(key: string, organizationSlug: string) {
  return staffRoleScopes[key] === organizationSlug;
}

export function hasStaffWorkspaceCapabilities(key: string, granted: readonly string[]) {
  const required = requiredCapabilities[key];
  return !!required && required.every(capability => granted.includes(capability));
}
