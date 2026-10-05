"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { siaService } from "@/server/sia/service";
import type { SiaResponse } from "@/server/sia/registry";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
export type SiaState = { error?: string; success?: string; response?: SiaResponse };
export async function siaAction(_previous: SiaState, form: FormData): Promise<SiaState> {
  const session = await requireSession();
  const get = (key: string) => String(form.get(key) ?? "");
  const selection = { siaId: get("siaId"), organizationId: get("organizationId"), ...(get("projectId") ? { projectId: get("projectId") } : {}) };
  try {
    await consumeSecurityBudget(securityKey("sia:action", session.userId), 20, 60);
    switch (get("mode")) {
      case "conversation": return { response: await siaService.converse(session.userId, { ...selection, message: get("message"), idempotencyKey: get("idempotencyKey") }) };
      case "tool": await siaService.setTool(session.userId, selection, get("toolKey"), form.get("enabled") === "on"); break;
      case "configuration": await siaService.configure(session.userId, selection, { name: get("name"), role: get("role"), communicationStyle: get("communicationStyle"), executiveTone: get("executiveTone"), responsePreferences: get("responsePreferences").split("\n").map(v => v.trim()).filter(Boolean), decisionPrinciples: get("decisionPrinciples").split("\n").map(v => v.trim()).filter(Boolean), operatingPrinciples: get("operatingPrinciples").split("\n").map(v => v.trim()).filter(Boolean) }, Number(get("version"))); break;
      case "memory": await siaService.saveMemory(session.userId, { ...selection, key: get("key"), category: get("category"), value: get("value"), sourceType: get("sourceType"), ...(get("sourceId") ? { sourceId: get("sourceId") } : {}), confidence: get("confidence") ? Number(get("confidence")) : null, ...(get("reviewAt") ? { reviewAt: get("reviewAt") } : {}), ...(get("expiresAt") ? { expiresAt: get("expiresAt") } : {}) }); break;
      case "review": await siaService.reviewMemory(session.userId, get("id"), Number(get("version")), z.enum(["APPROVED", "ARCHIVED"]).parse(get("status"))); break;
      case "proposal": await siaService.propose(session.userId, { ...selection, toolKey: "create_task", parameters: { title: get("title"), ...(get("description") ? { description: get("description") } : {}), ...(get("dueDate") ? { dueDate: get("dueDate") } : {}), priority: get("priority") }, reason: get("reason"), controlPointId: get("controlPointId"), idempotencyKey: get("idempotencyKey") }); break;
      case "execute": await siaService.execute(session.userId, get("id"), Number(get("version")), form.get("confirmed") === "on"); break;
      default: throw new AccessError("Unsupported operation");
    }
    revalidatePath("/app/sia"); revalidatePath("/app/operations"); revalidatePath("/app/executive"); revalidatePath("/app/execution/tasks");
    return { success: "Saved." };
  } catch (e) {
    if (!(e instanceof AccessError || e instanceof RateLimitError || e instanceof z.ZodError)) safeDiagnostic("operation_failed");
    return { error: e instanceof AccessError || e instanceof RateLimitError ? e.message : e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid input" : "Operation could not be completed. No successful execution is claimed." };
  }
}
