"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { executiveService } from "@/server/domain/executive-service";
import { safeDiagnostic } from "@/server/security/diagnostics";
export type ExecutiveActionState = { error?: string; success?: string };
export async function executiveAction(_state: ExecutiveActionState, form: FormData): Promise<ExecutiveActionState> {
  const session = await requireSession();
  const value = (key: string) => String(form.get(key) ?? "");
  try {
    switch (value("action")) {
      case "create": {
        const raw: Record<string, unknown> = Object.fromEntries(["kind", "organizationId", "ownerPersonId", "title", "description", "reference"].map(k => [k, value(k)]));
        for (const key of ["projectId", "dueAt", "impact", "recommendedAction", "unit", "direction", "periodStart", "periodEnd", "source", "severity", "mitigation", "nextAction"]) if (value(key)) raw[key] = value(key);
        for (const key of ["target", "probability"]) if (value(key)) raw[key] = Number(value(key));
        if (value("options")) raw.options = value("options").split("\n").map(s => s.trim()).filter(Boolean);
        await executiveService.save(session.userId, raw); break;
      }
      case "transition": await executiveService.transition(session.userId, { id: value("recordId"), status: value("status"), reason: value("reason"), expectedVersion: Number(value("version")), ...(value("observation") ? { observation: Number(value("observation")) } : {}) }); break;
      case "revise": {
        const raw: Record<string, unknown> = { id: value("recordId"), expectedVersion: Number(value("version")), reason: value("reason"), title: value("title"), description: value("description") };
        for (const key of ["impact", "mitigation", "nextAction", "severity"]) if (value(key)) raw[key] = value(key);
        if (form.has("probability")) raw.probability = value("probability") ? Number(value("probability")) : null;
        await executiveService.revise(session.userId, raw); break;
      }
      case "attention": await executiveService.handleAttention(session.userId, value("sourceKey"), value("status"), value("reason"), Number(value("version"))); break;
      default: throw new AccessError("Unknown executive action");
    }
    revalidatePath("/app", "layout"); return { success: "Saved" };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: error.issues.map(i => i.message).join("; ") };
    const reference = safeDiagnostic("operation_failed");
    return { error: `Unable to save. Refresh and check scope, reference and current version. Reference: ${reference}` };
  }
}
