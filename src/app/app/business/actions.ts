"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { BusinessError, businessService } from "@/server/domain/business-service";
import { businessKinds, type BusinessKind } from "@/server/domain/business-input";
import { safeDiagnostic } from "@/server/security/diagnostics";
export type SaveState = { error?: string; success?: boolean };
export async function setMembershipRoleAction(_previous: SaveState, form: FormData): Promise<SaveState> {
  const session = await requireSession();
  try {
    const membershipId = String(form.get("membershipId") ?? "");
    const roleId = String(form.get("roleId") ?? "");
    if (!membershipId || !roleId || !["true", "false"].includes(String(form.get("enabled")))) return { error: "Choose a membership and role." };
    await businessService.setMembershipRole(session.userId, membershipId, roleId, form.get("enabled") === "true");
    revalidatePath("/app", "layout");
    return { success: true };
  } catch (error) { return { error: error instanceof BusinessError ? error.message : "Role could not be updated." }; }
}
export async function saveBusinessAction(_previous: SaveState, form: FormData): Promise<SaveState> {
  const session = await requireSession();
  const kind = String(form.get("kind")) as BusinessKind;
  if (!businessKinds.includes(kind)) return { error: "Unknown business record." };
  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (["kind", "recordId"].includes(key) || key.startsWith("$ACTION")) continue;
    raw[key] = value === "" ? null : value;
  }
  try {
    if (raw.percentage != null) raw.percentage = Number(raw.percentage);
    if (raw.progress != null) raw.progress = Number(raw.progress);
    for (const key of ["metadata", "identifiers"]) if (typeof raw[key] === "string") raw[key] = JSON.parse(raw[key]);
    await businessService.save(session.userId, kind, raw, form.get("recordId") ? String(form.get("recordId")) : undefined);
    revalidatePath("/app", "layout");
    return { success: true };
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues.map(i => i.path.join(".") + ": " + i.message).join("; ") };
    if (error instanceof BusinessError) return { error: error.message };
    if (error instanceof SyntaxError) return { error: "Metadata and identifiers must be valid JSON objects." };
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: "A record with this identity already exists." };
    const reference = safeDiagnostic("operation_failed");
    return { error: `The record could not be saved. Please try again. Reference: ${reference}` };
  }
}
