import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { labsBillingOperations } from "@/server/labs/billing-operations";
import { buildInvoicePdf } from "@/server/labs/invoice-pdf";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, context: { params: Promise<{ site: string; id: string }> }) {
  try {
    const params = await context.params;
    if (params.site !== "labs" || !/^[a-zA-Z0-9_-]{1,120}$/.test(params.id)) return new Response("Not found", { status: 404, headers: privateHeaders });
    const { site } = await requestPortal("labs"), session = await getPortalSession(site);
    if (!session || session.needsPinChange) return new Response("Sign in required", { status: 401, headers: privateHeaders });
    await consumeSecurityBudget(securityKey("labs:invoice-document", session.userId), 30, 60);
    const data = await labsBillingOperations.invoiceDocument(session.userId, params.id);
    const content = buildInvoicePdf(data);
    return new Response(new Uint8Array(content), { headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${data.invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf"`, "Content-Length": String(content.length) } });
  } catch (error) {
    const status = error instanceof RateLimitError ? 429 : error instanceof AccessError ? 404 : 503;
    return new Response(status === 429 ? "Too many requests" : "Invoice unavailable", { status, headers: privateHeaders });
  }
}
