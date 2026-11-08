import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { AccessError } from "@/server/authorization/engine";
import { hrPayrollService } from "@/server/group/hr-payroll";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers(); validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = await request.json();
    const status = await hrPayrollService.voidRun(session.userId, { ...body, runId: (await params).id });
    return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { const status = error instanceof AccessError ? 403 : 400; return NextResponse.json({ error: error instanceof AccessError ? error.message : "Payroll draft could not be voided" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
