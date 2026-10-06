"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/guards";
import { accountPreferences } from "@/server/account/preferences";
export async function saveTimezone(_previous: { message: string; ok: boolean }, form: FormData) {
  const session = await requireSession();
  try {
    await accountPreferences.save(session.userId, { timezone: form.get("timezone") });
    revalidatePath("/app", "layout");
    return { message: "Timezone saved", ok: true };
  } catch { return { message: "Timezone could not be saved. Choose a valid timezone and try again.", ok: false }; }
}
