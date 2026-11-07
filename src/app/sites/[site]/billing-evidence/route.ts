import { NextResponse } from "next/server";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { labsBillingFiles } from "@/server/labs/billing-files";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
import { NiceJobsError } from "@/server/nicejobs/input";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const maxBytes = 20 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ site: string }> }) {
  try {
    if ((await context.params).site !== "labs") return new Response("Not found", { status: 404 });
    const { site } = await requestPortal("labs", true), session = await getPortalSession(site);
    if (!session || session.needsPinChange) return NextResponse.json({ error: "Sign in and change your initial PIN before uploading evidence." }, { status: 401 });
    await consumeSecurityBudget(securityKey("labs:billing-evidence", session.userId), 10, 300);
    const length = Number(request.headers.get("content-length") ?? "0");
    if (!request.body || !Number.isFinite(length) || length < 1 || length > maxBytes) throw new NiceJobsError("Choose a PDF or image up to 20 MB");
    const filename = decodeURIComponent(request.headers.get("x-file-name") ?? "");
    const evidenceType = request.headers.get("x-evidence-type") ?? "";
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > maxBytes) throw new NiceJobsError("Evidence exceeds the 20 MB limit"); chunks.push(value); } }
    finally { reader.releaseLock(); }
    const vendorBillId = request.headers.get("x-vendor-bill-id") ?? undefined;
    const result = await labsBillingFiles.upload(session.userId, { filename, mime: request.headers.get("content-type") ?? "", evidenceType, ...(vendorBillId ? { vendorBillId } : {}) }, Buffer.concat(chunks));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof RateLimitError ? 429 : error instanceof AccessError ? 403 : error instanceof NiceJobsError ? 400 : 503;
    return NextResponse.json({ error: status === 403 ? "Evidence upload is not authorized for this account." : status === 429 ? "Too many upload attempts. Try again later." : error instanceof NiceJobsError ? error.message : "Private evidence storage is unavailable." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
