import { uploadContent } from "@/server/nicejobs/content-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ site: string }> }) { return (await context.params).site === "jobs" ? uploadContent(request, true) : new Response("Not found", { status: 404 }); }
