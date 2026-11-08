import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { AccessError } from "@/server/authorization/engine";
import { hrPayrollService } from "@/server/group/hr-payroll";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const h = await headers(); validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const id = await hrPayrollService.recordPayment(session.userId, await request.json());
    return NextResponse.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { const status = error instanceof AccessError ? 403 : 400; return NextResponse.json({ error: error instanceof AccessError ? error.message : "Payment evidence could not be recorded" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
