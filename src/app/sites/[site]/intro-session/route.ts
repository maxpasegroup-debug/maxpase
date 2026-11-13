import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requestPortal } from "@/server/portals/request";
import { niceJobsIntroMedia } from "@/server/nicejobs/intro-media";
import { setJobsIntroCompletion } from "@/server/auth/jobs-intro-proof";
import { config } from "@/server/config";

const cookieName = "nicejobs_intro_session";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
export async function POST(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await requestPortal((await params).site);
  if (site.id !== "jobs") return reply({ error: "Unavailable" }, 404);
  try {
    const body = await request.json(), input = z.object({ languageCode: z.string().min(2).max(12) }).strict().parse(body);
    const started = await niceJobsIntroMedia.startSession(input.languageCode);
    const response = reply({ durationSeconds: started.durationSeconds, mediaFileId: started.mediaFileId });
    response.cookies.set(cookieName, started.token, { httpOnly: true, secure: config.AUTH_COOKIE_SECURE, sameSite: "strict", path: "/", maxAge: 30 * 60 });
    return response;
  } catch { return reply({ error: "That introduction is not currently available." }, 404); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await requestPortal((await params).site);
  if (site.id !== "jobs") return reply({ error: "Unavailable" }, 404);
  const jar = await cookies(), token = jar.get(cookieName)?.value;
  if (!token) return reply({ error: "Playback session expired. Start the introduction again." }, 401);
  try {
    const body = await request.json(), result = await niceJobsIntroMedia.playbackHeartbeat(token, body.status, body.position);
    if (body.status === "ABANDONED") jar.delete(cookieName);
    if (result.complete && result.sessionId && result.languageCode) {
      await setJobsIntroCompletion(result.sessionId, result.languageCode);
      jar.delete(cookieName);
      return reply({ complete: true });
    }
    if (body.status === "ENDED") return reply({ complete: false, error: "Keep the introduction playing through to the end." }, 409);
    return reply({ complete: false });
  } catch { return reply({ error: "Playback could not be verified. Please try again." }, 400); }
}
