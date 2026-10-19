import { offerDownload } from "@/server/nicejobs/offer-download-handler";
export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  return offerDownload((await context.params).reference, false, new URL(request.url).searchParams.get("format") ?? "html");
}
