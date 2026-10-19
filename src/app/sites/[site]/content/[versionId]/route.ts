import { downloadContent } from "@/server/nicejobs/content-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ site: string; versionId: string }> }) { const p = await context.params; return p.site === "jobs" ? downloadContent(request, p.versionId, true) : new Response("Not found", { status: 404 }); }
