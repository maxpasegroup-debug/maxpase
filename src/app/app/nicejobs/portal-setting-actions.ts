"use server";
import { niceJobsPortalSettings } from "@/server/nicejobs/portal-settings";
import { getSession } from "@/server/auth/session";
import { AccessError } from "@/server/authorization/engine";
import { RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { ZodError } from "zod";

export type IntroVideoActionState = { message?: string; error?: string };
export async function publishNiceJobsIntroVideo(_state: IntroVideoActionState, form: FormData): Promise<IntroVideoActionState> {
  const user = await getSession();
  if (!user) return { error: "Sign in with an authorized Boss account." };
  try {
    const result = await niceJobsPortalSettings.updateIntroVideo(user.userId, { title: form.get("title"), fileId: form.get("fileId") });
    return { message: `Published “${result.title}”. The public intro now uses the new video.` };
  } catch (error) {
    if (error instanceof ZodError) return { error: "Enter a title and upload an MP4 or WebM video first." };
    if (error instanceof AccessError) return { error: "This Boss account cannot manage the Nice Jobs introduction video." };
    if (error instanceof RateLimitError) return { error: error.message };
    safeDiagnostic("operation_failed");
    return { error: "Could not publish the video. Try again later." };
  }
}
