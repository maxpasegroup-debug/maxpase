import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { AccessError } from "@/server/authorization/engine";
import { hrRecruitmentService } from "@/server/group/hr-recruitment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers(); validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Decision reference required" }, { status: 400 });
    const result = await hrRecruitmentService.sendLetter(session.userId, (await params).id, (body as Record<string, unknown>).decisionReference);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { const status = error instanceof AccessError ? 403 : 400; return NextResponse.json({ error: status === 403 ? "Letter or sender scope unavailable" : "Letter could not be sent" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
