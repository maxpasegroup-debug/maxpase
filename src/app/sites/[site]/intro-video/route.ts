import { NextResponse } from "next/server";
import { requestPortal } from "@/server/portals/request";
import { contentFiles } from "@/server/nicejobs/content-files";

export async function GET(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await requestPortal((await params).site);
  if (site.id !== "jobs") return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const current = await contentFiles.publicIntroVideo();
    if (!current) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const { file, bytes } = current;
    const headers = new Headers({ "Content-Type": file.mime, "Content-Length": String(bytes.length), "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "cross-origin", "Accept-Ranges": "bytes" });
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range), start = match ? Number(match[1]) : -1, end = match?.[2] ? Number(match[2]) : bytes.length - 1;
      if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= bytes.length || end >= bytes.length) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}`, "Cache-Control": "no-store" } });
      headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`); headers.set("Content-Length", String(end - start + 1));
      return new NextResponse(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers });
    }
    return new NextResponse(new Uint8Array(bytes), { headers });
  } catch {
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
