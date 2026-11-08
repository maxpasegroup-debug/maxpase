import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { AccessError } from "@/server/authorization/engine";
import { hrRecruitmentService } from "@/server/group/hr-recruitment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const h = await headers(); validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).companyId !== "string") return NextResponse.json({ error: "Company required" }, { status: 400 });
    const created = await hrRecruitmentService.createStarterTemplates(session.userId, (body as Record<string, unknown>).companyId as string);
    return NextResponse.json({ created }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { const status = error instanceof AccessError ? 403 : 400; return NextResponse.json({ error: status === 403 ? "Company scope unavailable" : "Starter templates could not be created" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
