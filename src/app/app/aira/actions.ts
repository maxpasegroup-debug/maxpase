"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { BusinessError } from "@/server/domain/business-service";
import { airaService } from "@/server/domain/aira-service";
import { safeDiagnostic } from "@/server/security/diagnostics";
export type AiraState = { error?: string; success?: string };
export async function enterAira() {
  const session = await requireSession();
  try { await airaService.enter(session.userId); }
  catch (error) { if (!(error instanceof AccessError)) throw error; }
  redirect("/app/aira");
}
export async function saveAira(_state: AiraState, form: FormData): Promise<AiraState> {
  const session = await requireSession();
  try {
    const kind = String(form.get("kind")), id = String(form.get("recordId") ?? "");
    const payload = JSON.parse(String(form.get("payload"))) as Record<string, unknown>;
    if (["programs", "batches", "locations", "participants"].includes(kind)) await airaService.save(session.userId, kind as "programs", payload, id || undefined);
    else if (["divisions", "departments", "teams", "products", "projects", "goals", "responsibilities"].includes(kind)) await airaService.saveShared(session.userId, kind as "divisions", payload, id || undefined);
    else if (kind === "launch") await airaService.startWorkflow(session.userId, payload);
    else throw new AccessError("Unknown operation");
    revalidatePath("/app", "layout"); return { success: "Saved" };
  } catch (error) {
    if (error instanceof AccessError || error instanceof BusinessError) return { error: error.message };
    if (error instanceof ZodError) return { error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
    const reference = safeDiagnostic("operation_failed");
    return { error: `This change could not be saved. Check the fields and current access, then try again. Reference: ${reference}` };
  }
}
