import { z } from "zod";
const evidence = z.object({ processorUserId: z.string(), ownerUserId: z.string(), action: z.enum(["NOTIFY_OWNER", "REMIND_APPROVER", "FLAG_ATTENTION"]), requiredPermission: z.enum(["notification.generate", "reminder.manage"]), workflowVersionId: z.string().nullable(), resultId: z.string().nullable() }).strict();
export function automationProvenance(raw: string | null, resultId: string | null, workflowVersionId: string | null, revealAccounts: boolean) {
  let value: unknown;
  try { value = raw ? JSON.parse(raw) : null; } catch { return null; }
  const parsed = evidence.safeParse(value);
  if (!parsed.success || parsed.data.resultId !== resultId || parsed.data.workflowVersionId !== workflowVersionId) return null;
  if (parsed.data.requiredPermission !== (parsed.data.action === "REMIND_APPROVER" ? "reminder.manage" : "notification.generate")) return null;
  return { action: parsed.data.action, requiredPermission: parsed.data.requiredPermission, workflowVersionId, ownerUserId: revealAccounts ? parsed.data.ownerUserId : null, processorUserId: revealAccounts ? parsed.data.processorUserId : null };
}
