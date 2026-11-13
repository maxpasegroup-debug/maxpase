import { NextResponse } from "next/server";
import { requestPortal } from "@/server/portals/request";
import { niceJobsIntroMedia } from "@/server/nicejobs/intro-media";

export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await requestPortal((await params).site);
  if (site.id !== "jobs") return NextResponse.json({ error: "Unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try { return NextResponse.json(await niceJobsIntroMedia.published(), { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
  catch { return NextResponse.json({ error: "Introduction media unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
