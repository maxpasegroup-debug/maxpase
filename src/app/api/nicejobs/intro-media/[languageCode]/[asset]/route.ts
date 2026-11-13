import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { niceJobsIntroMedia } from "@/server/nicejobs/intro-media";

export async function GET(_request: Request, { params }: { params: Promise<{ languageCode: string; asset: string }> }) {
  const user = await getSession(), { languageCode, asset } = await params;
  if (!user || !["audio", "video", "audio-thumbnail", "video-thumbnail"].includes(asset)) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await niceJobsIntroMedia.draftFile(user.userId, languageCode, asset as "audio" | "video" | "audio-thumbnail" | "video-thumbnail");
    if (!result) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new NextResponse(new Uint8Array(result.bytes), { headers: { "Content-Type": result.file.mime, "Content-Length": String(result.bytes.length), "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
