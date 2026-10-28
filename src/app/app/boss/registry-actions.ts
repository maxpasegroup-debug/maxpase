"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { bossRegistry } from "@/server/group/boss-registry";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type RegistryState = { error?: string; success?: string };
export async function removeBossRegistryRecord(_state: RegistryState, form: FormData): Promise<RegistryState> {
  const session = await requireSession();
  const kind = form.get("kind"), mode = form.get("mode"), id = form.get("id");
  if ((kind !== "company" && kind !== "brand") || (mode !== "archive" && mode !== "delete") || typeof id !== "string" || !id || form.get("confirm") !== "REMOVE") return { error: "Type REMOVE to confirm the selected action." };
  try {
    await bossRegistry.remove(session.userId, kind, id, mode);
    revalidatePath("/app", "layout");
    return { success: mode === "delete" ? "Empty record removed. Its audit entry remains." : "Record archived." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    return { error: `Action unavailable. Reference: ${safeDiagnostic("operation_failed")}` };
  }
}
