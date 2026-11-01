import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { AccessError } from "@/server/authorization/engine";
import { hrDocuments } from "@/server/group/hr-documents";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const limit = 12 * 1024 * 1024;
export async function POST(request: Request) {
  try {
    const h = await headers();
    validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    await consumeSecurityBudget(securityKey("hr-document-upload", session.userId), 10, 300);
    if (!hrDocuments.configured()) return NextResponse.json({ error: "Private storage is not configured" }, { status: 503 });
    if (!request.body || Number(h.get("content-length") ?? 0) > limit) return NextResponse.json({ error: "File is too large" }, { status: 413 });
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > limit) return NextResponse.json({ error: "File is too large" }, { status: 413 }); chunks.push(part.value); } }
    finally { await reader.cancel(); reader.releaseLock(); }
    const raw = new Request("http://localhost", { method: "POST", headers: { "content-type": h.get("content-type") ?? "" }, body: new Uint8Array(Buffer.concat(chunks)) });
    const form = await raw.formData();
    const employmentId = String(form.get("employmentId") ?? ""), brandId = String(form.get("brandId") ?? "") || undefined;
    await hrDocuments.preflight(session.userId, employmentId, brandId);
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Choose a file up to 10 MB" }, { status: 400 });
    const documentId = await hrDocuments.upload(session.userId, { employmentId, brandId, categoryKey: String(form.get("categoryKey") ?? ""), title: String(form.get("title") ?? ""), filename: file.name, replacesId: String(form.get("replacesId") ?? "") || undefined }, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ id: documentId }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AccessError ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "Document or scope unavailable" : "Upload failed; existing documents are unchanged" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
