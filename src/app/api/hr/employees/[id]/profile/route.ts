import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService } from "@/server/group/hr-employment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers();
    validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
    const result = await hrEmploymentService.updateProfile(session.userId, { ...body, employmentId: (await params).id });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof AccessError ? 403 : 400;
    return NextResponse.json({ error: status === 403 ? "Profile or company scope unavailable" : "Profile could not be saved" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
