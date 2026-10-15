import { z } from "zod";
import { selection, taskParameters } from "./input";
import { messageInput } from "@/server/communications/input";

export const riskLevels = ["READ_ONLY", "LOW_RISK_WRITE", "HIGH_RISK_WRITE", "CRITICAL"] as const;
const readNames = ["get_group_overview", "get_company_overview", "get_companies", "get_projects", "get_project_status", "get_goals", "get_goal_status", "get_tasks", "get_attention_items", "get_pending_decisions", "get_pending_approvals", "get_recent_changes", "get_risks", "get_opportunities", "get_people_summary", "get_company_health", "get_training_management", "get_workforce_command", "prepare_report"] as const;
const permissions: Partial<Record<typeof readNames[number], string>> = { get_projects: "project.read", get_project_status: "project.read", get_goals: "goal.read", get_goal_status: "goal.read", get_tasks: "task.read", get_pending_approvals: "approval.read", get_risks: "risk.read", get_opportunities: "opportunity.read", get_people_summary: "person.read", get_companies: "company.read", get_company_health: "company.read", get_company_overview: "company.read", get_training_management:"nicejobs.onboarding.read", get_workforce_command: "nicejobs.command.read" };
export const resultSchema = z.object({ facts: z.array(z.object({ label: z.string(), value: z.union([z.string(), z.number(), z.null()]), source: z.string() }).strict()), signals: z.array(z.object({ id: z.string(), title: z.string(), severity: z.string(), explanation: z.string(), nextAction: z.string(), href: z.string(), owner: z.string().nullable() }).strict()), recommendations: z.array(z.object({ observation: z.string(), evidence: z.array(z.string()), interpretation: z.string(), recommendation: z.string(), expectedBenefit: z.string(), risk: z.string(), affectedEntities: z.array(z.string()), confidence: z.literal("RULE_BASED"), nextAction: z.string() }).strict()), actions: z.array(z.string()), approvals: z.array(z.object({ id: z.string(), title: z.string(), status: z.string(), href: z.string() }).strict()), limitations: z.array(z.string()), provider: z.string(), calculatedAt: z.string(), context: z.record(z.string(), z.unknown()) }).strict();
export type SiaResponse = z.infer<typeof resultSchema>;
export const workerSiaToolRegistry = Object.freeze([
  Object.freeze({ key: "get_worker_day", name: "Worker day briefing", description: "Read only the authenticated active worker's authorized work, reports and blockers", category: "WORKFORCE", requiredPermission: "nicejobs.workspace.self", scope: "GROUP" as const, risk: "READ_ONLY" as const, requiresApproval: false, audit: true, inputSchema: selection, outputSchema: resultSchema }),
]);
export const applicantSiaToolRegistry = Object.freeze([
  Object.freeze({ key: "get_application_guide", name: "Applicant guidance", description: "Explain the authenticated candidate's application questions and disclosed opportunity terms", category: "APPLICANT", requiredPermission: "nicejobs.application.self", scope: "GROUP" as const, risk: "READ_ONLY" as const, requiresApproval: false, audit: true, inputSchema: selection.extend({ applicationReference: z.string().uuid() }).strict(), outputSchema: resultSchema })
]);
export const advisorSiaToolRegistry = Object.freeze([
  Object.freeze({ key: "get_advisor_day", name: "Advisor day briefing", description: "Read only the authenticated advisor's assigned sales follow-ups and prepare draft coaching", category: "ADVISORY", requiredPermission: "labs.sales.self", scope: "GROUP" as const, risk: "READ_ONLY" as const, requiresApproval: false, audit: true, inputSchema: selection, outputSchema: resultSchema })
]);
export const siaToolRegistry = Object.freeze([
  ...["send_email", "send_whatsapp"].map(key => Object.freeze({ key, name: key.replaceAll("_", " "), description: "Prepare one immutable communication preview; independent approval and human confirmation required", category: "COMMUNICATION", requiredPermission: "communication.send", scope: "GROUP" as const, risk: "HIGH_RISK_WRITE" as const, requiresApproval: true, audit: true, inputSchema: selection.extend({ message: messageInput }).strict(), outputSchema: z.object({ id: z.string(), status: z.string(), requestId: z.string().nullable() }).strict() })),
  ...readNames.map(key => Object.freeze({ key, name: key.replaceAll("_", " "), description: "Read current authorized business evidence through domain services", category: "EXECUTIVE", requiredPermission: permissions[key] ?? "executive.read", scope: "GROUP" as const, risk: "READ_ONLY" as const, requiresApproval: false, audit: true, inputSchema: selection, outputSchema: resultSchema })),
  Object.freeze({ key: "create_task", name: "Create a task", description: "Create one task with independent human approval and explicit confirmation", category: "EXECUTION", requiredPermission: "task.manage", scope: "GROUP" as const, risk: "LOW_RISK_WRITE" as const, requiresApproval: true, audit: true, inputSchema: selection.extend({ parameters: taskParameters }).strict(), outputSchema: z.object({ id: z.string(), verificationStatus: z.literal("VERIFIED") }).strict() })
]);
export const allSiaToolRegistry = Object.freeze([...siaToolRegistry, ...workerSiaToolRegistry, ...applicantSiaToolRegistry, ...advisorSiaToolRegistry]);
export function registeredTool(key: string) { return allSiaToolRegistry.find(t => t.key === key); }
export function routeIntent(message: string): string | null {
  const text = message.toLowerCase();
  if (/\b(ignore|override|bypass|sql|shell|delete|grant|deploy|execute anything)\b/.test(text)) return null;
  if (/create.*task/.test(text)) return "create_task";
  if (/training.*(?:management|review|summary)|ojt.*(?:summary|review|management)/.test(text)) return "get_training_management";
  if (/workforce|workers?.*(?:command|overview)|automation.*(?:status|failure)|operational exceptions?/.test(text)) return "get_workforce_command";
  if (/report|briefing/.test(text)) return "prepare_report";
  if (/attention/.test(text)) return "get_attention_items";
  if (/changed|yesterday/.test(text)) return "get_recent_changes";
  if (/approvals?/.test(text)) return "get_pending_approvals";
  if (/decisions?/.test(text)) return "get_pending_decisions";
  if (/projects?/.test(text)) return /why|status/.test(text) ? "get_project_status" : "get_projects";
  if (/goals?/.test(text)) return "get_goals";
  if (/tasks?/.test(text)) return "get_tasks";
  if (/risks?/.test(text)) return "get_risks";
  if (/opportunit/.test(text)) return "get_opportunities";
  if (/people|teams?/.test(text)) return "get_people_summary";
  if (/health/.test(text)) return "get_company_health";
  if (/company|aira/.test(text)) return "get_company_overview";
  if (/business|overview|happening|group|status/.test(text)) return "get_group_overview";
  return null;
}
