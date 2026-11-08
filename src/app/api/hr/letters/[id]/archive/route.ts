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
    const stored = await hrRecruitmentService.archiveIssuedLetter(session.userId, (await params).id);
    return NextResponse.json({ stored }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { const status = error instanceof AccessError ? 403 : 400; return NextResponse.json({ error: status === 403 ? "Issued letter or company scope unavailable" : "Employee document could not be stored" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
