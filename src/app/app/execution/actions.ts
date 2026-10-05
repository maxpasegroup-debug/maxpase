"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { executionService } from "@/server/domain/execution-service";
import { workforceService } from "@/server/domain/workforce-service";
import { safeDiagnostic } from "@/server/security/diagnostics";
export type ExecutionState = { error?: string; success?: boolean };
export async function saveExecutionAction(_state: ExecutionState, form: FormData): Promise<ExecutionState> {
  const session = await requireSession();
  try {
    const kind = String(form.get("kind"));
    const operation = String(form.get("operation") ?? "save");
    const recordId = String(form.get("recordId") ?? "") || undefined;
    const raw: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (key.startsWith("$ACTION") || ["kind", "operation", "recordId"].includes(key)) continue;
      raw[key] = value === "" ? null : value;
    }
    for (const key of ["progress", "sequence", "estimatedHours"]) if (raw[key] != null) raw[key] = Number(raw[key]);
    raw.reopen = form.get("reopen") === "on";
    if (typeof raw.metadata === "string") raw.metadata = JSON.parse(raw.metadata);
    if (operation === "progress") await executionService.progress(session.userId, recordId ?? "", Number(raw.progress), typeof raw.progressReason === "string" ? raw.progressReason : undefined);
    else if (kind === "dependencies") await executionService.dependency(session.userId, raw, operation !== "remove");
    else if (kind === "blockers") await executionService.blocker(session.userId, raw, recordId);
    else if (kind === "members") await workforceService.save(session.userId, "memberships", { ...raw, scope: "ORGANIZATION" }, recordId);
    else if (kind === "responsibilities") await workforceService.save(session.userId, "responsibilities", raw, recordId);
    else if (["projects", "milestones", "tasks", "goals"].includes(kind)) await executionService.save(session.userId, kind as "projects" | "milestones" | "tasks" | "goals", raw, recordId);
    else return { error: "Unknown execution operation." };
    revalidatePath("/app", "layout");
    return { success: true };
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues.map(i => i.path.join(".") + ": " + i.message).join("; ") };
    if (e instanceof AccessError) return { error: e.message };
    if (e instanceof SyntaxError) return { error: "Metadata must be a JSON object." };
    const reference = safeDiagnostic("operation_failed");
    return { error: `The change could not be saved. Check scope and required fields. Reference: ${reference}` };
  }
}
