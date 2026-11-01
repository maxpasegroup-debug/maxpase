import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { hrDocuments } from "@/server/group/hr-documents";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const session = await getSession(); if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 }); const events = await hrDocuments.history(session.userId, (await params).id); return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "History unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
