import { NextResponse } from "next/server";
import { hrRecruitmentService } from "@/server/group/hr-recruitment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (token.length < 32 || token.length > 100) return new Response("Offer unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  const result = await hrRecruitmentService.publicOfferPdf((await params).id, token);
  if (!result) return new Response("Offer unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(new Uint8Array(result.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${result.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" } });
}
