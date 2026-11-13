import { NextResponse } from "next/server";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { niceJobsIntroMedia } from "@/server/nicejobs/intro-media";

export async function GET(_request: Request, { params }: { params: Promise<{ site: string; languageCode: string; asset: string }> }) {
  const { site: siteId, languageCode, asset } = await params;
  if (siteId !== "jobs" || !["audio", "video", "audio-thumbnail", "video-thumbnail"].includes(asset)) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const { site } = await requestPortal(siteId), session = await getPortalSession(site);
    if (!session) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const result = await niceJobsIntroMedia.draftFile(session.userId, languageCode, asset as "audio" | "video" | "audio-thumbnail" | "video-thumbnail");
    if (!result) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new NextResponse(new Uint8Array(result.bytes), { headers: { "Content-Type": result.file.mime, "Content-Length": String(result.bytes.length), "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" } });
  } catch { return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
