"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { startupPrograms } from "@/server/group/startup-programs";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type ProgramActionState = { error?: string; success?: string };
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || null;
const number = (form: FormData, key: string) => text(form, key) ? Number(text(form, key)) : null;

export async function programAction(_previous: ProgramActionState, form: FormData): Promise<ProgramActionState> {
  const session = await requireSession();
  const brandId = text(form, "brandId"), programId = optional(form, "programId"), operation = text(form, "operation");
  try {
    if (operation === "save") {
      await startupPrograms.saveDraft(session.userId, brandId, {
        name: text(form, "name"), slug: text(form, "slug"), description: optional(form, "description"), durationDays: number(form, "durationDays"), capacity: number(form, "capacity"), priceMinor: number(form, "priceMinor"), currency: optional(form, "currency"),
        draft: { deliveryFormat: optional(form, "deliveryFormat"), curriculum: optional(form, "curriculum"), learningOutcomes: optional(form, "learningOutcomes"), eligibility: optional(form, "eligibility"), intendedAudience: optional(form, "intendedAudience"), tierProposal: optional(form, "tierProposal"), writtenTermsReference: optional(form, "writtenTermsReference"), deliveryArrangements: optional(form, "deliveryArrangements") }
      }, programId ?? undefined);
    } else if (operation === "request" && programId) await startupPrograms.requestPublication(session.userId, brandId, programId);
    else if (operation === "decide" && programId) await startupPrograms.decidePublication(session.userId, brandId, programId, {
      requestId: text(form, "requestId"), version: Number(form.get("version")), decision: text(form, "decision"), reason: text(form, "reason"), evidenceReference: text(form, "evidenceReference")
    });
    else if ((operation === "pause" || operation === "archive") && programId) await startupPrograms.changeStatus(session.userId, brandId, programId, operation === "pause" ? "PAUSED" : "ARCHIVED");
    else throw new AccessError("Unknown programme action");
    revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/programs`);
    revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}`);
    return { success: operation === "request" ? "Review requested. Publication and commercial approval remain pending." : operation === "decide" ? "Publication decision recorded. Commercial terms, admission and enrolment remain separate." : "Programme saved." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
    const reference = safeDiagnostic("operation_failed");
    return { error: `The change could not be saved. Reference: ${reference}` };
  }
}
