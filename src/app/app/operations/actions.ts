"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { operationsService as ops } from "@/server/domain/operations-service";
import { proposalInput } from "@/server/domain/operations-input";
import { safeDiagnostic } from "@/server/security/diagnostics";
export type OperationState = { error?: string; success?: string };
export async function operationAction(_state: OperationState, form: FormData): Promise<OperationState> {
  const session = await requireSession();
  try {
    const action = String(form.get("operation"));
    const id = String(form.get("recordId") ?? "");
    const raw = JSON.parse(String(form.get("payload") ?? "{}")) as Record<string, unknown>;
    const reason = String(form.get("reason") ?? raw.reason ?? "");
    switch (action) {
      case "control": await ops.saveControl(session.userId, raw); break;
      case "workflow": await ops.saveWorkflow(session.userId, raw, id || undefined); break;
      case "publish": await ops.publishWorkflow(session.userId, id); break;
      case "instance": await ops.startWorkflow(session.userId, raw); break;
      case "transition": await ops.transition(session.userId, { ...raw, reason }); break;
      case "request": await ops.createRequest(session.userId, raw); break;
      case "proposal": await ops.createRequest(session.userId, raw, proposalInput.parse(raw)); break;
      case "submit": await ops.submitRequest(session.userId, id); break;
      case "cancel": await ops.cancelRequest(session.userId, id); break;
      case "update": await ops.updateRequest(session.userId, id, String(form.get("title")), String(form.get("description") ?? "")); break;
      case "decision": await ops.decide(session.userId, { approvalId: id, decision: form.get("decision"), comment: reason }); break;
      case "read": await ops.markRead(session.userId, id, form.get("read") === "true"); break;
      case "notice": await ops.generateNotification(session.userId, raw); break;
      case "reminder": await ops.saveReminder(session.userId, raw); break;
      case "recurring": await ops.saveRecurring(session.userId, raw); break;
      case "escalation": await ops.escalate(session.userId, raw); break;
      case "event": await ops.registerEvent(session.userId, raw); break;
      case "preference": await ops.preference(session.userId, raw); break;
      case "verify": await ops.checkControl(session.userId, id, String(form.get("controlPointId")), form.get("passed") === "true", reason); break;
      case "status": {
        const kind = String(form.get("kind"));
        if (!["reminder", "recurrence", "escalation", "control", "workflow"].includes(kind)) throw new AccessError("Unknown operation");
        await ops.changeStatus(session.userId, kind as "reminder" | "recurrence" | "escalation" | "control" | "workflow", id, String(form.get("status"))); break;
      }
      case "process": {
        const result = await ops.processDue(session.userId, 25);
        revalidatePath("/app", "layout");
        return { success: `${result.succeeded} completed, ${result.failures.length} failed, ${result.considered} considered` };
      }
      default: return { error: "Unknown operation." };
    }
    revalidatePath("/app", "layout");
    return { success: "Saved" };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
    const reference = safeDiagnostic("operation_failed");
    return { error: `The operation could not be completed. Refresh and check scope and required fields. Reference: ${reference}` };
  }
}
