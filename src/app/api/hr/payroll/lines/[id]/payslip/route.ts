import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { validateActionOrigin } from "@/server/security/origin";
import { AccessError } from "@/server/authorization/engine";
import { hrPayrollService } from "@/server/group/hr-payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const file = await hrPayrollService.payslip(session.userId, (await params).id);
    return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${file.filename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { const status = error instanceof AccessError ? 403 : 404; return NextResponse.json({ error: "Payslip unavailable" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers(); validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const stored = await hrPayrollService.storePayslip(session.userId, (await params).id);
    return NextResponse.json({ stored }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { const status = error instanceof AccessError ? 403 : 400; return NextResponse.json({ error: error instanceof AccessError ? error.message : "Payslip could not be stored" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
