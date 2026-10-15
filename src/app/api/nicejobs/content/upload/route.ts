import { uploadContent } from "@/server/nicejobs/content-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) { return uploadContent(request, false); }
