import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { hrDocuments } from "@/server/group/hr-documents";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers(); validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    await hrDocuments.archive(session.userId, (await params).id);
    return NextResponse.json({ archived: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Document could not be archived" }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
}
