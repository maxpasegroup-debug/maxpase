import { NextResponse } from "next/server";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { hrDocuments } from "@/server/group/hr-documents";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ site: string; id: string }> }) {
  try {
    const { site: siteId, id } = await params;
    const { site } = await requestPortal(siteId);
    if (site.id !== "skillcity") return new NextResponse("Unavailable", { status: 404 });
    const session = await getPortalSession(site);
    if (!session) return new NextResponse("Sign in required", { status: 401 });
    await consumeSecurityBudget(securityKey("hr-self-document", session.userId), 30, 60);
    const document = await hrDocuments.selfDownload(session.userId, id);
    const filename = encodeURIComponent(document.filename).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    return new NextResponse(new Uint8Array(document.bytes), { headers: { "Content-Type": document.mime, "Content-Disposition": `attachment; filename*=UTF-8''${filename}`, "Content-Length": String(document.bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" } });
  } catch { return new NextResponse("Document unavailable", { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
