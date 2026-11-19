import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { startupOperationsDesk } from "@/server/skillcity/startup-operations-desk";
import { startupCentreDesk } from "@/server/skillcity/startup-centre-desk";
import { startupRecordsGrievancesDesk } from "@/server/skillcity/startup-records-grievances-desk";
import { startupFinanceDesk } from "@/server/skillcity/startup-finance-desk";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ site: string; fileId: string }> }) {
  const params = await context.params;
  if (params.site !== "skillcity") return new Response("Not found", { status: 404 });
  try {
    const { site } = await requestPortal("skillcity", true);
    const session = await getPortalSession(site);
    if (!session) return new Response("Sign in required", { status: 401 });
    const url = new URL(request.url), centreId = url.searchParams.get("centreId"), recordId = url.searchParams.get("recordId"), financeId = url.searchParams.get("financeId"), itemId = url.searchParams.get("itemId") ?? "";
    const { file, bytes } = financeId ? await startupFinanceDesk.downloadBill(session.userId, financeId, params.fileId) : recordId ? await startupRecordsGrievancesDesk.downloadDocument(session.userId, recordId, params.fileId) : centreId ? await startupCentreDesk.attachment(session.userId, centreId, params.fileId) : await startupOperationsDesk.attachment(session.userId, itemId, params.fileId);
    return new Response(bytes, { headers: { "Content-Type": file.mime, "Content-Disposition": `inline; filename="${file.filename.replace(/["\\\r\n]/g, "_")}"`, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  } catch { return new Response("Attachment unavailable", { status: 404 }); }
}
