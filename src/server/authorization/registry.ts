import type { PermissionScope } from "@prisma/client";
export const workforcePermissions: { key: string; name: string; scope: PermissionScope }[] = [
  ...["integration.read", "integration.manage", "communication.read", "communication.draft", "communication.send", "communication.process", "communication.policy.manage", "communication.consent.manage", "communication.template.manage", "automation.read", "automation.manage", "automation.process"].map(key => ({ key, name: key.replaceAll(".", " "), scope: "GROUP" as const })),
  ...["executive.read", "attention.manage", "decision.read", "decision.manage", "decision.decide", "kpi.read", "kpi.manage", "risk.read", "risk.manage", "opportunity.read", "opportunity.manage"].map(key => ({ key, name: key.replaceAll(".", " "), scope: "GROUP" as const })),
  ...["program", "batch", "location"].flatMap(domain => ["read", "manage"].map(action => ({ key: domain + "." + action, name: action + " " + domain, scope: "GROUP" as const }))),
  ...["workflow", "request", "reminder", "recurrence", "escalation", "control", "event"].flatMap(domain => ["read", "manage"].map(action => ({ key: domain + "." + action, name: action + " " + domain, scope: "GROUP" as const }))),
  ...["approval.read", "approval.decide", "workflow.transition", "control.evaluate", "notification.read", "notification.generate", "activity.read", "operations.process", "sia.propose"].map(key => ({ key, name: key.replaceAll(".", " "), scope: "GROUP" as const })),
  ...["task", "milestone", "dependency", "blocker"].flatMap(domain => ["read", "manage"].map(action => ({ key: domain + "." + action, name: action + " " + domain, scope: "GROUP" as const }))),
  ...["project", "task", "milestone", "goal"].map(domain => ({ key: domain + ".reopen", name: "Reopen " + domain, scope: "GROUP" as const })),
  { key: "goal.progress", name: "Record goal progress", scope: "GROUP" },
  ...["person", "user", "role"].flatMap(domain => ["read", "create", "update"].map(action => ({ key: domain + "." + action, name: action[0].toUpperCase() + action.slice(1) + " " + domain, scope: "GROUP" as const }))),
  { key: "person.archive", name: "Archive people", scope: "GROUP" },
  { key: "permission.read", name: "View capabilities", scope: "GROUP" },
  { key: "permission.create", name: "Register capabilities", scope: "GLOBAL" },
  { key: "permission.assign", name: "Assign role capabilities", scope: "GROUP" },
  { key: "reporting.read", name: "View reporting relationships", scope: "GROUP" },
  { key: "reporting.manage", name: "Manage reporting relationships", scope: "GROUP" },
  { key: "responsibility.read", name: "View responsibilities", scope: "GROUP" },
  { key: "responsibility.manage", name: "Assign responsibilities", scope: "GROUP" },
  { key: "access.explain", name: "Inspect access decisions", scope: "GROUP" },
  { key: "sia.access.read", name: "View SIA access", scope: "GROUP" },
  { key: "sia.access.manage", name: "Manage SIA access", scope: "GROUP" }
];
