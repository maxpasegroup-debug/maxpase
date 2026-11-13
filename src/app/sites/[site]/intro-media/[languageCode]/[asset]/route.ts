import { NextResponse } from "next/server";
import { requestPortal } from "@/server/portals/request";
import { niceJobsIntroMedia } from "@/server/nicejobs/intro-media";

export async function GET(request: Request, { params }: { params: Promise<{ site: string; languageCode: string; asset: string }> }) {
  const { site } = await requestPortal((await params).site), { languageCode, asset } = await params;
  if (site.id !== "jobs" || asset !== "media" && asset !== "thumbnail") return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await niceJobsIntroMedia.publicFile(languageCode, asset);
    if (!result) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const { file, bytes } = result;
    const headers = new Headers({ "Content-Type": file.mime, "Content-Length": String(bytes.length), "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "cross-origin" });
    if (asset === "media") {
      headers.set("Accept-Ranges", "bytes");
      const range = request.headers.get("range");
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range), start = match ? Number(match[1]) : -1, end = match?.[2] ? Number(match[2]) : bytes.length - 1;
        if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= bytes.length || end >= bytes.length) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}`, "Cache-Control": "no-store" } });
        headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`); headers.set("Content-Length", String(end - start + 1));
        return new NextResponse(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers });
      }
    }
    return new NextResponse(new Uint8Array(bytes), { headers });
  } catch { return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
