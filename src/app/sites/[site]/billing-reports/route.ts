import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { labsBillingOperations } from "@/server/labs/billing-operations";
import { AccessError } from "@/server/authorization/engine";
import { RateLimitError, consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer" };

export async function GET(request: Request, context: { params: Promise<{ site: string }> }) {
  try {
    if ((await context.params).site !== "labs") return new Response("Not found", { status: 404, headers });
    const { site } = await requestPortal("labs"), session = await getPortalSession(site);
    if (!session || session.needsPinChange) return new Response("Sign in required", { status: 401, headers });
    await consumeSecurityBudget(securityKey("labs:billing-report", session.userId), 10, 60);
    const params = new URL(request.url).searchParams;
    const { filename, csv } = await labsBillingOperations.reportCsv(session.userId, params.get("from") ?? "", params.get("to") ?? "");
    return new Response(csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch (error) {
    const status = error instanceof RateLimitError ? 429 : error instanceof AccessError ? 400 : 503;
    return new Response(status === 429 ? "Too many requests" : status === 400 ? "Report unavailable or date range invalid" : "Report unavailable", { status, headers });
  }
}
