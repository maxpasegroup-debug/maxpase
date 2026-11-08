import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { AccessError } from "@/server/authorization/engine";
import { hrRecruitmentService } from "@/server/group/hr-recruitment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers(); validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    await hrRecruitmentService.moveCandidate(session.userId, (await params).id, (body as Record<string, unknown>).status);
    return NextResponse.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { const status = error instanceof AccessError ? 403 : 400; return NextResponse.json({ error: status === 403 ? "Candidate or company scope unavailable" : "Candidate stage could not be changed" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
