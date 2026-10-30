"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/guards";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { AccessError } from "@/server/authorization/engine";
import { startupCommercial, type CommercialAccess } from "@/server/group/startup-commercial";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type CommercialState = { error?: string; success?: string };
const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
export async function commercialAction(_state: CommercialState, form: FormData): Promise<CommercialState> {
  const mode: CommercialAccess = field(form, "mode") === "SKILLCITY" ? "SKILLCITY" : "BOSS";
  let userId: string;
  if (mode === "SKILLCITY") {
    const { site } = await requestPortal("skillcity", true);
    const session = await getPortalSession(site);
    if (!session) return { error: "Sign in to Skill City again." };
    userId = session.userId;
  } else userId = (await requireSession()).userId;
  const brandId = field(form, "brandId"), operation = field(form, "operation");
  try {
    if (operation === "prepare") {
      const money = field(form, "fee");
      if (!/^(0|[1-9][0-9]{0,6})(\.[0-9]{1,2})?$/.test(money)) throw new AccessError("Enter a valid proposed fee with at most two decimals");
      const tax = field(form, "taxBasisPoints");
      if (!/^(0|[1-9][0-9]{0,4})$/.test(tax) || Number(tax) > 10000) throw new AccessError("Choose a valid proposed tax rate from a reviewed policy");
      const [whole, fraction = ""] = money.split(".");
      await startupCommercial.prepare(userId, brandId, mode, { programId: field(form, "programId"), termsReference: field(form, "termsReference"), feeMinor: Number(whole) * 100 + Number(fraction.padEnd(2, "0")), currency: field(form, "currency"), taxBasisPoints: Number(tax) });
    } else if (["SUBMIT", "APPROVE", "REJECT"].includes(operation)) {
      await startupCommercial.change(userId, brandId, mode, field(form, "recordId"), Number(field(form, "version")), operation as "SUBMIT" | "APPROVE" | "REJECT", operation === "SUBMIT" ? undefined : { decision: operation === "APPROVE" ? "APPROVED" : "REJECTED", reason: field(form, "reason"), evidenceReference: field(form, "evidenceReference") });
    } else throw new AccessError("Commercial action unavailable");
    revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/commercial`);
    revalidatePath("/sites/skillcity/gateway");
    return { success: operation === "prepare" ? "Proposed terms recorded as a draft. No fee is approved." : "Decision recorded. No invoice, payment or admission was created." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error && typeof error === "object" && "issues" in error) return { error: "Check the programme, terms reference, fee and current version." };
    return { error: `Commercial change unavailable. Reference: ${safeDiagnostic("operation_failed")}` };
  }
}
