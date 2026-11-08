import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { hrDocuments } from "@/server/group/hr-documents";
import { AccessError } from "@/server/authorization/engine";
export async function POST(request: Request) {
  try {
    const h = await headers(); validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = await request.json();
    await hrDocuments.addCategory(session.userId, body);
    return NextResponse.json({ created: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Category could not be created" }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
}

export async function PATCH(request: Request) {
  try {
    const h = await headers();
    validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body: unknown = await request.json();
    const result = await hrDocuments.setRetentionPolicy(session.userId, body);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AccessError ? 403 : 400;
    return NextResponse.json({ error: status === 403 ? "Company or category unavailable" : "Retention policy could not be saved" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
