"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/guards";
import { nexaService } from "@/server/group/nexa-service";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { ZodError } from "zod";

export type NexaActionState = { error?: string; message?: string };
export async function createNexaDirectiveAction(_state: NexaActionState, form: FormData): Promise<NexaActionState> {
  const session = await requireSession();
  try {
    await consumeSecurityBudget(securityKey("nexa:instruction", session.userId), 20, 3600);
    await nexaService.create(session.userId, { organizationId: String(form.get("organizationId") ?? ""), directorUserId: String(form.get("directorUserId") ?? ""), instruction: String(form.get("instruction") ?? ""), directorBrief: String(form.get("directorBrief") ?? ""), idempotencyKey: String(form.get("idempotencyKey") ?? "") });
    revalidatePath("/app/boss");
    return { message: "Directive recorded for the nominated director. No business action was executed." };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RateLimitError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Complete the company, verified director, instruction and brief." };
    safeDiagnostic("operation_failed");
    return { error: "Could not record the directive. No success is confirmed." };
  }
}
