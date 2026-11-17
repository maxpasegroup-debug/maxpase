"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { startupAdmissionIntakes } from "@/server/group/startup-admission-intakes";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type IntakeActionState = { error?: string; success?: string };
export async function saveStartupIntake(brandId: string, _state: IntakeActionState, form: FormData): Promise<IntakeActionState> {
  try {
    const session = await requireSession();
    await startupAdmissionIntakes.save(session.userId, brandId, {
      ...(form.get("id") ? { id: String(form.get("id")) } : {}),
      ...(form.get("version") ? { version: String(form.get("version")) } : {}),
      programId: String(form.get("programId") ?? ""), name: String(form.get("name") ?? ""),
      startDate: String(form.get("startDate") ?? ""), endDate: String(form.get("endDate") ?? ""),
      capacity: String(form.get("capacity") ?? "").trim() ? Number(form.get("capacity")) : null,
      locationId: String(form.get("locationId") ?? "") || null, open: form.get("open") === "on"
    });
    revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/admissions/configuration`);
    revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/admissions/ao-assignments`);
    revalidatePath("/apply"); revalidatePath("/sites/startup/apply");
    return { success: "Intake configuration saved and recorded in the audit trail." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    safeDiagnostic("operation_failed");
    return { error: "Intake could not be saved. Refresh and check the dates, program and active centre." };
  }
}
