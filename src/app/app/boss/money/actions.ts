"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { bossMoney } from "@/server/group/boss-money";

async function done(work: (id: string) => Promise<void>, form: FormData, section: string) {
  const session = await requireSession();
  try { await work(session.userId); }
  catch { redirect(`/app/boss/money?section=${section}&error=save`); }
  revalidatePath("/app/boss/money");
  redirect(`/app/boss/money?section=${section}&saved=1`);
}
export async function saveOpening(form: FormData) { await done(id => bossMoney.saveOpening(id, form), form, "overview"); }
export async function saveEntry(form: FormData) { await done(id => bossMoney.saveEntry(id, form), form, "entries"); }
export async function deleteEntry(form: FormData) { await done(id => bossMoney.deleteEntry(id, form), form, "entries"); }
export async function saveHomeBudget(form: FormData) { await done(id => bossMoney.saveSimple(id, "HOME_BUDGET", form), form, "home"); }
export async function saveOfficeBudget(form: FormData) { await done(id => bossMoney.saveSimple(id, "OFFICE_BUDGET", form), form, "office"); }
export async function saveVenture(form: FormData) { await done(id => bossMoney.saveSimple(id, "VENTURE", form), form, "ventures"); }
export async function saveCategory(form: FormData) { await done(id => bossMoney.saveSimple(id, "CATEGORY", form), form, String(form.get("area") ?? "HOME").toLowerCase()); }
export async function saveCommitment(form: FormData) { await done(id => bossMoney.saveSimple(id, "COMMITMENT", form), form, "office"); }
export async function markCommitmentPaid(form: FormData) { await done(id => bossMoney.markCommitmentPaid(id, form), form, "office"); }
export async function setCommitmentActive(form: FormData) { await done(id => bossMoney.setCommitmentActive(id, form), form, "office"); }
