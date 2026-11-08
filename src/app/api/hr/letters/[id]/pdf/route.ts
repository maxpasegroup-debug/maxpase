import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { AccessError } from "@/server/authorization/engine";
import { hrRecruitmentService } from "@/server/group/hr-recruitment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(); if (!session) return new Response("Sign in required", { status: 401 });
    const pdf = await hrRecruitmentService.getPdf(session.userId, (await params).id);
    return new NextResponse(new Uint8Array(pdf.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" } });
  } catch (error) { return new Response("Letter unavailable", { status: error instanceof AccessError ? 404 : 500, headers: { "Cache-Control": "no-store" } }); }
}
