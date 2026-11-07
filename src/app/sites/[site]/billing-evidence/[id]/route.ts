import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { labsBillingFiles } from "@/server/labs/billing-files";
import { AccessError } from "@/server/authorization/engine";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, context: { params: Promise<{ site: string; id: string }> }) {
  try {
    const params = await context.params;
    if (params.site !== "labs" || !/^[a-zA-Z0-9_-]{1,120}$/.test(params.id)) return new Response("Not found", { status: 404, headers: privateHeaders });
    const { site } = await requestPortal("labs"), session = await getPortalSession(site);
    if (!session || session.needsPinChange) return new Response("Sign in required", { status: 401, headers: privateHeaders });
    await consumeSecurityBudget(securityKey("labs:billing-evidence-download", session.userId), 30, 60);
    const file = await labsBillingFiles.download(session.userId, params.id);
    const filename = encodeURIComponent(file.filename).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    return new Response(new Uint8Array(file.bytes), { headers: { ...privateHeaders, "Content-Type": file.mime, "Content-Disposition": `attachment; filename*=UTF-8''${filename}`, "Content-Length": String(file.bytes.length) } });
  } catch (error) {
    const status = error instanceof RateLimitError ? 429 : error instanceof AccessError ? 404 : 503;
    return new Response(status === 429 ? "Too many requests" : "Evidence unavailable", { status, headers: privateHeaders });
  }
}
