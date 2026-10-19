import { downloadContent } from "@/server/nicejobs/content-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ versionId: string }> }) { return downloadContent(request, (await context.params).versionId, false); }
