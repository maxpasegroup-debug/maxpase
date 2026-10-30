"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/guards";
import { getPortalSession } from "@/server/portals/session";
import { requestPortal } from "@/server/portals/request";
import { AccessError } from "@/server/authorization/engine";
import { brandMarketing, type MarketingAccess } from "@/server/group/brand-marketing";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type MarketingActionState = { error?: string; success?: string };
const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
function ist(value: string) { return value ? new Date(`${value}:00+05:30`).toISOString() : null; }
export async function marketingAction(_state: MarketingActionState, form: FormData): Promise<MarketingActionState> {
  const mode: MarketingAccess = field(form, "mode") === "SKILLCITY" ? "SKILLCITY" : "BOSS";
  let userId: string;
  if (mode === "SKILLCITY") {
    const { site } = await requestPortal("skillcity", true);
    const session = await getPortalSession(site);
    if (!session) return { error: "Sign in to Skill City again." };
    userId = session.userId;
  } else userId = (await requireSession()).userId;
  const brandId = field(form, "brandId"), campaignId = field(form, "campaignId"), version = Number(field(form, "version")), operation = field(form, "operation");
  try {
    if (operation === "save") await brandMarketing.save(userId, brandId, mode, { title: field(form, "title"), objective: field(form, "objective"), channel: field(form, "channel"), ownerPersonId: field(form, "ownerPersonId") || null, startsAt: ist(field(form, "startsAt")), endsAt: ist(field(form, "endsAt")), reference: field(form, "reference") }, campaignId || undefined, campaignId ? version : undefined);
    else if (operation === "asset") await brandMarketing.addAsset(userId, brandId, mode, campaignId, version, { kind: field(form, "kind"), title: field(form, "title"), body: field(form, "body") });
    else if (operation === "asset-change") await brandMarketing.changeAsset(userId, brandId, mode, campaignId, version, { action: field(form, "assetAction"), assetId: field(form, "assetId"), ...(field(form, "assetAction") === "REVISE" ? { kind: field(form, "kind"), title: field(form, "title"), body: field(form, "body") } : {}) });
    else if (operation === "work") await brandMarketing.addWorkOrder(userId, brandId, mode, campaignId, { title: field(form, "title"), description: field(form, "description"), assigneePersonId: field(form, "assigneePersonId"), dueAt: ist(field(form, "dueAt")), reference: field(form, "reference") });
    else if (operation === "review") await brandMarketing.requestReview(userId, brandId, mode, campaignId, version);
    else if (operation === "decide") await brandMarketing.decide(userId, brandId, mode, campaignId, version, { decision: field(form, "decision"), reason: field(form, "reason"), evidenceReference: field(form, "evidenceReference") });
    else throw new AccessError("Unknown marketing action");
    revalidatePath(`/app/boss/brands/${encodeURIComponent(brandId)}/marketing`);
    revalidatePath("/sites/skillcity/gateway");
    return { success: operation === "decide" ? "Review decision recorded. No content was published or sent." : operation === "review" ? "Independent review requested. No content was published or sent." : "Saved. Refresh to see the latest version." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error && typeof error === "object" && "issues" in error) return { error: "Check required fields, schedule and current record version." };
    const reference = safeDiagnostic("operation_failed");
    return { error: `Marketing change unavailable. Reference: ${reference}` };
  }
}
