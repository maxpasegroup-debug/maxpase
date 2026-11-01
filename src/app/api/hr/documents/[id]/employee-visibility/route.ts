import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { hrDocuments } from "@/server/group/hr-documents";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers(); validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = await request.json();
    if (typeof body.visible !== "boolean") return NextResponse.json({ error: "Choose sharing state" }, { status: 400 });
    await hrDocuments.setEmployeeVisibility(session.userId, (await params).id, body.visible);
    return NextResponse.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Sharing could not be changed" }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
}
