import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { AccessError } from "@/server/authorization/engine";
import { hrDocuments } from "@/server/group/hr-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers();
    validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid review" }, { status: 400 });
    const values = body as Record<string, unknown>;
    const status = await hrDocuments.reviewRetention(session.userId, (await params).id, values.outcome, values.decisionReference);
    return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AccessError ? 403 : 400;
    return NextResponse.json({ error: status === 403 ? "Document or company scope unavailable" : "Retention review could not be recorded" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
