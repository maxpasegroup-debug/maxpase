"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { startupPilotRegister } from "@/server/portals/startup-pilot-register";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type PilotRegisterState = { error?: string };
function istInstant(value: FormDataEntryValue | null): string | null {
  if (!value) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Invalid IST date");
  const date = new Date(`${value}:00+05:30`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid IST date");
  return date.toISOString();
}
const text = (value: FormDataEntryValue | null) => typeof value === "string" && value.trim() ? value.trim() : null;
const failure = (error: unknown): PilotRegisterState => {
  if (error instanceof z.ZodError) return { error: "Check the intake code, dates, evidence references and account choices." };
  safeDiagnostic("operation_failed");
  return { error: "The register could not be saved or approved. Refresh, check authority and evidence, then try again." };
};
export async function pilotRegisterSaveAction(_state: PilotRegisterState, form: FormData): Promise<PilotRegisterState> {
  const { site, paths } = await requestPortal("skillcity", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again to prepare the intake." };
  try {
    const ids = form.getAll("participantPersonId"), dates = form.getAll("consentAt"), refs = form.getAll("consentEvidenceRef");
    if (ids.length !== dates.length || ids.length !== refs.length) return { error: "Participant evidence rows are incomplete." };
    await startupPilotRegister.save(session.userId, String(form.get("batchId")), {
      intakeCode: form.get("intakeCode"), tier: text(form.get("tier")),
      termsVersion: text(form.get("termsVersion")), termsEvidenceRef: text(form.get("termsEvidenceRef")), termsEffectiveAt: istInstant(form.get("termsEffectiveAt")), termsApprovedAt: istInstant(form.get("termsApprovedAt")), termsApproverUserId: text(form.get("termsApproverUserId")),
      reviewerUserId: text(form.get("reviewerUserId")), reviewerEvidenceRef: text(form.get("reviewerEvidenceRef")), mentorUserId: text(form.get("mentorUserId")), mentorEvidenceRef: text(form.get("mentorEvidenceRef")),
      participants: ids.map((personId, index) => ({ personId, consentAt: istInstant(dates[index]), consentEvidenceRef: text(refs[index]) })).filter(row => text(row.personId) !== null)
    });
  } catch (error) { return failure(error); }
  redirect(`${paths.gateway}?view=pilot`);
}
export async function pilotRegisterApproveAction(_state: PilotRegisterState, form: FormData): Promise<PilotRegisterState> {
  const { site, paths } = await requestPortal("skillcity", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Sign in again before reviewing the intake." };
  try { await startupPilotRegister.approve(session.userId, String(form.get("batchId")), Number(form.get("version"))); }
  catch (error) { return failure(error); }
  redirect(`${paths.gateway}?view=pilot`);
}
