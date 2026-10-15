import { offerDownload } from "@/server/nicejobs/offer-download-handler";
import { NextResponse } from "next/server";
export async function GET(request: Request, context: { params: Promise<{ site: string; reference: string }> }) {
  const params = await context.params;
  if (params.site !== "jobs") return new NextResponse("Not found", { status: 404 });
  return offerDownload(params.reference, true, new URL(request.url).searchParams.get("format") ?? "html");
}
