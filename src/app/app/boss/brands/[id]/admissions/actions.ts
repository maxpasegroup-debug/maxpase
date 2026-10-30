"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { startupApplications } from "@/server/portals/startup-applications";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type AdmissionActionState = { error?: string; success?: string };
export async function decideApplication(_state: AdmissionActionState, form: FormData): Promise<AdmissionActionState> {
  const session = await requireSession();
  const brandId = String(form.get("brandId") ?? "");
  try {
    const result = await startupApplications.reviewForBoss(session.userId, brandId, {
      id: form.get("id"), version: Number(form.get("version")), decision: form.get("decision"), reason: form.get("reason")
    });
    revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/admissions`);
    return { success: `${result.status.replaceAll("_", " ")} recorded. This is an application decision, not enrolment or payment approval.` };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (!(error && typeof error === "object" && "issues" in error)) safeDiagnostic("operation_failed");
    return { error: "The decision could not be recorded. Check the answers and current status, then refresh." };
  }
}
export async function associateProgramme(_state: AdmissionActionState, form: FormData): Promise<AdmissionActionState> {
  const session = await requireSession();
  const brandId = String(form.get("brandId") ?? "");
  try {
    await startupApplications.associateProgramForBoss(session.userId, brandId, { id: form.get("id"), version: Number(form.get("version")), programId: form.get("programId") });
    revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/admissions`);
    return { success: "Programme association recorded for review. Admission and enrolment remain unconfirmed." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (!(error && typeof error === "object" && "issues" in error)) safeDiagnostic("operation_failed");
    return { error: "Programme could not be linked. Refresh and check the existing PBA programme." };
  }
}
export async function confirmAdmission(_state: AdmissionActionState, form: FormData): Promise<AdmissionActionState> {
  const session = await requireSession();
  const brandId = String(form.get("brandId") ?? "");
  try {
    const result = await startupApplications.confirmAdmissionForBoss(session.userId, brandId, { applicationId: form.get("applicationId"), version: Number(form.get("version")), batchId: form.get("batchId"), reason: form.get("reason") });
    revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/admissions`);
    return { success: result.duplicate ? "Admission was already recorded. No duplicate created." : "Admission confirmed against the approved intake. Enrolment and payment remain separate." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (!(error && typeof error === "object" && "issues" in error)) safeDiagnostic("operation_failed");
    return { error: "Admission could not be confirmed. Check the approved intake, consent and current application." };
  }
}
