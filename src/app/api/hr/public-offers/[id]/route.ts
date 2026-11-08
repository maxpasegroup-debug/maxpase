import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { validateActionOrigin } from "@/server/security/origin";
import { AccessError } from "@/server/authorization/engine";
import { hrRecruitmentService } from "@/server/group/hr-recruitment";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers(); validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid response" }, { status: 400 });
    const values = body as Record<string, unknown>, token = typeof values.token === "string" ? values.token : "";
    if (token.length < 32 || token.length > 100) return NextResponse.json({ error: "This offer link is invalid or expired" }, { status: 404 });
    await consumeSecurityBudget(securityKey("hr-offer-response", createHash("sha256").update(token).digest("hex")), 5, 300);
    const status = await hrRecruitmentService.decideOffer((await params).id, token, values.decision);
    return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { const status = error instanceof AccessError ? 404 : 400; return NextResponse.json({ error: status === 404 ? "This offer link is invalid, expired, or already used" : "Offer response could not be recorded" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
