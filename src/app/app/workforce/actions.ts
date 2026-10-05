"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { workforceService } from "@/server/domain/workforce-service";
import { workforceKinds, type WorkforceKind } from "@/server/domain/workforce-input";
import { AccessError } from "@/server/authorization/engine";
import { safeDiagnostic } from "@/server/security/diagnostics";
export type WorkforceState = { success?: boolean; error?: string; decision?: string };
function failure(error: unknown): WorkforceState {
  if (error instanceof AccessError) return { error: error.message };
  if (error instanceof ZodError) return { error: error.issues.map(i => i.message).join("; ") };
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: "This identity or assignment already exists." };
  const reference = safeDiagnostic("operation_failed");
  return { error: `The change could not be saved. Please try again. Reference: ${reference}` };
}
export async function saveWorkforceAction(_previous: WorkforceState, form: FormData): Promise<WorkforceState> {
  const session = await requireSession();
  const kind = String(form.get("kind")) as WorkforceKind;
  if (!workforceKinds.includes(kind)) return { error: "Unknown view." };
  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) if (!["kind", "recordId"].includes(key) && !key.startsWith("$ACTION")) raw[key] = value === "" ? (key === "password" ? undefined : null) : value;
  try {
    await workforceService.save(session.userId, kind, raw, form.get("recordId") ? String(form.get("recordId")) : undefined);
    revalidatePath("/app", "layout"); return { success: true };
  } catch(error) { return failure(error); }
}
export async function assignAccessAction(_previous: WorkforceState, form: FormData): Promise<WorkforceState> {
  const session = await requireSession();
  try {
    const operation = String(form.get("operation")); const enabled = form.get("enabled") === "true";
    if (!["true", "false"].includes(String(form.get("enabled")))) return { error: "Choose assign or revoke." };
    const id = (key: string) => { const value = String(form.get(key) ?? ""); if (!value || value.length > 200) throw new AccessError("Choose a valid assignment."); return value; };
    if (operation === "role") await workforceService.setRole(session.userId, id("membershipId"), id("roleId"), enabled);
    else if (operation === "permission") await workforceService.setPermission(session.userId, id("roleId"), id("permissionId"), enabled);
    else if (operation === "sia") await workforceService.setSiaRole(session.userId, id("siaId"), id("organizationId"), id("roleId"), enabled);
    else return { error: "Unknown assignment." };
    revalidatePath("/app", "layout"); return { success: true };
  } catch(error) { return failure(error); }
}
export async function explainAccessAction(_previous: WorkforceState, form: FormData): Promise<WorkforceState> {
  const session = await requireSession();
  try {
    const result = await workforceService.explain(session.userId, String(form.get("userId")), String(form.get("permission")), { organizationId: String(form.get("organizationId")), projectId: form.get("projectId") ? String(form.get("projectId")) : undefined });
    return { decision: (result.allowed ? "Granted: " : "Denied: ") + result.reason + (result.via?.roleName ? " (" + result.via.roleName + ")" : "") };
  } catch(error) { return failure(error); }
}
