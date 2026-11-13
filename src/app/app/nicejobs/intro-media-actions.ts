"use server";
import { getSession } from "@/server/auth/session";
import { getPortalSession } from "@/server/portals/session";
import { requestPortal } from "@/server/portals/request";
import { AccessError } from "@/server/authorization/engine";
import { niceJobsIntroMedia } from "@/server/nicejobs/intro-media";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { ZodError } from "zod";

export type IntroMediaState = { message?: string; error?: string };
export async function manageNiceJobsIntroMedia(_state: IntroMediaState, form: FormData): Promise<IntroMediaState> {
  const realm = String(form.get("realm") ?? "corporate");
  if (realm !== "corporate" && realm !== "jobs") return { error: "Sign in with an authorized NICEJOBS account." };
  const user = realm === "jobs"
    ? await (async () => { const { site } = await requestPortal("jobs", true); return getPortalSession(site); })()
    : await getSession();
  if (!user) return { error: "Sign in with an authorized NICEJOBS account." };
  try {
    const operation = String(form.get("operation") ?? "");
    if (operation === "add-language") { await niceJobsIntroMedia.addLanguage(user.userId, { code: form.get("languageCode"), name: form.get("languageName") }); return { message: "Language added. Upload its introduction when ready." }; }
    const code = String(form.get("languageCode") ?? "");
    if (operation === "save-draft") { await niceJobsIntroMedia.saveDraft(user.userId, { languageCode: code, title: form.get("title"), mediaType: form.get("mediaType"), mediaFileId: form.get("mediaFileId"), thumbnailFileId: form.get("thumbnailFileId"), durationSeconds: Number(form.get("durationSeconds")) }); return { message: "Draft saved privately. Preview it before publishing." }; }
    if (operation === "publish") { await niceJobsIntroMedia.publish(user.userId, code, form.get("mediaType")); return { message: "Selected introduction published for this language." }; }
    if (operation === "unpublish") { await niceJobsIntroMedia.unpublish(user.userId, code); return { message: "Introduction unpublished. It is no longer shown publicly." }; }
    return { error: "Choose a valid introduction action." };
  } catch (error) {
    if (error instanceof ZodError) return { error: "Check the language, media type, title, thumbnail and duration." };
    if (error instanceof AccessError) return { error: error.message };
    safeDiagnostic("operation_failed");
    return { error: "Could not update introduction media. Try again." };
  }
}
