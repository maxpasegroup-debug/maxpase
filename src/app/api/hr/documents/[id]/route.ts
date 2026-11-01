import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { hrDocuments } from "@/server/group/hr-documents";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return new NextResponse("Sign in required", { status: 401 });
    await consumeSecurityBudget(securityKey("hr-document-download", session.userId), 60, 60);
    const { id } = await params;
    const document = await hrDocuments.download(session.userId, id);
    const inline = new URL(request.url).searchParams.get("open") === "1";
    const filename = encodeURIComponent(document.filename).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    return new NextResponse(new Uint8Array(document.bytes), { headers: { "Content-Type": document.mime, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`, "Content-Length": String(document.bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" } });
  } catch { return new NextResponse("Document unavailable", { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
